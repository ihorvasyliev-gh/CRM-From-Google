import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, Clock, XCircle, Send, Search, Copy, Calendar, Filter, Check, X, Plus, Trash2, ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import EnrollmentModal from './EnrollmentModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';

// --- Types ---
interface Student {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
}

interface Course {
    id: string;
    name: string;
}

interface Enrollment {
    id: string;
    student_id: string;
    course_id: string;
    status: string;
    course_variant: string | null;
    notes: string | null;
    created_at: string;
    students: Student | null;
    courses: Course | null;
}

// --- Constants ---
const STATUS_ICONS: Record<string, JSX.Element> = {
    requested: <Clock size={13} className="text-amber-600" />,
    invited: <Send size={13} className="text-blue-600" />,
    confirmed: <CheckCircle size={13} className="text-emerald-600" />,
    rejected: <XCircle size={13} className="text-red-500" />,
    completed: <GraduationCap size={13} className="text-teal-600" />,
    withdrawn: <XCircle size={13} className="text-slate-500" />,
};

const STATUS_COLORS: Record<string, string> = {
    requested: 'bg-amber-50 text-amber-700 border-amber-200',
    invited: 'bg-blue-50 text-blue-700 border-blue-200',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-50 text-red-600 border-red-200',
    completed: 'bg-teal-50 text-teal-700 border-teal-200',
    withdrawn: 'bg-slate-50 text-slate-500 border-slate-200',
};

// --- Helpers ---
function buildGroupKey(enrollment: Enrollment): string {
    const courseName = enrollment.courses?.name || 'Unknown Course';
    const variant = enrollment.course_variant?.trim() || '';
    if (!variant) return courseName;
    return `${courseName} (${variant})`;
}

function normalizeGroupKey(key: string): string {
    return key.toLowerCase();
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IE', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

function copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
}

function collectEmails(enrollments: Enrollment[]): string {
    const emails = enrollments
        .map(e => e.students?.email)
        .filter((email): email is string => !!email && email.trim() !== '');
    return [...new Set(emails)].join('; ');
}

// --- Component ---
export default function EnrollmentBoard() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [selectedCourse, setSelectedCourse] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    }, []);

    useEffect(() => {
        fetchCourses();
        fetchEnrollments();
    }, []);

    async function fetchCourses() {
        const { data } = await supabase.from('courses').select('*').order('name');
        if (data) setCourses(data);
    }

    async function fetchEnrollments() {
        const { data } = await supabase
            .from('enrollments')
            .select('*, students(first_name, last_name, email, phone), courses(name)')
            .order('created_at', { ascending: false });
        if (data) setEnrollments(data as Enrollment[]);
    }

    async function updateStatus(id: string, newStatus: string) {
        const { error } = await supabase.from('enrollments').update({ status: newStatus }).eq('id', id);
        if (!error) {
            setEnrollments(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
        }
    }

    async function bulkUpdateStatus(newStatus: string) {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        const { error } = await supabase
            .from('enrollments')
            .update({ status: newStatus })
            .in('id', ids);

        if (!error) {
            setEnrollments(prev => prev.map(e => ids.includes(e.id) ? { ...e, status: newStatus } : e));
            setSelectedIds(new Set());
            showToast(`${ids.length} enrollments marked as ${newStatus}`, 'success');
        } else {
            showToast('Error updating status', 'error');
        }
    }

    async function handleDeleteEnrollment() {
        if (!deleteTarget) return;
        const { error } = await supabase.from('enrollments').delete().eq('id', deleteTarget.id);
        if (!error) {
            setEnrollments(prev => prev.filter(e => e.id !== deleteTarget.id));
            selectedIds.delete(deleteTarget.id);
            setSelectedIds(new Set(selectedIds));
            showToast('Enrollment deleted', 'success');
        } else {
            showToast('Failed to delete enrollment', 'error');
        }
        setDeleteTarget(null);
    }

    // --- Filtering ---
    const filteredEnrollments = useMemo(() => {
        let result = enrollments;
        if (selectedCourse !== 'all') result = result.filter(e => e.course_id === selectedCourse);
        if (selectedStatus !== 'all') result = result.filter(e => e.status === selectedStatus);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(e => {
                const name = `${e.students?.first_name || ''} ${e.students?.last_name || ''}`.toLowerCase();
                const email = (e.students?.email || '').toLowerCase();
                const phone = (e.students?.phone || '').toLowerCase();
                return name.includes(q) || email.includes(q) || phone.includes(q);
            });
        }
        if (dateFrom) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            result = result.filter(e => new Date(e.created_at) >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            result = result.filter(e => new Date(e.created_at) <= to);
        }
        return result;
    }, [enrollments, selectedCourse, selectedStatus, searchQuery, dateFrom, dateTo]);

    // --- Grouping ---
    const groupedByCourse = useMemo(() => {
        const normalizedMap: Record<string, { displayName: string; items: Enrollment[] }> = {};
        for (const enrollment of filteredEnrollments) {
            const rawKey = buildGroupKey(enrollment);
            const normKey = normalizeGroupKey(rawKey);
            if (!normalizedMap[normKey]) {
                normalizedMap[normKey] = { displayName: rawKey, items: [] };
            }
            normalizedMap[normKey].items.push(enrollment);
        }
        return Object.values(normalizedMap).sort((a, b) =>
            a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
        );
    }, [filteredEnrollments]);

    // --- Selection ---
    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleSelectGroup(items: Enrollment[]) {
        const allSelected = items.every(e => selectedIds.has(e.id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            items.forEach(e => {
                if (allSelected) next.delete(e.id);
                else next.add(e.id);
            });
            return next;
        });
    }

    function clearSelection() {
        setSelectedIds(new Set());
    }

    function toggleCollapse(key: string) {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    // --- Copy helpers ---
    async function handleCopyEmails(items: Enrollment[], label: string) {
        const emailStr = collectEmails(items);
        if (!emailStr) {
            showToast('No emails to copy', 'error');
            return;
        }
        await copyToClipboard(emailStr);
        showToast(`${label} emails copied!`, 'success');
    }

    async function handleCopySelectedEmails() {
        const selected = filteredEnrollments.filter(e => selectedIds.has(e.id));
        await handleCopyEmails(selected, `${selected.length}`);
    }

    const hasFilters = searchQuery || selectedCourse !== 'all' || selectedStatus !== 'all' || dateFrom || dateTo;
    const selectedCount = selectedIds.size;

    return (
        <div className="space-y-4 pb-24">
            {/* === Toolbar === */}
            <div className="bg-white rounded-2xl shadow-card border border-surface-200/60 p-4 space-y-3">
                {/* Row 1: Title + Search + Add */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                            <GraduationCap size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-surface-900">Enrollments</h2>
                                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">{enrollments.length}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search by name, email or phone..."
                                className="w-full pl-9 pr-8 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-white transition-all placeholder:text-surface-400"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setEnrollModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl transition-all shadow-sm hover:shadow-md hover:shadow-emerald-500/25 whitespace-nowrap"
                        >
                            <Plus size={16} /> Add Enrollment
                        </button>
                    </div>
                </div>

                {/* Row 2: Filters */}
                <div className="flex flex-wrap gap-2.5 items-center">
                    <div className="flex items-center gap-1.5 text-surface-400">
                        <Filter size={14} />
                        <span className="text-xs font-medium">Filters:</span>
                    </div>

                    <select
                        className="px-3 py-2 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 appearance-none pr-8 cursor-pointer"
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                        value={selectedCourse}
                        onChange={e => setSelectedCourse(e.target.value)}
                    >
                        <option value="all">All Courses</option>
                        {courses.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    <select
                        className="px-3 py-2 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 appearance-none pr-8 cursor-pointer"
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                        value={selectedStatus}
                        onChange={e => setSelectedStatus(e.target.value)}
                    >
                        <option value="all">All Statuses</option>
                        <option value="requested">Requested</option>
                        <option value="invited">Invited</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="completed">Completed</option>
                        <option value="withdrawn">Withdrawn</option>
                        <option value="rejected">Rejected</option>
                    </select>

                    <div className="flex items-center gap-1.5 bg-surface-50 border border-surface-200 rounded-xl px-2.5 py-1">
                        <Calendar size={13} className="text-surface-400" />
                        <input
                            type="date"
                            className="bg-transparent text-sm outline-none py-0.5 text-surface-700"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            title="From date"
                        />
                        <span className="text-surface-300 text-xs">—</span>
                        <input
                            type="date"
                            className="bg-transparent text-sm outline-none py-0.5 text-surface-700"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            title="To date"
                        />
                    </div>

                    {hasFilters && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setSelectedCourse('all');
                                setSelectedStatus('all');
                                setDateFrom('');
                                setDateTo('');
                            }}
                            className="text-xs font-medium text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-all"
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                <div className="text-xs text-surface-400 font-medium">
                    Showing {filteredEnrollments.length} of {enrollments.length} enrollments
                    {groupedByCourse.length > 0 && ` in ${groupedByCourse.length} group${groupedByCourse.length > 1 ? 's' : ''}`}
                </div>
            </div>

            {/* === Course Groups === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {groupedByCourse.map(({ displayName, items }) => {
                    const allGroupSelected = items.every(e => selectedIds.has(e.id));
                    const someGroupSelected = items.some(e => selectedIds.has(e.id));
                    const invitedItems = items.filter(e => e.status === 'invited');
                    const confirmedItems = items.filter(e => e.status === 'confirmed');
                    const isCollapsed = collapsedGroups.has(displayName);

                    return (
                        <div key={displayName} className="bg-white rounded-2xl shadow-card border border-surface-200/60 flex flex-col max-h-[700px] overflow-hidden">
                            {/* Group Header */}
                            <div className="p-4 border-b border-surface-100 bg-gradient-to-r from-surface-50/80 to-white rounded-t-2xl">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => toggleSelectGroup(items)}
                                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
                                                ${allGroupSelected
                                                    ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                                                    : someGroupSelected
                                                        ? 'bg-brand-100 border-brand-400 text-brand-600'
                                                        : 'border-surface-300 hover:border-brand-400'
                                                }`}
                                        >
                                            {(allGroupSelected || someGroupSelected) && <Check size={11} />}
                                        </button>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-surface-800">{displayName}</h3>
                                            <span className="text-xs text-surface-500 font-medium">{items.length} student{items.length !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => toggleCollapse(displayName)}
                                        className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-all"
                                    >
                                        {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    <button
                                        onClick={() => handleCopyEmails(items, `All ${items.length}`)}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-600 transition-all"
                                        title="Copy all emails in this group"
                                    >
                                        <Copy size={11} /> All Emails ({items.length})
                                    </button>
                                    {invitedItems.length > 0 && (
                                        <button
                                            onClick={() => handleCopyEmails(invitedItems, `${invitedItems.length} invited`)}
                                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all"
                                        >
                                            <Copy size={11} /> Invited ({invitedItems.length})
                                        </button>
                                    )}
                                    {confirmedItems.length > 0 && (
                                        <button
                                            onClick={() => handleCopyEmails(confirmedItems, `${confirmedItems.length} confirmed`)}
                                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-all"
                                        >
                                            <Copy size={11} /> Confirmed ({confirmedItems.length})
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Student Cards */}
                            {!isCollapsed && (
                                <div className="p-3 overflow-y-auto space-y-2 flex-1">
                                    {items.map((enrollment) => {
                                        const isSelected = selectedIds.has(enrollment.id);
                                        return (
                                            <div
                                                key={enrollment.id}
                                                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${isSelected
                                                    ? 'border-brand-300 bg-brand-50/40 shadow-sm ring-1 ring-brand-200/50'
                                                    : 'border-surface-100 bg-white hover:shadow-sm hover:border-surface-200'
                                                    }`}
                                                onClick={() => toggleSelect(enrollment.id)}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div
                                                        className={`mt-0.5 w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected
                                                            ? 'bg-brand-500 border-brand-500 text-white'
                                                            : 'border-surface-300'
                                                            }`}
                                                        style={{ width: '18px', height: '18px' }}
                                                    >
                                                        {isSelected && <Check size={10} />}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start mb-1.5">
                                                            <p className="font-semibold text-surface-900 text-sm truncate">
                                                                {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                            </p>
                                                            <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 border flex-shrink-0 ml-2 font-medium ${STATUS_COLORS[enrollment.status]}`}>
                                                                {STATUS_ICONS[enrollment.status]} {enrollment.status}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-surface-500 space-y-0.5">
                                                            {enrollment.students?.email && (
                                                                <p className="truncate">{enrollment.students.email}</p>
                                                            )}
                                                            {enrollment.students?.phone && (
                                                                <p>{enrollment.students.phone}</p>
                                                            )}
                                                            <p className="text-surface-400">
                                                                {formatDate(enrollment.created_at)}
                                                                {enrollment.course_variant && (
                                                                    <span className="ml-2 text-surface-400">• {enrollment.course_variant}</span>
                                                                )}
                                                            </p>
                                                            {enrollment.notes && (
                                                                <p className="text-surface-400 italic mt-1 bg-surface-50 px-2 py-1 rounded-md">📝 {enrollment.notes}</p>
                                                            )}
                                                        </div>

                                                        <div className="mt-2.5 pt-2 border-t border-surface-100 flex gap-1.5"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <button
                                                                onClick={() => updateStatus(enrollment.id, 'invited')}
                                                                className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${enrollment.status === 'invited'
                                                                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                                                                    : 'bg-surface-50 hover:bg-blue-50 text-surface-500 hover:text-blue-600'
                                                                    }`}
                                                            >
                                                                Invite
                                                            </button>
                                                            <button
                                                                onClick={() => updateStatus(enrollment.id, 'confirmed')}
                                                                className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${enrollment.status === 'confirmed'
                                                                    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                                                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600'
                                                                    }`}
                                                            >

                                                                Confirm
                                                            </button>
                                                            <button
                                                                onClick={() => updateStatus(enrollment.id, 'completed')}
                                                                className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${enrollment.status === 'completed'
                                                                    ? 'bg-teal-100 text-teal-700 ring-1 ring-teal-200'
                                                                    : 'bg-teal-50 hover:bg-teal-100 text-teal-600'
                                                                    }`}
                                                            >
                                                                Complete
                                                            </button>
                                                            <button
                                                                onClick={() => updateStatus(enrollment.id, 'withdrawn')}
                                                                className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all ${enrollment.status === 'withdrawn'
                                                                    ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                                                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-500'
                                                                    }`}
                                                            >
                                                                Withdraw
                                                            </button>
                                                            <button
                                                                onClick={() => updateStatus(enrollment.id, 'rejected')}
                                                                className="text-[11px] font-medium text-red-500 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-all"
                                                            >
                                                                Reject
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteTarget(enrollment)}
                                                                className="text-[11px] text-surface-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg ml-auto transition-all"
                                                                title="Delete enrollment"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Empty state */}
            {groupedByCourse.length === 0 && (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <GraduationCap size={28} className="text-surface-300" />
                    </div>
                    <p className="text-lg font-semibold text-surface-700">No enrollments found</p>
                    <p className="text-sm text-surface-400 mt-1">Try adjusting your filters or add a new enrollment</p>
                </div>
            )}

            {/* === Floating Action Bar === */}
            {selectedCount > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slideUp">
                    <div className="glass-dark rounded-2xl shadow-float px-6 py-3.5 flex items-center gap-4">
                        <span className="text-sm font-semibold text-white">
                            {selectedCount} selected
                        </span>

                        <div className="w-px h-6 bg-white/10" />

                        <button
                            onClick={handleCopySelectedEmails}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
                        >
                            <Copy size={14} /> Copy Emails
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('invited')}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-all shadow-sm"
                        >
                            <Send size={14} /> Invite All
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('confirmed')}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-sm"
                        >
                            <CheckCircle size={14} /> Confirm All
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('completed')}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white transition-all shadow-sm"
                        >
                            <GraduationCap size={14} /> Complete All
                        </button>

                        <button
                            onClick={clearSelection}
                            className="text-white/50 hover:text-white transition-all ml-1 p-1 hover:bg-white/10 rounded-lg"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* === Modals === */}
            <EnrollmentModal
                open={enrollModalOpen}
                onSave={() => {
                    fetchEnrollments();
                    setToast({ message: 'Enrollment created', type: 'success' });
                }}
                onClose={() => setEnrollModalOpen(false)}
            />
            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Enrollment"
                message={`Remove ${deleteTarget?.students?.first_name || ''} ${deleteTarget?.students?.last_name || ''} from ${deleteTarget?.courses?.name || 'this course'}?`}
                confirmLabel="Remove"
                onConfirm={handleDeleteEnrollment}
                onCancel={() => setDeleteTarget(null)}
            />
            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}

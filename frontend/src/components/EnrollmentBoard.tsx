import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, Clock, XCircle, Send, Search, Copy, Calendar, Filter, Check, X } from 'lucide-react';

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
    created_at: string;
    students: Student | null;
    courses: Course | null;
}

// --- Constants ---
const STATUS_ICONS: Record<string, JSX.Element> = {
    requested: <Clock size={14} className="text-yellow-600" />,
    invited: <Send size={14} className="text-blue-600" />,
    confirmed: <CheckCircle size={14} className="text-green-600" />,
    rejected: <XCircle size={14} className="text-red-600" />
};

const STATUS_COLORS: Record<string, string> = {
    requested: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    invited: 'bg-blue-50 text-blue-700 border-blue-200',
    confirmed: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200'
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
    // Deduplicate
    return [...new Set(emails)].join('; ');
}

// --- Component ---
export default function EnrollmentBoard() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Filters
    const [selectedCourse, setSelectedCourse] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchCourses();
        fetchEnrollments();
    }, []);

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

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

        // Update in DB (Supabase supports .in() filter)
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

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type });
    }

    // --- Filtering ---
    const filteredEnrollments = useMemo(() => {
        let result = enrollments;

        // Course filter
        if (selectedCourse !== 'all') {
            result = result.filter(e => e.course_id === selectedCourse);
        }

        // Status filter
        if (selectedStatus !== 'all') {
            result = result.filter(e => e.status === selectedStatus);
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(e => {
                const name = `${e.students?.first_name || ''} ${e.students?.last_name || ''}`.toLowerCase();
                const email = (e.students?.email || '').toLowerCase();
                const phone = (e.students?.phone || '').toLowerCase();
                return name.includes(q) || email.includes(q) || phone.includes(q);
            });
        }

        // Date filter
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

    // --- Grouping (case-insensitive) ---
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

        // Sort groups alphabetically
        return Object.values(normalizedMap).sort((a, b) =>
            a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
        );
    }, [filteredEnrollments]);

    // --- Selection helpers ---
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

    // --- Render ---
    const selectedCount = selectedIds.size;

    return (
        <div className="space-y-4 pb-24">
            {/* === Toolbar === */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
                {/* Row 1: Title + Search */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-800">Enrollments</h2>
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search by name, email or phone..."
                            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Row 2: Filters */}
                <div className="flex flex-wrap gap-3 items-center">
                    <Filter size={16} className="text-slate-400" />

                    {/* Course filter */}
                    <select
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                        value={selectedCourse}
                        onChange={e => setSelectedCourse(e.target.value)}
                    >
                        <option value="all">All Courses</option>
                        {courses.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    {/* Status filter */}
                    <select
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                        value={selectedStatus}
                        onChange={e => setSelectedStatus(e.target.value)}
                    >
                        <option value="all">All Statuses</option>
                        <option value="requested">Requested</option>
                        <option value="invited">Invited</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="rejected">Rejected</option>
                    </select>

                    {/* Date from */}
                    <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-slate-400" />
                        <input
                            type="date"
                            className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            title="From date"
                        />
                        <span className="text-slate-400 text-xs">—</span>
                        <input
                            type="date"
                            className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            title="To date"
                        />
                    </div>

                    {/* Clear filters */}
                    {(searchQuery || selectedCourse !== 'all' || selectedStatus !== 'all' || dateFrom || dateTo) && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setSelectedCourse('all');
                                setSelectedStatus('all');
                                setDateFrom('');
                                setDateTo('');
                            }}
                            className="text-xs text-red-500 hover:text-red-700 underline"
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {/* Results count */}
                <div className="text-xs text-slate-400">
                    Showing {filteredEnrollments.length} of {enrollments.length} enrollments
                    {groupedByCourse.length > 0 && ` in ${groupedByCourse.length} group${groupedByCourse.length > 1 ? 's' : ''}`}
                </div>
            </div>

            {/* === Course Groups === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {groupedByCourse.map(({ displayName, items }) => {
                    const allGroupSelected = items.every(e => selectedIds.has(e.id));
                    const someGroupSelected = items.some(e => selectedIds.has(e.id));
                    const invitedItems = items.filter(e => e.status === 'invited');
                    const confirmedItems = items.filter(e => e.status === 'confirmed');

                    return (
                        <div key={displayName} className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col max-h-[700px]">
                            {/* Group Header */}
                            <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white rounded-t-xl">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        {/* Select All checkbox */}
                                        <button
                                            onClick={() => toggleSelectGroup(items)}
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition
                                                ${allGroupSelected
                                                    ? 'bg-blue-600 border-blue-600 text-white'
                                                    : someGroupSelected
                                                        ? 'bg-blue-100 border-blue-400 text-blue-600'
                                                        : 'border-slate-300 hover:border-blue-400'
                                                }`}
                                        >
                                            {(allGroupSelected || someGroupSelected) && <Check size={12} />}
                                        </button>
                                        <div>
                                            <h3 className="font-semibold text-slate-800">{displayName}</h3>
                                            <span className="text-xs text-slate-500">{items.length} student{items.length !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Group quick-copy buttons */}
                                <div className="flex flex-wrap gap-2 mt-2">
                                    <button
                                        onClick={() => handleCopyEmails(items, `All ${items.length}`)}
                                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                                        title="Copy all emails in this group"
                                    >
                                        <Copy size={11} /> All Emails ({items.length})
                                    </button>
                                    {invitedItems.length > 0 && (
                                        <button
                                            onClick={() => handleCopyEmails(invitedItems, `${invitedItems.length} invited`)}
                                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 transition"
                                        >
                                            <Copy size={11} /> Invited ({invitedItems.length})
                                        </button>
                                    )}
                                    {confirmedItems.length > 0 && (
                                        <button
                                            onClick={() => handleCopyEmails(confirmedItems, `${confirmedItems.length} confirmed`)}
                                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-green-50 hover:bg-green-100 text-green-600 transition"
                                        >
                                            <Copy size={11} /> Confirmed ({confirmedItems.length})
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Student Cards */}
                            <div className="p-3 overflow-y-auto space-y-2 flex-1">
                                {items.map((enrollment) => {
                                    const isSelected = selectedIds.has(enrollment.id);
                                    return (
                                        <div
                                            key={enrollment.id}
                                            className={`p-3 rounded-lg border transition cursor-pointer ${isSelected
                                                    ? 'border-blue-300 bg-blue-50/50 shadow-sm'
                                                    : 'border-slate-100 bg-white hover:shadow-sm hover:border-slate-200'
                                                }`}
                                            onClick={() => toggleSelect(enrollment.id)}
                                        >
                                            <div className="flex items-start gap-3">
                                                {/* Checkbox */}
                                                <div
                                                    className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${isSelected
                                                            ? 'bg-blue-600 border-blue-600 text-white'
                                                            : 'border-slate-300'
                                                        }`}
                                                >
                                                    {isSelected && <Check size={10} />}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <p className="font-medium text-slate-900 text-sm truncate">
                                                            {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                        </p>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 border flex-shrink-0 ml-2 ${STATUS_COLORS[enrollment.status]}`}>
                                                            {STATUS_ICONS[enrollment.status]} {enrollment.status}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-slate-500 space-y-0.5">
                                                        {enrollment.students?.email && (
                                                            <p className="truncate">{enrollment.students.email}</p>
                                                        )}
                                                        {enrollment.students?.phone && (
                                                            <p>{enrollment.students.phone}</p>
                                                        )}
                                                        <p className="text-slate-400">
                                                            {formatDate(enrollment.created_at)}
                                                            {enrollment.course_variant && (
                                                                <span className="ml-2 text-slate-400">• {enrollment.course_variant}</span>
                                                            )}
                                                        </p>
                                                    </div>

                                                    {/* Individual action buttons */}
                                                    <div className="mt-2 pt-1.5 border-t border-slate-100 flex gap-1.5"
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        <button
                                                            onClick={() => updateStatus(enrollment.id, 'invited')}
                                                            className={`text-[11px] px-2 py-0.5 rounded transition ${enrollment.status === 'invited'
                                                                    ? 'bg-blue-100 text-blue-700 font-medium'
                                                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                                                                }`}
                                                        >
                                                            Invite
                                                        </button>
                                                        <button
                                                            onClick={() => updateStatus(enrollment.id, 'confirmed')}
                                                            className={`text-[11px] px-2 py-0.5 rounded transition ${enrollment.status === 'confirmed'
                                                                    ? 'bg-green-100 text-green-700 font-medium'
                                                                    : 'bg-green-50 hover:bg-green-100 text-green-700'
                                                                }`}
                                                        >
                                                            Confirm
                                                        </button>
                                                        <button
                                                            onClick={() => updateStatus(enrollment.id, 'rejected')}
                                                            className="text-[11px] text-red-500 hover:bg-red-50 px-2 py-0.5 rounded ml-auto transition"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Empty state */}
            {groupedByCourse.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                    <p className="text-lg">No enrollments found</p>
                    <p className="text-sm mt-1">Try adjusting your filters or search query</p>
                </div>
            )}

            {/* === Floating Action Bar === */}
            {selectedCount > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in">
                    <div className="bg-slate-900 text-white rounded-2xl shadow-2xl px-6 py-3 flex items-center gap-4">
                        <span className="text-sm font-medium">
                            {selectedCount} selected
                        </span>

                        <div className="w-px h-6 bg-slate-700" />

                        <button
                            onClick={handleCopySelectedEmails}
                            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                        >
                            <Copy size={14} /> Copy Emails
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('invited')}
                            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 transition"
                        >
                            <Send size={14} /> Invite All
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('confirmed')}
                            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 transition"
                        >
                            <CheckCircle size={14} /> Confirm All
                        </button>

                        <button
                            onClick={clearSelection}
                            className="text-slate-400 hover:text-white transition ml-2"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* === Toast Notification === */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${toast.type === 'success'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}

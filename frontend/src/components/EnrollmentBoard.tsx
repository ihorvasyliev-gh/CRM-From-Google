import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
    CheckCircle, Clock, Send, Search, Copy, Calendar,
    Filter, Check, X, Plus, Trash2, ChevronDown, GraduationCap,
    MoreHorizontal, ArrowRight, LogOut, Ban
} from 'lucide-react';
import EnrollmentModal from './EnrollmentModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';

// ─── Types ──────────────────────────────────────────────────
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
    confirmed_date: string | null;
    created_at: string;
    students: Student | null;
    courses: Course | null;
}

// ─── Constants ──────────────────────────────────────────────
const PIPELINE_STATUSES = ['requested', 'invited', 'confirmed', 'completed'] as const;
const SECONDARY_STATUSES = ['withdrawn', 'rejected'] as const;
const ALL_STATUSES = [...PIPELINE_STATUSES, ...SECONDARY_STATUSES] as const;

const STATUS_CONFIG: Record<string, {
    label: string;
    icon: JSX.Element;
    color: string;
    bg: string;
    border: string;
    pillBg: string;
    gradient: string;
}> = {
    requested: {
        label: 'Requested',
        icon: <Clock size={14} />,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        pillBg: 'bg-amber-100 text-amber-700',
        gradient: 'from-amber-500 to-orange-500',
    },
    invited: {
        label: 'Invited',
        icon: <Send size={14} />,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        pillBg: 'bg-blue-100 text-blue-700',
        gradient: 'from-blue-500 to-indigo-500',
    },
    confirmed: {
        label: 'Confirmed',
        icon: <CheckCircle size={14} />,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        pillBg: 'bg-emerald-100 text-emerald-700',
        gradient: 'from-emerald-500 to-green-500',
    },
    completed: {
        label: 'Completed',
        icon: <GraduationCap size={14} />,
        color: 'text-teal-600',
        bg: 'bg-teal-50',
        border: 'border-teal-200',
        pillBg: 'bg-teal-100 text-teal-700',
        gradient: 'from-teal-500 to-cyan-500',
    },
    withdrawn: {
        label: 'Withdrawn',
        icon: <LogOut size={14} />,
        color: 'text-slate-500',
        bg: 'bg-slate-50',
        border: 'border-slate-200',
        pillBg: 'bg-slate-100 text-slate-600',
        gradient: 'from-slate-400 to-slate-500',
    },
    rejected: {
        label: 'Rejected',
        icon: <Ban size={14} />,
        color: 'text-red-500',
        bg: 'bg-red-50',
        border: 'border-red-200',
        pillBg: 'bg-red-100 text-red-600',
        gradient: 'from-red-500 to-rose-500',
    },
};

// ─── Helpers ────────────────────────────────────────────────
function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IE', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function formatShortDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IE', {
        day: 'numeric', month: 'short',
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

function getCoursePill(enrollment: Enrollment): string {
    const name = enrollment.courses?.name || 'Unknown';
    const variant = enrollment.course_variant?.trim();
    return variant ? `${name} (${variant})` : name;
}

function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

// ─── Component ──────────────────────────────────────────────
export default function EnrollmentBoard() {
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Filters
    const [selectedCourse, setSelectedCourse] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showSecondary, setShowSecondary] = useState(false);

    // Modals
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

    // Confirm date picker
    const [confirmDateTarget, setConfirmDateTarget] = useState<{ ids: string[]; bulk: boolean } | null>(null);
    const [confirmDate, setConfirmDate] = useState(todayISO());

    // Action menu
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    }, []);

    // Close menu on click outside
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenuId(null);
            }
        }
        if (openMenuId) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [openMenuId]);

    // ─── Data Fetching ──────────────────────────────────────
    useEffect(() => {
        fetchEnrollments();
    }, []);

    async function fetchEnrollments() {
        const { data } = await supabase
            .from('enrollments')
            .select('*, students(first_name, last_name, email, phone), courses(name)')
            .order('created_at', { ascending: false });
        if (data) setEnrollments(data as Enrollment[]);
    }

    // ─── Status Update ──────────────────────────────────────
    async function updateStatus(id: string, newStatus: string, confirmedDate?: string) {
        if (newStatus === 'confirmed' && !confirmedDate) {
            setConfirmDateTarget({ ids: [id], bulk: false });
            setConfirmDate(todayISO());
            return;
        }

        const updatePayload: Record<string, string | null> = { status: newStatus };
        if (newStatus === 'confirmed' && confirmedDate) {
            updatePayload.confirmed_date = confirmedDate;
        }
        if (newStatus !== 'confirmed') {
            updatePayload.confirmed_date = null;
        }

        // For completed/withdrawn, update ALL variants
        if (newStatus === 'completed' || newStatus === 'withdrawn') {
            const currentEnrollment = enrollments.find(e => e.id === id);
            if (!currentEnrollment) return;

            const relatedIds = enrollments
                .filter(e => e.student_id === currentEnrollment.student_id && e.course_id === currentEnrollment.course_id)
                .map(e => e.id);

            const { error } = await supabase
                .from('enrollments')
                .update(updatePayload)
                .in('id', relatedIds);

            if (!error) {
                setEnrollments(prev => prev.map(e =>
                    relatedIds.includes(e.id) ? { ...e, status: newStatus, confirmed_date: updatePayload.confirmed_date ?? null } : e
                ));
                showToast(`Updated ${relatedIds.length} related enrollment(s)`, 'success');
            } else {
                showToast('Error updating status', 'error');
            }
        } else {
            const { error } = await supabase.from('enrollments').update(updatePayload).eq('id', id);
            if (!error) {
                setEnrollments(prev => prev.map(e =>
                    e.id === id ? { ...e, status: newStatus, confirmed_date: updatePayload.confirmed_date ?? null } : e
                ));
            } else {
                showToast('Error updating status', 'error');
            }
        }
        setOpenMenuId(null);
    }

    // ─── Bulk Update ────────────────────────────────────────
    async function bulkUpdateStatus(newStatus: string, confirmedDate?: string) {
        if (selectedIds.size === 0) return;

        if (newStatus === 'confirmed' && !confirmedDate) {
            setConfirmDateTarget({ ids: Array.from(selectedIds), bulk: true });
            setConfirmDate(todayISO());
            return;
        }

        let idsToUpdate = Array.from(selectedIds);
        const updatePayload: Record<string, string | null> = { status: newStatus };
        if (newStatus === 'confirmed' && confirmedDate) {
            updatePayload.confirmed_date = confirmedDate;
        }
        if (newStatus !== 'confirmed') {
            updatePayload.confirmed_date = null;
        }

        if (newStatus === 'completed' || newStatus === 'withdrawn') {
            const selectedEnrollments = enrollments.filter(e => selectedIds.has(e.id));
            const extraIds: string[] = [];
            selectedEnrollments.forEach(curr => {
                enrollments.filter(e =>
                    e.student_id === curr.student_id &&
                    e.course_id === curr.course_id &&
                    !selectedIds.has(e.id)
                ).forEach(r => extraIds.push(r.id));
            });
            idsToUpdate = [...idsToUpdate, ...extraIds];
        }

        const { error } = await supabase
            .from('enrollments')
            .update(updatePayload)
            .in('id', idsToUpdate);

        if (!error) {
            setEnrollments(prev => prev.map(e =>
                idsToUpdate.includes(e.id)
                    ? { ...e, status: newStatus, confirmed_date: updatePayload.confirmed_date ?? null }
                    : e
            ));
            setSelectedIds(new Set());
            showToast(`${idsToUpdate.length} enrollment(s) → ${newStatus}`, 'success');
        } else {
            showToast('Error updating status', 'error');
        }
    }

    // ─── Confirm Date Handler ───────────────────────────────
    async function handleConfirmWithDate() {
        if (!confirmDateTarget) return;
        if (confirmDateTarget.bulk) {
            await bulkUpdateStatus('confirmed', confirmDate);
        } else {
            await updateStatus(confirmDateTarget.ids[0], 'confirmed', confirmDate);
        }
        setConfirmDateTarget(null);
    }

    // ─── Delete ─────────────────────────────────────────────
    async function handleDeleteEnrollment() {
        if (!deleteTarget) return;
        const { error } = await supabase.from('enrollments').delete().eq('id', deleteTarget.id);
        if (!error) {
            setEnrollments(prev => prev.filter(e => e.id !== deleteTarget.id));
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(deleteTarget.id);
                return next;
            });
            showToast('Enrollment deleted', 'success');
        } else {
            showToast('Failed to delete enrollment', 'error');
        }
        setDeleteTarget(null);
    }

    // ─── Filtering ──────────────────────────────────────────
    const filteredEnrollments = useMemo(() => {
        let result = enrollments;
        if (selectedCourse !== 'all') result = result.filter(e => e.course_id === selectedCourse);
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
    }, [enrollments, selectedCourse, searchQuery, dateFrom, dateTo]);

    // ─── Group by Status ────────────────────────────────────
    const byStatus = useMemo(() => {
        const map: Record<string, Enrollment[]> = {};
        ALL_STATUSES.forEach(s => { map[s] = []; });
        filteredEnrollments.forEach(e => {
            if (map[e.status]) map[e.status].push(e);
            else map[e.status] = [e];
        });
        return map;
    }, [filteredEnrollments]);

    // ─── Status Counts (unfiltered) ─────────────────────────
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        ALL_STATUSES.forEach(s => { counts[s] = 0; });
        enrollments.forEach(e => { counts[e.status] = (counts[e.status] || 0) + 1; });
        return counts;
    }, [enrollments]);

    // ─── Selection ──────────────────────────────────────────
    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function selectAllInColumn(status: string) {
        const items = byStatus[status] || [];
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

    // ─── Copy ───────────────────────────────────────────────
    async function handleCopyEmails(items: Enrollment[], label: string) {
        const emailStr = collectEmails(items);
        if (!emailStr) { showToast('No emails to copy', 'error'); return; }
        await copyToClipboard(emailStr);
        showToast(`${label} emails copied!`, 'success');
    }

    async function handleCopySelectedEmails() {
        const selected = filteredEnrollments.filter(e => selectedIds.has(e.id));
        await handleCopyEmails(selected, `${selected.length}`);
    }

    // ─── Unique course list for chips ───────────────────────
    const uniqueCourses = useMemo(() => {
        const seen = new Map<string, string>();
        enrollments.forEach(e => {
            if (e.course_id && e.courses?.name && !seen.has(e.course_id)) {
                seen.set(e.course_id, e.courses.name);
            }
        });
        return Array.from(seen.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [enrollments]);

    const hasFilters = searchQuery || selectedCourse !== 'all' || dateFrom || dateTo;
    const selectedCount = selectedIds.size;
    const secondaryCount = (byStatus['withdrawn']?.length || 0) + (byStatus['rejected']?.length || 0);

    // ─── Render ─────────────────────────────────────────────
    return (
        <div className="space-y-4 pb-24">
            {/* ═══ Toolbar ═══ */}
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
                                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                                    {enrollments.length}
                                </span>
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
                            <Plus size={16} /> Add
                        </button>
                    </div>
                </div>

                {/* Row 2: Course chips */}
                <div className="flex flex-wrap gap-2 items-center">
                    <button
                        onClick={() => setSelectedCourse('all')}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${selectedCourse === 'all'
                            ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                            : 'bg-white text-surface-600 border-surface-200 hover:border-brand-300 hover:text-brand-600'
                            }`}
                    >
                        All Courses
                    </button>
                    {uniqueCourses.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setSelectedCourse(c.id === selectedCourse ? 'all' : c.id)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${selectedCourse === c.id
                                ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                                : 'bg-white text-surface-600 border-surface-200 hover:border-brand-300 hover:text-brand-600'
                                }`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>

                {/* Row 3: Date filter + Clear */}
                <div className="flex flex-wrap gap-2.5 items-center">
                    <div className="flex items-center gap-1.5 text-surface-400">
                        <Filter size={14} />
                        <span className="text-xs font-medium">Date:</span>
                    </div>
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
                                setDateFrom('');
                                setDateTo('');
                            }}
                            className="text-xs font-medium text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-all"
                        >
                            Clear filters
                        </button>
                    )}
                    <span className="text-xs text-surface-400 font-medium ml-auto">
                        {filteredEnrollments.length} of {enrollments.length} enrollments
                    </span>
                </div>

                {/* Row 4: Status Summary Bar */}
                <div className="flex flex-wrap gap-2">
                    {ALL_STATUSES.map(status => {
                        const cfg = STATUS_CONFIG[status];
                        const count = statusCounts[status] || 0;
                        if (count === 0 && SECONDARY_STATUSES.includes(status as typeof SECONDARY_STATUSES[number])) return null;
                        return (
                            <div
                                key={status}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${cfg.bg} ${cfg.color} ${cfg.border} border`}
                            >
                                {cfg.icon}
                                <span>{cfg.label}</span>
                                <span className="font-bold">{count}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═══ Kanban Pipeline ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {PIPELINE_STATUSES.map(status => {
                    const cfg = STATUS_CONFIG[status];
                    const items = byStatus[status] || [];
                    const allSelected = items.length > 0 && items.every(e => selectedIds.has(e.id));
                    const someSelected = items.some(e => selectedIds.has(e.id));

                    return (
                        <div key={status} className="flex flex-col bg-white rounded-2xl shadow-card border border-surface-200/60 overflow-hidden">
                            {/* Column Header */}
                            <div className={`p-3.5 border-b-2 ${cfg.border}`}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${cfg.gradient}`} />
                                        <h3 className="text-sm font-bold text-surface-800">{cfg.label}</h3>
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.pillBg}`}>
                                            {items.length}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {items.length > 0 && (
                                            <button
                                                onClick={() => handleCopyEmails(items, cfg.label)}
                                                className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-all"
                                                title={`Copy all ${cfg.label} emails`}
                                            >
                                                <Copy size={13} />
                                            </button>
                                        )}
                                        {items.length > 0 && (
                                            <button
                                                onClick={() => selectAllInColumn(status)}
                                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${allSelected
                                                    ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                                                    : someSelected
                                                        ? 'bg-brand-100 border-brand-400 text-brand-600'
                                                        : 'border-surface-300 hover:border-brand-400'
                                                    }`}
                                            >
                                                {(allSelected || someSelected) && <Check size={10} />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Cards */}
                            <div className="p-2 overflow-y-auto flex-1 space-y-1.5" style={{ maxHeight: '520px' }}>
                                {items.length === 0 && (
                                    <div className="text-center py-8 text-surface-300">
                                        <div className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center mx-auto mb-2 ${cfg.color} opacity-40`}>
                                            {cfg.icon}
                                        </div>
                                        <p className="text-xs">No enrollments</p>
                                    </div>
                                )}
                                {items.map(enrollment => {
                                    const isSelected = selectedIds.has(enrollment.id);
                                    const isMenuOpen = openMenuId === enrollment.id;

                                    return (
                                        <div
                                            key={enrollment.id}
                                            className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${isSelected
                                                ? 'border-brand-300 bg-brand-50/50 shadow-sm ring-1 ring-brand-200/50'
                                                : 'border-surface-100 bg-white hover:shadow-sm hover:border-surface-200'
                                                }`}
                                            onClick={() => toggleSelect(enrollment.id)}
                                        >
                                            <div className="flex items-start gap-2.5">
                                                {/* Checkbox */}
                                                <div
                                                    className={`mt-0.5 w-[16px] h-[16px] rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${isSelected
                                                        ? 'bg-brand-500 border-brand-500 text-white'
                                                        : 'border-surface-300 group-hover:border-brand-300'
                                                        }`}
                                                >
                                                    {isSelected && <Check size={9} />}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    {/* Name + Actions */}
                                                    <div className="flex justify-between items-start">
                                                        <p className="font-semibold text-surface-900 text-[13px] truncate leading-5">
                                                            {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                        </p>
                                                        {/* ⋯ Action Menu */}
                                                        <div className="relative" ref={isMenuOpen ? menuRef : null}>
                                                            <button
                                                                onClick={e => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : enrollment.id); }}
                                                                className={`p-1 rounded-md transition-all ${isMenuOpen
                                                                    ? 'bg-surface-200 text-surface-700'
                                                                    : 'text-surface-300 opacity-0 group-hover:opacity-100 hover:bg-surface-100 hover:text-surface-600'
                                                                    }`}
                                                            >
                                                                <MoreHorizontal size={14} />
                                                            </button>

                                                            {isMenuOpen && (
                                                                <div className="absolute right-0 top-7 z-50 w-44 bg-white rounded-xl shadow-lg border border-surface-200 py-1.5 animate-scaleIn origin-top-right">
                                                                    {ALL_STATUSES.filter(s => s !== status).map(s => {
                                                                        const sCfg = STATUS_CONFIG[s];
                                                                        return (
                                                                            <button
                                                                                key={s}
                                                                                onClick={e => { e.stopPropagation(); updateStatus(enrollment.id, s); }}
                                                                                className="w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 hover:bg-surface-50 transition-all"
                                                                            >
                                                                                <ArrowRight size={12} className="text-surface-300" />
                                                                                <span className={sCfg.color}>{sCfg.icon}</span>
                                                                                <span className="text-surface-700">Move to {sCfg.label}</span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                    <div className="border-t border-surface-100 my-1" />
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); setDeleteTarget(enrollment); setOpenMenuId(null); }}
                                                                        className="w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 text-red-500 hover:bg-red-50 transition-all"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Course pill */}
                                                    <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 ${cfg.pillBg}`}>
                                                        {getCoursePill(enrollment)}
                                                    </span>

                                                    {/* Info row */}
                                                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-surface-400">
                                                        <span>{formatShortDate(enrollment.created_at)}</span>
                                                        {enrollment.confirmed_date && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                                                                    <CheckCircle size={10} />
                                                                    {formatDate(enrollment.confirmed_date)}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Notes */}
                                                    {enrollment.notes && (
                                                        <p className="text-[11px] text-surface-400 italic mt-1 bg-surface-50 px-2 py-1 rounded-md truncate">
                                                            📝 {enrollment.notes}
                                                        </p>
                                                    )}
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

            {/* ═══ Secondary Statuses (Withdrawn / Rejected) ═══ */}
            {secondaryCount > 0 && (
                <div>
                    <button
                        onClick={() => setShowSecondary(!showSecondary)}
                        className="flex items-center gap-2 text-sm font-medium text-surface-500 hover:text-surface-700 transition-all mb-3"
                    >
                        <ChevronDown size={16} className={`transition-transform ${showSecondary ? 'rotate-180' : ''}`} />
                        Withdrawn & Rejected ({secondaryCount})
                    </button>

                    {showSecondary && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-slideDown">
                            {SECONDARY_STATUSES.map(status => {
                                const cfg = STATUS_CONFIG[status];
                                const items = byStatus[status] || [];
                                if (items.length === 0) return null;

                                return (
                                    <div key={status} className="bg-white rounded-2xl shadow-card border border-surface-200/60 overflow-hidden opacity-75">
                                        <div className={`p-3 border-b ${cfg.border} ${cfg.bg}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={cfg.color}>{cfg.icon}</span>
                                                <h3 className="text-sm font-bold text-surface-700">{cfg.label}</h3>
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.pillBg}`}>
                                                    {items.length}
                                                </span>
                                                <button
                                                    onClick={() => handleCopyEmails(items, cfg.label)}
                                                    className="ml-auto p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-all"
                                                    title={`Copy ${cfg.label} emails`}
                                                >
                                                    <Copy size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto">
                                            {items.map(enrollment => (
                                                <div
                                                    key={enrollment.id}
                                                    className="group p-3 rounded-xl border border-surface-100 bg-white hover:shadow-sm transition-all flex items-center gap-3"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-surface-700 text-[13px] truncate">
                                                            {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                        </p>
                                                        <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${cfg.pillBg}`}>
                                                            {getCoursePill(enrollment)}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => updateStatus(enrollment.id, 'requested')}
                                                        className="text-[11px] font-medium text-surface-400 hover:text-brand-600 hover:bg-brand-50 px-2 py-1 rounded-lg transition-all whitespace-nowrap"
                                                    >
                                                        Restore
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteTarget(enrollment)}
                                                        className="text-surface-300 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Empty State ═══ */}
            {filteredEnrollments.length === 0 && (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <GraduationCap size={28} className="text-surface-300" />
                    </div>
                    <p className="text-lg font-semibold text-surface-700">No enrollments found</p>
                    <p className="text-sm text-surface-400 mt-1">Try adjusting your filters or add a new enrollment</p>
                </div>
            )}

            {/* ═══ Floating Action Bar ═══ */}
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
                            <Send size={14} /> Invite
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('confirmed')}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-sm"
                        >
                            <CheckCircle size={14} /> Confirm
                        </button>

                        <button
                            onClick={() => bulkUpdateStatus('completed')}
                            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white transition-all shadow-sm"
                        >
                            <GraduationCap size={14} /> Complete
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

            {/* ═══ Confirm Date Modal ═══ */}
            {confirmDateTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => setConfirmDateTarget(null)}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl border border-surface-200 p-6 w-full max-w-sm mx-4 animate-scaleIn"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                                <CheckCircle size={22} />
                            </div>
                            <div>
                                <h3 className="font-bold text-surface-900">Confirm Enrollment</h3>
                                <p className="text-xs text-surface-500 mt-0.5">
                                    {confirmDateTarget.ids.length === 1
                                        ? 'Set the confirmation date for this enrollment'
                                        : `Set the confirmation date for ${confirmDateTarget.ids.length} enrollments`
                                    }
                                </p>
                            </div>
                        </div>

                        <label className="block text-sm font-medium text-surface-700 mb-1.5">
                            Confirmation Date
                        </label>
                        <input
                            type="date"
                            value={confirmDate}
                            onChange={e => setConfirmDate(e.target.value)}
                            className="w-full px-4 py-3 border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-surface-50"
                        />

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setConfirmDateTarget(null)}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmWithDate}
                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl transition-all shadow-sm"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Modals ═══ */}
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

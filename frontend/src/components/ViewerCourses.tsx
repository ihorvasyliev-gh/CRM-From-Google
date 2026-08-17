import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ViewerCourse, ViewerCourseRosterItem, getAvatarGradient, cleanVariant } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';
import { useRequestCompletion } from '../hooks/useApprovals';
import Toast, { ToastData } from './Toast';
import {
    BookOpen, Search, ArrowLeft, Users, Clock, CheckCircle,
    GraduationCap, CheckSquare, Square, Calendar, Loader2,
    AlertCircle, RefreshCw, Star, ArrowDownUp, ArrowUpDown, CaseSensitive
} from 'lucide-react';

const STATUS_TABS = [
    { key: 'all', label: 'All Students' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'requested', label: 'Requested' },
    { key: 'invited', label: 'Invited' },
    { key: 'completed', label: 'Completed' },
] as const;

function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    try {
        return new Date(dateStr).toLocaleDateString('en-IE');
    } catch {
        return dateStr;
    }
}

export default function ViewerCourses() {
    const [selectedCourse, setSelectedCourse] = useState<ViewerCourse | null>(null);
    const [catalogSearch, setCatalogSearch] = useState('');
    const debouncedCatalogSearch = useDebounce(catalogSearch, 250);

    const [rosterSearch, setRosterSearch] = useState('');
    const debouncedRosterSearch = useDebounce(rosterSearch, 250);
    const [selectedStatusTab, setSelectedStatusTab] = useState<string>('all');
    const [sortOrder, setSortOrder] = useState<'queue' | 'date-desc' | 'name'>('queue');
    const [selectedVariant, setSelectedVariant] = useState<string>('all');

    // Selection for bulk completion
    const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<Set<string>>(new Set());

    // Date Modal state
    const [dateModalOpen, setDateModalOpen] = useState(false);
    const [completionTargetIds, setCompletionTargetIds] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [toast, setToast] = useState<ToastData | null>(null);

    const requestCompletionMutation = useRequestCompletion();

    // 1. Query: List of courses
    const {
        data: courses = [],
        isLoading: isLoadingCourses,
        error: coursesError,
        refetch: refetchCourses
    } = useQuery<ViewerCourse[]>({
        queryKey: ['viewer_courses'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_viewer_courses');
            if (error) throw error;
            return (data || []).map((c: any) => ({
                id: c.id,
                name: c.name,
                created_at: c.created_at,
                total_count: Number(c.total_count || 0),
                requested_count: Number(c.requested_count || 0),
                invited_count: Number(c.invited_count || 0),
                confirmed_count: Number(c.confirmed_count || 0),
                completed_count: Number(c.completed_count || 0),
                rejected_count: Number(c.rejected_count || 0),
                pending_approval_count: Number(c.pending_approval_count || 0),
            }));
        },
    });

    // 2. Query: Roster for selected course
    const {
        data: roster = [],
        isLoading: isLoadingRoster,
        error: rosterError,
        refetch: refetchRoster
    } = useQuery<ViewerCourseRosterItem[]>({
        queryKey: ['viewer_course_roster', selectedCourse?.id, selectedStatusTab, debouncedRosterSearch],
        queryFn: async () => {
            if (!selectedCourse) return [];
            const { data, error } = await supabase.rpc('get_viewer_course_roster', {
                p_course_id: selectedCourse.id,
                p_status: selectedStatusTab === 'all' ? null : selectedStatusTab,
                p_search: debouncedRosterSearch.trim() || null,
            });
            if (error) throw error;
            return (data || []) as ViewerCourseRosterItem[];
        },
        enabled: !!selectedCourse,
    });

    // Extract unique course variants from the loaded roster
    const availableVariants = useMemo(() => {
        const variants = new Set<string>();
        roster.forEach(r => {
            if (r.course_variant && r.course_variant.trim()) {
                variants.add(cleanVariant(selectedCourse?.name || '', r.course_variant));
            }
        });
        return Array.from(variants);
    }, [roster, selectedCourse]);

    // Sorted and filtered roster
    const sortedRoster = useMemo(() => {
        let list = [...roster];

        // Filter by variant if selected
        if (selectedVariant !== 'all') {
            list = list.filter(item => {
                const cleaned = cleanVariant(selectedCourse?.name || '', item.course_variant);
                return cleaned.toLowerCase() === selectedVariant.toLowerCase();
            });
        }

        return list.sort((a, b) => {
            // 1. Pending approvals always on top
            if (a.completion_request_status === 'pending' && b.completion_request_status !== 'pending') return -1;
            if (b.completion_request_status === 'pending' && a.completion_request_status !== 'pending') return 1;

            // 2. Status hierarchy on 'all' tab
            if (selectedStatusTab === 'all' && a.status !== b.status) {
                const statusOrder: Record<string, number> = {
                    confirmed: 1,
                    invited: 2,
                    requested: 3,
                    completed: 4,
                    rejected: 5,
                };
                const orderA = statusOrder[a.status] ?? 99;
                const orderB = statusOrder[b.status] ?? 99;
                if (orderA !== orderB) return orderA - orderB;
            }

            // 3. Priority: Star / Priority is always first (Admin principle)!
            if (a.is_priority !== b.is_priority) {
                return a.is_priority ? -1 : 1;
            }

            // 4. Sort order
            if (sortOrder === 'queue') {
                // If in requested status and both have queue_position, respect it
                if (a.status === 'requested' && b.status === 'requested') {
                    if (a.queue_position != null && b.queue_position != null && a.queue_position !== b.queue_position) {
                        return a.queue_position - b.queue_position;
                    }
                }
                const aDate = new Date(a.created_at).getTime();
                const bDate = new Date(b.created_at).getTime();
                if (aDate !== bDate) return aDate - bDate;
                const aName = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
                const bName = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
                return aName.localeCompare(bName);
            } else if (sortOrder === 'date-desc') {
                const aDate = new Date(a.created_at).getTime();
                const bDate = new Date(b.created_at).getTime();
                if (aDate !== bDate) return bDate - aDate;
                const aName = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
                const bName = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
                return aName.localeCompare(bName);
            } else if (sortOrder === 'name') {
                const aName = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
                const bName = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
                return aName.localeCompare(bName);
            }
            return 0;
        });
    }, [roster, sortOrder, selectedVariant, selectedStatusTab, selectedCourse]);

    // Filter courses for catalog search
    const filteredCourses = useMemo(() => {
        if (!debouncedCatalogSearch.trim()) return courses;
        const q = debouncedCatalogSearch.toLowerCase();
        return courses.filter(c => c.name.toLowerCase().includes(q));
    }, [courses, debouncedCatalogSearch]);

    // Eligible enrollments in current roster view for batch completion (not already completed & not already pending)
    const eligibleRosterItems = useMemo(() => {
        return sortedRoster.filter(item => item.status !== 'completed' && item.completion_request_status !== 'pending');
    }, [sortedRoster]);

    const isAllSelected = eligibleRosterItems.length > 0 && eligibleRosterItems.every(item => selectedEnrollmentIds.has(item.enrollment_id));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedEnrollmentIds(new Set());
        } else {
            setSelectedEnrollmentIds(new Set(eligibleRosterItems.map(item => item.enrollment_id)));
        }
    };

    const toggleSelectItem = (id: string) => {
        setSelectedEnrollmentIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const openSingleCompletionModal = (item: ViewerCourseRosterItem) => {
        const defaultDate = item.confirmed_date || item.invited_date || new Date().toISOString().split('T')[0];
        setSelectedDate(defaultDate);
        setCompletionTargetIds([item.enrollment_id]);
        setDateModalOpen(true);
    };

    const openBatchCompletionModal = () => {
        if (selectedEnrollmentIds.size === 0) return;
        setSelectedDate(new Date().toISOString().split('T')[0]);
        setCompletionTargetIds(Array.from(selectedEnrollmentIds));
        setDateModalOpen(true);
    };

    const handleSubmitCompletionRequest = async () => {
        if (completionTargetIds.length === 0) return;
        try {
            await requestCompletionMutation.mutateAsync({
                enrollmentIds: completionTargetIds,
                completedDate: selectedDate,
            });
            setToast({
                message: `Completion request submitted for ${completionTargetIds.length} student(s). Waiting for Admin approval.`,
                type: 'success',
            });
            setDateModalOpen(false);
            setSelectedEnrollmentIds(new Set());
            refetchRoster();
            refetchCourses();
        } catch (err: any) {
            setToast({
                message: err.message || 'Failed to submit completion request',
                type: 'error',
            });
        }
    };

    // ─────────────────────────────────────────────────────────
    // RENDER: ROSTER VIEW
    // ─────────────────────────────────────────────────────────
    if (selectedCourse) {
        return (
            <div className="flex-1 flex flex-col min-h-0 bg-background text-primary animate-fadeIn space-y-4">
                {/* Header with back button */}
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                setSelectedCourse(null);
                                setSelectedEnrollmentIds(new Set());
                                setRosterSearch('');
                                setSelectedStatusTab('all');
                                setSelectedVariant('all');
                                setSortOrder('queue');
                            }}
                            className="p-2 bg-surface-elevated hover:bg-surface border border-border-subtle rounded-xl text-muted hover:text-primary transition-all flex items-center gap-1.5 text-xs font-semibold"
                            title="Back to courses list"
                        >
                            <ArrowLeft size={16} />
                            <span>Courses</span>
                        </button>

                        <div className="flex items-center gap-2.5">
                            <div className={`w-9 h-9 bg-gradient-to-br ${getAvatarGradient(selectedCourse.id)} rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-sm`}>
                                {selectedCourse.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <h1 className="text-base sm:text-lg font-bold text-primary tracking-tight flex items-center gap-2">
                                    {selectedCourse.name}
                                </h1>
                                <p className="text-xs text-muted">
                                    Total {selectedCourse.total_count} students registered
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Quick batch action button */}
                    {selectedEnrollmentIds.size > 0 && (
                        <div className="flex items-center gap-2 animate-fadeIn">
                            <span className="text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-1.5 rounded-xl border border-brand-500/20">
                                {selectedEnrollmentIds.size} selected
                            </span>
                            <button
                                onClick={openBatchCompletionModal}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm"
                            >
                                <GraduationCap size={15} />
                                <span>Mark Selected as Completed</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Filters & Search Bar */}
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-3 sm:p-4 space-y-3">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                        {/* Status Tabs */}
                        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                            {STATUS_TABS.map(tab => {
                                const isActive = selectedStatusTab === tab.key;
                                let count = selectedCourse.total_count;
                                if (tab.key === 'confirmed') count = selectedCourse.confirmed_count;
                                if (tab.key === 'requested') count = selectedCourse.requested_count;
                                if (tab.key === 'invited') count = selectedCourse.invited_count;
                                if (tab.key === 'completed') count = selectedCourse.completed_count;

                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => {
                                            setSelectedStatusTab(tab.key);
                                            setSelectedEnrollmentIds(new Set());
                                        }}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex-shrink-0 flex items-center gap-1.5 border ${
                                            isActive
                                                ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                                                : 'bg-surface-elevated hover:bg-surface text-muted hover:text-primary border-border-subtle'
                                        }`}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                            isActive ? 'bg-white/20 text-white' : 'bg-background text-muted'
                                        }`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search Input */}
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
                            <input
                                type="text"
                                placeholder="Search attendees..."
                                value={rosterSearch}
                                onChange={e => setRosterSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 bg-surface-elevated border border-border-strong rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-primary"
                            />
                        </div>
                    </div>

                    {/* Sub-toolbar: Sort Controls + Variants (if any) + Refresh */}
                    <div className="pt-2.5 border-t border-border-subtle/50 flex flex-wrap items-center justify-between gap-2.5">
                        {/* Sort pills */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="flex items-center gap-1 text-muted mr-1 text-xs font-semibold">
                                <ArrowDownUp size={13} />
                                <span className="text-[11px] uppercase tracking-wider">Sort:</span>
                            </div>
                            {([
                                { value: 'queue' as const, label: 'Queue Order (Oldest)', icon: <Clock size={12} /> },
                                { value: 'date-desc' as const, label: 'Newest First', icon: <ArrowUpDown size={12} /> },
                                { value: 'name' as const, label: 'By Name', icon: <CaseSensitive size={12} /> },
                            ]).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setSortOrder(opt.value)}
                                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl border transition-all active:scale-95 ${
                                        sortOrder === opt.value
                                            ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                                            : 'bg-surface-elevated hover:bg-surface text-muted hover:text-primary border-border-subtle'
                                    }`}
                                >
                                    {opt.icon}
                                    <span>{opt.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Right: Variants Filter (if available) & Refresh */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {availableVariants.length > 1 && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setSelectedVariant('all')}
                                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-xl border transition-all ${
                                            selectedVariant === 'all'
                                                ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                                : 'bg-surface-elevated text-muted border-border-subtle hover:text-primary'
                                        }`}
                                    >
                                        All Streams
                                    </button>
                                    {availableVariants.map(v => (
                                        <button
                                            key={v}
                                            onClick={() => setSelectedVariant(v === selectedVariant ? 'all' : v)}
                                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-xl border transition-all ${
                                                selectedVariant === v
                                                    ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                                    : 'bg-surface-elevated text-muted border-border-subtle hover:text-primary'
                                            }`}
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <button
                                onClick={() => refetchRoster()}
                                className="flex items-center gap-1 text-muted hover:text-primary transition-colors text-xs font-semibold px-2.5 py-1 rounded-xl bg-surface-elevated hover:bg-surface border border-border-subtle"
                                title="Refresh roster"
                            >
                                <RefreshCw size={12} />
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>

                    {/* Batch Selection Row if applicable */}
                    {eligibleRosterItems.length > 0 && (
                        <div className="pt-2 border-t border-border-subtle/50 flex items-center justify-between text-xs text-muted">
                            <button
                                onClick={toggleSelectAll}
                                className="flex items-center gap-1.5 font-semibold text-primary hover:text-brand-500 transition-colors"
                            >
                                {isAllSelected ? <CheckSquare size={16} className="text-brand-500" /> : <Square size={16} />}
                                <span>{isAllSelected ? 'Deselect All' : `Select All Non-Completed (${eligibleRosterItems.length})`}</span>
                            </button>
                            <span className="text-[11px] text-muted">
                                Showing {sortedRoster.length} student{sortedRoster.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>

                {/* Roster Items List */}
                <div className="flex-1 overflow-y-auto space-y-2.5">
                    {isLoadingRoster ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted">
                            <Loader2 size={30} className="animate-spin text-brand-500" />
                            <span className="text-xs font-semibold">Loading course roster...</span>
                        </div>
                    ) : rosterError ? (
                        <div className="p-8 text-center bg-red-500/5 border border-red-500/20 rounded-2xl">
                            <AlertCircle size={28} className="text-red-500 mx-auto mb-2" />
                            <p className="text-sm font-bold text-red-500">Failed to load roster</p>
                            <p className="text-xs text-muted mt-1">Please try refreshing or check your connection.</p>
                        </div>
                    ) : sortedRoster.length === 0 ? (
                        <div className="p-12 text-center bg-surface rounded-2xl border border-border-subtle">
                            <Users size={32} className="text-muted mx-auto mb-2 opacity-50" />
                            <p className="text-sm font-bold text-primary">No students in this list</p>
                            <p className="text-xs text-muted mt-1">Try switching tabs or adjusting search query.</p>
                        </div>
                    ) : (
                        sortedRoster.map(item => {
                            const isSelected = selectedEnrollmentIds.has(item.enrollment_id);
                            const isPending = item.completion_request_status === 'pending';
                            const isRejected = item.completion_request_status === 'rejected';
                            const isCompleted = item.status === 'completed';
                            const isEligibleForCompletion = !isCompleted && !isPending;

                            return (
                                <div
                                    key={item.enrollment_id}
                                    className={`p-3.5 sm:p-4 rounded-2xl bg-surface border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                        isSelected
                                            ? 'border-brand-500 bg-brand-500/5 shadow-sm'
                                            : isPending
                                            ? 'border-amber-500/40 bg-amber-500/5'
                                            : 'border-border-subtle hover:border-border-strong'
                                    }`}
                                >
                                    {/* Left: Checkbox + Student Info */}
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                        {isEligibleForCompletion ? (
                                            <button
                                                onClick={() => toggleSelectItem(item.enrollment_id)}
                                                className="mt-1 text-muted hover:text-brand-500 transition-colors flex-shrink-0"
                                            >
                                                {isSelected ? (
                                                    <CheckSquare size={18} className="text-brand-500" />
                                                ) : (
                                                    <Square size={18} />
                                                )}
                                            </button>
                                        ) : (
                                            <div className="w-[18px] flex-shrink-0" />
                                        )}

                                        <div className={`w-10 h-10 bg-gradient-to-br ${getAvatarGradient(item.student_id)} rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0`}>
                                            {(item.first_name?.[0] || '').toUpperCase()}{(item.last_name?.[0] || '').toUpperCase()}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-bold text-primary text-sm truncate">
                                                    {item.first_name} {item.last_name}
                                                </h3>
                                                {item.is_priority && (
                                                    <span 
                                                        className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg shadow-sm"
                                                        title="Priority student"
                                                    >
                                                        <Star size={12} className="fill-amber-500 text-amber-500" />
                                                        <span>Priority</span>
                                                    </span>
                                                )}
                                                {item.course_variant && (
                                                    <span className="text-[10px] bg-surface-elevated border border-border-subtle px-1.5 py-0.2 rounded text-muted">
                                                        {cleanVariant(selectedCourse.name, item.course_variant)}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted">
                                                <span>{item.email}</span>
                                                {item.phone && <span>• {item.phone}</span>}
                                            </div>

                                            {/* Dates Line */}
                                            <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-[11px]">
                                                {/* Registration Date (Queue order basis) */}
                                                <span className="text-muted font-medium flex items-center gap-1" title="Registration Date">
                                                    <Clock size={11} /> Registered: {formatDate(item.created_at)}
                                                </span>
                                                {item.confirmed_date && (
                                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                                        <Calendar size={11} /> Confirmed: {formatDate(item.confirmed_date)}
                                                    </span>
                                                )}
                                                {item.invited_date && !item.confirmed_date && (
                                                    <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                                                        <Calendar size={11} /> Invited: {formatDate(item.invited_date)}
                                                    </span>
                                                )}
                                                {item.completed_date && (
                                                    <span className="text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1">
                                                        <GraduationCap size={11} /> Completed: {formatDate(item.completed_date)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Rejection notice if previously rejected */}
                                            {isRejected && (
                                                <div className="mt-1.5 text-[11px] text-red-500 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg">
                                                    <strong>Completion Request Rejected:</strong> {item.completion_rejection_reason || 'No reason provided by admin'}. You can re-submit if needed.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Status & Action Button */}
                                    <div className="flex items-center gap-2 flex-shrink-0 sm:self-center justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border-subtle">
                                        {/* Status badge */}
                                        <div className="flex items-center gap-1.5">
                                            {isPending ? (
                                                <span className="px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center gap-1.5 animate-pulse">
                                                    <Clock size={13} />
                                                    <span>Pending Admin Approval</span>
                                                </span>
                                            ) : isCompleted ? (
                                                <span className="px-2.5 py-1 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-500/15 border border-teal-500/30 rounded-xl flex items-center gap-1.5">
                                                    <CheckCircle size={13} />
                                                    <span>Completed</span>
                                                </span>
                                            ) : item.status === 'requested' ? (
                                                <span className="px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center gap-1.5">
                                                    <Clock size={13} />
                                                    <span>Queue</span>
                                                    {item.queue_position != null && (
                                                        <span className="bg-amber-500/25 text-amber-900 dark:text-amber-200 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                                                            #{item.queue_position}
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 text-xs font-semibold text-muted bg-surface-elevated border border-border-subtle rounded-xl capitalize">
                                                    {item.status}
                                                </span>
                                            )}
                                        </div>

                                        {/* Action Button */}
                                        {isEligibleForCompletion && (
                                            <button
                                                onClick={() => openSingleCompletionModal(item)}
                                                className="px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                                title="Submit course completion request for admin approval"
                                            >
                                                <GraduationCap size={14} />
                                                <span>Mark Completed</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Date Selection Modal */}
                {dateModalOpen && (
                    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                        <div className="bg-surface rounded-3xl border border-border-subtle shadow-card max-w-md w-full p-6 space-y-4 animate-scaleUp">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                                    <GraduationCap size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-primary">Mark Course Completion</h3>
                                    <p className="text-xs text-muted">
                                        Requesting completion for <strong className="text-primary">{completionTargetIds.length}</strong> student(s)
                                    </p>
                                </div>
                            </div>

                            <div className="p-3.5 bg-surface-elevated rounded-2xl border border-border-subtle space-y-2">
                                <label className="text-xs font-bold text-muted uppercase tracking-wider block">
                                    Completion Date
                                </label>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-surface border border-border-strong rounded-xl text-sm text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                />
                                <p className="text-[11px] text-muted">
                                    This date will be sent to the administrator for review and verification.
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setDateModalOpen(false)}
                                    className="px-4 py-2 text-xs font-semibold text-muted hover:text-primary hover:bg-surface-elevated rounded-xl transition-all"
                                    disabled={requestCompletionMutation.isPending}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmitCompletionRequest}
                                    disabled={requestCompletionMutation.isPending || !selectedDate}
                                    className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                                >
                                    {requestCompletionMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                                    <span>Submit Request</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <Toast toast={toast} onDismiss={() => setToast(null)} />
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────
    // RENDER: CATALOG VIEW
    // ─────────────────────────────────────────────────────────
    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background text-primary space-y-4">
            {/* Catalog Header */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-xl">
                            <BookOpen size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-primary tracking-tight">Courses Catalog</h1>
                                <span className="text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full">
                                    {courses.length}
                                </span>
                            </div>
                            <p className="text-xs text-muted">
                                Select a course to view student rosters and mark completions
                            </p>
                        </div>
                    </div>

                    {/* Search Courses */}
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} />
                        <input
                            type="text"
                            placeholder="Search courses..."
                            value={catalogSearch}
                            onChange={e => setCatalogSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-surface-elevated border border-border-strong rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-primary"
                        />
                    </div>
                </div>
            </div>

            {/* Courses Grid */}
            <div className="flex-1 overflow-y-auto">
                {isLoadingCourses ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
                        <Loader2 size={32} className="animate-spin text-brand-500" />
                        <span className="text-sm font-semibold">Loading courses catalog...</span>
                    </div>
                ) : coursesError ? (
                    <div className="p-8 text-center bg-red-500/5 border border-red-500/20 rounded-2xl">
                        <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
                        <p className="text-sm font-bold text-red-500">Failed to load courses</p>
                        <p className="text-xs text-muted mt-1">Please try refreshing or check permissions.</p>
                        <button
                            onClick={() => refetchCourses()}
                            className="mt-3 px-3 py-1.5 bg-surface border border-border-subtle rounded-xl text-xs font-semibold hover:bg-surface-elevated"
                        >
                            Retry
                        </button>
                    </div>
                ) : filteredCourses.length === 0 ? (
                    <div className="text-center py-16 bg-surface rounded-2xl border border-border-subtle">
                        <BookOpen size={36} className="text-muted mx-auto mb-2 opacity-40" />
                        <p className="text-base font-bold text-primary">No courses found</p>
                        <p className="text-xs text-muted mt-1">No course names match "{catalogSearch}".</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredCourses.map(course => {
                            const gradient = getAvatarGradient(course.id);
                            return (
                                <div
                                    key={course.id}
                                    onClick={() => setSelectedCourse(course)}
                                    className="bg-surface rounded-2xl shadow-card border border-border-subtle hover:shadow-float hover:-translate-y-1 hover:border-brand-500/40 transition-all duration-200 overflow-hidden cursor-pointer group flex flex-col justify-between"
                                >
                                    <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />

                                    <div className="p-5 space-y-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-11 h-11 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm group-hover:scale-105 transition-transform`}>
                                                    {course.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-primary group-hover:text-brand-500 transition-colors text-sm sm:text-base">
                                                        {course.name}
                                                    </h3>
                                                    <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                                                        <Users size={12} />
                                                        <strong className="text-primary font-semibold">{course.total_count}</strong> students total
                                                    </p>
                                                </div>
                                            </div>

                                            {course.pending_approval_count > 0 && (
                                                <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full flex items-center gap-1 animate-pulse" title="Pending completions waiting for admin approval">
                                                    <Clock size={10} />
                                                    {course.pending_approval_count} pending
                                                </span>
                                            )}
                                        </div>

                                        {/* Status badges grid */}
                                        <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-border-subtle/50 text-[11px] text-center">
                                            <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                                <p className="font-bold text-emerald-600 dark:text-emerald-400">{course.confirmed_count}</p>
                                                <p className="text-[9px] text-muted uppercase font-semibold">Confirmed</p>
                                            </div>
                                            <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                                <p className="font-bold text-amber-600 dark:text-amber-400">{course.requested_count}</p>
                                                <p className="text-[9px] text-muted uppercase font-semibold">Queue</p>
                                            </div>
                                            <div className="p-1.5 bg-blue-500/10 rounded-lg">
                                                <p className="font-bold text-blue-600 dark:text-blue-400">{course.invited_count}</p>
                                                <p className="text-[9px] text-muted uppercase font-semibold">Invited</p>
                                            </div>
                                            <div className="p-1.5 bg-teal-500/10 rounded-lg">
                                                <p className="font-bold text-teal-600 dark:text-teal-400">{course.completed_count}</p>
                                                <p className="text-[9px] text-muted uppercase font-semibold">Completed</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}

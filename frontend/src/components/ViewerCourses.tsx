import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ViewerCourse, ViewerCourseRosterItem, getAvatarGradient, cleanVariant } from '../lib/types';
import { formatDateDMY, todayISO } from '../lib/dateUtils';
import { exportViewerRosterToExcel } from '../lib/excelExport';
import { useDebounce } from '../hooks/useDebounce';
import { useRequestCompletion } from '../hooks/useApprovals';
import Toast, { ToastData } from './Toast';
import {
    BookOpen, Search, ArrowLeft, Users, Clock, CheckCircle,
    GraduationCap, CheckSquare, Square, Calendar, Loader2,
    AlertCircle, RefreshCw, Star, ArrowDownUp, ArrowUpDown, CaseSensitive,
    Download, FileSpreadsheet, Copy, X, Send, RotateCcw
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
    return formatDateDMY(dateStr);
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
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');

    // Selection for bulk completion & export
    const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<Set<string>>(new Set());
    const [isExporting, setIsExporting] = useState(false);

    // Date Modal state
    const [dateModalOpen, setDateModalOpen] = useState(false);
    const [completionTargetIds, setCompletionTargetIds] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>(() => todayISO());
    const [toast, setToast] = useState<ToastData | null>(null);

    const handleCopyField = (value: string | null | undefined, label: string) => {
        if (!value) return;
        navigator.clipboard.writeText(value)
            .then(() => {
                setToast({
                    message: `${label} copied to clipboard!`,
                    type: 'success',
                });
            })
            .catch((err) => {
                console.error('Failed to copy text:', err);
                setToast({
                    message: `Failed to copy ${label.toLowerCase()}`,
                    type: 'error',
                });
            });
    };

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
        isFetching: isFetchingRoster,
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

    // Extract unique dates with student counts for confirmed / invited tabs
    const availableDates = useMemo(() => {
        if (selectedStatusTab !== 'confirmed' && selectedStatusTab !== 'invited') {
            return [];
        }

        const dateMap = new Map<string, number>();

        roster.forEach(item => {
            // If variant filter is active, respect it
            if (selectedVariant !== 'all') {
                const cleaned = cleanVariant(selectedCourse?.name || '', item.course_variant);
                if (cleaned.toLowerCase() !== selectedVariant.toLowerCase()) return;
            }

            if (selectedStatusTab === 'confirmed' && item.confirmed_date) {
                dateMap.set(item.confirmed_date, (dateMap.get(item.confirmed_date) || 0) + 1);
            } else if (selectedStatusTab === 'invited' && item.invited_date) {
                dateMap.set(item.invited_date, (dateMap.get(item.invited_date) || 0) + 1);
            }
        });

        return Array.from(dateMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [roster, selectedStatusTab, selectedVariant, selectedCourse]);

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

        // Filter by date if selected
        if (selectedDateFilter !== 'all') {
            if (selectedStatusTab === 'confirmed') {
                list = list.filter(item => item.confirmed_date === selectedDateFilter);
            } else if (selectedStatusTab === 'invited') {
                list = list.filter(item => item.invited_date === selectedDateFilter);
            }
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

            // 3. Priority: Star / Priority is always first
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
    }, [roster, sortOrder, selectedVariant, selectedDateFilter, selectedStatusTab, selectedCourse]);

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

    const handleBackToCatalog = () => {
        setSelectedCourse(null);
        setSelectedEnrollmentIds(new Set());
        setRosterSearch('');
        setSelectedStatusTab('all');
        setSelectedVariant('all');
        setSelectedDateFilter('all');
        setSortOrder('queue');
    };

    const openSingleCompletionModal = (item: ViewerCourseRosterItem) => {
        const defaultDate = item.confirmed_date || item.invited_date || todayISO();
        setSelectedDate(defaultDate);
        setCompletionTargetIds([item.enrollment_id]);
        setDateModalOpen(true);
    };

    const openBatchCompletionModal = () => {
        if (selectedEnrollmentIds.size === 0) return;
        setSelectedDate(todayISO());
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

    const handleExportSelected = async () => {
        if (selectedEnrollmentIds.size === 0 || !selectedCourse) return;
        const selectedItems = sortedRoster.filter(item => selectedEnrollmentIds.has(item.enrollment_id));
        if (selectedItems.length === 0) return;

        try {
            setIsExporting(true);
            const filterLabel = `${selectedStatusTab}_selected_${selectedItems.length}`;
            await exportViewerRosterToExcel({
                items: selectedItems,
                courseName: selectedCourse.name,
                filterLabel,
            });
            setToast({
                message: `Exported ${selectedItems.length} student(s) to Excel!`,
                type: 'success',
            });
        } catch (err: any) {
            console.error('Failed to export to Excel:', err);
            setToast({
                message: err.message || 'Failed to export to Excel',
                type: 'error',
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleCopySelectedBccEmails = () => {
        if (selectedEnrollmentIds.size === 0) return;
        const selectedItems = sortedRoster.filter(item => selectedEnrollmentIds.has(item.enrollment_id));
        const emails = selectedItems
            .map(i => i.email?.trim())
            .filter((e): e is string => !!e && e.length > 0);
        const uniqueEmails = Array.from(new Set(emails));
        if (uniqueEmails.length === 0) {
            setToast({ message: 'No valid email addresses found for selected students', type: 'error' });
            return;
        }
        const bccString = uniqueEmails.join(', ');
        navigator.clipboard.writeText(bccString).then(() => {
            setToast({ message: `Copied ${uniqueEmails.length} email(s) for BCC!`, type: 'success' });
        }).catch(() => {
            setToast({ message: 'Failed to copy emails to clipboard', type: 'error' });
        });
    };

    const handleExportFullRoster = async () => {
        if (!selectedCourse || sortedRoster.length === 0) return;

        try {
            setIsExporting(true);
            let filterLabel = selectedStatusTab;
            if (selectedDateFilter !== 'all') {
                filterLabel += `_${selectedDateFilter}`;
            }
            await exportViewerRosterToExcel({
                items: sortedRoster,
                courseName: selectedCourse.name,
                filterLabel,
            });
            setToast({
                message: `Exported ${sortedRoster.length} student(s) to Excel!`,
                type: 'success',
            });
        } catch (err: any) {
            console.error('Failed to export to Excel:', err);
            setToast({
                message: err.message || 'Failed to export to Excel',
                type: 'error',
            });
        } finally {
            setIsExporting(false);
        }
    };

    // ─────────────────────────────────────────────────────────
    // RENDER: ROSTER VIEW
    // ─────────────────────────────────────────────────────────
    if (selectedCourse) {
        return (
            <div className="max-w-7xl mx-auto w-full space-y-6 flex-1 flex flex-col min-h-0 text-primary animate-fadeIn">
                {/* Breadcrumb & Header Bar */}
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2.5 min-w-0">
                        {/* Breadcrumb Navigation */}
                        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs">
                            <button
                                type="button"
                                onClick={handleBackToCatalog}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-elevated hover:bg-surface border border-border-subtle hover:border-border-strong rounded-xl font-semibold text-primary transition-all cursor-pointer group shadow-sm"
                                title="Back to all courses"
                            >
                                <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                                <span>All Courses</span>
                            </button>
                            <span className="text-muted font-medium">/</span>
                            <span className="font-semibold text-primary truncate max-w-[200px] sm:max-w-md">
                                {selectedCourse.name}
                            </span>
                        </nav>

                        {/* Course Info */}
                        <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 bg-gradient-to-br ${getAvatarGradient(selectedCourse.id)} rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0`}>
                                {selectedCourse.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-tight truncate">
                                        {selectedCourse.name}
                                    </h1>
                                    {selectedCourse.pending_approval_count > 0 && (
                                        <span className="px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full flex items-center gap-1 animate-pulse" title="Pending completions waiting for admin approval">
                                            <Clock size={11} />
                                            <span>{selectedCourse.pending_approval_count} pending</span>
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted mt-0.5">
                                    Total <strong className="text-primary font-semibold">{selectedCourse.total_count}</strong> students registered
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Quick batch action buttons if students selected */}
                    {selectedEnrollmentIds.size > 0 && (
                        <div className="flex items-center gap-2 animate-fadeIn flex-wrap self-start sm:self-auto">
                            <span className="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-500/10 px-3 py-1.5 rounded-xl border border-brand-200 dark:border-brand-500/20">
                                {selectedEnrollmentIds.size} selected
                            </span>
                            <button
                                type="button"
                                onClick={handleCopySelectedBccEmails}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-primary bg-surface-elevated hover:bg-surface border border-border-subtle hover:border-border-strong rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                                title="Copy all selected student emails formatted for BCC in email client"
                            >
                                <Copy size={14} className="text-brand-500" />
                                <span>Copy Emails (BCC)</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleExportSelected}
                                disabled={isExporting}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-primary bg-surface-elevated hover:bg-surface border border-border-subtle hover:border-border-strong rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                                title="Export selected students to Excel (.xlsx)"
                            >
                                {isExporting ? <Loader2 size={15} className="animate-spin text-brand-500" /> : <FileSpreadsheet size={15} className="text-emerald-500" />}
                                <span>Export Excel ({selectedEnrollmentIds.size})</span>
                            </button>
                            <button
                                type="button"
                                onClick={openBatchCompletionModal}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                                title="Request completion for selected students"
                            >
                                <GraduationCap size={15} />
                                <span>Mark Selected as Completed</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedEnrollmentIds(new Set())}
                                className="p-2 text-muted hover:text-primary hover:bg-surface-elevated rounded-xl transition-all cursor-pointer"
                                title="Clear selection"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Filters & Search Card */}
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-4 space-y-4">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                        {/* Status Tabs / Pills */}
                        <div className="flex items-center gap-1 p-1 bg-surface-elevated border border-border-subtle rounded-xl overflow-x-auto scrollbar-none">
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
                                        type="button"
                                        onClick={() => {
                                            setSelectedStatusTab(tab.key);
                                            setSelectedDateFilter('all');
                                            setSelectedEnrollmentIds(new Set());
                                        }}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex-shrink-0 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                                            isActive
                                                ? 'bg-brand-600 text-white shadow-sm'
                                                : 'text-muted hover:text-primary hover:bg-surface'
                                        }`}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                            isActive ? 'bg-white/20 text-white' : 'bg-surface text-muted'
                                        }`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search Input */}
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={15} />
                            <input
                                type="text"
                                placeholder="Search attendees..."
                                value={rosterSearch}
                                onChange={e => setRosterSearch(e.target.value)}
                                className="w-full pl-9 pr-8 py-2 bg-surface-elevated border border-border-subtle rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-primary placeholder:text-muted transition-all"
                            />
                            {rosterSearch && (
                                <button
                                    type="button"
                                    onClick={() => setRosterSearch('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary rounded-full hover:bg-surface transition-colors cursor-pointer"
                                    title="Clear search"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Date Filter Chips (for Confirmed and Invited tabs) */}
                    {availableDates.length > 0 && (
                        <div className="pt-3 border-t border-border-subtle/50 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none animate-fadeIn">
                            <div className="flex items-center gap-1.5 text-muted text-xs font-semibold shrink-0">
                                <Calendar size={14} className="text-brand-500" />
                                <span className="text-[11px] uppercase tracking-wider">
                                    {selectedStatusTab === 'confirmed' ? 'Course Dates:' : 'Invited Dates:'}
                                </span>
                            </div>

                            <div className="flex items-center gap-1 p-1 bg-surface-elevated border border-border-subtle rounded-xl shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedDateFilter('all');
                                        setSelectedEnrollmentIds(new Set());
                                    }}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                        selectedDateFilter === 'all'
                                            ? 'bg-emerald-600 text-white shadow-sm'
                                            : 'text-muted hover:text-primary hover:bg-surface'
                                    }`}
                                >
                                    <span>All Dates</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                        selectedDateFilter === 'all' ? 'bg-white/20 text-white' : 'bg-surface text-muted'
                                    }`}>
                                        {availableDates.reduce((sum, d) => sum + d.count, 0)}
                                    </span>
                                </button>

                                {availableDates.map(({ date, count }) => {
                                    const isActive = selectedDateFilter === date;
                                    return (
                                        <button
                                            key={date}
                                            type="button"
                                            onClick={() => {
                                                setSelectedDateFilter(isActive ? 'all' : date);
                                                setSelectedEnrollmentIds(new Set());
                                            }}
                                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                                isActive
                                                    ? 'bg-emerald-600 text-white shadow-sm'
                                                    : 'text-muted hover:text-primary hover:bg-surface'
                                            }`}
                                        >
                                            <span>{formatDateDMY(date)}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                                isActive ? 'bg-white/20 text-white' : 'bg-surface text-muted'
                                            }`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Sub-toolbar: Sort Controls + Variants (if any) + Export Roster + Refresh */}
                    <div className="pt-3 border-t border-border-subtle/50 flex flex-wrap items-center justify-between gap-2.5">
                        {/* Sort pills */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1 text-muted text-xs font-semibold">
                                <ArrowDownUp size={13} />
                                <span className="text-[11px] uppercase tracking-wider">Sort:</span>
                            </div>
                            <div className="flex items-center gap-1 p-1 bg-surface-elevated border border-border-subtle rounded-xl">
                                {([
                                    { value: 'queue' as const, label: 'Queue Order (Oldest)', icon: <Clock size={12} /> },
                                    { value: 'date-desc' as const, label: 'Newest First', icon: <ArrowUpDown size={12} /> },
                                    { value: 'name' as const, label: 'By Name', icon: <CaseSensitive size={12} /> },
                                ]).map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setSortOrder(opt.value)}
                                        className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                            sortOrder === opt.value
                                                ? 'bg-brand-600 text-white shadow-sm'
                                                : 'text-muted hover:text-primary hover:bg-surface'
                                        }`}
                                    >
                                        {opt.icon}
                                        <span>{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Right: Variants Filter & Export Roster & Refresh */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {availableVariants.length > 1 && (
                                <div className="flex items-center gap-1 p-1 bg-surface-elevated border border-border-subtle rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedVariant('all')}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            selectedVariant === 'all'
                                                ? 'bg-violet-600 text-white shadow-sm'
                                                : 'text-muted hover:text-primary hover:bg-surface'
                                        }`}
                                    >
                                        All Streams
                                    </button>
                                    {availableVariants.map(v => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => setSelectedVariant(v === selectedVariant ? 'all' : v)}
                                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                                selectedVariant === v
                                                    ? 'bg-violet-600 text-white shadow-sm'
                                                    : 'text-muted hover:text-primary hover:bg-surface'
                                            }`}
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={handleExportFullRoster}
                                disabled={isExporting || sortedRoster.length === 0}
                                className="flex items-center gap-1.5 text-muted hover:text-primary transition-colors text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-elevated hover:bg-surface border border-border-subtle hover:border-emerald-500/50 disabled:opacity-50 active:scale-95 cursor-pointer shadow-sm"
                                title="Export full filtered roster to Excel (.xlsx)"
                            >
                                {isExporting ? <Loader2 size={13} className="animate-spin text-brand-500" /> : <Download size={13} className="text-emerald-500" />}
                                <span>Export Roster</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => refetchRoster()}
                                className="flex items-center gap-1.5 text-muted hover:text-primary transition-colors text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-elevated hover:bg-surface border border-border-subtle cursor-pointer shadow-sm"
                                title="Refresh roster"
                            >
                                <RefreshCw size={13} className={isFetchingRoster ? 'animate-spin' : ''} />
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>

                    {/* Batch Selection Row if applicable */}
                    {eligibleRosterItems.length > 0 && (
                        <div className="pt-2.5 border-t border-border-subtle/50 flex items-center justify-between text-xs text-muted">
                            <button
                                type="button"
                                onClick={toggleSelectAll}
                                className="flex items-center gap-1.5 font-semibold text-primary hover:text-brand-600 transition-colors cursor-pointer"
                            >
                                {isAllSelected ? <CheckSquare size={16} className="text-brand-600" /> : <Square size={16} />}
                                <span>{isAllSelected ? 'Deselect All' : `Select All Non-Completed (${eligibleRosterItems.length})`}</span>
                            </button>
                            <span className="text-[11px] text-muted">
                                Showing {sortedRoster.length} student{sortedRoster.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>

                {/* Roster Items List */}
                <div className="flex-1 overflow-y-auto space-y-3">
                    {isLoadingRoster ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="bg-surface rounded-2xl border border-border-subtle p-4 flex items-center gap-3 animate-pulse">
                                    <div className="w-10 h-10 rounded-xl bg-muted/20 shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-muted/20 rounded w-1/4" />
                                        <div className="h-3 bg-muted/20 rounded w-1/3" />
                                    </div>
                                    <div className="w-24 h-6 bg-muted/20 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    ) : rosterError ? (
                        <div className="bg-surface rounded-3xl border border-rose-200 dark:border-rose-500/20 p-8 sm:p-12 text-center max-w-lg mx-auto space-y-4 shadow-card">
                            <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
                                <AlertCircle size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-primary">Failed to load roster</h3>
                                <p className="text-sm text-muted mt-1">
                                    {rosterError instanceof Error ? rosterError.message : 'Please try refreshing or check your connection.'}
                                </p>
                            </div>
                            <div>
                                <button
                                    type="button"
                                    onClick={() => refetchRoster()}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold shadow-sm transition-all cursor-pointer"
                                >
                                    <RotateCcw size={15} />
                                    <span>Retry</span>
                                </button>
                            </div>
                        </div>
                    ) : sortedRoster.length === 0 ? (
                        <div className="bg-surface rounded-3xl border border-border-subtle p-12 text-center max-w-lg mx-auto space-y-4 shadow-card">
                            <div className="w-16 h-16 rounded-full bg-muted/10 text-muted mx-auto flex items-center justify-center">
                                <Users size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-primary">No students in this list</h3>
                                <p className="text-sm text-muted mt-1">
                                    {rosterSearch.trim() || selectedVariant !== 'all' || selectedDateFilter !== 'all'
                                        ? 'Try adjusting your filters or clearing your search query.'
                                        : 'There are no students enrolled in this course status tab.'}
                                </p>
                            </div>
                            {(rosterSearch.trim() || selectedVariant !== 'all' || selectedDateFilter !== 'all') && (
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRosterSearch('');
                                            setSelectedVariant('all');
                                            setSelectedDateFilter('all');
                                        }}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold shadow-sm transition-all cursor-pointer"
                                    >
                                        <RotateCcw size={15} />
                                        <span>Reset Filters</span>
                                    </button>
                                </div>
                            )}
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
                                    className={`p-3.5 sm:p-4 rounded-2xl bg-surface border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-card ${
                                        isSelected
                                            ? 'border-brand-500 bg-brand-50/20 dark:bg-brand-500/5 shadow-md'
                                            : isPending
                                            ? 'border-amber-500/40 bg-amber-50/20 dark:bg-amber-500/5'
                                            : 'border-border-subtle hover:border-border-strong hover:shadow-card-hover'
                                    }`}
                                >
                                    {/* Left: Checkbox + Student Info */}
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                        {isEligibleForCompletion ? (
                                            <button
                                                type="button"
                                                onClick={() => toggleSelectItem(item.enrollment_id)}
                                                className="mt-1 text-muted hover:text-brand-600 transition-colors shrink-0 cursor-pointer"
                                                title={isSelected ? 'Deselect student' : 'Select student'}
                                            >
                                                {isSelected ? (
                                                    <CheckSquare size={18} className="text-brand-600" />
                                                ) : (
                                                    <Square size={18} />
                                                )}
                                            </button>
                                        ) : (
                                            <div className="w-[18px] shrink-0" />
                                        )}

                                        <div className={`w-10 h-10 bg-gradient-to-br ${getAvatarGradient(item.student_id)} rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0`}>
                                            {(item.first_name?.[0] || '').toUpperCase()}{(item.last_name?.[0] || '').toUpperCase()}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCopyField(`${item.first_name} ${item.last_name}`, 'Name');
                                                    }}
                                                    className="font-bold text-primary text-sm truncate cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                                    title="Click to copy name to clipboard"
                                                >
                                                    {item.first_name} {item.last_name}
                                                </h3>
                                                {item.is_priority && (
                                                    <span 
                                                        className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-lg shadow-sm"
                                                        title="Priority student"
                                                    >
                                                        <Star size={12} className="fill-amber-400 text-amber-500" />
                                                        <span>Priority</span>
                                                    </span>
                                                )}
                                                {item.course_variant && (
                                                    <span className="text-[10px] font-medium bg-surface-elevated border border-border-subtle px-1.5 py-0.5 rounded text-muted">
                                                        {cleanVariant(selectedCourse.name, item.course_variant)}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted">
                                                <span 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCopyField(item.email, 'Email');
                                                    }}
                                                    className="cursor-pointer hover:text-primary hover:underline decoration-dotted underline-offset-2 transition-colors"
                                                    title="Click to copy email to clipboard"
                                                >
                                                    {item.email}
                                                </span>
                                                {item.phone && (
                                                    <span 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCopyField(item.phone, 'Phone');
                                                        }}
                                                        className="cursor-pointer hover:text-primary hover:underline decoration-dotted underline-offset-2 transition-colors"
                                                        title="Click to copy phone to clipboard"
                                                    >
                                                        • {item.phone}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Dates Line */}
                                            <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-[11px]">
                                                {/* Registration Date */}
                                                <span className="text-muted font-medium flex items-center gap-1" title="Registration Date">
                                                    <Clock size={11} /> Registered: {formatDate(item.created_at)}
                                                </span>
                                                {item.confirmed_date && (
                                                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                                        <Calendar size={11} /> Confirmed: {formatDate(item.confirmed_date)}
                                                    </span>
                                                )}
                                                {item.invited_date && !item.confirmed_date && (
                                                    <span className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1">
                                                        <Calendar size={11} /> Invited: {formatDate(item.invited_date)}
                                                    </span>
                                                )}
                                                {item.completed_date && (
                                                    <span className="text-teal-700 dark:text-teal-400 font-semibold flex items-center gap-1">
                                                        <GraduationCap size={11} /> Completed: {formatDate(item.completed_date)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Rejection notice if previously rejected */}
                                            {isRejected && (
                                                <div className="mt-1.5 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-2.5 py-1 rounded-lg">
                                                    <strong>Completion Request Rejected:</strong> {item.completion_rejection_reason || 'No reason provided by admin'}. You can re-submit if needed.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Status & Action Button */}
                                    <div className="flex items-center gap-2 shrink-0 sm:self-center justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border-subtle">
                                        {/* Status badge */}
                                        <div className="flex items-center gap-1.5">
                                            {isPending ? (
                                                <span className="px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center gap-1.5 animate-pulse">
                                                    <Clock size={12} />
                                                    <span>Pending Admin Approval</span>
                                                </span>
                                            ) : isCompleted ? (
                                                <span className="px-2.5 py-1 text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 border border-teal-200 dark:bg-teal-500/10 dark:border-teal-500/20 rounded-xl flex items-center gap-1.5">
                                                    <GraduationCap size={12} />
                                                    <span>Completed</span>
                                                </span>
                                            ) : item.status === 'confirmed' ? (
                                                <span className="px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 rounded-xl flex items-center gap-1.5">
                                                    <CheckCircle size={12} />
                                                    <span>Confirmed</span>
                                                </span>
                                            ) : item.status === 'invited' ? (
                                                <span className="px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20 rounded-xl flex items-center gap-1.5">
                                                    <Send size={12} />
                                                    <span>Invited</span>
                                                </span>
                                            ) : item.status === 'requested' ? (
                                                <span className="px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 rounded-xl flex items-center gap-1.5">
                                                    <Clock size={12} />
                                                    <span>Queue</span>
                                                    {item.queue_position != null && (
                                                        <span className="bg-amber-500/20 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
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
                                                type="button"
                                                onClick={() => openSingleCompletionModal(item)}
                                                className="px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
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
                        <div className="bg-surface rounded-3xl border border-border-subtle shadow-card max-w-md w-full p-6 space-y-4 animate-scaleIn">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl">
                                    <GraduationCap size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-primary">Mark Course Completion</h3>
                                    <p className="text-xs text-muted">
                                        Requesting completion for <strong className="text-primary">{completionTargetIds.length}</strong> student(s)
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 bg-surface-elevated rounded-2xl border border-border-subtle space-y-2">
                                <label htmlFor="completion-date-input" className="text-xs font-bold text-muted uppercase tracking-wider block">
                                    Completion Date
                                </label>
                                <input
                                    id="completion-date-input"
                                    type="date"
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-surface border border-border-strong rounded-xl text-sm text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                                />
                                <p className="text-[11px] text-muted">
                                    This date will be sent to the administrator for review and verification.
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setDateModalOpen(false)}
                                    className="px-4 py-2 text-xs font-semibold text-muted hover:text-primary hover:bg-surface-elevated rounded-xl transition-all cursor-pointer"
                                    disabled={requestCompletionMutation.isPending}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSubmitCompletionRequest}
                                    disabled={requestCompletionMutation.isPending || !selectedDate}
                                    className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
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
        <div className="max-w-7xl mx-auto w-full space-y-6 flex-1 flex flex-col min-h-0 text-primary">
            {/* Catalog Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-2xl border border-brand-200 dark:border-brand-500/20 shrink-0">
                        <BookOpen size={24} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
                                Courses Catalog
                            </h1>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-500/20">
                                {courses.length}
                            </span>
                        </div>
                        <p className="text-sm text-muted">
                            Select a course to view student rosters, monitor streams and request completions
                        </p>
                    </div>
                </div>

                {/* Search Courses */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} />
                    <input
                        type="text"
                        placeholder="Search courses..."
                        value={catalogSearch}
                        onChange={e => setCatalogSearch(e.target.value)}
                        className="w-full pl-10 pr-9 py-2.5 bg-surface-elevated border border-border-subtle rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-primary placeholder:text-muted transition-all"
                    />
                    {catalogSearch && (
                        <button
                            type="button"
                            onClick={() => setCatalogSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary rounded-full hover:bg-surface transition-colors cursor-pointer"
                            title="Clear search"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Courses Grid / Status States */}
            <div className="flex-1 overflow-y-auto">
                {isLoadingCourses ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="bg-surface rounded-2xl border border-border-subtle p-5 space-y-4 animate-pulse shadow-card">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-2xl bg-muted/20 shrink-0" />
                                    <div className="space-y-2 flex-1">
                                        <div className="h-4 bg-muted/20 rounded w-2/3" />
                                        <div className="h-3 bg-muted/20 rounded w-1/3" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-border-subtle/50">
                                    {[1, 2, 3, 4].map(j => (
                                        <div key={j} className="h-10 bg-muted/15 rounded-lg" />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : coursesError ? (
                    <div className="bg-surface rounded-3xl border border-rose-200 dark:border-rose-500/20 p-8 sm:p-12 text-center max-w-lg mx-auto space-y-4 shadow-card">
                        <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
                            <AlertCircle size={32} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-primary">Failed to load courses</h3>
                            <p className="text-sm text-muted mt-1">
                                {coursesError instanceof Error ? coursesError.message : 'Please try refreshing or check permissions.'}
                            </p>
                        </div>
                        <div>
                            <button
                                type="button"
                                onClick={() => refetchCourses()}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold shadow-sm transition-all cursor-pointer"
                            >
                                <RotateCcw size={15} />
                                <span>Retry</span>
                            </button>
                        </div>
                    </div>
                ) : filteredCourses.length === 0 ? (
                    <div className="bg-surface rounded-3xl border border-border-subtle p-12 text-center max-w-lg mx-auto space-y-4 shadow-card">
                        <div className="w-16 h-16 rounded-full bg-muted/10 text-muted mx-auto flex items-center justify-center">
                            <BookOpen size={32} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-primary">No courses found</h3>
                            <p className="text-sm text-muted mt-1">
                                {catalogSearch.trim()
                                    ? `No course names match "${catalogSearch}".`
                                    : 'There are currently no courses registered in the catalog.'}
                            </p>
                        </div>
                        {catalogSearch.trim() && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setCatalogSearch('')}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold shadow-sm transition-all cursor-pointer"
                                >
                                    <RotateCcw size={15} />
                                    <span>Clear Search</span>
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredCourses.map(course => {
                            const gradient = getAvatarGradient(course.id);
                            return (
                                <div
                                    key={course.id}
                                    onClick={() => setSelectedCourse(course)}
                                    className="bg-surface rounded-2xl shadow-card border border-border-subtle hover:shadow-card-hover hover:-translate-y-0.5 hover:border-brand-500/40 transition-all duration-200 overflow-hidden cursor-pointer group flex flex-col justify-between"
                                >
                                    <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />

                                    <div className="p-5 space-y-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`w-11 h-11 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm group-hover:scale-105 transition-transform shrink-0`}>
                                                    {course.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="font-bold text-primary group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors text-base truncate">
                                                        {course.name}
                                                    </h3>
                                                    <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                                                        <Users size={12} />
                                                        <strong className="text-primary font-semibold">{course.total_count}</strong> students total
                                                    </p>
                                                </div>
                                            </div>

                                            {course.pending_approval_count > 0 && (
                                                <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full flex items-center gap-1 animate-pulse" title="Pending completions waiting for admin approval">
                                                    <Clock size={10} />
                                                    {course.pending_approval_count} pending
                                                </span>
                                            )}
                                        </div>

                                        {/* Status badges grid */}
                                        <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-border-subtle/50 text-[11px] text-center">
                                            <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
                                                <p className="font-bold text-emerald-700 dark:text-emerald-400">{course.confirmed_count}</p>
                                                <p className="text-[9px] text-muted uppercase font-semibold">Confirmed</p>
                                            </div>
                                            <div className="p-2 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-100 dark:border-amber-500/20">
                                                <p className="font-bold text-amber-700 dark:text-amber-400">{course.requested_count}</p>
                                                <p className="text-[9px] text-muted uppercase font-semibold">Queue</p>
                                            </div>
                                            <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/20">
                                                <p className="font-bold text-blue-700 dark:text-blue-400">{course.invited_count}</p>
                                                <p className="text-[9px] text-muted uppercase font-semibold">Invited</p>
                                            </div>
                                            <div className="p-2 bg-teal-50 dark:bg-teal-500/10 rounded-xl border border-teal-100 dark:border-teal-500/20">
                                                <p className="font-bold text-teal-700 dark:text-teal-400">{course.completed_count}</p>
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

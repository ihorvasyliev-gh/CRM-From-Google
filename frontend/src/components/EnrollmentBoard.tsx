import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue, startTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, GraduationCap, RotateCcw } from 'lucide-react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCenter, MouseSensor, useSensor, useSensors, MeasuringStrategy, defaultDropAnimationSideEffects } from '@dnd-kit/core';
import { supabase } from '../lib/supabase';
import { usePersistentState } from '../hooks/usePersistentState';

import { useEnrollments, type EnrollmentRow } from '../hooks/useEnrollments';
import { isAnyModalOpen } from '../hooks/useModalBehavior';
import { useDialogMount, useLastPresent } from '../hooks/usePresence';
import { useBulkActions } from '../hooks/useBulkActions';
import { useInviteFlow } from '../hooks/useInviteFlow';
import { useCourseSessions } from '../hooks/useCourseSessions';
import { sessionForEnrollment } from '../lib/courseSessions';
import { useStudentFlags } from '../hooks/useStudentFlags';
import { ALL_STATUSES, cleanVariant, fullName, isEnrollmentStatus, PIPELINE_STATUSES, SECONDARY_STATUSES, Student, type EnrollmentStatus } from '../lib/types';
import StudentDetail from './StudentDetail';
import { todayISO } from '../lib/dateUtils';
import { STATUS_CONFIG } from '../lib/statusConfig';
import { listEmailOptOutsSafe, normalizeEmail } from '../lib/emailOptOut';
import type { NavigateFn, NavState } from '../lib/navigation';

import FilterBar from './EnrollmentBoard/FilterBar';
import StatusColumn from './EnrollmentBoard/StatusColumn';
import EnrollmentCard from './EnrollmentBoard/EnrollmentCard';
import SecondaryPanel from './EnrollmentBoard/SecondaryPanel';
import BulkActionBar from './EnrollmentBoard/BulkActionBar';
import EnrollmentModal from './EnrollmentModal';
import GenerateDocsModal from './EnrollmentBoard/GenerateDocsModal';
import InviteDateModal from './EnrollmentBoard/InviteDateModal';
import ConfirmDateModal from './EnrollmentBoard/ConfirmDateModal';
import EditNoteModal from './EnrollmentBoard/EditNoteModal';
import StudentFlagModal from './EnrollmentBoard/StudentFlagModal';
import ConfirmDialog from './ConfirmDialog';
import { showToast } from '../lib/toast';
import { matchesSearch } from '../lib/searchUtils';
import { useNowMinute } from '../hooks/useNow';
import { getInviteDeadline, matchesInviteFilter, type InviteFilter } from '../lib/inviteDeadline';
import { courseDatesOf } from '../lib/courseDates';
import { computeQueuePositions } from '../lib/queuePositions';
import { sortColumn } from './EnrollmentBoard/boardSort';
import {
    computeAvailableCourseDates,
    computeCourseActiveCounts,
    isEmailUnreachable,
    matchesAttributeFilters,
    type EmailStatusFilter,
    type FlagFilter,
} from './EnrollmentBoard/boardFilters';

const EMPTY_FLAGS: import('../lib/types').StudentFlag[] = [];
const isString = (v: unknown): v is string => typeof v === 'string';
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isPipelineList = (v: unknown): v is EnrollmentStatus[] =>
    Array.isArray(v) && v.every(item => (PIPELINE_STATUSES as readonly unknown[]).includes(item));
const EMPTY_COMPLETED_COURSES: Array<{id: string, name: string}> = [];

// dnd-kit config (module-level so the objects are stable)
const MOUSE_SENSOR_OPTS = { activationConstraint: { distance: 5 } };
const MEASURING_CONFIG = { droppable: { strategy: MeasuringStrategy.BeforeDragging } };
const DROP_ANIMATION = { sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) };

export default function EnrollmentBoard({
    initialCourseFilter,
    initialCourseDate,
    initialInviteFilter,
    initialStatus,
    onOpenApprovals,
    onNavigate,
}: {
    initialCourseFilter?: string;
    initialCourseDate?: string;
    initialInviteFilter?: InviteFilter;
    /** Status to bring into view (dashboard status links) */
    initialStatus?: EnrollmentStatus;
    /** Opens the app-wide Pending Approvals modal when clicking a card's completion-requested banner */
    onOpenApprovals?: () => void;
    /** App-wide navigator (used by StudentDetail when jumping to another page) */
    onNavigate?: NavigateFn;
}) {

    // Modals
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    // Time, place and days of the course dates, shown on the cards
    const courseSessions = useCourseSessions();
    const [detailStudent, setDetailStudent] = useState<Student | null>(null);
    const [enrollStudentId, setEnrollStudentId] = useState<string | undefined>();

    const openEnrollFromDetail = useCallback(() => {
        if (detailStudent) {
            setEnrollStudentId(detailStudent.id);
            setEnrollModalOpen(true);
        }
    }, [detailStudent]);

    const [deleteTarget, setDeleteTarget] = useState<EnrollmentRow | null>(null);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    // The selection "Generate Docs" was opened for (kept while the dialog is open)
    const [docsFor, setDocsFor] = useState<EnrollmentRow[] | null>(null);
    const [confirmMoveTarget, setConfirmMoveTarget] = useState<{ enrollmentId: string; oldStatus: string; newStatus: EnrollmentStatus } | null>(null);
    const [bulkConfirmMoveTarget, setBulkConfirmMoveTarget] = useState<{ newStatus: EnrollmentStatus; confirmedCount: number; totalCount: number } | null>(null);
    const [confirmDateTarget, setConfirmDateTarget] = useState<{ ids: string[]; bulk: boolean; people: EnrollmentRow[] } | null>(null);
    const [confirmDate, setConfirmDate] = useState(todayISO());
    const [confirmingDate, setConfirmingDate] = useState(false);
    const [editNoteTarget, setEditNoteTarget] = useState<{ id: string; note: string } | null>(null);
    const [editNoteText, setEditNoteText] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Student Flags
    const [flagModalTarget, setFlagModalTarget] = useState<{ studentId: string; studentName: string } | null>(null);

    // Email opt-outs (shared cache with Outcomes & Settings)
    const { data: optOuts = [] } = useQuery({
        queryKey: ['email_opt_outs'],
        queryFn: listEmailOptOutsSafe,
        staleTime: 60_000,
    });
    const optedOutEmails = useMemo(
        () => new Set(optOuts.map(o => normalizeEmail(o.email))),
        [optOuts],
    );

    // Filters
    // Board filters survive navigating away and back within the tab (session) — preferences like sort
    // order and collapsed columns are remembered across sessions (local).
    const [selectedCourse, setSelectedCourse] = usePersistentState<string>('board.course', () => initialCourseFilter || 'all', { validate: isString });
    const [selectedVariant, setSelectedVariant] = usePersistentState<string>('board.variant', 'all', { validate: isString });
    const [selectedCourseDate, setSelectedCourseDate] = usePersistentState<string>('board.courseDate', () => initialCourseDate || 'all', { validate: isString });
    // Set by the search field once typing pauses
    const [searchQuery, setSearchQuery] = usePersistentState<string>('board.search', '', { validate: isString });
    // The invite and date filters are remembered like the rest: coming back from a student's page
    // shows the same cards
    const [inviteFilter, setInviteFilter] = usePersistentState<InviteFilter>('board.inviteFilter', () => initialInviteFilter || 'all', {
        validate: (v): v is InviteFilter => v === 'all' || v === 'expired' || v === 'soon' || v === 'attention',
    });
    const [dateFrom, setDateFrom] = usePersistentState<string>('board.dateFrom', '', { validate: isString });
    const [dateTo, setDateTo] = usePersistentState<string>('board.dateTo', '', { validate: isString });
    const [courseDateFrom, setCourseDateFrom] = usePersistentState<string>('board.courseDateFrom', '', { validate: isString });
    const [courseDateTo, setCourseDateTo] = usePersistentState<string>('board.courseDateTo', '', { validate: isString });
    const [priorityOnly, setPriorityOnly] = usePersistentState<boolean>('board.priorityOnly', false, { validate: isBoolean });
    const [flagFilter, setFlagFilter] = usePersistentState<FlagFilter>('board.flagFilter', 'all', {
        validate: (v): v is FlagFilter => v === 'all' || v === 'flagged' || v === 'unflagged',
    });
    const [pendingApprovalOnly, setPendingApprovalOnly] = usePersistentState<boolean>('board.pendingApprovalOnly', false, { validate: isBoolean });
    const [hasNoteOnly, setHasNoteOnly] = usePersistentState<boolean>('board.hasNoteOnly', false, { validate: isBoolean });
    const [emailFilter, setEmailFilter] = usePersistentState<EmailStatusFilter>('board.emailFilter', 'all', {
        validate: (v): v is EmailStatusFilter => v === 'all' || v === 'unreachable' || v === 'emailable',
    });
    // Withdrawn & Rejected open in a dialog of their own
    const [showSecondary, setShowSecondary] = useState(false);
    const [sortOrder, setSortOrder] = usePersistentState<'date-asc' | 'date-desc' | 'name'>('board.sortOrder', 'date-asc', {
        storage: 'local',
        validate: (v): v is 'date-asc' | 'date-desc' | 'name' => v === 'date-asc' || v === 'date-desc' || v === 'name',
    });
    const [collapsedColumns, setCollapsedColumns] = usePersistentState<EnrollmentStatus[]>('board.collapsedColumns', [], {
        storage: 'local',
        validate: isPipelineList,
    });
    const collapsedSet = useMemo(() => {
        // Always keep at least one pipeline column expanded
        const valid = collapsedColumns.filter(s => (PIPELINE_STATUSES as readonly EnrollmentStatus[]).includes(s));
        return new Set(valid.length >= PIPELINE_STATUSES.length ? valid.slice(0, PIPELINE_STATUSES.length - 1) : valid);
    }, [collapsedColumns]);

    const toggleCollapseColumn = useCallback((status: EnrollmentStatus) => {
        setCollapsedColumns(prev => {
            if (prev.includes(status)) return prev.filter(s => s !== status);
            // Keep at least one column open
            if (prev.length >= PIPELINE_STATUSES.length - 1) return prev;
            return [...prev, status];
        });
    }, [setCollapsedColumns]);

    // Navigation from elsewhere (course card, dashboard, student drawer) overrides the remembered filters
    useEffect(() => {
        if (initialCourseFilter) {
            setSelectedCourse(prev => {
                if (prev !== initialCourseFilter) setSelectedVariant('all');
                return initialCourseFilter;
            });
            setSelectedCourseDate(initialCourseDate || 'all');
        } else if (initialCourseDate) {
            setSelectedCourseDate(initialCourseDate);
        }
    }, [initialCourseFilter, initialCourseDate, setSelectedCourse, setSelectedVariant, setSelectedCourseDate]);

    // Dashboard "Expired invites" link pre-selects the invite filter
    useEffect(() => {
        if (initialInviteFilter) setInviteFilter(initialInviteFilter);
    }, [initialInviteFilter, setInviteFilter]);

    const inviteFlowRef = useRef<ReturnType<typeof useInviteFlow> | null>(null);
    const enrollmentsRef = useRef<EnrollmentRow[]>([]);

    const openInviteModalProxy = useCallback((ids: string[], bulk: boolean) => {
        inviteFlowRef.current?.openInviteModal(ids, bulk);
    }, []);

    const openConfirmModal = useCallback((ids: string[], defDate: string, bulk: boolean) => {
        const people = enrollmentsRef.current.filter(e => ids.includes(e.id));
        setConfirmDateTarget({ ids, bulk, people });
        setConfirmDate(defDate);
        const first = people[0];
        if (first?.course_id) {
            inviteFlowRef.current?.fetchCourseDates(first.course_id);
        }
    }, []);
    const openConfirmModalSingle = useCallback((id: string, defDate: string) => openConfirmModal([id], defDate, false), [openConfirmModal]);
    const openConfirmModalBulk = useCallback((ids: string[], defDate: string) => openConfirmModal(ids, defDate, true), [openConfirmModal]);

    const enrollmentsHook = useEnrollments({
        showToast,
        openInviteModal: openInviteModalProxy,
        openConfirmModal: openConfirmModalSingle
    });

    const bulkActions = useBulkActions({
        enrollments: enrollmentsHook.enrollments,
        setEnrollments: enrollmentsHook.setEnrollments,
        showToast,
        openInviteModal: openInviteModalProxy,
        openConfirmModal: openConfirmModalBulk
    });

    const inviteFlow = useInviteFlow({
        enrollments: enrollmentsHook.enrollments,
        setEnrollments: enrollmentsHook.setEnrollments,
        clearSelection: bulkActions.clearSelection,
        showToast
    });

    useEffect(() => {
        inviteFlowRef.current = inviteFlow;
    }, [inviteFlow]);

    const studentFlagsHook = useStudentFlags(showToast);

    const enrollments = enrollmentsHook.enrollments;
    // The hook returns a new object on every render, but these callbacks are stable: depend on them,
    // not on the object, or every card and column re-renders whenever the board does
    const { updateNote, updateStatus } = enrollmentsHook;

    useEffect(() => {
        enrollmentsRef.current = enrollments;
    }, [enrollments]);

    // Course date chips: upcoming dates + past dates that still have confirmed/invited students (excluding withdrawn/rejected)
    const today = todayISO();
    const { availableCourseDates, courseDatesTotal } = useMemo(
        () => computeAvailableCourseDates(enrollments, selectedCourse, selectedVariant, today),
        [enrollments, selectedCourse, selectedVariant, today],
    );

    const courseActiveCounts = useMemo(() => computeCourseActiveCounts(enrollments), [enrollments]);

    // Reset selectedCourseDate if no longer present in available dates
    // (only once data is loaded — otherwise a date passed via navigation is wiped before enrollments arrive)
    useEffect(() => {
        if (enrollments.length === 0) return;
        if (selectedCourseDate !== 'all' && !availableCourseDates.some(d => d.date === selectedCourseDate)) {
            setSelectedCourseDate('all');
        }
    }, [availableCourseDates, selectedCourseDate, enrollments.length, setSelectedCourseDate]);

    // The columns follow filter changes in the background: the clicked chip or the typed text shows
    // at once and the board catches up a moment later (dimmed if that takes a while). Data changes,
    // such as a moved card, still show immediately.
    const filters = useMemo(() => ({
        course: selectedCourse, variant: selectedVariant, courseDate: selectedCourseDate, search: searchQuery,
        dateFrom, dateTo, courseDateFrom, courseDateTo, inviteFilter, sortOrder,
        priorityOnly, flagFilter, pendingApprovalOnly, hasNoteOnly, emailFilter,
    }), [
        selectedCourse, selectedVariant, selectedCourseDate, searchQuery,
        dateFrom, dateTo, courseDateFrom, courseDateTo, inviteFilter, sortOrder,
        priorityOnly, flagFilter, pendingApprovalOnly, hasNoteOnly, emailFilter,
    ]);
    const shownFilters = useDeferredValue(filters);
    const filtersPending = shownFilters !== filters;

    // Step 1: Course, language, date, search, date-range filters (before attribute & invite filters so chip counts stay accurate)
    const scopeFilteredEnrollments = useMemo(() => {
        const { course, variant, courseDate, search, dateFrom, dateTo, courseDateFrom, courseDateTo } = shownFilters;
        let result = enrollments;
        if (course !== 'all') result = result.filter(e => e.course_id === course);
        if (variant !== 'all') {
            result = result.filter(e => cleanVariant(e.courses?.name || '', e.course_variant).toLowerCase() === variant.toLowerCase());
        }
        if (courseDate !== 'all') result = result.filter(e => courseDatesOf(e).includes(courseDate));
        if (search.trim()) {
            result = result.filter(e =>
                matchesSearch({
                    firstName: e.students?.first_name,
                    lastName: e.students?.last_name,
                    email: e.students?.email,
                    phone: e.students?.phone,
                    notes: e.notes,
                    eircode: e.students?.eircode,
                    course: e.courses?.name,
                    variant: cleanVariant(e.courses?.name || '', e.course_variant),
                }, search)
            );
        }
        if (dateFrom) {
            const from = new Date(dateFrom);
            result = result.filter(e => new Date(e.created_at) >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setSeconds(59, 999);
            result = result.filter(e => new Date(e.created_at) <= to);
        }
        if (courseDateFrom) {
            const from = courseDateFrom.split('T')[0];
            result = result.filter(e => courseDatesOf(e).some(d => d >= from));
        }
        if (courseDateTo) {
            const to = courseDateTo.split('T')[0];
            result = result.filter(e => courseDatesOf(e).some(d => d <= to));
        }
        return result;
    }, [enrollments, shownFilters]);

    const attributeCounts = useMemo(() => {
        let priority = 0;
        let flagged = 0;
        let pendingApproval = 0;
        let hasNote = 0;
        let unreachableEmail = 0;
        for (const e of scopeFilteredEnrollments) {
            if (e.is_priority) priority++;
            if ((studentFlagsHook.flagsByStudentId.get(e.student_id)?.length ?? 0) > 0) flagged++;
            if (e.completion_request_status === 'pending') pendingApproval++;
            if (e.notes?.trim()) hasNote++;
            if (isEmailUnreachable(e.students?.email, optedOutEmails)) unreachableEmail++;
        }
        return { priority, flagged, pendingApproval, hasNote, unreachableEmail };
    }, [scopeFilteredEnrollments, studentFlagsHook.flagsByStudentId, optedOutEmails]);

    // Step 2: Apply quick attribute filters (still before invite-deadline filter so expired/soon counts follow active filters)
    const baseFilteredEnrollments = useMemo(() => {
        const { priorityOnly, flagFilter, pendingApprovalOnly, hasNoteOnly, emailFilter } = shownFilters;
        if (!priorityOnly && flagFilter === 'all' && !pendingApprovalOnly && !hasNoteOnly && emailFilter === 'all') {
            return scopeFilteredEnrollments;
        }
        return scopeFilteredEnrollments.filter(e =>
            matchesAttributeFilters(
                e,
                { priorityOnly, flagFilter, pendingApprovalOnly, hasNoteOnly, emailFilter },
                studentFlagsHook.flagsByStudentId,
                optedOutEmails,
            ),
        );
    }, [scopeFilteredEnrollments, shownFilters, studentFlagsHook.flagsByStudentId, optedOutEmails]);

    const now = useNowMinute();
    const inviteCounts = useMemo(() => {
        const counts = { expired: 0, soon: 0 };
        baseFilteredEnrollments.forEach(e => {
            if (e.status !== 'invited') return;
            const d = getInviteDeadline(e.invited_at, e.response_days, now);
            if (d?.isExpired) counts.expired++;
            else if (d?.isDueSoon) counts.soon++;
        });
        return counts;
    }, [baseFilteredEnrollments, now]);

    const filteredEnrollments = useMemo(() => {
        const { inviteFilter } = shownFilters;
        if (inviteFilter === 'all') return baseFilteredEnrollments;
        return baseFilteredEnrollments.filter(e =>
            e.status === 'invited' && matchesInviteFilter(getInviteDeadline(e.invited_at, e.response_days, now), inviteFilter)
        );
    }, [baseFilteredEnrollments, shownFilters, now]);

    // The selection never holds a card the filters hide (or one that is gone): the bulk bar acts on
    // what is selected, so it must be what the user can see
    const keepSelectedOnly = bulkActions.keepOnly;
    useEffect(() => {
        keepSelectedOnly(new Set(filteredEnrollments.map(e => e.id)));
    }, [filteredEnrollments, keepSelectedOnly]);

    // Data grouped by status
    const byStatus = useMemo(() => {
        const { sortOrder } = shownFilters;
        const map: Record<string, EnrollmentRow[]> = {};
        ALL_STATUSES.forEach(s => { map[s] = []; });
        filteredEnrollments.forEach(e => {
            if (map[e.status]) map[e.status].push(e);
            else map[e.status] = [e];
        });

        Object.entries(map).forEach(([status, arr]) => sortColumn(arr, status, sortOrder));
        return map;
    }, [filteredEnrollments, shownFilters]);

    const { positions: queuePositions, details: queueDetails } = useMemo(() => computeQueuePositions(enrollments), [enrollments]);

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

    const selectedCourseMaxCapacity = useMemo(() => {
        if (selectedCourse === 'all') return null;
        return enrollments.find(e => e.course_id === selectedCourse)?.courses?.max_capacity ?? null;
    }, [enrollments, selectedCourse]);

    const confirmedCohortCapacity = useMemo(() => {
        if (selectedCourse === 'all' || selectedCourseDate === 'all' || selectedCourseMaxCapacity == null) return null;
        return { confirmed: byStatus['confirmed']?.length || 0, max: selectedCourseMaxCapacity };
    }, [selectedCourse, selectedCourseDate, selectedCourseMaxCapacity, byStatus]);

    const uniqueVariants = useMemo(() => {
        if (selectedCourse === 'all') return [];
        const seen = new Map<string, string>();
        enrollments
            .filter(e => e.course_id === selectedCourse)
            .forEach(e => {
                const cleaned = cleanVariant(e.courses?.name || '', e.course_variant);
                if (cleaned && !seen.has(cleaned.toLowerCase())) {
                    seen.set(cleaned.toLowerCase(), cleaned);
                }
            });
        return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
    }, [enrollments, selectedCourse]);

    const completedCoursesByStudentId = useMemo(() => {
        const map = new Map<string, Array<{id: string, name: string}>>();
        enrollments.forEach(e => {
            if (e.status === 'completed' && e.courses?.name) {
                const studentId = e.student_id;
                const courses = map.get(studentId) || [];
                if (!courses.some(c => c.id === e.course_id)) {
                    courses.push({ id: e.course_id, name: e.courses.name });
                }
                map.set(studentId, courses);
            }
        });
        return map;
    }, [enrollments]);

    const secondaryCount = (byStatus['withdrawn']?.length || 0) + (byStatus['rejected']?.length || 0);
    const openSecondary = useCallback(() => setShowSecondary(true), []);

    // Handlers
    const openEditNote = useCallback((enrollment: EnrollmentRow) => {
        setEditNoteTarget({ id: enrollment.id, note: enrollment.notes || '' });
        setEditNoteText(enrollment.notes || '');
    }, []);

    const handleUpdateNote = updateNote;

    const handleShowDetail = useCallback((enrollment: EnrollmentRow) => {
        if (enrollment.students) {
            setDetailStudent(enrollment.students);
        }
    }, []);

    const handleStudentDetailNavigate: NavigateFn = useCallback((tab: string, state?: NavState) => {
        if (tab === 'enrollments' && state?.courseId) {
            setSelectedCourse(state.courseId);
            setSelectedVariant('all');
            setSelectedCourseDate(state.courseDate || 'all');
            setDetailStudent(null);
            return;
        }
        onNavigate?.(tab, state);
    }, [setSelectedCourse, setSelectedVariant, setSelectedCourseDate, onNavigate]);

    const openFlagModal = useCallback((enrollment: EnrollmentRow) => {
        const name = fullName(enrollment.students);
        setFlagModalTarget({ studentId: enrollment.student_id, studentName: name });
    }, []);

    const handleToggleInviteFilter = useCallback((target: 'expired' | 'soon') => {
        setInviteFilter(prev => (prev === target ? 'all' : target));
    }, [setInviteFilter]);

    const handleTogglePriorityFilter = useCallback(() => {
        setPriorityOnly(prev => !prev);
    }, [setPriorityOnly]);

    async function handleConfirmWithDate() {
        if (!confirmDateTarget || !confirmDate || confirmingDate) return;
        setConfirmingDate(true);
        try {
            const firstId = confirmDateTarget.ids[0];
            const first = enrollments.find(e => e.id === firstId);
            if (first) {
                // Remember the date for this course (non-critical — don't block confirmation on failure)
                const { error } = await supabase.from('invite_dates').upsert(
                    { course_id: first.course_id, invite_date: confirmDate },
                    { onConflict: 'course_id,invite_date' }
                );
                if (error) console.warn('Failed to save course date:', error.message);
            }

            if (confirmDateTarget.bulk) {
                await bulkActions.bulkUpdateStatus('confirmed', confirmDate);
            } else {
                await enrollmentsHook.updateStatus(confirmDateTarget.ids[0], 'confirmed', confirmDate);
            }
            setConfirmDateTarget(null);
        } finally {
            setConfirmingDate(false);
        }
    }

    async function handleSaveNote() {
        if (!editNoteTarget) return;
        // Keep the editor (and the typed text) open if the save fails
        if (await enrollmentsHook.updateNote(editNoteTarget.id, editNoteText.trim())) setEditNoteTarget(null);
    }

    const hasActiveFilters = selectedCourse !== 'all' || selectedVariant !== 'all' || selectedCourseDate !== 'all' ||
        inviteFilter !== 'all' || !!searchQuery.trim() || !!dateFrom || !!dateTo || !!courseDateFrom || !!courseDateTo ||
        priorityOnly || flagFilter !== 'all' || pendingApprovalOnly || hasNoteOnly || emailFilter !== 'all';

    const resetFilters = useCallback(() => {
        setSelectedCourse('all');
        setSelectedVariant('all');
        setSelectedCourseDate('all');
        setSearchQuery('');
        setInviteFilter('all');
        setDateFrom('');
        setDateTo('');
        setCourseDateFrom('');
        setCourseDateTo('');
        setPriorityOnly(false);
        setFlagFilter('all');
        setPendingApprovalOnly(false);
        setHasNoteOnly(false);
        setEmailFilter('all');
    }, [
        setSelectedCourse, setSelectedVariant, setSelectedCourseDate, setSearchQuery, setInviteFilter,
        setDateFrom, setDateTo, setCourseDateFrom, setCourseDateTo,
        setPriorityOnly, setFlagFilter, setPendingApprovalOnly, setHasNoteOnly, setEmailFilter,
    ]);

    async function handleDeleteEnrollment() {
        if (!deleteTarget) return;
        const { id } = deleteTarget;
        setDeleteTarget(null);
        if (await enrollmentsHook.deleteEnrollment(id)) {
            // Drop it from the selection if it was selected (toggleSelect would *add* unselected ids)
            bulkActions.deselect(id);
        }
    }

    // The flag dialog is mounted per opening (fresh form) and kept while it animates out
    const flagMount = useDialogMount(!!flagModalTarget);
    const flagTarget = useLastPresent(flagModalTarget);
    // The others keep what they showed while they animate out
    const enrollModalMount = useDialogMount(enrollModalOpen);
    const shownDetail = useLastPresent(detailStudent);
    const shownMove = useLastPresent(confirmMoveTarget);
    const shownBulkMove = useLastPresent(bulkConfirmMoveTarget);

    // Escape clears the bulk selection when nothing else is open
    const selectedIds = bulkActions.selectedIds;
    const hasSelection = selectedIds.size > 0;
    const clearSelection = bulkActions.clearSelection;
    useEffect(() => {
        if (!hasSelection) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented || isAnyModalOpen()) return;
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            clearSelection();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [hasSelection, clearSelection]);

    const mouseSensor = useSensor(MouseSensor, MOUSE_SENSOR_OPTS);
    const sensors = useSensors(mouseSensor);

    const handleBulkUpdateStatus = useCallback((newStatus: EnrollmentStatus) => {
        const selected = enrollments.filter(e => bulkActions.selectedIds.has(e.id));
        const confirmedCount = selected.filter(e => e.status === 'confirmed').length;

        if (confirmedCount > 0 && newStatus !== 'confirmed' && newStatus !== 'completed' && newStatus !== 'rejected') {
            setBulkConfirmMoveTarget({
                newStatus,
                confirmedCount,
                totalCount: selected.length
            });
            return;
        }

        bulkActions.bulkUpdateStatus(newStatus);
    }, [enrollments, bulkActions]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;

        startTransition(() => {
            setActiveId(null);
            if (!over) return;

            const enrollmentId = active.id as string;
            const oldStatus = active.data.current?.status;
            const newStatus = over.id;

            if (oldStatus && isEnrollmentStatus(newStatus) && oldStatus !== newStatus) {
                // A selected card carries the whole selection with it, like the bulk bar's buttons
                if (selectedIds.size > 1 && selectedIds.has(enrollmentId)) {
                    handleBulkUpdateStatus(newStatus);
                    return;
                }

                // Moving from confirmed to anything other than completed requires confirmation
                if (oldStatus === 'confirmed' && newStatus !== 'completed') {
                    setConfirmMoveTarget({ enrollmentId, oldStatus, newStatus });
                    return;
                }

                // Opens the invite / confirm dialog where a date is needed; every move offers Undo
                updateStatus(enrollmentId, newStatus);
            }
        });
    }, [updateStatus, selectedIds, handleBulkUpdateStatus]);

    const handleConfirmMove = useCallback(() => {
        if (!confirmMoveTarget) return;
        const { enrollmentId, newStatus } = confirmMoveTarget;
        setConfirmMoveTarget(null);
        updateStatus(enrollmentId, newStatus);
    }, [confirmMoveTarget, updateStatus]);

    const handleCardMoveStatus = useCallback((enrollmentId: string, oldStatus: string, newStatus: EnrollmentStatus) => {
        if (oldStatus === newStatus) {
            // Re-invite / change invite date
            if (newStatus === 'invited') openInviteModalProxy([enrollmentId], false);
            // Reschedule confirmed student to a new course date
            if (newStatus === 'confirmed') {
                const current = enrollmentsRef.current.find(e => e.id === enrollmentId);
                openConfirmModalSingle(enrollmentId, current?.confirmed_date || current?.invited_date || todayISO());
            }
            return;
        }
        if (oldStatus === 'confirmed' && newStatus !== 'completed') {
            setConfirmMoveTarget({ enrollmentId, oldStatus, newStatus });
            return;
        }
        // The same path as a drag: the confirm dialog starts from the date the person was invited
        // for (not today), the invite dialog opens for 'invited'
        updateStatus(enrollmentId, newStatus);
    }, [updateStatus, openInviteModalProxy, openConfirmModalSingle]);

    const [activeMobileColumn, setActiveMobileColumn] = useState<string>('requested');

    const handleConfirmBulkMove = useCallback(() => {
        if (!bulkConfirmMoveTarget) return;
        const { newStatus } = bulkConfirmMoveTarget;
        setBulkConfirmMoveTarget(null);
        bulkActions.bulkUpdateStatus(newStatus);
    }, [bulkConfirmMoveTarget, bulkActions]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    }, []);

    const handleDragCancel = useCallback(() => {
        setActiveId(null);
    }, []);

    const bulkActionBar = useMemo(() => {
        const selectedEnrollments = enrollments.filter(e => bulkActions.selectedIds.has(e.id));
        return (
            <BulkActionBar
                selectedCount={bulkActions.selectedIds.size}
                selectedEnrollments={selectedEnrollments}
                busy={bulkActions.busy}
                reminding={inviteFlow.reminding}
                handleCopySelectedEmails={() => bulkActions.handleCopySelectedEmails(filteredEnrollments)}
                handleCopySelectedPhones={() => bulkActions.handleCopySelectedPhones(filteredEnrollments)}
                bulkUpdateStatus={handleBulkUpdateStatus}
                bulkSetPriority={bulkActions.bulkSetPriority}
                handleGenerateDocuments={() => setDocsFor(selectedEnrollments)}
                sendReminder={() => inviteFlow.handleSendReminder(Array.from(bulkActions.selectedIds))}
                setBulkDeleteOpen={setBulkDeleteOpen}
                clearSelection={bulkActions.clearSelection}
                toggleSelect={bulkActions.toggleSelect}
            />
        );
    }, [enrollments, filteredEnrollments, bulkActions, handleBulkUpdateStatus, inviteFlow]);

    const boardContainerRef = useRef<HTMLDivElement | null>(null);

    // Synchronize activeMobileColumn with currently scrolled column on mobile & tablet (< xl)
    useEffect(() => {
        const container = boardContainerRef.current;
        if (!container) return;

        let timer: ReturnType<typeof setTimeout> | null = null;
        const handleScroll = () => {
            if (window.innerWidth >= 1280) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                const scrollLeft = container.scrollLeft;
                const width = container.clientWidth;
                let bestStatus: string = PIPELINE_STATUSES[0];
                let minDiff = Infinity;
                PIPELINE_STATUSES.forEach(st => {
                    const el = columnRefs.current[st];
                    if (el) {
                        const elCenter = el.offsetLeft + el.offsetWidth / 2;
                        const viewCenter = scrollLeft + width / 2;
                        const diff = Math.abs(elCenter - viewCenter);
                        if (diff < minDiff) {
                            minDiff = diff;
                            bestStatus = st;
                        }
                    }
                });
                setActiveMobileColumn(bestStatus);
            }, 60);
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            container.removeEventListener('scroll', handleScroll);
            if (timer) clearTimeout(timer);
        };
    }, []);

    // п.9: scroll-to-column handler
    const handleStatusBadgeClick = useCallback((status: string) => {
        setActiveMobileColumn(status);
        const el = columnRefs.current[status];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, []);

    // Dashboard status links: show that status — its column, or the opened "Withdrawn & Rejected" section
    useEffect(() => {
        if (!initialStatus) return;
        if ((SECONDARY_STATUSES as readonly EnrollmentStatus[]).includes(initialStatus)) {
            setShowSecondary(true);
            return;
        }
        // Expand the target column if it was collapsed
        setCollapsedColumns(prev => prev.includes(initialStatus) ? prev.filter(s => s !== initialStatus) : prev);
        handleStatusBadgeClick(initialStatus);
    }, [initialStatus, handleStatusBadgeClick, setCollapsedColumns]);

    // Total pipeline count for progress bars & empty-state detection
    const totalPipelineCount = useMemo(() => {
        return PIPELINE_STATUSES.reduce((sum, s) => sum + (byStatus[s]?.length || 0), 0);
    }, [byStatus]);

    const onlySecondaryMatches = totalPipelineCount === 0 && secondaryCount > 0;
    const expandedCount = PIPELINE_STATUSES.length - collapsedSet.size;

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-2 md:gap-4 overflow-hidden">
            <FilterBar
                enrollments={enrollments}
                enrollmentCount={enrollments.length}
                countLoading={!enrollmentsHook.complete}
                filteredCount={filteredEnrollments.length}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                setEnrollModalOpen={(open) => {
                    if (open) setEnrollStudentId(undefined);
                    setEnrollModalOpen(open);
                }}
                selectedCourse={selectedCourse}
                setSelectedCourse={setSelectedCourse}
                uniqueCourses={uniqueCourses}
                courseActiveCounts={courseActiveCounts}
                selectedVariant={selectedVariant}
                setSelectedVariant={setSelectedVariant}
                uniqueVariants={uniqueVariants}
                selectedCourseDate={selectedCourseDate}
                setSelectedCourseDate={setSelectedCourseDate}
                availableCourseDates={availableCourseDates}
                courseDatesTotal={courseDatesTotal}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                courseDateFrom={courseDateFrom}
                setCourseDateFrom={setCourseDateFrom}
                courseDateTo={courseDateTo}
                setCourseDateTo={setCourseDateTo}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                inviteFilter={inviteFilter}
                setInviteFilter={setInviteFilter}
                inviteCounts={inviteCounts}
                priorityOnly={priorityOnly}
                setPriorityOnly={setPriorityOnly}
                flagFilter={flagFilter}
                setFlagFilter={setFlagFilter}
                pendingApprovalOnly={pendingApprovalOnly}
                setPendingApprovalOnly={setPendingApprovalOnly}
                hasNoteOnly={hasNoteOnly}
                setHasNoteOnly={setHasNoteOnly}
                emailFilter={emailFilter}
                setEmailFilter={setEmailFilter}
                attributeCounts={attributeCounts}
                secondaryCount={secondaryCount}
                onOpenSecondary={openSecondary}
            />

            {/* Mobile & Tablet (< xl) Column Quick Switcher Bar */}
            {filteredEnrollments.length > 0 && (
                <div className="xl:hidden flex items-center gap-1.5 overflow-x-auto pb-1 px-1 scrollbar-none shrink-0">
                    {PIPELINE_STATUSES.map(s => {
                        const c = STATUS_CONFIG[s];
                        const count = byStatus[s]?.length || 0;
                        const isActive = activeMobileColumn === s;
                        return (
                            <button
                                key={s}
                                onClick={() => handleStatusBadgeClick(s)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                                    isActive
                                        ? `${c.pillBg} border-current shadow-2xs scale-[1.02]`
                                        : 'bg-surface border-border-subtle text-muted hover:text-primary hover:bg-surface-elevated'
                                }`}
                            >
                                <span className={c.color}>{c.icon}</span>
                                <span>{c.label}</span>
                                <span className="text-xs font-mono">({count})</span>
                            </button>
                        );
                    })}
                    {secondaryCount > 0 && (
                        <button
                            onClick={openSecondary}
                            className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border bg-surface border-border-subtle text-muted"
                        >
                            <Archive size={13} />
                            <span>Withdrawn & Rejected</span>
                            <span className="text-xs font-mono">({secondaryCount})</span>
                        </button>
                    )}
                </div>
            )}

            {/* When matches exist ONLY in Withdrawn & Rejected, point the user right there instead of showing 4 silent empty columns */}
            {onlySecondaryMatches && (
                <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-brand-500/10 border border-brand-500/25 text-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Archive size={18} className="text-brand-600 dark:text-brand-400 shrink-0" />
                        <p className="text-primary font-medium">
                            No active pipeline matches — <strong className="font-bold">{secondaryCount}</strong> {secondaryCount === 1 ? 'enrollment matches' : 'enrollments match'} in Withdrawn &amp; Rejected.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openSecondary}
                        className="px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer shrink-0"
                    >
                        Open Withdrawn &amp; Rejected
                    </button>
                </div>
            )}

            {filteredEnrollments.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4">
                    <div className="w-16 h-16 bg-surface-elevated border border-border-subtle rounded-full flex items-center justify-center mx-auto mb-4 shadow-xs">
                        <GraduationCap size={28} className="text-muted" />
                    </div>
                    <p className="text-lg font-semibold text-primary">No enrollments found</p>
                    <p className="text-sm text-muted mt-1">Try adjusting your filters or add a new enrollment</p>
                    {hasActiveFilters && (
                        <button
                            onClick={resetFilters}
                            className="mt-4 px-4 py-2 text-sm font-semibold text-primary bg-surface-elevated hover:bg-surface border border-border-subtle rounded-xl transition-all active:scale-[0.98] inline-flex items-center gap-2 cursor-pointer"
                        >
                            <RotateCcw size={14} /> Reset filters
                        </button>
                    )}
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                    measuring={MEASURING_CONFIG}
                >
                    <div
                        ref={boardContainerRef}
                        aria-busy={filtersPending || undefined}
                        className={`flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden xl:overflow-hidden gap-2 md:gap-4 snap-x snap-mandatory xl:snap-none scrollbar-none pb-2 overscroll-x-contain touch-pan-x touch-pan-y transition-opacity duration-150 ${filtersPending ? 'opacity-60 delay-150' : ''}`}
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                        {PIPELINE_STATUSES.map(status => {
                            const isCollapsed = collapsedSet.has(status);
                            return (
                                <div
                                    key={status}
                                    ref={el => { columnRefs.current[status] = el; }}
                                    className={`min-h-0 flex flex-col snap-center md:snap-align-none ${
                                        isCollapsed
                                            ? 'w-[calc(100vw-2.5rem)] sm:w-[350px] md:w-[360px] shrink-0 xl:w-11'
                                            : 'w-[calc(100vw-2.5rem)] sm:w-[350px] md:w-[360px] shrink-0 xl:flex-1 xl:min-w-0 xl:w-auto xl:shrink'
                                    }`}
                                >
                                    <StatusColumn
                                        status={status}
                                        items={byStatus[status] || []}
                                        selectedIds={bulkActions.selectedIds}
                                        selectAllInList={bulkActions.selectAllInList}
                                        handleCopyEmails={bulkActions.handleCopyEmails}
                                        toggleSelect={bulkActions.toggleSelect}
                                        selectMany={bulkActions.selectMany}
                                        onSelectTopN={status === 'requested' ? bulkActions.replaceSelection : undefined}
                                        togglePriority={enrollmentsHook.togglePriority}
                                        openEditNote={openEditNote}
                                        onUpdateNote={handleUpdateNote}
                                        queuePositions={queuePositions}
                                        queueDetails={queueDetails}
                                        flagsByStudentId={studentFlagsHook.flagsByStudentId}
                                        completedCoursesByStudentId={completedCoursesByStudentId}
                                        onFlagClick={openFlagModal}
                                        emptyFlags={EMPTY_FLAGS}
                                        emptyCompletedCourses={EMPTY_COMPLETED_COURSES}
                                        totalCount={totalPipelineCount}
                                        onShowDetail={handleShowDetail}
                                        onMoveStatus={handleCardMoveStatus}
                                        optedOutEmails={optedOutEmails}
                                        onOpenApprovals={onOpenApprovals}
                                        sessions={courseSessions}
                                        filters={shownFilters}
                                        sortOrder={shownFilters.sortOrder}
                                        loadingOlder={status === 'completed' && !enrollmentsHook.complete}
                                        expiredCount={status === 'invited' ? inviteCounts.expired : 0}
                                        dueSoonCount={status === 'invited' ? inviteCounts.soon : 0}
                                        inviteFilter={status === 'invited' ? inviteFilter : 'all'}
                                        onToggleInviteFilter={status === 'invited' ? handleToggleInviteFilter : undefined}
                                        priorityOnly={status === 'requested' ? priorityOnly : false}
                                        onTogglePriorityFilter={status === 'requested' ? handleTogglePriorityFilter : undefined}
                                        cohortCapacity={status === 'confirmed' ? confirmedCohortCapacity : null}
                                        suggestedTopN={status === 'requested' ? selectedCourseMaxCapacity : null}
                                        collapsed={isCollapsed}
                                        canCollapse={expandedCount > 1 || isCollapsed}
                                        onToggleCollapse={() => toggleCollapseColumn(status)}
                                        hasSelection={hasSelection}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* п.8: drop animation enabled */}
                    <DragOverlay dropAnimation={DROP_ANIMATION}>
                        {activeId ? (() => {
                            const activeEnrollment = enrollments.find(e => e.id === activeId);
                            if (!activeEnrollment) return null;
                            const carried = selectedIds.has(activeId) ? selectedIds.size : 1;
                            const emailNorm = normalizeEmail(activeEnrollment.students?.email);
                            return (
                                <div className="relative">
                                {carried > 1 && (
                                    <span
                                        data-testid="drag-count"
                                        className="absolute -top-2.5 -left-2.5 z-110 min-w-7 h-7 px-2 inline-flex items-center justify-center rounded-full bg-brand-500 text-white text-xs font-extrabold shadow-lg ring-2 ring-surface"
                                    >
                                        {carried}
                                    </span>
                                )}
                                <EnrollmentCard
                                    enrollment={activeEnrollment}
                                    status={activeEnrollment.status}
                                    isSelected={bulkActions.selectedIds.has(activeId)}
                                    toggleSelect={bulkActions.toggleSelect}
                                    togglePriority={enrollmentsHook.togglePriority}
                                    openEditNote={openEditNote}
                                    onUpdateNote={handleUpdateNote}
                                    queuePosition={queuePositions.get(activeId)}
                                    queueDetail={queueDetails.get(activeId)}
                                    studentFlags={studentFlagsHook.flagsByStudentId.get(activeEnrollment.student_id) || EMPTY_FLAGS}
                                    completedCourses={completedCoursesByStudentId.get(activeEnrollment.student_id) || EMPTY_COMPLETED_COURSES}
                                    onFlagClick={openFlagModal}
                                    emailOptedOut={!!emailNorm && optedOutEmails.has(emailNorm)}
                                    isOverlay
                                    onShowDetail={handleShowDetail}
                                    session={sessionForEnrollment(activeEnrollment, courseSessions)}
                                />
                                </div>
                            );
                        })() : null}
                    </DragOverlay>
                </DndContext>
            )}

            {bulkActionBar}

            <SecondaryPanel
                open={showSecondary}
                onClose={() => setShowSecondary(false)}
                byStatus={byStatus}
                loading={!enrollmentsHook.complete}
                optedOutEmails={optedOutEmails}
                // Back to the queue; the toast that follows offers Undo
                onRestore={e => updateStatus(e.id, 'requested')}
                onDelete={setDeleteTarget}
                onShowDetail={handleShowDetail}
                onCopyEmails={bulkActions.handleCopyEmails}
                onUpdateNote={handleUpdateNote}
                onRestoreMany={items => bulkActions.bulkRestoreIds(items.map(e => e.id))}
                onDeleteMany={items => bulkActions.bulkDeleteIds(items.map(e => e.id))}
            />

            {/* Modals go here */}
            <InviteDateModal inviteFlow={inviteFlow} optedOutEmails={optedOutEmails} />

            <ConfirmDateModal target={confirmDateTarget} date={confirmDate} onDateChange={setConfirmDate} busy={confirmingDate} onConfirm={handleConfirmWithDate} onClose={() => setConfirmDateTarget(null)} savedDates={inviteFlow.savedInviteDates} getDateStats={inviteFlow.getDateStats} />

            {enrollModalMount.mounted && (
                <EnrollmentModal
                    key={enrollModalMount.key}
                    open={enrollModalOpen}
                    preselectedStudentId={enrollStudentId}
                    // "Add" on a board filtered to a course starts with that course (and language)
                    preselectedCourseId={!enrollStudentId && selectedCourse !== 'all' ? selectedCourse : undefined}
                    preselectedVariant={!enrollStudentId && selectedCourse !== 'all' && selectedVariant !== 'all' ? selectedVariant : undefined}
                    onSave={() => {
                        // The modal itself reads the new enrollment into the cached list
                        showToast('Enrollment created', 'success');
                        if (detailStudent) setDetailStudent({ ...detailStudent });
                    }}
                    onClose={() => {
                        setEnrollModalOpen(false);
                        setEnrollStudentId(undefined);
                    }}
                />
            )}

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Enrollment"
                message={`Remove ${deleteTarget?.students?.first_name || ''} ${deleteTarget?.students?.last_name || ''} from ${deleteTarget?.courses?.name || 'this course'}?`}
                confirmLabel="Remove"
                onConfirm={handleDeleteEnrollment}
                onCancel={() => setDeleteTarget(null)}
            />

            <GenerateDocsModal
                open={docsFor !== null}
                selected={docsFor ?? []}
                onClose={done => {
                    setDocsFor(null);
                    if (done) bulkActions.clearSelection();
                }}
            />
            <ConfirmDialog
                open={bulkDeleteOpen}
                title="Delete Selected Enrollments"
                message={`Delete ${bulkActions.selectedIds.size} selected enrollment(s)? This cannot be undone.`}
                confirmLabel="Delete All"
                onConfirm={() => { bulkActions.handleBulkDelete(); setBulkDeleteOpen(false); }}
                onCancel={() => setBulkDeleteOpen(false)}
            />

            {shownMove && (() => {
                const enrollment = enrollments.find(e => e.id === shownMove.enrollmentId);
                const name = fullName(enrollment?.students) || 'this student';
                const targetLabel = STATUS_CONFIG[shownMove.newStatus]?.label || shownMove.newStatus;
                return (
                    <ConfirmDialog
                        open={!!confirmMoveTarget}
                        title="Move from Confirmed"
                        message={`Are you sure you want to move ${name} from Confirmed to ${targetLabel}?`}
                        confirmLabel="Move"
                        variant="warning"
                        onConfirm={handleConfirmMove}
                        onCancel={() => setConfirmMoveTarget(null)}
                    />
                );
            })()}

            {shownBulkMove && (() => {
                const targetLabel = STATUS_CONFIG[shownBulkMove.newStatus]?.label || shownBulkMove.newStatus;
                const isAllConfirmed = shownBulkMove.confirmedCount === shownBulkMove.totalCount;
                const message = isAllConfirmed
                    ? `Are you sure you want to move ${shownBulkMove.totalCount} confirmed enrollment(s) to ${targetLabel}?`
                    : `Are you sure you want to move ${shownBulkMove.totalCount} enrollment(s) (${shownBulkMove.confirmedCount} currently confirmed) to ${targetLabel}?`;
                return (
                    <ConfirmDialog
                        open={!!bulkConfirmMoveTarget}
                        title="Move Confirmed Enrollments"
                        message={message}
                        confirmLabel="Move"
                        variant="warning"
                        onConfirm={handleConfirmBulkMove}
                        onCancel={() => setBulkConfirmMoveTarget(null)}
                    />
                );
            })()}

            <EditNoteModal open={!!editNoteTarget} text={editNoteText} onTextChange={setEditNoteText} onSave={handleSaveNote} onClose={() => setEditNoteTarget(null)} />

            {/* Student Flag Modal */}
            {flagMount.mounted && flagTarget && (
                <StudentFlagModal key={flagMount.key} open={!!flagModalTarget} target={flagTarget} flags={studentFlagsHook.flagsByStudentId.get(flagTarget.studentId) ?? EMPTY_FLAGS} courses={uniqueCourses} onAddFlag={(courseId, comment) => studentFlagsHook.addFlag(flagTarget.studentId, courseId, comment)} onRemoveFlag={studentFlagsHook.removeFlag} onClose={() => setFlagModalTarget(null)} />
            )}

            {/* Student Detail Drawer */}
            {shownDetail && (
                <StudentDetail
                    open={!!detailStudent}
                    student={shownDetail}
                    onClose={() => setDetailStudent(null)}
                    onEnroll={openEnrollFromDetail}
                    onStudentUpdated={setDetailStudent}
                    onNavigate={handleStudentDetailNavigate}
                />
            )}
        </div>
    );
}

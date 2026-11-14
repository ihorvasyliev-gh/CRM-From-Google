import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue, startTransition } from 'react';
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

const EMPTY_FLAGS: import('../lib/types').StudentFlag[] = [];
const isString = (v: unknown): v is string => typeof v === 'string';
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
}: {
    initialCourseFilter?: string;
    initialCourseDate?: string;
    initialInviteFilter?: InviteFilter;
    /** Status to bring into view (dashboard status links) */
    initialStatus?: EnrollmentStatus;
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

    // Filters
    // Board filters survive navigating away and back within the tab (session) — preferences like sort
    // order and the Withdrawn/Rejected toggle are remembered across sessions (local).
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
    // Withdrawn & Rejected open in a dialog of their own
    const [showSecondary, setShowSecondary] = useState(false);
    const [sortOrder, setSortOrder] = usePersistentState<'date-asc' | 'date-desc' | 'name'>('board.sortOrder', 'date-asc', {
        storage: 'local',
        validate: (v): v is 'date-asc' | 'date-desc' | 'name' => v === 'date-asc' || v === 'date-desc' || v === 'name',
    });

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

    // Upcoming course dates (today on) with student counts for the current course/variant.
    // An open multi-date invite counts on each offered date, so the total counts people, not date slots.
    const { availableCourseDates, courseDatesTotal } = useMemo(() => {
        const dateMap = new Map<string, { count: number; confirmed: number; invited: number }>();
        const today = todayISO();
        let total = 0;

        enrollments.forEach(item => {
            if (selectedCourse !== 'all' && item.course_id !== selectedCourse) return;
            if (selectedVariant !== 'all') {
                const cleaned = cleanVariant(item.courses?.name || '', item.course_variant);
                if (cleaned.toLowerCase() !== selectedVariant.toLowerCase()) return;
            }

            // Only include today and future dates (ISO strings compare chronologically)
            const upcoming = courseDatesOf(item).filter(date => date >= today);
            if (upcoming.length === 0) return;
            total++;
            upcoming.forEach(date => {
                const entry = dateMap.get(date) || { count: 0, confirmed: 0, invited: 0 };
                entry.count++;
                if (item.status === 'confirmed') entry.confirmed++;
                if (item.status === 'invited') entry.invited++;
                dateMap.set(date, entry);
            });
        });

        return {
            availableCourseDates: Array.from(dateMap.entries())
                .map(([date, c]) => ({ date, ...c }))
                .sort((a, b) => a.date.localeCompare(b.date)),
            courseDatesTotal: total,
        };
    }, [enrollments, selectedCourse, selectedVariant]);

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
    }), [selectedCourse, selectedVariant, selectedCourseDate, searchQuery, dateFrom, dateTo, courseDateFrom, courseDateTo, inviteFilter, sortOrder]);
    const shownFilters = useDeferredValue(filters);
    const filtersPending = shownFilters !== filters;

    // Filters derivation (everything except the invite-deadline filter, so its chip counts follow the other filters)
    const baseFilteredEnrollments = useMemo(() => {
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

    const openFlagModal = useCallback((enrollment: EnrollmentRow) => {
        const name = fullName(enrollment.students);
        setFlagModalTarget({ studentId: enrollment.student_id, studentName: name });
    }, []);

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
        inviteFilter !== 'all' || !!searchQuery.trim() || !!dateFrom || !!dateTo || !!courseDateFrom || !!courseDateTo;

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
    }, [setSelectedCourse, setSelectedVariant, setSelectedCourseDate, setSearchQuery, setInviteFilter, setDateFrom, setDateTo, setCourseDateFrom, setCourseDateTo]);

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
            // An expired invitation sent again: the invite dialog, for the person already invited
            if (newStatus === 'invited') openInviteModalProxy([enrollmentId], false);
            return;
        }
        if (oldStatus === 'confirmed' && newStatus !== 'completed') {
            setConfirmMoveTarget({ enrollmentId, oldStatus, newStatus });
            return;
        }
        // The same path as a drag: the confirm dialog starts from the date the person was invited
        // for (not today), the invite dialog opens for 'invited'
        updateStatus(enrollmentId, newStatus);
    }, [updateStatus, openInviteModalProxy]);

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
                handleCopySelectedEmails={() => bulkActions.handleCopySelectedEmails(filteredEnrollments)}
                bulkUpdateStatus={handleBulkUpdateStatus}
                handleGenerateDocuments={() => setDocsFor(selectedEnrollments)}
                sendReminder={() => inviteFlow.handleSendReminder(Array.from(bulkActions.selectedIds))}
                setBulkDeleteOpen={setBulkDeleteOpen}
                clearSelection={bulkActions.clearSelection}
                toggleSelect={bulkActions.toggleSelect}
            />
        );
    }, [enrollments, filteredEnrollments, bulkActions, handleBulkUpdateStatus, inviteFlow]);

    const boardContainerRef = useRef<HTMLDivElement | null>(null);

    // Synchronize activeMobileColumn with currently scrolled column
    useEffect(() => {
        const container = boardContainerRef.current;
        if (!container) return;

        let timer: ReturnType<typeof setTimeout> | null = null;
        const handleScroll = () => {
            if (window.innerWidth >= 1024) return;
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
        handleStatusBadgeClick(initialStatus);
    }, [initialStatus, handleStatusBadgeClick]);

    // Total pipeline count for progress bars — п.1
    const totalPipelineCount = useMemo(() => {
        return PIPELINE_STATUSES.reduce((sum, s) => sum + (byStatus[s]?.length || 0), 0);
    }, [byStatus]);

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
                secondaryCount={secondaryCount}
                onOpenSecondary={openSecondary}
            />

            {/* Mobile Column Quick Switcher Bar */}
            <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pb-1 px-1 scrollbar-none shrink-0">
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border bg-surface border-border-subtle text-muted"
                    >
                        <Archive size={13} />
                        <span>Withdrawn & Rejected</span>
                        <span className="text-xs font-mono">({secondaryCount})</span>
                    </button>
                )}
            </div>

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
                    className={`flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden md:overflow-hidden md:grid md:grid-cols-2 xl:grid-cols-4 gap-2 md:gap-4 snap-x snap-mandatory scrollbar-none pb-2 overscroll-x-contain touch-pan-x touch-pan-y transition-opacity duration-150 ${filtersPending ? 'opacity-60 delay-150' : ''}`}
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    {PIPELINE_STATUSES.map(status => (
                        <div
                            key={status}
                            ref={el => { columnRefs.current[status] = el; }}
                            className="min-h-0 flex flex-col w-[calc(100vw-2.5rem)] sm:w-[350px] md:w-auto shrink-0 md:shrink snap-center md:snap-align-none"
                        >
                            <StatusColumn
                                status={status}
                                items={byStatus[status] || []}
                                selectedIds={bulkActions.selectedIds}
                                selectAllInList={bulkActions.selectAllInList}
                                handleCopyEmails={bulkActions.handleCopyEmails}
                                toggleSelect={bulkActions.toggleSelect}
                                selectMany={bulkActions.selectMany}
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
                                sessions={courseSessions}
                                filters={shownFilters}
                                loadingOlder={status === 'completed' && !enrollmentsHook.complete}
                            />
                        </div>
                    ))}
                </div>

                {/* п.8: drop animation enabled */}
                <DragOverlay dropAnimation={DROP_ANIMATION}>
                    {activeId ? (() => {
                        const activeEnrollment = enrollments.find(e => e.id === activeId);
                        if (!activeEnrollment) return null;
                        const carried = selectedIds.has(activeId) ? selectedIds.size : 1;
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
                                isOverlay
                                onShowDetail={handleShowDetail}
                                session={sessionForEnrollment(activeEnrollment, courseSessions)}
                            />
                            </div>
                        );
                    })() : null}
                </DragOverlay>
            </DndContext>

            {filteredEnrollments.length === 0 && (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-surface-elevated border border-border-subtle rounded-full flex items-center justify-center mx-auto mb-4 shadow-xs">
                        <GraduationCap size={28} className="text-muted" />
                    </div>
                    <p className="text-lg font-semibold text-primary">No enrollments found</p>
                    <p className="text-sm text-muted mt-1">Try adjusting your filters or add a new enrollment</p>
                    {hasActiveFilters && (
                        <button
                            onClick={resetFilters}
                            className="mt-4 px-4 py-2 text-sm font-semibold text-primary bg-surface-elevated hover:bg-surface border border-border-subtle rounded-xl transition-all active:scale-[0.98] inline-flex items-center gap-2"
                        >
                            <RotateCcw size={14} /> Reset filters
                        </button>
                    )}
                </div>
            )}

            {bulkActionBar}

            <SecondaryPanel
                open={showSecondary}
                onClose={() => setShowSecondary(false)}
                byStatus={byStatus}
                loading={!enrollmentsHook.complete}
                // Back to the queue; the toast that follows offers Undo
                onRestore={e => updateStatus(e.id, 'requested')}
                onDelete={setDeleteTarget}
                onShowDetail={handleShowDetail}
                onCopyEmails={bulkActions.handleCopyEmails}
            />

            {/* Modals go here */}
            <InviteDateModal inviteFlow={inviteFlow} />

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
                />
            )}
        </div>
    );
}

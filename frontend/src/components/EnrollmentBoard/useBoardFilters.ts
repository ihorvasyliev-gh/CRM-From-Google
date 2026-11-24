import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useNowMinute } from '../../hooks/useNow';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import { ALL_STATUSES, cleanVariant, PIPELINE_STATUSES, type StudentFlag } from '../../lib/types';
import { todayISO } from '../../lib/dateUtils';
import { matchesSearch } from '../../lib/searchUtils';
import { getInviteDeadline, matchesInviteFilter, type InviteFilter } from '../../lib/inviteDeadline';
import { courseDatesOf } from '../../lib/courseDates';
import { sortColumn, type SortOrder } from './boardSort';
import {
    computeAvailableCourseDates,
    computeCourseActiveCounts,
    isEmailUnreachable,
    matchesAttributeFilters,
    type EmailStatusFilter,
    type FlagFilter,
} from './boardFilters';

const isString = (v: unknown): v is string => typeof v === 'string';
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isInviteFilter = (v: unknown): v is InviteFilter =>
    v === 'all' || v === 'expired' || v === 'soon' || v === 'attention';
const isFlagFilter = (v: unknown): v is FlagFilter =>
    v === 'all' || v === 'flagged' || v === 'unflagged';
const isEmailStatusFilter = (v: unknown): v is EmailStatusFilter =>
    v === 'all' || v === 'unreachable' || v === 'emailable';
const isSortOrder = (v: unknown): v is SortOrder =>
    v === 'date-asc' || v === 'date-desc' || v === 'name';

export interface UseBoardFiltersOptions {
    enrollments: EnrollmentRow[];
    flagsByStudentId: ReadonlyMap<string, StudentFlag[]>;
    optedOutEmails: ReadonlySet<string>;
    initialCourseFilter?: string;
    initialCourseDate?: string;
    initialInviteFilter?: InviteFilter;
}

export function useBoardFilters({
    enrollments,
    flagsByStudentId,
    optedOutEmails,
    initialCourseFilter,
    initialCourseDate,
    initialInviteFilter,
}: UseBoardFiltersOptions) {
    // Board filters survive navigating away and back within the tab (session) — preferences like sort
    // order are remembered across sessions (local). Explicit URL query params (?course=..., ?date=...,
    // ?invite=...) override saved filters so admins can share cohort links.
    const urlParams = useMemo(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''), []);
    const urlCourse = urlParams.get('course') || undefined;
    const urlDate = urlParams.get('date') || undefined;
    const rawUrlInvite = urlParams.get('invite');
    const urlInvite: InviteFilter | undefined =
        rawUrlInvite === 'expired' || rawUrlInvite === 'soon' || rawUrlInvite === 'attention' ? rawUrlInvite : undefined;

    const [selectedCourse, setSelectedCourse] = usePersistentState<string>(
        'board.course',
        () => urlCourse || initialCourseFilter || 'all',
        { validate: isString },
    );
    const [selectedVariant, setSelectedVariant] = usePersistentState<string>('board.variant', 'all', { validate: isString });
    const [selectedCourseDate, setSelectedCourseDate] = usePersistentState<string>(
        'board.courseDate',
        () => urlDate || initialCourseDate || 'all',
        { validate: isString },
    );
    // Set by the search field once typing pauses
    const [searchQuery, setSearchQuery] = usePersistentState<string>('board.search', '', { validate: isString });
    // The invite and date filters are remembered like the rest: coming back from a student's page
    // shows the same cards
    const [inviteFilter, setInviteFilter] = usePersistentState<InviteFilter>(
        'board.inviteFilter',
        () => urlInvite || initialInviteFilter || 'all',
        { validate: isInviteFilter },
    );

    // Apply URL deep-link overrides once on mount if present (even when sessionStorage had another filter)
    const appliedUrlDeepLinkRef = useRef(false);
    useEffect(() => {
        if (appliedUrlDeepLinkRef.current) return;
        appliedUrlDeepLinkRef.current = true;
        if (urlCourse) {
            setSelectedCourse(urlCourse);
            setSelectedVariant('all');
        }
        if (urlDate) setSelectedCourseDate(urlDate);
        if (urlInvite) setInviteFilter(urlInvite);
    }, [urlCourse, urlDate, urlInvite, setSelectedCourse, setSelectedVariant, setSelectedCourseDate, setInviteFilter]);

    const [dateFrom, setDateFrom] = usePersistentState<string>('board.dateFrom', '', { validate: isString });
    const [dateTo, setDateTo] = usePersistentState<string>('board.dateTo', '', { validate: isString });
    const [courseDateFrom, setCourseDateFrom] = usePersistentState<string>('board.courseDateFrom', '', { validate: isString });
    const [courseDateTo, setCourseDateTo] = usePersistentState<string>('board.courseDateTo', '', { validate: isString });
    const [priorityOnly, setPriorityOnly] = usePersistentState<boolean>('board.priorityOnly', false, { validate: isBoolean });
    const [flagFilter, setFlagFilter] = usePersistentState<FlagFilter>('board.flagFilter', 'all', { validate: isFlagFilter });
    const [pendingApprovalOnly, setPendingApprovalOnly] = usePersistentState<boolean>('board.pendingApprovalOnly', false, { validate: isBoolean });
    const [hasNoteOnly, setHasNoteOnly] = usePersistentState<boolean>('board.hasNoteOnly', false, { validate: isBoolean });
    const [emailFilter, setEmailFilter] = usePersistentState<EmailStatusFilter>('board.emailFilter', 'all', { validate: isEmailStatusFilter });
    const [sortOrder, setSortOrder] = usePersistentState<SortOrder>('board.sortOrder', 'date-asc', {
        storage: 'local',
        validate: isSortOrder,
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
        course: selectedCourse,
        variant: selectedVariant,
        courseDate: selectedCourseDate,
        search: searchQuery,
        dateFrom,
        dateTo,
        courseDateFrom,
        courseDateTo,
        inviteFilter,
        sortOrder,
        priorityOnly,
        flagFilter,
        pendingApprovalOnly,
        hasNoteOnly,
        emailFilter,
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
                }, search),
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
            if ((flagsByStudentId.get(e.student_id)?.length ?? 0) > 0) flagged++;
            if (e.completion_request_status === 'pending') pendingApproval++;
            if (e.notes?.trim()) hasNote++;
            if (isEmailUnreachable(e.students?.email, optedOutEmails)) unreachableEmail++;
        }
        return { priority, flagged, pendingApproval, hasNote, unreachableEmail };
    }, [scopeFilteredEnrollments, flagsByStudentId, optedOutEmails]);

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
                flagsByStudentId,
                optedOutEmails,
            ),
        );
    }, [scopeFilteredEnrollments, shownFilters, flagsByStudentId, optedOutEmails]);

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
            e.status === 'invited' && matchesInviteFilter(getInviteDeadline(e.invited_at, e.response_days, now), inviteFilter),
        );
    }, [baseFilteredEnrollments, shownFilters, now]);

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

    const secondaryCount = (byStatus['withdrawn']?.length || 0) + (byStatus['rejected']?.length || 0);

    // Total pipeline count for progress bars & empty-state detection
    const totalPipelineCount = useMemo(
        () => PIPELINE_STATUSES.reduce((sum, s) => sum + (byStatus[s]?.length || 0), 0),
        [byStatus],
    );

    const onlySecondaryMatches = totalPipelineCount === 0 && secondaryCount > 0;

    const handleToggleInviteFilter = useCallback((target: 'expired' | 'soon') => {
        setInviteFilter(prev => (prev === target ? 'all' : target));
    }, [setInviteFilter]);

    const handleTogglePriorityFilter = useCallback(() => {
        setPriorityOnly(prev => !prev);
    }, [setPriorityOnly]);

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

    return {
        selectedCourse,
        setSelectedCourse,
        selectedVariant,
        setSelectedVariant,
        selectedCourseDate,
        setSelectedCourseDate,
        searchQuery,
        setSearchQuery,
        inviteFilter,
        setInviteFilter,
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,
        courseDateFrom,
        setCourseDateFrom,
        courseDateTo,
        setCourseDateTo,
        priorityOnly,
        setPriorityOnly,
        flagFilter,
        setFlagFilter,
        pendingApprovalOnly,
        setPendingApprovalOnly,
        hasNoteOnly,
        setHasNoteOnly,
        emailFilter,
        setEmailFilter,
        sortOrder,
        setSortOrder,
        shownFilters,
        filtersPending,
        availableCourseDates,
        courseDatesTotal,
        courseActiveCounts,
        uniqueCourses,
        uniqueVariants,
        selectedCourseMaxCapacity,
        confirmedCohortCapacity,
        attributeCounts,
        inviteCounts,
        filteredEnrollments,
        byStatus,
        secondaryCount,
        totalPipelineCount,
        onlySecondaryMatches,
        hasActiveFilters,
        resetFilters,
        handleToggleInviteFilter,
        handleTogglePriorityFilter,
    };
}

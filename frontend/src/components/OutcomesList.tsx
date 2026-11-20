import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Loader2, X, Pencil, GraduationCap, Users, MailCheck, Clock } from 'lucide-react';
import StatTile from './ui/StatTile';
import { Segmented } from './ui/Tabs';
import { buildStatusEmailBodyHtml, buildStatusEmailSubject } from '../lib/emailTemplates';
import { fetchOptedOutEmails, listEmailOptOutsSafe, normalizeEmail } from '../lib/emailOptOut';
import { TrackingBadge, EmploymentBadge, CallMarkButton, PhoneLink, EmailStatusBadges } from './OutcomeBadges';
import OutcomeBulkBar from './OutcomeBulkBar';
import { setGraduateCallMark, callMarkErrorMessage } from '../lib/callMark';
import { copyEligibleEmails, copySurveyAndOpenMailto } from '../lib/surveyEmail';
import {
    computeOutcomeStats,
    formatAllSkippedMessage,
    formatSkippedSummary,
    isNotWorkingOutcome,
    isWorkingOutcome,
    partitionForSurvey,
} from '../lib/employmentTypes';
import { matchesOutcomeSearch, toggleOutcomeSelection } from '../lib/outcomeSelection';
import { OUTCOME_UNDO_MS, restoreGraduatesFromPending, snapshotGraduatesForPending } from '../lib/outcomeUndo';
import { formatLocalDate, formatDisplayDate } from '../lib/dateUtils';
import { getAvatarGradient } from '../lib/types';
import { showToast } from '../lib/toast';
import OutcomeEditModal, { type OutcomeValues } from './OutcomeEditModal';
import { useDialogMount, useLastPresent } from '../hooks/usePresence';
import { usePersistentState } from '../hooks/usePersistentState';
import { useDebounce } from '../hooks/useDebounce';
import SearchInput from './ui/SearchInput';
import { ErrorState } from './ui/States';
import OutreachLists from './OutreachLists';

export { type GraduateRow } from '../hooks/useOutcomes';
import { fetchGraduatesFn, type GraduateRow } from '../hooks/useOutcomes';
import { useProgressiveList } from '../hooks/useProgressiveList';
import { SortHeader } from './OutcomeTableSort';
import { sortOutcomeRows, type OutcomeSort } from '../lib/outcomeSort';

export interface OutcomesListProps {
    onOpenStudentDetail?: (studentId: string) => void;
    onOpenStudentByEmail?: (email: string) => void;
}

type OutcomeFilter = 'all' | 'not_contacted' | 'pending' | 'responded';
type EmploymentFilter = 'all' | 'working' | 'not_working';
/** "Called, no answer" mark (only people who haven't responded can carry it) */
type CallFilter = 'all' | 'called' | 'not_called';

const VALID_STATUS_FILTERS = new Set<string>(['all', 'not_contacted', 'pending', 'responded']);
const VALID_EMPLOYMENT_FILTERS = new Set<string>(['all', 'working', 'not_working']);
const VALID_CALL_FILTERS = new Set<string>(['all', 'called', 'not_called']);
const VALID_SORT_KEYS = new Set<string>(['name', 'courses', 'tracking', 'employment', 'updated']);

const isOutcomeFilter = (v: unknown): v is OutcomeFilter => typeof v === 'string' && VALID_STATUS_FILTERS.has(v);
const isEmploymentFilter = (v: unknown): v is EmploymentFilter => typeof v === 'string' && VALID_EMPLOYMENT_FILTERS.has(v);
const isCallFilter = (v: unknown): v is CallFilter => typeof v === 'string' && VALID_CALL_FILTERS.has(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isOutcomeSort = (v: unknown): v is OutcomeSort =>
    typeof v === 'object' && v !== null
    && typeof (v as { key?: unknown }).key === 'string'
    && VALID_SORT_KEYS.has((v as { key: string }).key)
    && ((v as { dir?: unknown }).dir === 'asc' || (v as { dir?: unknown }).dir === 'desc');

const CALL_FILTERS: { value: CallFilter; label: string }[] = [
    { value: 'all', label: 'All calls' },
    { value: 'not_called', label: 'Not called yet' },
    { value: 'called', label: 'Called, no answer' },
];

const EMPLOYMENT_FILTERS: { value: EmploymentFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'working', label: 'Working' },
    { value: 'not_working', label: 'Not working' },
];

const pillBtnCls = (active: boolean) =>
    `text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
        active
            ? 'bg-brand-500 text-white shadow-xs'
            : 'bg-surface-elevated text-muted hover:text-primary border border-border-subtle'
    }`;

/** Outcomes page: CRM graduates, or external lists such as Action 11 (from IRIS). */
export default function OutcomesList({ onOpenStudentDetail, onOpenStudentByEmail }: OutcomesListProps = {}) {
    const [, setSearchParams] = useSearchParams();
    // Kept in <Activity>: persist the active tab instead of deriving it reactively from
    // searchParams (which clear when another route is shown).
    const [view, setView] = usePersistentState<'graduates' | 'lists'>(
        'outcomes.view',
        () => (new URLSearchParams(window.location.search).get('view') === 'lists' ? 'lists' : 'graduates'),
        { validate: (v): v is 'graduates' | 'lists' => v === 'graduates' || v === 'lists' },
    );

    return (
        <div className="space-y-4">
            <Segmented<'graduates' | 'lists'>
                ariaLabel="Outcomes source"
                value={view}
                onChange={value => {
                    setView(value);
                    setSearchParams(value === 'lists' ? { view: 'lists' } : {}, { replace: true });
                }}
                className="w-fit"
                options={[
                    { value: 'graduates', label: 'CRM Graduates', icon: <GraduationCap size={13} /> },
                    { value: 'lists', label: 'External Lists (Action 11…)', icon: <Users size={13} /> },
                ]}
            />
            {view === 'lists'
                ? <OutreachLists onOpenStudentByEmail={onOpenStudentByEmail} />
                : <GraduateOutcomes onOpenStudentDetail={onOpenStudentDetail} />}
        </div>
    );
}

function GraduateOutcomes({ onOpenStudentDetail }: { onOpenStudentDetail?: (studentId: string) => void }) {
    const queryClient = useQueryClient();
    const { data: graduates = [], isLoading: loading, error: loadError, refetch: fetchGraduates } = useQuery({
        queryKey: ['outcomes_graduates'],
        queryFn: fetchGraduatesFn,
    });
    const { data: optOuts = [] } = useQuery({
        queryKey: ['email_opt_outs'],
        queryFn: listEmailOptOutsSafe,
    });
    const optedOutSet = useMemo(
        () => new Set(optOuts.map(o => normalizeEmail(o.email))),
        [optOuts],
    );

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const lastClickedIdRef = useRef<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    const [filterStatus, setFilterStatus] = usePersistentState<OutcomeFilter>('outcomes.grad.status', 'all', { validate: isOutcomeFilter });
    const [filterEmployment, setFilterEmployment] = usePersistentState<EmploymentFilter>('outcomes.grad.employment', 'all', { validate: isEmploymentFilter });
    const [filterCall, setFilterCall] = usePersistentState<CallFilter>('outcomes.grad.call', 'all', { validate: isCallFilter });
    const [filterCourse, setFilterCourse] = usePersistentState<string>('outcomes.grad.course', 'all', { validate: isString });
    const [sort, setSort] = usePersistentState<OutcomeSort>('outcomes.grad.sort', { key: 'name', dir: 'asc' }, { validate: isOutcomeSort });

    const [callBusy, setCallBusy] = useState<Set<string>>(new Set());
    const [busyMode, setBusyMode] = useState<'sending' | 'marking' | null>(null);
    const [editingGrad, setEditingGrad] = useState<GraduateRow | null>(null);
    // Kept while the editor animates out; a fresh editor for every opening
    const editMount = useDialogMount(!!editingGrad);
    const shownGrad = useLastPresent(editingGrad);

    // Unique courses for filter
    const uniqueCourses = useMemo(() => {
        const courseSet = new Set<string>();
        graduates.forEach(g => g.courses.forEach(c => courseSet.add(c)));
        return Array.from(courseSet).sort();
    }, [graduates]);

    // Guard against a stale persisted course name that no longer appears in the data
    const effectiveCourse = filterCourse !== 'all' && (uniqueCourses.length === 0 || uniqueCourses.includes(filterCourse))
        ? filterCourse
        : 'all';

    // Calls filter only applies to people awaiting a reply (not Responded or already Working)
    const callsApplicable = filterStatus !== 'responded' && filterEmployment !== 'working';

    function handleSelectStatus(next: OutcomeFilter) {
        setFilterStatus(next);
        if (next === 'responded') {
            setFilterCall('all');
        } else if (next === 'not_contacted' && filterEmployment !== 'all') {
            setFilterEmployment('all');
        }
    }

    function handleSelectEmployment(next: EmploymentFilter) {
        setFilterEmployment(next);
        if (next === 'working') {
            setFilterCall('all');
        }
        if (next !== 'all' && filterStatus === 'not_contacted') {
            setFilterStatus('all');
        }
    }

    // Filtered graduates
    const filtered = useMemo(() => {
        let result = graduates;
        if (filterStatus !== 'all') {
            result = result.filter(g => g.tracking_status === filterStatus);
        }
        if (filterEmployment === 'working') {
            result = result.filter(isWorkingOutcome);
        } else if (filterEmployment === 'not_working') {
            result = result.filter(isNotWorkingOutcome);
        }
        if (effectiveCourse !== 'all') {
            result = result.filter(g => g.courses.includes(effectiveCourse));
        }
        if (callsApplicable && filterCall !== 'all') {
            // Responded people are left out: there is no one to call back
            result = result.filter(g => g.tracking_status !== 'responded' && !!g.called_no_answer_at === (filterCall === 'called'));
        }
        if (debouncedSearchQuery.trim()) {
            result = result.filter(g => matchesOutcomeSearch({
                firstName: g.first_name,
                lastName: g.last_name,
                email: g.email,
                phone: g.phone,
                fieldOfWork: g.field_of_work,
                extra: g.courses,
            }, debouncedSearchQuery));
        }
        return sortOutcomeRows(result, sort, g => ({
            ...g,
            sent_at: g.last_sent_at,
            updated_at: g.status_updated_at,
        }));
    }, [graduates, filterStatus, filterEmployment, effectiveCourse, callsApplicable, filterCall, debouncedSearchQuery, sort]);

    const orderedIds = useMemo(() => filtered.map(g => g.student_id), [filtered]);

    // Rows render in steps as the table is scrolled (a full list is hundreds of rows)
    const { visible: visibleGraduates, hasMore, sentinelRef } = useProgressiveList(
        filtered,
        `${filterStatus}|${filterEmployment}|${effectiveCourse}|${callsApplicable ? filterCall : 'all'}|${debouncedSearchQuery}|${sort.key}|${sort.dir}`,
    );

    // KPIs and pill counts
    const stats = useMemo(() => computeOutcomeStats(graduates), [graduates]);

    const statusCounts = useMemo(() => ({
        all: stats.total,
        not_contacted: stats.notContacted,
        pending: stats.pending,
        responded: stats.responded,
    }), [stats]);

    const callCounts = useMemo(() => {
        const counts = { all: 0, called: 0, not_called: 0 };
        graduates.forEach(g => {
            if (g.tracking_status === 'responded') return;
            counts.all++;
            counts[g.called_no_answer_at ? 'called' : 'not_called']++;
        });
        return counts;
    }, [graduates]);

    const hasActiveFilters = filterStatus !== 'all'
        || filterEmployment !== 'all'
        || effectiveCourse !== 'all'
        || (callsApplicable && filterCall !== 'all')
        || searchQuery.trim() !== '';

    function clearAllFilters() {
        setFilterStatus('all');
        setFilterEmployment('all');
        setFilterCourse('all');
        setFilterCall('all');
        setSearchQuery('');
    }

    /** Sets or clears "called, no answer"; the list shows it at once and goes back if saving fails. */
    async function toggleCallMark(grad: GraduateRow) {
        const calledAt = grad.called_no_answer_at ? null : new Date().toISOString();
        const patch = (value: string | null) => queryClient.setQueryData<GraduateRow[]>(['outcomes_graduates'], old =>
            old?.map(g => g.student_id === grad.student_id ? { ...g, called_no_answer_at: value } : g));
        setCallBusy(prev => new Set(prev).add(grad.student_id));
        patch(calledAt);
        try {
            await setGraduateCallMark(grad, calledAt);
        } catch (err) {
            console.error(err);
            patch(grad.called_no_answer_at);
            showToast(callMarkErrorMessage(err as { code?: string; message?: string }), 'error');
        } finally {
            setCallBusy(prev => { const next = new Set(prev); next.delete(grad.student_id); return next; });
        }
    }

    function toggleSelect(id: string, shiftKey = false) {
        const anchor = lastClickedIdRef.current;
        lastClickedIdRef.current = id;
        setSelectedIds(prev => toggleOutcomeSelection(prev, id, orderedIds, anchor, shiftKey));
    }

    function deselectOne(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }

    function selectAll() {
        const allSelected = filtered.length > 0 && filtered.every(g => selectedIds.has(g.student_id));
        lastClickedIdRef.current = null;
        setSelectedIds(prev => {
            const next = new Set(prev);
            filtered.forEach(g => {
                if (allSelected) next.delete(g.student_id);
                else next.add(g.student_id);
            });
            return next;
        });
    }

    const selectedGraduates = useMemo(
        () => graduates.filter(g => selectedIds.has(g.student_id)),
        [graduates, selectedIds],
    );
    const selectedBulkItems = useMemo(
        () => selectedGraduates.map(g => ({
            id: g.student_id,
            name: `${g.first_name} ${g.last_name}`.trim() || g.email,
            subtitle: g.email || undefined,
        })),
        [selectedGraduates],
    );

    async function handleCopyEmails() {
        if (selectedGraduates.length === 0) return;
        try {
            const optedOut = await fetchOptedOutEmails(selectedGraduates.map(g => g.email));
            const { allowed, skippedOptedOut, skippedNoEmail } = partitionForSurvey(
                selectedGraduates,
                g => g,
                optedOut,
                { skipWorking: false },
            );
            if (allowed.length === 0) {
                showToast(
                    formatAllSkippedMessage({
                        optedOut: skippedOptedOut.length,
                        noEmail: skippedNoEmail.length,
                    }, 'copied'),
                    'error',
                );
                return;
            }
            const note = formatSkippedSummary({
                optedOut: skippedOptedOut.length,
                noEmail: skippedNoEmail.length,
            });
            await copyEligibleEmails(allowed.map(g => g.email), showToast, note);
        } catch (err) {
            console.error(err);
            showToast('Could not copy the emails', 'error');
        }
    }

    async function moveSelectedToPending(openMailto: boolean) {
        if (selectedGraduates.length === 0) return;
        setBusyMode(openMailto ? 'sending' : 'marking');

        try {
            // Working, unsubscribed, and email-less graduates are skipped automatically
            const optedOut = await fetchOptedOutEmails(selectedGraduates.map(g => g.email));
            const { allowed, skippedWorking, skippedOptedOut, skippedNoEmail } = partitionForSurvey(
                selectedGraduates,
                g => g,
                optedOut,
                { skipWorking: true },
            );

            const skippedCounts = {
                working: skippedWorking.length,
                optedOut: skippedOptedOut.length,
                noEmail: skippedNoEmail.length,
            };

            if (allowed.length === 0) {
                showToast(formatAllSkippedMessage(skippedCounts, openMailto ? 'sent' : 'updated'), 'error');
                return;
            }

            const snapshots = snapshotGraduatesForPending(allowed);
            const ids = allowed.map(g => g.student_id);

            const { error: rpcError } = await supabase.rpc('mark_students_outcomes_pending', {
                p_student_ids: ids,
            });
            if (rpcError) throw rpcError;

            const undoAction = {
                label: 'Undo',
                onClick: () => {
                    void (async () => {
                        try {
                            await restoreGraduatesFromPending(snapshots);
                            await fetchGraduates();
                            queryClient.invalidateQueries({ queryKey: ['analytics_employment_statuses_v1'] });
                            showToast('Pending status undone', 'info');
                        } catch (undoErr) {
                            console.error(undoErr);
                            showToast('Could not undo pending status.', 'error');
                        }
                    })();
                },
            };

            const skippedText = formatSkippedSummary(skippedCounts);

            if (openMailto) {
                await copySurveyAndOpenMailto({
                    html: buildStatusEmailBodyHtml(`${window.location.origin}/status`),
                    subject: buildStatusEmailSubject(),
                    emails: allowed.map(g => g.email),
                    noun: 'graduate',
                    skippedNoteText: skippedText,
                    showToast,
                    toastOptions: { action: undoAction, duration: OUTCOME_UNDO_MS },
                });
            } else {
                showToast(
                    `Marked ${allowed.length} graduate(s) as pending.${skippedText}`,
                    'success',
                    { action: undoAction, duration: OUTCOME_UNDO_MS },
                );
            }

            await fetchGraduates();
            queryClient.invalidateQueries({ queryKey: ['analytics_employment_statuses_v1'] });
            setSelectedIds(new Set());
        } catch (err) {
            console.error(err);
            showToast(
                openMailto ? 'Failed to send status requests.' : 'Failed to mark graduates as pending.',
                'error',
            );
        } finally {
            setBusyMode(null);
        }
    }

    async function saveGraduateOutcome(grad: GraduateRow, values: OutcomeValues) {
        if (values.tracking_status === 'not_contacted') {
            if (grad.called_no_answer_at) {
                // Keep the row so the "called, no answer" timestamp is preserved
                const { error: updErr } = await supabase
                    .from('employment_status')
                    .update({
                        status: 'not_contacted',
                        is_working: null,
                        started_month: null,
                        field_of_work: null,
                        employment_type: null,
                        last_invited_at: null,
                        last_responded_at: null,
                    })
                    .eq('student_id', grad.student_id);
                if (updErr) throw updErr;
                return;
            }
            // Remove the employment_status record completely
            const { error: delErr } = await supabase
                .from('employment_status')
                .delete()
                .eq('student_id', grad.student_id);
            if (delErr) throw delErr;
            return;
        }

        const responded = values.tracking_status === 'responded';
        const { error: upsertErr } = await supabase
            .from('employment_status')
            .upsert({
                student_id: grad.student_id,
                email: grad.email,
                status: responded ? 'responded' : 'pending',
                is_working: values.is_working,
                started_month: values.started_month,
                field_of_work: values.field_of_work,
                employment_type: values.employment_type,
                // If marking as responded, record timestamp and clear any pending call mark
                ...(responded ? { last_responded_at: new Date().toISOString(), called_no_answer_at: null } : {}),
            }, { onConflict: 'student_id' });
        if (upsertErr) throw upsertErr;
    }

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={28} className="animate-spin text-brand-500" />
                    <p className="text-sm text-muted">Loading outcomes...</p>
                </div>
            </div>
        );
    }

    if (loadError && graduates.length === 0) {
        return <ErrorState title="Could not load the graduates" error={loadError} onRetry={() => fetchGraduates()} />;
    }

    return (
        <div className={`space-y-4 ${selectedIds.size > 0 ? 'pb-24' : 'pb-8'}`}>
            {/* Clickable KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatTile
                    label="Total graduates"
                    icon={GraduationCap}
                    tone="brand"
                    value={stats.total}
                    hint={stats.notContacted > 0 ? `${stats.notContacted} not contacted` : 'Everyone contacted'}
                    onClick={() => {
                        setFilterStatus('all');
                        setFilterEmployment('all');
                        setFilterCall('all');
                    }}
                />
                <StatTile
                    label="Response rate"
                    icon={MailCheck}
                    tone="completed"
                    value={stats.responseRate !== null ? `${stats.responseRate}%` : '—'}
                    hint={stats.asked > 0 ? `${stats.answered} of ${stats.asked} contacted` : 'No surveys sent yet'}
                    onClick={() => {
                        setFilterStatus('responded');
                        setFilterEmployment('all');
                        setFilterCall('all');
                    }}
                />
                <StatTile
                    label="Currently working"
                    icon={Briefcase}
                    tone="success"
                    value={stats.working}
                    hint={stats.employmentRate !== null ? `${stats.employmentRate}% of answered` : 'No answers yet'}
                    onClick={() => {
                        setFilterStatus('all');
                        setFilterEmployment('working');
                        setFilterCall('all');
                    }}
                />
                <StatTile
                    label="Pending responses"
                    icon={Clock}
                    tone="warning"
                    value={stats.pending}
                    hint={
                        stats.resentNotWorking > 0
                            ? `incl. ${stats.resentNotWorking} follow-up${stats.resentNotWorking === 1 ? '' : 's'}`
                            : stats.notContacted > 0
                                ? `${stats.notContacted} not contacted`
                                : undefined
                    }
                    onClick={() => {
                        setFilterStatus('pending');
                        setFilterEmployment('all');
                    }}
                />
            </div>

            {/* Always-visible Toolbar */}
            <div className="bg-surface rounded-2xl border border-border-subtle shadow-card p-3 sm:p-3.5 space-y-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <SearchInput
                        wrapperClassName="flex-1 min-w-[200px]"
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Name, email, phone, course or field…"
                        aria-label="Search graduates"
                    />

                    {uniqueCourses.length > 1 && (
                        <select
                            aria-label="Filter by course"
                            value={effectiveCourse}
                            onChange={e => setFilterCourse(e.target.value)}
                            className="text-xs sm:text-sm bg-background border border-border-strong rounded-xl px-2.5 py-2 text-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 max-w-[200px]"
                        >
                            <option value="all">All courses</option>
                            {uniqueCourses.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    )}

                    <span className="text-xs text-muted font-medium whitespace-nowrap">
                        {filtered.length} of {graduates.length} graduate{graduates.length !== 1 ? 's' : ''}
                    </span>

                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={clearAllFilters}
                            className="text-xs font-medium text-muted hover:text-primary flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-surface-elevated transition-colors"
                        >
                            <X size={12} /> Clear
                        </button>
                    )}
                </div>

                {/* Compact always-visible filter pills */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2.5 border-t border-border-subtle">
                    {/* Status Filter */}
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
                        <span className="text-xs font-medium text-muted mr-0.5">Status:</span>
                        {(['all', 'not_contacted', 'pending', 'responded'] as const).map(s => (
                            <button
                                key={s}
                                type="button"
                                aria-pressed={filterStatus === s}
                                onClick={() => handleSelectStatus(s)}
                                className={pillBtnCls(filterStatus === s)}
                            >
                                {s === 'all' ? 'All' : s === 'not_contacted' ? 'Not Contacted' : s === 'pending' ? 'Pending' : 'Responded'}
                                {' '}({statusCounts[s]})
                            </button>
                        ))}
                    </div>

                    {/* Employment Filter */}
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by employment">
                        <span className="text-xs font-medium text-muted mr-0.5">Employment:</span>
                        {EMPLOYMENT_FILTERS.map(({ value, label }) => {
                            const count = value === 'working' ? stats.working : value === 'not_working' ? stats.notWorking : null;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={filterEmployment === value}
                                    onClick={() => handleSelectEmployment(value)}
                                    className={pillBtnCls(filterEmployment === value)}
                                >
                                    {label}{count !== null ? ` (${count})` : ''}
                                </button>
                            );
                        })}
                    </div>

                    {/* Calls Filter (hidden when Responded or Working is active) */}
                    {callsApplicable && callCounts.all > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by calls">
                            <span className="text-xs font-medium text-muted mr-0.5">Calls:</span>
                            {CALL_FILTERS.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={filterCall === value}
                                    onClick={() => setFilterCall(value)}
                                    className={pillBtnCls(filterCall === value)}
                                >
                                    {label}{value !== 'all' ? ` (${callCounts[value]})` : ''}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface rounded-2xl border border-border-subtle shadow-card overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center mx-auto mb-4">
                            <Briefcase size={28} className="text-muted" />
                        </div>
                        <p className="text-lg font-semibold text-primary">No graduates found</p>
                        <p className="text-sm text-muted mt-1">Try adjusting your filters or wait for students to complete courses</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border-subtle bg-surface-elevated/50">
                                    <th className="py-3 px-4 text-left w-10">
                                        <input
                                            type="checkbox"
                                            checked={filtered.length > 0 && filtered.every(g => selectedIds.has(g.student_id))}
                                            onChange={selectAll}
                                            aria-label="Select all shown graduates"
                                            className="rounded-sm border-border-strong text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                                        />
                                    </th>
                                    <SortHeader label="Student" column="name" sort={sort} onSort={setSort} />
                                    <SortHeader label="Courses" column="courses" sort={sort} onSort={setSort} className="hidden md:table-cell" />
                                    <SortHeader label="Tracking" column="tracking" sort={sort} onSort={setSort} className="hidden sm:table-cell" />
                                    <SortHeader label="Employment" column="employment" sort={sort} onSort={setSort} className="hidden sm:table-cell" />
                                    <SortHeader label="Updated" column="updated" sort={sort} onSort={setSort} className="hidden lg:table-cell" />
                                    <th className="py-3 px-4 text-right text-xs font-semibold text-muted uppercase tracking-wider"><span className="sr-only sm:not-sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleGraduates.map(grad => {
                                    const isSelected = selectedIds.has(grad.student_id);
                                    const isOptedOut = optedOutSet.has(normalizeEmail(grad.email));
                                    const fullDisplayName = `${grad.first_name} ${grad.last_name}`.trim();
                                    return (
                                        <tr
                                            key={grad.student_id}
                                            onClick={e => toggleSelect(grad.student_id, e.shiftKey)}
                                            className={`border-b border-border-subtle/50 transition-colors cursor-pointer ${
                                                isSelected
                                                    ? 'bg-brand-500/5'
                                                    : 'hover:bg-surface-elevated/50'
                                            }`}
                                        >
                                            <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        toggleSelect(grad.student_id, e.shiftKey);
                                                    }}
                                                    aria-label={`Select ${grad.first_name} ${grad.last_name}`}
                                                    className="rounded-sm border-border-strong text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 bg-linear-to-br ${getAvatarGradient(grad.student_id)} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                                        {(grad.first_name[0] || '').toUpperCase()}{(grad.last_name[0] || '').toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0 max-w-[calc(100vw-13rem)] sm:max-w-none">
                                                        {onOpenStudentDetail ? (
                                                            <button
                                                                type="button"
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    onOpenStudentDetail(grad.student_id);
                                                                }}
                                                                className="block font-semibold text-primary text-[13px] truncate max-w-full text-left hover:text-brand-500 hover:underline transition-colors cursor-pointer"
                                                                title="View student profile"
                                                            >
                                                                {fullDisplayName}
                                                            </button>
                                                        ) : (
                                                            <p className="font-semibold text-primary text-[13px] truncate">
                                                                {fullDisplayName}
                                                            </p>
                                                        )}
                                                        {grad.email?.trim() && (
                                                            <p className="text-xs text-muted truncate">{grad.email}</p>
                                                        )}
                                                        {(grad.phone?.trim() || !grad.email?.trim() || isOptedOut) && (
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                                                                <PhoneLink phone={grad.phone} />
                                                                <EmailStatusBadges email={grad.email} optedOut={isOptedOut} />
                                                            </div>
                                                        )}
                                                        {/* Phones: the status columns are hidden, so their badges go under the name */}
                                                        <div className="sm:hidden mt-1 flex flex-wrap items-center gap-1.5">
                                                            <TrackingBadge status={grad.tracking_status} />
                                                            {(grad.tracking_status === 'responded' || (grad.tracking_status === 'pending' && grad.is_working !== null)) && (
                                                                <EmploymentBadge status={grad.tracking_status} row={grad} />
                                                            )}
                                                            <CallMarkButton
                                                                status={grad.tracking_status}
                                                                calledAt={grad.called_no_answer_at}
                                                                busy={callBusy.has(grad.student_id)}
                                                                onToggle={() => toggleCallMark(grad)}
                                                                name={fullDisplayName}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 hidden md:table-cell">
                                                <div className="flex flex-wrap gap-1">
                                                    {grad.courses.map(c => (
                                                        <span key={c} className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300 truncate max-w-[120px]">
                                                            {c}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 hidden sm:table-cell">
                                                <TrackingBadge status={grad.tracking_status} />
                                                {grad.tracking_status === 'pending' && grad.last_sent_at && (
                                                    <p className="text-xs text-muted mt-0.5">Sent {formatDisplayDate(grad.last_sent_at)}</p>
                                                )}
                                                {grad.tracking_status !== 'responded' && (
                                                    <div className="mt-1">
                                                        <CallMarkButton
                                                            status={grad.tracking_status}
                                                            calledAt={grad.called_no_answer_at}
                                                            busy={callBusy.has(grad.student_id)}
                                                            onToggle={() => toggleCallMark(grad)}
                                                            name={fullDisplayName}
                                                        />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 hidden sm:table-cell">
                                                <EmploymentBadge status={grad.tracking_status} row={grad} />
                                                {grad.tracking_status === 'responded' && grad.is_working && grad.started_month && (
                                                    <p className="text-xs text-muted mt-0.5">
                                                        Since {formatLocalDate(new Date(`${grad.started_month}-01T12:00:00`), { month: 'short', year: 'numeric' }, 'en-GB')}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 hidden lg:table-cell">
                                                {grad.status_updated_at ? (
                                                    <span className="text-xs text-muted">{formatDisplayDate(grad.status_updated_at)}</span>
                                                ) : (
                                                    <span className="text-xs text-muted italic">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); setEditingGrad(grad); }}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-brand-500 bg-surface-elevated/60 hover:bg-surface-elevated border border-border-subtle rounded-lg transition-colors"
                                                    title="Edit Status"
                                                >
                                                    <Pencil size={12} /> <span className="hidden sm:inline">Status</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {hasMore && (
                                    <tr ref={sentinelRef} key={visibleGraduates.length} aria-hidden="true">
                                        <td colSpan={7} className="py-4 text-center text-xs text-muted">Loading more…</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <OutcomeBulkBar
                selectedItems={selectedBulkItems}
                busy={busyMode !== null}
                busyLabel={busyMode === 'marking' ? 'Marking…' : 'Moving…'}
                onCopyEmails={() => { void handleCopyEmails(); }}
                onMarkPending={() => { void moveSelectedToPending(false); }}
                onSendSurvey={() => { void moveSelectedToPending(true); }}
                onDeselect={deselectOne}
                onClear={() => setSelectedIds(new Set())}
            />

            {editMount.mounted && shownGrad && (
                <OutcomeEditModal
                    key={editMount.key}
                    isOpen={!!editingGrad}
                    person={shownGrad}
                    onSave={values => saveGraduateOutcome(shownGrad, values)}
                    onClose={() => setEditingGrad(null)}
                    onSaved={() => {
                        fetchGraduates();
                        queryClient.invalidateQueries({ queryKey: ['analytics_employment_statuses_v1'] });
                        queryClient.invalidateQueries({ queryKey: ['outcomes_graduates'] });
                        showToast('Student status has been updated.', 'success');
                    }}
                />
            )}
        </div>
    );
}

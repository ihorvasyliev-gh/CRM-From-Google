import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Briefcase, Mail, Loader2, X, Pencil, Upload, Download, Plus, Users, AlertCircle, MailCheck, Clock, Trash2, UserPlus } from 'lucide-react';
import StatTile from './ui/StatTile';
import { buildStatusEmailBodyHtml, buildStatusEmailSubject } from '../lib/emailTemplates';
import { fetchOptedOutEmails, listEmailOptOutsSafe, normalizeEmail } from '../lib/emailOptOut';
import { TrackingBadge, EmploymentBadge, CallMarkButton, PhoneLink, EmailStatusBadges } from './OutcomeBadges';
import OutcomeBulkBar, { type BulkSelectedItem } from './OutcomeBulkBar';
import { setContactCallMark, callMarkErrorMessage } from '../lib/callMark';
import { copyEligibleEmails, copySurveyAndOpenMailto } from '../lib/surveyEmail';
import { formatLocalDate, formatDisplayDate } from '../lib/dateUtils';
import { fullName, getAvatarGradient } from '../lib/types';
import { showToast } from '../lib/toast';
import OutcomeEditModal, { type OutcomeValues } from './OutcomeEditModal';
import { useDialogMount, useLastPresent } from '../hooks/usePresence';
import OutreachImportModal from './OutreachImportModal';
import OutreachAddContactModal from './OutreachAddContactModal';
import ConfirmDialog from './ConfirmDialog';
import { useDebounce } from '../hooks/useDebounce';
import SearchInput from './ui/SearchInput';
import { fetchOutreachContactsFn, fetchOutreachListsFn, type OutreachContact } from '../hooks/useOutreach';
import { exportOutreachListToExcel } from '../lib/outreachExport';
import { useProgressiveList } from '../hooks/useProgressiveList';
import { SortHeader } from './OutcomeTableSort';
import { sortOutcomeRows, type OutcomeSort } from '../lib/outcomeSort';
import {
    computeOutcomeStats,
    formatAllSkippedMessage,
    formatSkippedSummary,
    isNotWorkingOutcome,
    isWorkingOutcome,
    partitionForSurvey,
} from '../lib/employmentTypes';
import { matchesOutcomeSearch, toggleOutcomeSelection } from '../lib/outcomeSelection';
import {
    OUTCOME_UNDO_MS,
    restoreOutreachFromPending,
    snapshotOutreachForPending,
} from '../lib/outcomeUndo';

type StatusFilter = 'all' | OutreachContact['status'];
type EmploymentFilter = 'all' | 'working' | 'not_working';
/** "Called, no answer" mark (only people who haven't responded can carry it) */
type CallFilter = 'all' | 'called' | 'not_called';

const CALL_FILTERS: { value: CallFilter; label: string }[] = [
    { value: 'all', label: 'All calls' },
    { value: 'not_called', label: 'Not called yet' },
    { value: 'called', label: 'Called, no answer' },
];

const EMPLOYMENT_FILTERS: { value: EmploymentFilter; label: string }[] = [
    { value: 'all', label: 'All employment' },
    { value: 'working', label: 'Working' },
    { value: 'not_working', label: 'Not working' },
];

/** Up to this many lists are shown as tabs; more fall back to a dropdown. */
const MAX_LIST_TABS = 6;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'not_contacted', label: 'Not Contacted' },
    { value: 'pending', label: 'Pending' },
    { value: 'responded', label: 'Responded' },
];

export interface OutreachListsProps {
    onOpenStudentByEmail?: (email: string) => void;
}

/**
 * External outreach lists (e.g. Action 11 clients from IRIS): people who may not be
 * in the CRM get the same status survey as graduates, tracked separately.
 */
export default function OutreachLists({ onOpenStudentByEmail }: OutreachListsProps = {}) {
    const queryClient = useQueryClient();
    const { data: lists = [], isLoading: listsLoading, error: listsError, refetch: refetchLists } = useQuery({
        queryKey: ['outreach_lists'],
        queryFn: fetchOutreachListsFn,
    });

    const [listId, setListId] = useState<string | null>(null);
    const activeList = lists.find(l => l.id === listId) ?? null;

    // Default to "Action 11" (or the first list) once lists load
    useEffect(() => {
        if (lists.length > 0 && !lists.some(l => l.id === listId)) {
            setListId((lists.find(l => l.name === 'Action 11') ?? lists[0]).id);
        }
    }, [lists, listId]);

    const { data: contacts = [], isLoading: contactsLoading, refetch: refetchContacts } = useQuery({
        queryKey: ['outreach_contacts', listId],
        queryFn: () => fetchOutreachContactsFn(listId!),
        enabled: !!listId,
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
    const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
    const [filterEmployment, setFilterEmployment] = useState<EmploymentFilter>('all');
    const [filterCall, setFilterCall] = useState<CallFilter>('all');
    // null: newest added first, as loaded
    const [sort, setSort] = useState<OutcomeSort | null>(null);
    const [callBusy, setCallBusy] = useState<Set<string>>(new Set());
    const [bulkAction, setBulkAction] = useState<'sending' | 'marking' | null>(null);
    const [exporting, setExporting] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [showAddContact, setShowAddContact] = useState(false);
    const [confirmDeleteList, setConfirmDeleteList] = useState(false);
    const [editing, setEditing] = useState<OutreachContact | null>(null);
    const [newListName, setNewListName] = useState<string | null>(null);

    const callsFilterApplicable = filterStatus !== 'responded' && filterEmployment !== 'working';

    // Auto-clear call filter when viewing only responded or working contacts
    useEffect(() => {
        if (!callsFilterApplicable && filterCall !== 'all') {
            setFilterCall('all');
        }
    }, [callsFilterApplicable, filterCall]);

    // Selection and filters belong to one list
    useEffect(() => {
        setSelectedIds(new Set());
        lastClickedIdRef.current = null;
        setFilterStatus('all');
        setFilterEmployment('all');
        setFilterCall('all');
        setSearchQuery('');
    }, [listId]);

    function handleSelectStatus(next: StatusFilter) {
        setFilterStatus(next);
        if (next === 'responded') setFilterCall('all');
        if (next === 'not_contacted' && filterEmployment !== 'all') setFilterEmployment('all');
    }

    function handleSelectEmployment(next: EmploymentFilter) {
        setFilterEmployment(next);
        if (next === 'working') setFilterCall('all');
        if (next !== 'all' && filterStatus === 'not_contacted') setFilterStatus('all');
    }

    // Stable object so the edit modal doesn't reset its form on every re-render
    const editingPerson = useMemo(() => editing ? { ...editing, tracking_status: editing.status } : null, [editing]);
    // Dialogs are kept while they animate out, and start fresh on every opening
    const editMount = useDialogMount(!!editing);
    const shownEditing = useLastPresent(editing);
    const shownPerson = useLastPresent(editingPerson);
    const importMount = useDialogMount(showImport && !!activeList);
    const shownList = useLastPresent(activeList);
    const addContactMount = useDialogMount(showAddContact && !!activeList);

    const existingEmails = useMemo(
        () => new Set(contacts.map(c => normalizeEmail(c.email)).filter(Boolean)),
        [contacts],
    );

    const filtered = useMemo(() => {
        let result = contacts;
        if (filterStatus !== 'all') result = result.filter(c => c.status === filterStatus);
        if (filterEmployment === 'working') {
            result = result.filter(c => isWorkingOutcome({ tracking_status: c.status, is_working: c.is_working }));
        } else if (filterEmployment === 'not_working') {
            result = result.filter(c => isNotWorkingOutcome({ tracking_status: c.status, is_working: c.is_working }));
        }
        // Responded people are left out: there is no one to call back
        if (callsFilterApplicable && filterCall !== 'all') {
            result = result.filter(c => c.status !== 'responded' && !!c.called_no_answer_at === (filterCall === 'called'));
        }
        if (debouncedSearchQuery.trim()) {
            result = result.filter(c => matchesOutcomeSearch({
                firstName: c.first_name,
                lastName: c.last_name,
                email: c.email,
                phone: c.phone,
                fieldOfWork: c.field_of_work,
                extra: [c.external_ref],
            }, debouncedSearchQuery));
        }
        if (!sort) return result;
        return sortOutcomeRows(result, sort, c => ({
            ...c,
            ref: c.external_ref,
            tracking_status: c.status,
            sent_at: c.last_invited_at,
            updated_at: c.last_responded_at,
        }));
    }, [contacts, filterStatus, filterEmployment, callsFilterApplicable, filterCall, debouncedSearchQuery, sort]);

    const orderedIds = useMemo(() => filtered.map(c => c.id), [filtered]);

    // Rows render in steps as the table is scrolled (imported lists can be hundreds of contacts)
    const { visible: visibleContacts, hasMore, sentinelRef } = useProgressiveList(
        filtered,
        `${listId}|${filterStatus}|${filterEmployment}|${filterCall}|${debouncedSearchQuery}|${sort?.key}|${sort?.dir}`,
    );

    const stats = useMemo(
        () => computeOutcomeStats(contacts.map(c => ({ tracking_status: c.status, is_working: c.is_working }))),
        [contacts],
    );

    const statusCounts: Record<StatusFilter, number> = {
        all: stats.total,
        not_contacted: stats.notContacted,
        pending: stats.pending,
        responded: stats.responded,
    };

    const employmentCounts: Record<EmploymentFilter, number> = {
        all: stats.total,
        working: stats.working,
        not_working: stats.notWorking,
    };

    const callCounts = useMemo(() => {
        const counts = { all: 0, called: 0, not_called: 0 };
        contacts.forEach(c => {
            if (c.status === 'responded') return;
            counts.all++;
            counts[c.called_no_answer_at ? 'called' : 'not_called']++;
        });
        return counts;
    }, [contacts]);

    const selectedBulkItems = useMemo<BulkSelectedItem[]>(
        () => contacts
            .filter(c => selectedIds.has(c.id))
            .map(c => ({
                id: c.id,
                name: fullName(c) || c.email || '—',
                subtitle: fullName(c) ? (c.email || undefined) : undefined,
            })),
        [contacts, selectedIds],
    );

    /** Sets or clears "called, no answer"; the list shows it at once and goes back if saving fails. */
    async function toggleCallMark(contact: OutreachContact) {
        const calledAt = contact.called_no_answer_at ? null : new Date().toISOString();
        const patch = (value: string | null | undefined) => queryClient.setQueryData<OutreachContact[]>(['outreach_contacts', contact.list_id], old =>
            old?.map(c => c.id === contact.id ? { ...c, called_no_answer_at: value } : c));
        setCallBusy(prev => new Set(prev).add(contact.id));
        patch(calledAt);
        try {
            await setContactCallMark(contact.id, calledAt);
        } catch (err) {
            console.error(err);
            patch(contact.called_no_answer_at);
            showToast(callMarkErrorMessage(err as { code?: string; message?: string }), 'error');
        } finally {
            setCallBusy(prev => { const next = new Set(prev); next.delete(contact.id); return next; });
        }
    }

    function toggleSelect(id: string, shiftKey = false) {
        const anchor = lastClickedIdRef.current;
        lastClickedIdRef.current = id;
        setSelectedIds(prev => toggleOutcomeSelection(prev, id, orderedIds, anchor, shiftKey));
    }

    function selectAll() {
        const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            filtered.forEach(c => {
                if (allSelected) next.delete(c.id);
                else next.add(c.id);
            });
            return next;
        });
    }

    async function handleCreateList() {
        const name = (newListName || '').trim();
        if (!name) return;
        const { data, error } = await supabase.from('outreach_lists').insert({ name }).select('id').single();
        if (error) {
            showToast(error.code === '23505' ? 'A list with this name already exists' : 'Could not create the list', 'error');
            return;
        }
        setNewListName(null);
        await refetchLists();
        setListId(data.id);
        showToast(`List "${name}" created`, 'success');
    }

    async function handleDeleteList() {
        if (!activeList) return;
        const { name, id } = activeList;
        const { error } = await supabase.from('outreach_lists').delete().eq('id', id);
        if (error) {
            showToast('Could not delete the list', 'error');
            return;
        }
        setConfirmDeleteList(false);
        setListId(null);
        queryClient.removeQueries({ queryKey: ['outreach_contacts', id] });
        await refetchLists();
        showToast(`List "${name}" deleted`, 'success');
    }

    async function handleCopyEmails() {
        if (selectedIds.size === 0) return;
        const selectedAll = contacts.filter(c => selectedIds.has(c.id));
        try {
            const optedOut = await fetchOptedOutEmails(selectedAll.map(c => c.email));
            const { allowed, skippedOptedOut, skippedNoEmail } = partitionForSurvey(
                selectedAll,
                c => ({ email: c.email, tracking_status: c.status, is_working: c.is_working }),
                optedOut,
                { skipWorking: false },
            );
            const skippedCounts = {
                optedOut: skippedOptedOut.length,
                noEmail: skippedNoEmail.length,
            };
            if (allowed.length === 0) {
                showToast(formatAllSkippedMessage(skippedCounts, 'copied'), 'error');
                return;
            }
            await copyEligibleEmails(allowed.map(c => c.email), showToast, formatSkippedSummary(skippedCounts));
        } catch (err) {
            console.error(err);
            showToast('Could not copy the emails', 'error');
        }
    }

    async function moveSelectedToPending(openEmail: boolean) {
        if (selectedIds.size === 0 || !listId) return;
        setBulkAction(openEmail ? 'sending' : 'marking');
        const selectedAll = contacts.filter(c => selectedIds.has(c.id));

        try {
            // Skip people already working, unsubscribed, or missing an email address
            const optedOut = await fetchOptedOutEmails(selectedAll.map(c => c.email));
            const { allowed, skippedWorking, skippedOptedOut, skippedNoEmail } = partitionForSurvey(
                selectedAll,
                c => ({ email: c.email, tracking_status: c.status, is_working: c.is_working }),
                optedOut,
                { skipWorking: true },
            );
            const skippedCounts = {
                working: skippedWorking.length,
                optedOut: skippedOptedOut.length,
                noEmail: skippedNoEmail.length,
            };
            if (allowed.length === 0) {
                showToast(formatAllSkippedMessage(skippedCounts, openEmail ? 'sent' : 'updated'), 'error');
                return;
            }

            const snapshots = snapshotOutreachForPending(allowed);
            const { error: rpcError } = await supabase.rpc('mark_outreach_contacts_pending', {
                p_ids: allowed.map(c => c.id),
            });
            if (rpcError) throw rpcError;

            const undoAction = {
                label: 'Undo',
                onClick: () => {
                    void (async () => {
                        try {
                            await restoreOutreachFromPending(snapshots);
                            await refetchContacts();
                            showToast('Pending status undone', 'success');
                        } catch (undoErr) {
                            console.error(undoErr);
                            showToast('Could not undo pending status.', 'error');
                        }
                    })();
                },
            };
            const skippedText = formatSkippedSummary(skippedCounts);
            const toastOptions = { action: undoAction, duration: OUTCOME_UNDO_MS };

            if (openEmail) {
                await copySurveyAndOpenMailto({
                    // The link carries the list, so answers are saved to this list only
                    html: buildStatusEmailBodyHtml(`${window.location.origin}/status?list=${listId}`, undefined, 'outreach'),
                    subject: buildStatusEmailSubject(undefined, 'outreach'),
                    emails: allowed.map(c => c.email),
                    noun: 'contact',
                    skippedNoteText: skippedText,
                    showToast,
                    toastOptions,
                });
            } else {
                showToast(
                    `Marked ${allowed.length} contact(s) as pending${skippedText}`,
                    'success',
                    toastOptions,
                );
            }

            await refetchContacts();
            setSelectedIds(new Set());
            lastClickedIdRef.current = null;
        } catch (err) {
            console.error(err);
            showToast(openEmail ? 'Failed to send status requests.' : 'Failed to mark contacts as pending.', 'error');
        } finally {
            setBulkAction(null);
        }
    }

    async function handleExport() {
        if (!activeList) return;
        setExporting(true);
        try {
            await exportOutreachListToExcel(activeList.name, filtered);
        } catch (err) {
            console.error(err);
            showToast('Export failed', 'error');
        } finally {
            setExporting(false);
        }
    }

    async function saveContactOutcome(contact: OutreachContact, values: OutcomeValues) {
        const { error } = await supabase
            .from('outreach_contacts')
            .update({
                status: values.tracking_status,
                is_working: values.is_working,
                started_month: values.started_month,
                field_of_work: values.field_of_work,
                employment_type: values.employment_type,
                ...(values.tracking_status === 'responded'
                    ? { last_responded_at: new Date().toISOString(), called_no_answer_at: null }
                    : {}),
                ...(values.tracking_status === 'not_contacted'
                    ? { last_invited_at: null, last_responded_at: null }
                    : {}),
            })
            .eq('id', contact.id);
        if (error) throw error;
    }

    async function deleteContact(contact: OutreachContact) {
        const { error } = await supabase.from('outreach_contacts').delete().eq('id', contact.id);
        if (error) throw error;
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(contact.id);
            return next;
        });
        await refetchContacts();
        showToast(`${contact.first_name || contact.email} removed from the list`, 'success');
    }

    if (listsLoading) {
        return (
            <div className="w-full flex items-center justify-center min-h-[40vh]">
                <Loader2 size={28} className="animate-spin text-brand-500" />
            </div>
        );
    }

    if (listsError) {
        return (
            <div className="bg-surface rounded-2xl border border-border-subtle p-6 flex items-start gap-3 text-sm">
                <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold text-primary">External lists are not available yet</p>
                    <p className="text-muted mt-1">Run <code>supabase/61_outreach_lists.sql</code> in the Supabase SQL editor, then reload this page.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-8">
            {/* List picker */}
            <div className="bg-surface rounded-2xl border border-border-subtle shadow-card p-3 sm:p-3.5 flex flex-wrap items-center gap-2 sm:gap-3">
                <Users size={16} className="text-brand-500" />
                {lists.length <= MAX_LIST_TABS ? (
                    <div role="tablist" aria-label="Contact list" className="flex flex-wrap items-center gap-1">
                        {lists.map(l => (
                            <button
                                key={l.id}
                                type="button"
                                role="tab"
                                aria-selected={l.id === listId}
                                onClick={() => setListId(l.id)}
                                className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                                    l.id === listId
                                        ? 'bg-brand-500 text-white shadow-xs'
                                        : 'text-muted hover:text-primary bg-surface-elevated border border-border-subtle'
                                }`}
                            >
                                {l.name}
                            </button>
                        ))}
                    </div>
                ) : (
                    <select
                        value={listId ?? ''}
                        onChange={e => setListId(e.target.value)}
                        aria-label="Contact list"
                        className="text-sm font-semibold bg-background border border-border-strong rounded-lg px-2.5 py-1.5 text-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
                    >
                        {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                )}

                {newListName === null ? (
                    <button
                        onClick={() => setNewListName('')}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-primary bg-surface-elevated border border-border-subtle rounded-lg transition-all"
                    >
                        <Plus size={12} /> New list
                    </button>
                ) : (
                    <form
                        onSubmit={e => { e.preventDefault(); handleCreateList(); }}
                        className="flex items-center gap-1.5"
                    >
                        <input
                            autoFocus
                            value={newListName}
                            onChange={e => setNewListName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setNewListName(null); } }}
                            placeholder="List name"
                            aria-label="New list name"
                            className="text-sm bg-background border border-border-strong rounded-lg px-2.5 py-1.5 text-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 w-40"
                        />
                        <button type="submit" disabled={!newListName.trim()} className="px-2.5 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 rounded-lg disabled:opacity-50">Create</button>
                        <button type="button" onClick={() => setNewListName(null)} className="p-1.5 text-muted hover:text-primary"><X size={14} /></button>
                    </form>
                )}

                {activeList && newListName === null && (
                    <button
                        onClick={() => setConfirmDeleteList(true)}
                        title={`Delete the list "${activeList.name}"`}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-red-500 bg-surface-elevated border border-border-subtle hover:border-red-500/30 rounded-lg transition-all"
                    >
                        <Trash2 size={12} /> Delete list
                    </button>
                )}

                <div className="flex items-center gap-2 ml-auto">
                    <button
                        onClick={handleExport}
                        disabled={exporting || filtered.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted hover:text-primary bg-surface-elevated border border-border-subtle rounded-lg transition-all disabled:opacity-50"
                    >
                        {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Export Excel
                    </button>
                    <button
                        onClick={() => setShowAddContact(true)}
                        disabled={!activeList}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted hover:text-primary bg-surface-elevated border border-border-subtle rounded-lg transition-all disabled:opacity-50"
                    >
                        <UserPlus size={12} /> Add person
                    </button>
                    <button
                        onClick={() => setShowImport(true)}
                        disabled={!activeList}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-all shadow-xs disabled:opacity-50"
                    >
                        <Upload size={12} /> Import from IRIS (Excel/CSV)
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatTile
                    label="Contacts"
                    icon={Users}
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

            {/* Toolbar */}
            <div className="bg-surface rounded-2xl border border-border-subtle shadow-card p-3 sm:p-3.5 space-y-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <SearchInput
                        wrapperClassName="flex-1 min-w-[200px]"
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Name, email, phone, IRIS ID, field…"
                        aria-label="Search contacts"
                    />
                    <span className="text-xs text-muted font-medium">
                        {filtered.length} of {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
                    </span>
                </div>
                {contacts.length > 0 && selectedIds.size === 0 && (
                    <p className="text-xs text-muted flex items-center gap-1.5">
                        <Mail size={12} className="shrink-0" />
                        Tick people in the list to email them the survey (Shift+click for a range). Click “Status” on a row to change it by hand.
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="flex flex-wrap gap-1" role="group" aria-label="Status filter">
                        {STATUS_FILTERS.map(({ value, label }) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={filterStatus === value}
                                onClick={() => handleSelectStatus(value)}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
                                    filterStatus === value
                                        ? 'bg-brand-500 text-white shadow-xs'
                                        : 'bg-surface-elevated text-muted hover:text-primary border border-border-subtle'
                                }`}
                            >
                                {label} ({statusCounts[value]})
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1" role="group" aria-label="Employment filter">
                        {EMPLOYMENT_FILTERS.map(({ value, label }) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={filterEmployment === value}
                                onClick={() => handleSelectEmployment(value)}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
                                    filterEmployment === value
                                        ? 'bg-brand-500 text-white shadow-xs'
                                        : 'bg-surface-elevated text-muted hover:text-primary border border-border-subtle'
                                }`}
                            >
                                {label}{value !== 'all' && ` (${employmentCounts[value]})`}
                            </button>
                        ))}
                    </div>
                    {(filterStatus !== 'all' || filterEmployment !== 'all' || filterCall !== 'all') && (
                        <button
                            type="button"
                            onClick={() => {
                                setFilterStatus('all');
                                setFilterEmployment('all');
                                setFilterCall('all');
                            }}
                            className="text-xs text-muted hover:text-primary flex items-center gap-1 transition-colors"
                        >
                            <X size={12} /> Clear filters
                        </button>
                    )}
                </div>
                {callsFilterApplicable && callCounts.all > 0 && (
                    <div className="flex flex-wrap gap-1" role="group" aria-label="Calls filter">
                        {CALL_FILTERS.map(({ value, label }) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={filterCall === value}
                                onClick={() => setFilterCall(value)}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
                                    filterCall === value
                                        ? 'bg-brand-500 text-white shadow-xs'
                                        : 'bg-surface-elevated text-muted hover:text-primary border border-border-subtle'
                                }`}
                            >
                                {label}{value !== 'all' && ` (${callCounts[value]})`}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-surface rounded-2xl border border-border-subtle shadow-card overflow-hidden">
                {contactsLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-brand-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 px-4">
                        <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center mx-auto mb-4">
                            <Users size={28} className="text-muted" />
                        </div>
                        <p className="text-lg font-semibold text-primary">{contacts.length === 0 ? 'This list is empty' : 'No contacts found'}</p>
                        <p className="text-sm text-muted mt-1">
                            {contacts.length === 0 ? 'Export the clients from IRIS to Excel and import the file, or add people one by one.' : 'Try adjusting your search or filter'}
                        </p>
                        {contacts.length === 0 && activeList && (
                            <div className="flex flex-wrap justify-center gap-2 mt-5">
                                <button
                                    onClick={() => setShowImport(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-500 rounded-xl transition-all shadow-xs"
                                >
                                    <Upload size={14} /> Import Excel / CSV
                                </button>
                                <button
                                    onClick={() => setShowAddContact(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary bg-surface-elevated border border-border-subtle hover:border-border-strong rounded-xl transition-all"
                                >
                                    <UserPlus size={14} /> Add person
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border-subtle bg-surface-elevated/50">
                                    <th className="py-3 px-4 text-left w-10">
                                        <input
                                            type="checkbox"
                                            checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))}
                                            onChange={selectAll}
                                            aria-label="Select all"
                                            className="rounded-sm border-border-strong text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                                        />
                                    </th>
                                    <SortHeader label="Contact" column="name" sort={sort} onSort={setSort} />
                                    <SortHeader label="IRIS ID" column="ref" sort={sort} onSort={setSort} className="hidden md:table-cell" />
                                    <SortHeader label="Tracking" column="tracking" sort={sort} onSort={setSort} className="hidden sm:table-cell" />
                                    <SortHeader label="Employment" column="employment" sort={sort} onSort={setSort} className="hidden sm:table-cell" />
                                    <SortHeader label="Updated" column="updated" sort={sort} onSort={setSort} className="hidden lg:table-cell" />
                                    <th className="py-3 px-4 text-right text-xs font-semibold text-muted uppercase tracking-wider"><span className="sr-only sm:not-sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleContacts.map(contact => {
                                    const isSelected = selectedIds.has(contact.id);
                                    const isOptedOut = optedOutSet.has(normalizeEmail(contact.email));
                                    const initials = `${contact.first_name?.[0] || contact.email?.[0] || ''}${contact.last_name?.[0] || ''}`.toUpperCase();
                                    return (
                                        <tr
                                            key={contact.id}
                                            onClick={e => {
                                                if (e.shiftKey) window.getSelection()?.removeAllRanges();
                                                toggleSelect(contact.id, e.shiftKey);
                                            }}
                                            className={`border-b border-border-subtle/50 transition-colors cursor-pointer ${
                                                isSelected ? 'bg-brand-500/5' : 'hover:bg-surface-elevated/50'
                                            }`}
                                        >
                                            <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={e => toggleSelect(contact.id, Boolean((e.nativeEvent as MouseEvent).shiftKey))}
                                                    aria-label={`Select ${fullName(contact) || contact.email || 'contact'}`}
                                                    className="rounded-sm border-border-strong text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 bg-linear-to-br ${getAvatarGradient(contact.id)} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                                        {initials}
                                                    </div>
                                                    <div className="min-w-0 max-w-[calc(100vw-13rem)] sm:max-w-none">
                                                        <div className="font-semibold text-primary text-[13px] flex items-center gap-1.5 min-w-0">
                                                            <span className="truncate">{fullName(contact) || '—'}</span>
                                                            {contact.in_crm && (
                                                                onOpenStudentByEmail ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={e => {
                                                                            e.stopPropagation();
                                                                            onOpenStudentByEmail(contact.email);
                                                                        }}
                                                                        title="Open student card in CRM"
                                                                        className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-completed/15 text-status-completed hover:bg-completed/25 hover:underline transition-colors cursor-pointer shrink-0"
                                                                    >
                                                                        In CRM
                                                                    </button>
                                                                ) : (
                                                                    <span
                                                                        title="The same email is also a student in the CRM"
                                                                        className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-completed/15 text-status-completed shrink-0"
                                                                    >
                                                                        In CRM
                                                                    </span>
                                                                )
                                                            )}
                                                        </div>
                                                        {contact.email && (
                                                            <p className="text-xs text-muted truncate">{contact.email}</p>
                                                        )}
                                                        {(contact.phone?.trim() || !contact.email?.trim() || isOptedOut) && (
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                                                                <PhoneLink phone={contact.phone} />
                                                                <EmailStatusBadges email={contact.email} optedOut={isOptedOut} />
                                                            </div>
                                                        )}
                                                        {/* Phones: the status columns are hidden, so their badges go under the name */}
                                                        <div className="sm:hidden mt-1 flex flex-wrap items-center gap-1.5">
                                                            <TrackingBadge status={contact.status} />
                                                            {(contact.status === 'responded' || contact.is_working !== null) && (
                                                                <EmploymentBadge status={contact.status} row={contact} />
                                                            )}
                                                            <CallMarkButton status={contact.status} calledAt={contact.called_no_answer_at} busy={callBusy.has(contact.id)} onToggle={() => toggleCallMark(contact)} name={fullName(contact) || contact.email} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 hidden md:table-cell">
                                                <span className="text-xs text-muted">{contact.external_ref || '—'}</span>
                                            </td>
                                            <td className="py-3 px-4 hidden sm:table-cell">
                                                <TrackingBadge status={contact.status} />
                                                {contact.status === 'pending' && contact.last_invited_at && (
                                                    <p className="text-xs text-muted mt-0.5">Sent {formatDisplayDate(contact.last_invited_at)}</p>
                                                )}
                                                {contact.status !== 'responded' && <div className="mt-1">
                                                    <CallMarkButton status={contact.status} calledAt={contact.called_no_answer_at} busy={callBusy.has(contact.id)} onToggle={() => toggleCallMark(contact)} name={fullName(contact) || contact.email} />
                                                </div>}
                                            </td>
                                            <td className="py-3 px-4 hidden sm:table-cell">
                                                <EmploymentBadge status={contact.status} row={contact} />
                                                {contact.status === 'responded' && contact.is_working && contact.started_month && (
                                                    <p className="text-xs text-muted mt-0.5">
                                                        Since {formatLocalDate(new Date(`${contact.started_month}-01T12:00:00`), { month: 'short', year: 'numeric' }, 'en-GB')}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 hidden lg:table-cell">
                                                <span className="text-xs text-muted">
                                                    {contact.last_responded_at ? formatDisplayDate(contact.last_responded_at) : '—'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    onClick={e => { e.stopPropagation(); setEditing(contact); }}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-brand-500 bg-surface-elevated/60 hover:bg-surface-elevated border border-border-subtle rounded-lg transition-colors"
                                                    title="Change status or remove from the list"
                                                >
                                                    <Pencil size={12} /> <span className="hidden sm:inline">Status</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {hasMore && (
                                    <tr ref={sentinelRef} key={visibleContacts.length} aria-hidden="true">
                                        <td colSpan={7} className="py-4 text-center text-xs text-muted">Loading more…</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Bulk Action Bar */}
            <OutcomeBulkBar
                selectedItems={selectedBulkItems}
                busy={bulkAction !== null}
                busyLabel={bulkAction === 'marking' ? 'Marking…' : bulkAction === 'sending' ? 'Moving…' : undefined}
                onCopyEmails={handleCopyEmails}
                onMarkPending={() => moveSelectedToPending(false)}
                onSendSurvey={() => moveSelectedToPending(true)}
                onDeselect={id => setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                })}
                onClear={() => {
                    setSelectedIds(new Set());
                    lastClickedIdRef.current = null;
                }}
            />

            {editMount.mounted && shownEditing && (
                <OutcomeEditModal
                    key={editMount.key}
                    isOpen={!!editing}
                    person={shownPerson ?? null}
                    onSave={values => saveContactOutcome(shownEditing, values)}
                    onDelete={() => deleteContact(shownEditing)}
                    deleteLabel="Remove from list"
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        refetchContacts();
                        showToast('Contact status has been updated.', 'success');
                    }}
                />
            )}

            {importMount.mounted && shownList && (
                <OutreachImportModal
                    key={importMount.key}
                    open={showImport && !!activeList}
                    listId={shownList.id}
                    listName={shownList.name}
                    existingEmails={existingEmails}
                    onClose={() => setShowImport(false)}
                    onImported={({ inserted, updated }) => {
                        refetchContacts();
                        showToast(`Added ${inserted} new, ${updated} already on the list`, 'success');
                    }}
                />
            )}

            {addContactMount.mounted && shownList && (
                <OutreachAddContactModal
                    key={addContactMount.key}
                    open={showAddContact && !!activeList}
                    listId={shownList.id}
                    listName={shownList.name}
                    existingEmails={existingEmails}
                    onClose={() => setShowAddContact(false)}
                    onAdded={({ name, alreadyOnList }) => {
                        refetchContacts();
                        showToast(alreadyOnList ? `${name} is already on the list — details updated` : `${name} added to the list`, 'success');
                    }}
                />
            )}

            <ConfirmDialog
                open={confirmDeleteList && !!activeList}
                title="Delete this list?"
                message={activeList
                    ? `"${activeList.name}" and all ${contacts.length} ${contacts.length === 1 ? 'person' : 'people'} on it, with their answers, will be deleted. This can't be undone.`
                    : ''}
                confirmLabel="Delete list"
                onConfirm={handleDeleteList}
                onCancel={() => setConfirmDeleteList(false)}
            />
        </div>
    );
}

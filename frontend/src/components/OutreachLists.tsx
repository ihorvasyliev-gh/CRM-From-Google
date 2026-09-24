import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Briefcase, Mail, Copy, CheckCircle, Send, Loader2, X, Pencil, Upload, Download, Plus, Users, AlertCircle, MailCheck, Clock } from 'lucide-react';
import StatTile from './ui/StatTile';
import { buildStatusEmailBodyHtml, buildStatusEmailSubject } from '../lib/appConfig';
import { fetchOptedOutEmails, partitionByOptOut, skippedNote } from '../lib/emailOptOut';
import { formatDateDMY } from '../lib/dateUtils';
import { getAvatarGradient } from '../lib/types';
import Toast, { ToastData } from './Toast';
import OutcomeEditModal, { type OutcomeValues } from './OutcomeEditModal';
import OutreachImportModal from './OutreachImportModal';
import { useDebounce } from '../hooks/useDebounce';
import SearchInput from './ui/SearchInput';
import { fetchOutreachContactsFn, fetchOutreachListsFn, type OutreachContact } from '../hooks/useOutreach';
import { exportOutreachListToExcel } from '../lib/outreachExport';

type StatusFilter = 'all' | OutreachContact['status'];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'not_contacted', label: 'Not Contacted' },
    { value: 'pending', label: 'Pending' },
    { value: 'responded', label: 'Responded' },
];

/**
 * External outreach lists (e.g. Action 11 clients from IRIS): people who may not be
 * in the CRM get the same status survey as graduates, tracked separately.
 */
export default function OutreachLists() {
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

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
    const [sending, setSending] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [editing, setEditing] = useState<OutreachContact | null>(null);
    const [newListName, setNewListName] = useState<string | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);
    const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

    // Selection and filters belong to one list
    useEffect(() => {
        setSelectedIds(new Set());
        setFilterStatus('all');
        setSearchQuery('');
    }, [listId]);

    // Stable object so the edit modal doesn't reset its form on every re-render
    const editingPerson = useMemo(() => editing ? { ...editing, tracking_status: editing.status } : null, [editing]);

    const existingEmails = useMemo(() => new Set(contacts.map(c => c.email.trim().toLowerCase())), [contacts]);

    const filtered = useMemo(() => {
        let result = contacts;
        if (filterStatus !== 'all') result = result.filter(c => c.status === filterStatus);
        if (debouncedSearchQuery.trim()) {
            const words = debouncedSearchQuery.toLowerCase().trim().split(/\s+/);
            result = result.filter(c => {
                const haystack = `${c.first_name} ${c.last_name} ${c.email} ${c.external_ref || ''} ${c.field_of_work || ''}`.toLowerCase();
                return words.every(w => haystack.includes(w));
            });
        }
        return result;
    }, [contacts, filterStatus, debouncedSearchQuery]);

    const statusCounts = useMemo(() => {
        const counts = { all: contacts.length, not_contacted: 0, pending: 0, responded: 0 };
        contacts.forEach(c => { counts[c.status]++; });
        return counts;
    }, [contacts]);

    const workingCount = contacts.filter(c => c.status === 'responded' && c.is_working).length;
    const responseRate = contacts.length > 0 ? Math.round((statusCounts.responded / contacts.length) * 100) : 0;

    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
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

    async function handleCopyEmails() {
        const all = [...new Set(contacts.filter(c => selectedIds.has(c.id)).map(c => c.email).filter(Boolean))];
        if (all.length === 0) { showToast('No emails to copy', 'error'); return; }
        try {
            // Leave out people who unsubscribed from our emails
            const optedOut = await fetchOptedOutEmails(all);
            const { allowed: emails, skipped } = partitionByOptOut(all, e => e, optedOut);
            if (emails.length === 0) { showToast('Everyone selected has unsubscribed from emails', 'error'); return; }
            await navigator.clipboard.writeText(emails.join('; '));
            showToast(`${emails.length} email(s) copied!${skippedNote(skipped.length)}`, 'success');
        } catch {
            showToast('Could not copy the emails', 'error');
        }
    }

    async function handleSendStatusRequest() {
        if (selectedIds.size === 0 || !listId) return;
        setSending(true);
        const selectedAll = contacts.filter(c => selectedIds.has(c.id));

        try {
            // Unsubscribed contacts stay on the list but get no survey email
            const optedOut = await fetchOptedOutEmails(selectedAll.map(c => c.email));
            const { allowed: selected, skipped } = partitionByOptOut(selectedAll, c => c.email, optedOut);
            if (selected.length === 0) {
                showToast('Everyone selected has unsubscribed from emails — nothing was sent.', 'error');
                return;
            }

            const { error: rpcError } = await supabase.rpc('mark_outreach_contacts_pending', {
                p_ids: selected.map(c => c.id),
            });
            if (rpcError) throw rpcError;

            // The link carries the list, so answers are saved to this list only
            const statusLink = `${window.location.origin}/status?list=${listId}`;
            const htmlBody = buildStatusEmailBodyHtml(statusLink, undefined, 'outreach');
            const subject = encodeURIComponent(buildStatusEmailSubject(undefined, 'outreach'));

            let copied = true;
            try {
                await navigator.clipboard.write([new ClipboardItem({
                    'text/html': new Blob([htmlBody], { type: 'text/html' }),
                    'text/plain': new Blob(['Please view this email in an HTML-compatible client.'], { type: 'text/plain' }),
                })]);
            } catch (clipErr) {
                console.error('Clipboard write failed:', clipErr);
                copied = false;
            }

            showToast(
                copied
                    ? `Status requests sent to ${selected.length} contact(s). Template copied!${skippedNote(skipped.length)}`
                    : `Marked ${selected.length} contact(s) as pending, but the email template could not be copied`,
                copied ? 'success' : 'error'
            );

            const bcc = [...new Set(selected.map(c => c.email))].map(e => encodeURIComponent(e)).join(',');
            window.location.href = `mailto:?bcc=${bcc}&subject=${subject}`;

            await refetchContacts();
            setSelectedIds(new Set());
        } catch (err) {
            console.error(err);
            showToast('Failed to send status requests.', 'error');
        } finally {
            setSending(false);
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
                ...(values.tracking_status === 'responded' ? { last_responded_at: new Date().toISOString() } : {}),
                ...(values.tracking_status === 'not_contacted' ? { last_invited_at: null, last_responded_at: null } : {}),
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

    function getTrackingBadge(status: OutreachContact['status']) {
        switch (status) {
            case 'responded':
                return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/15 text-status-confirmed"><CheckCircle size={10} /> Responded</span>;
            case 'pending':
                return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-info/15 text-status-invited"><Send size={10} /> Pending</span>;
            default:
                return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/15 text-muted"><Mail size={10} /> Not Contacted</span>;
        }
    }

    function getEmploymentBadge(contact: OutreachContact) {
        if (contact.status !== 'responded') {
            return <span className="text-xs text-muted italic">No data</span>;
        }
        if (contact.is_working) {
            const type = contact.employment_type === 'full_time' ? 'Full-time' : contact.employment_type === 'part_time' ? 'Part-time' : '';
            return (
                <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/15 text-status-confirmed">
                        <Briefcase size={10} /> Working {type && `· ${type}`}
                    </span>
                    {contact.field_of_work && (
                        <span className="text-[10px] text-muted">in {contact.field_of_work}</span>
                    )}
                </div>
            );
        }
        return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">Not working</span>;
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
                <select
                    value={listId ?? ''}
                    onChange={e => setListId(e.target.value)}
                    aria-label="Contact list"
                    className="text-sm font-semibold bg-background border border-border-strong rounded-lg px-2.5 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>

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
                            className="text-sm bg-background border border-border-strong rounded-lg px-2.5 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20 w-40"
                        />
                        <button type="submit" disabled={!newListName.trim()} className="px-2.5 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 rounded-lg disabled:opacity-50">Create</button>
                        <button type="button" onClick={() => setNewListName(null)} className="p-1.5 text-muted hover:text-primary"><X size={14} /></button>
                    </form>
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
                        onClick={() => setShowImport(true)}
                        disabled={!activeList}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-all shadow-sm disabled:opacity-50"
                    >
                        <Upload size={12} /> Import from IRIS (Excel/CSV)
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatTile label="Contacts" icon={Users} tone="brand" value={contacts.length} />
                <StatTile label="Response rate" icon={MailCheck} tone="completed" value={`${responseRate}%`} />
                <StatTile label="Currently working" icon={Briefcase} tone="success" value={workingCount} />
                <StatTile label="Pending responses" icon={Clock} tone="warning" value={statusCounts.pending} />
            </div>

            {/* Toolbar */}
            <div className="bg-surface rounded-2xl border border-border-subtle shadow-card p-3 sm:p-3.5 space-y-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <SearchInput
                        wrapperClassName="flex-1 min-w-[200px]"
                                                value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search by name, email, IRIS ID or field..."
                        aria-label="Search contacts"
                    />
                    <span className="text-xs text-muted font-medium">
                        {filtered.length} of {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex flex-wrap gap-1">
                    {STATUS_FILTERS.map(({ value, label }) => (
                        <button
                            key={value}
                            onClick={() => setFilterStatus(value)}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all ${
                                filterStatus === value
                                    ? 'bg-brand-500 text-white shadow-sm'
                                    : 'bg-surface-elevated text-muted hover:text-primary border border-border-subtle'
                            }`}
                        >
                            {label} ({statusCounts[value]})
                        </button>
                    ))}
                </div>
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
                            {contacts.length === 0 ? 'Export the clients from IRIS to Excel and use "Import from IRIS".' : 'Try adjusting your search or filter'}
                        </p>
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
                                            className="rounded border-border-strong text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                                        />
                                    </th>
                                    <th className="py-3 px-4 text-left text-[11px] font-semibold text-muted uppercase tracking-wider">Contact</th>
                                    <th className="py-3 px-4 text-left text-[11px] font-semibold text-muted uppercase tracking-wider hidden md:table-cell">IRIS ID</th>
                                    <th className="py-3 px-4 text-left text-[11px] font-semibold text-muted uppercase tracking-wider">Tracking</th>
                                    <th className="py-3 px-4 text-left text-[11px] font-semibold text-muted uppercase tracking-wider">Employment</th>
                                    <th className="py-3 px-4 text-left text-[11px] font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Updated</th>
                                    <th className="py-3 px-4 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(contact => {
                                    const isSelected = selectedIds.has(contact.id);
                                    const initials = `${contact.first_name[0] || contact.email[0] || ''}${contact.last_name[0] || ''}`.toUpperCase();
                                    return (
                                        <tr
                                            key={contact.id}
                                            onClick={() => toggleSelect(contact.id)}
                                            className={`cv-auto-row border-b border-border-subtle/50 transition-all cursor-pointer ${
                                                isSelected ? 'bg-brand-500/5' : 'hover:bg-surface-elevated/50'
                                            }`}
                                        >
                                            <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(contact.id)}
                                                    className="rounded border-border-strong text-brand-500 focus:ring-brand-500/50 cursor-pointer"
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 bg-gradient-to-br ${getAvatarGradient(contact.id)} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                        {initials}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-primary text-[13px] truncate flex items-center gap-1.5">
                                                            {`${contact.first_name} ${contact.last_name}`.trim() || '—'}
                                                            {contact.in_crm && (
                                                                <span title="The same email is also a student in the CRM" className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-completed/15 text-status-completed">In CRM</span>
                                                            )}
                                                        </p>
                                                        <p className="text-[11px] text-muted truncate">{contact.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 hidden md:table-cell">
                                                <span className="text-xs text-muted">{contact.external_ref || '—'}</span>
                                            </td>
                                            <td className="py-3 px-4">
                                                {getTrackingBadge(contact.status)}
                                                {contact.status === 'pending' && contact.last_invited_at && (
                                                    <p className="text-[10px] text-muted mt-0.5">Sent {formatDateDMY(contact.last_invited_at)}</p>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                {getEmploymentBadge(contact)}
                                                {contact.status === 'responded' && contact.is_working && contact.started_month && (
                                                    <p className="text-[10px] text-muted mt-0.5">
                                                        Since {new Date(contact.started_month + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 hidden lg:table-cell">
                                                <span className="text-xs text-muted">
                                                    {contact.last_responded_at ? formatDateDMY(contact.last_responded_at) : '—'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    onClick={e => { e.stopPropagation(); setEditing(contact); }}
                                                    className="p-1.5 text-muted hover:text-brand-500 hover:bg-surface-elevated rounded-lg transition-colors"
                                                    title="Edit Status"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border-subtle rounded-2xl shadow-float px-4 py-3 flex flex-wrap justify-center items-center gap-3 animate-slideUpCenter w-[calc(100vw-2rem)] sm:w-auto max-w-[480px] sm:max-w-none">
                    <span className="text-sm font-bold text-primary">{selectedIds.size} selected</span>
                    <div className="h-5 w-px bg-border-subtle" />
                    <button
                        onClick={handleCopyEmails}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted hover:text-primary bg-surface-elevated hover:bg-background border border-border-subtle rounded-lg transition-all"
                    >
                        <Copy size={12} /> Copy Emails
                    </button>
                    <button
                        onClick={handleSendStatusRequest}
                        disabled={sending}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {sending ? (
                            <><Loader2 size={12} className="animate-spin" /> Moving...</>
                        ) : (
                            <>
                                <Mail size={12} />
                                <span className="hidden sm:inline">Send Email & Move to Pending</span>
                                <span className="inline sm:hidden">Send Email</span>
                            </>
                        )}
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-muted hover:text-primary transition-colors">
                        <X size={14} />
                    </button>
                </div>
            )}

            {editing && (
                <OutcomeEditModal
                    isOpen={true}
                    person={editingPerson}
                    onSave={values => saveContactOutcome(editing, values)}
                    onDelete={() => deleteContact(editing)}
                    deleteLabel="Remove from list"
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        refetchContacts();
                        showToast('Contact status has been updated.', 'success');
                    }}
                />
            )}

            {showImport && activeList && (
                <OutreachImportModal
                    listId={activeList.id}
                    listName={activeList.name}
                    existingEmails={existingEmails}
                    onClose={() => setShowImport(false)}
                    onImported={({ inserted, updated }) => {
                        refetchContacts();
                        showToast(`Added ${inserted} new, ${updated} already on the list`, 'success');
                    }}
                />
            )}

            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Info, Loader2, MailCheck, MailX, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import {
    listEmailOptOuts,
    normalizeEmail,
    optInEmail,
    optOutEmail,
    updateEmailOptOutNote,
    type EmailOptOut,
} from '../lib/emailOptOut';
import { toast } from '../lib/toast';
import { formatDisplayDate } from '../lib/dateUtils';
import ConfirmDialog from './ConfirmDialog';
import Card from './ui/Card';
import Badge from './ui/Badge';
import { Button, IconButton } from './ui/Button';
import SearchInput from './ui/SearchInput';
import { EmptyState, SkeletonRows } from './ui/States';
import { calloutCls, fieldCls, labelCls, panelCls } from './ui/styles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Unsubscribe list: emails entered here are left out of every mailing
 * (course invitations, outcome and outreach surveys). The people stay in the CRM.
 * Registering again through the Google Form turns emails back on automatically.
 */
export default function EmailOptOutSection() {
    const queryClient = useQueryClient();
    const [email, setEmail] = useState('');
    const [note, setNote] = useState('');
    const [search, setSearch] = useState('');
    const [confirmOptIn, setConfirmOptIn] = useState<EmailOptOut | null>(null);
    const [editingEmail, setEditingEmail] = useState<string | null>(null);
    const [editingNote, setEditingNote] = useState('');

    const { data: optOuts = [], isLoading, error, refetch, isFetching } = useQuery<EmailOptOut[]>({
        queryKey: ['email_opt_outs'],
        queryFn: listEmailOptOuts,
    });

    const normalized = normalizeEmail(email);
    const isValid = EMAIL_RE.test(normalized);
    const existingEntry = useMemo(
        () => (isValid ? optOuts.find(o => o.email === normalized) ?? null : null),
        [isValid, normalized, optOuts],
    );
    const alreadyListed = Boolean(existingEntry);
    const trimmedNote = note.trim();
    const canUpdateExistingNote =
        alreadyListed && trimmedNote.length > 0 && trimmedNote !== (existingEntry?.note ?? '').trim();
    const canSubmitForm = isValid && (!alreadyListed || canUpdateExistingNote);

    const addOrUpdate = useMutation({
        mutationFn: async ({ targetEmail, targetNote, isUpdate }: { targetEmail: string; targetNote: string; isUpdate: boolean }) => {
            if (isUpdate) {
                await updateEmailOptOutNote(targetEmail, targetNote);
                return { email: normalizeEmail(targetEmail), students: 0, contacts: 0, isUpdate: true };
            }
            const result = await optOutEmail(targetEmail, targetNote);
            return { ...result, isUpdate: false };
        },
        onSuccess: ({ email: savedEmail, students, contacts, isUpdate }) => {
            queryClient.invalidateQueries({ queryKey: ['email_opt_outs'] });
            if (isUpdate) {
                toast.success(`Note updated for ${savedEmail}`);
            } else {
                const found = students + contacts;
                toast.success(
                    found > 0
                        ? `${savedEmail} will no longer receive emails`
                        : `${savedEmail} added — no student or contact uses this email yet`,
                );
            }
            setEmail('');
            setNote('');
        },
        onError: (err: Error) => toast.error(err.message || 'Could not update the email'),
    });

    const saveInlineNote = useMutation({
        mutationFn: ({ targetEmail, targetNote }: { targetEmail: string; targetNote: string }) =>
            updateEmailOptOutNote(targetEmail, targetNote),
        onSuccess: (_data, { targetEmail, targetNote }) => {
            const cleaned = targetNote.trim() || null;
            queryClient.setQueryData<EmailOptOut[]>(['email_opt_outs'], prev =>
                prev?.map(o => (o.email === targetEmail ? { ...o, note: cleaned } : o)),
            );
            queryClient.invalidateQueries({ queryKey: ['email_opt_outs'] });
            toast.success(cleaned ? 'Note updated' : 'Note cleared');
            setEditingEmail(null);
            setEditingNote('');
        },
        onError: (err: Error) => toast.error(err.message || 'Could not save the note'),
    });

    const remove = useMutation({
        mutationFn: (target: string) => optInEmail(target),
        onSuccess: (_data, target) => {
            queryClient.setQueryData<EmailOptOut[]>(['email_opt_outs'], prev => prev?.filter(o => o.email !== target));
            queryClient.invalidateQueries({ queryKey: ['email_opt_outs'] });
            if (editingEmail === target) {
                setEditingEmail(null);
                setEditingNote('');
            }
            toast.success(`Emails turned back on for ${target}`);
        },
        onError: (err: Error) => toast.error(err.message || 'Could not update the email'),
    });

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q
            ? optOuts.filter(o => o.email.toLowerCase().includes(q) || o.note?.toLowerCase().includes(q))
            : optOuts;
    }, [optOuts, search]);

    const startEditNote = (entry: EmailOptOut) => {
        setEditingEmail(entry.email);
        setEditingNote(entry.note ?? '');
    };

    const cancelEditNote = () => {
        setEditingEmail(null);
        setEditingNote('');
    };

    return (
        <Card
            title={
                <span className="inline-flex items-center gap-2 flex-wrap">
                    <span>Unsubscribed emails</span>
                    {!isLoading && !error && (
                        <Badge tone={optOuts.length > 0 ? 'danger' : 'neutral'} shape="pill" className="tabular-nums">
                            {optOuts.length} unsubscribed
                        </Badge>
                    )}
                </span>
            }
            subtitle="People who asked not to be emailed. They stay in the CRM but are left out of all mailings."
            icon={MailX}
            tone="danger"
            divided
            action={
                <IconButton label="Refresh unsubscribed emails" title="Refresh" onClick={() => refetch()}>
                    <RotateCcw size={15} className={isFetching ? 'animate-spin' : ''} />
                </IconButton>
            }
        >
            <div className="space-y-4">
                <form
                    className={`${panelCls} p-3.5 space-y-2.5`}
                    onSubmit={e => {
                        e.preventDefault();
                        if (canSubmitForm && !addOrUpdate.isPending) {
                            addOrUpdate.mutate({
                                targetEmail: email,
                                targetNote: note,
                                isUpdate: canUpdateExistingNote,
                            });
                        }
                    }}
                >
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2.5 items-end">
                        <div>
                            <label htmlFor="opt-out-email" className={labelCls}>
                                Email address
                            </label>
                            <input
                                id="opt-out-email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                autoComplete="off"
                                className={fieldCls}
                            />
                        </div>
                        <div>
                            <label htmlFor="opt-out-note" className={labelCls}>
                                Note <span className="font-normal">(optional)</span>
                            </label>
                            <input
                                id="opt-out-note"
                                type="text"
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder="e.g. replied to invitation"
                                className={fieldCls}
                            />
                        </div>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={!canSubmitForm}
                            loading={addOrUpdate.isPending}
                            className="w-full sm:w-auto"
                        >
                            {!addOrUpdate.isPending && (canUpdateExistingNote ? <Pencil size={13} /> : <Plus size={14} />)}
                            {canUpdateExistingNote ? 'Update note' : 'Unsubscribe'}
                        </Button>
                    </div>

                    {email.trim() && !isValid && (
                        <p className="text-xs text-status-rejected">Enter a valid email address.</p>
                    )}
                    {isValid && alreadyListed && !canUpdateExistingNote && (
                        <p className="text-xs text-muted">
                            This email is already unsubscribed. Enter a new note above to update it.
                        </p>
                    )}
                    {isValid && canUpdateExistingNote && (
                        <p className="text-xs text-brand-600 dark:text-brand-400 font-medium">
                            Already unsubscribed — submit to update the saved note.
                        </p>
                    )}
                </form>

                {optOuts.length > 3 && (
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Search by email or note…"
                        aria-label="Search unsubscribed emails"
                        className="h-9!"
                    />
                )}

                {isLoading ? (
                    <SkeletonRows rows={3} />
                ) : error ? (
                    <div className={`${calloutCls.danger} text-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                        <span>
                            Couldn't load the unsubscribe list: {(error as Error).message}. Make sure migration 62 has been applied.
                        </span>
                        <Button size="sm" variant="secondary" onClick={() => refetch()} className="self-start sm:self-center shrink-0">
                            Try again
                        </Button>
                    </div>
                ) : optOuts.length === 0 ? (
                    <EmptyState
                        bare
                        className="py-8!"
                        icon={<MailCheck size={20} />}
                        title="Nobody has unsubscribed yet"
                        description="Add an email above whenever someone asks to stop receiving course invitations or surveys."
                    />
                ) : visible.length === 0 ? (
                    <EmptyState
                        bare
                        className="py-8!"
                        icon={<MailX size={20} />}
                        title="No matching emails"
                        description={`No unsubscribed addresses or notes match “${search.trim()}”.`}
                        action={
                            <Button size="sm" variant="secondary" onClick={() => setSearch('')}>
                                Clear search
                            </Button>
                        }
                    />
                ) : (
                    <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden bg-surface">
                        {visible.map(o => {
                            const isEditing = editingEmail === o.email;
                            const isRemoving = remove.isPending && remove.variables === o.email;
                            const isSavingNote = saveInlineNote.isPending && saveInlineNote.variables?.targetEmail === o.email;
                            return (
                                <li
                                    key={o.email}
                                    data-testid="opt-out-row"
                                    className="px-3.5 py-3 hover:bg-surface-elevated/40 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-danger/10 text-status-rejected">
                                            <MailX size={15} aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-semibold text-primary truncate">{o.email}</p>
                                            {!isEditing && (
                                                <p className="text-xs text-muted truncate">
                                                    Unsubscribed {formatDisplayDate(o.opted_out_at)}
                                                    {o.note ? ` · ${o.note}` : ''}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {!isEditing && (
                                                <IconButton
                                                    size="sm"
                                                    label={`Edit note for ${o.email}`}
                                                    title="Edit note"
                                                    disabled={remove.isPending || saveInlineNote.isPending}
                                                    onClick={() => startEditNote(o)}
                                                >
                                                    <Pencil size={13} />
                                                </IconButton>
                                            )}
                                            <button
                                                type="button"
                                                aria-label={`Resubscribe ${o.email}`}
                                                title="Turn emails back on"
                                                onClick={() => setConfirmOptIn(o)}
                                                disabled={remove.isPending || isSavingNote}
                                                className="h-8 px-2.5 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 border border-brand-500/20 hover:bg-brand-500/15 inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40"
                                            >
                                                {isRemoving ? <Loader2 size={13} className="animate-spin" /> : <MailCheck size={13} />}
                                                <span className="hidden sm:inline">Resubscribe</span>
                                            </button>
                                        </div>
                                    </div>

                                    {isEditing && (
                                        <form
                                            className="mt-2.5 pl-11 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                                            onSubmit={e => {
                                                e.preventDefault();
                                                if (!isSavingNote) {
                                                    saveInlineNote.mutate({ targetEmail: o.email, targetNote: editingNote });
                                                }
                                            }}
                                        >
                                            <input
                                                type="text"
                                                value={editingNote}
                                                onChange={e => setEditingNote(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        cancelEditNote();
                                                    }
                                                }}
                                                placeholder="Add a note (leave blank to clear)…"
                                                aria-label={`Note for ${o.email}`}
                                                autoFocus
                                                className={`${fieldCls} h-8! text-xs flex-1`}
                                            />
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <Button type="submit" size="xs" variant="primary" loading={isSavingNote}>
                                                    {!isSavingNote && <Check size={12} />}
                                                    Save
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="xs"
                                                    variant="secondary"
                                                    disabled={isSavingNote}
                                                    onClick={cancelEditNote}
                                                >
                                                    <X size={12} />
                                                    Cancel
                                                </Button>
                                            </div>
                                        </form>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <p className="text-xs text-muted flex items-start gap-1.5">
                    <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                        Unsubscribed people are skipped when sending course invitations, outcome surveys and outreach surveys. If they register again through the Google Form, emails are turned back on automatically.
                    </span>
                </p>
            </div>

            <ConfirmDialog
                open={!!confirmOptIn}
                title="Turn emails back on?"
                message={confirmOptIn ? `${confirmOptIn.email} will receive course invitations and surveys again.` : ''}
                confirmLabel="Resubscribe"
                variant="warning"
                onConfirm={() => {
                    if (!confirmOptIn) return;
                    return remove.mutateAsync(confirmOptIn.email).catch(() => undefined).finally(() => setConfirmOptIn(null));
                }}
                onCancel={() => setConfirmOptIn(null)}
            />
        </Card>
    );
}

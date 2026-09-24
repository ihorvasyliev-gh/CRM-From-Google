import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailX, Search, Loader2, Plus, RotateCcw, Info, MailCheck } from 'lucide-react';
import { listEmailOptOuts, normalizeEmail, optInEmail, optOutEmail, type EmailOptOut } from '../lib/emailOptOut';
import { toast } from '../lib/toast';
import { formatDateDMY } from '../lib/dateUtils';
import ConfirmDialog from './ConfirmDialog';
import Card from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { calloutCls, fieldCls, labelCls } from './ui/styles';

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

    const { data: optOuts = [], isLoading, error, refetch, isFetching } = useQuery<EmailOptOut[]>({
        queryKey: ['email_opt_outs'],
        queryFn: listEmailOptOuts,
    });

    const add = useMutation({
        mutationFn: () => optOutEmail(email, note),
        onSuccess: result => {
            queryClient.invalidateQueries({ queryKey: ['email_opt_outs'] });
            const found = result.students + result.contacts;
            toast.success(
                found > 0
                    ? `${result.email} will no longer receive emails`
                    : `${result.email} added — no student or contact uses this email yet`
            );
            setEmail('');
            setNote('');
        },
        onError: (err: Error) => toast.error(err.message || 'Could not add the email'),
    });

    const remove = useMutation({
        mutationFn: (target: string) => optInEmail(target),
        onSuccess: (_data, target) => {
            queryClient.setQueryData<EmailOptOut[]>(['email_opt_outs'], prev => prev?.filter(o => o.email !== target));
            queryClient.invalidateQueries({ queryKey: ['email_opt_outs'] });
            toast.success(`Emails turned back on for ${target}`);
        },
        onError: (err: Error) => toast.error(err.message || 'Could not update the email'),
    });

    const normalized = normalizeEmail(email);
    const isValid = EMAIL_RE.test(normalized);
    const alreadyListed = optOuts.some(o => o.email === normalized);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? optOuts.filter(o => o.email.includes(q) || o.note?.toLowerCase().includes(q)) : optOuts;
    }, [optOuts, search]);

    return (
        <Card
            title="Unsubscribed emails"
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
                    className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end"
                    onSubmit={e => {
                        e.preventDefault();
                        if (isValid && !alreadyListed && !add.isPending) add.mutate();
                    }}
                >
                    <div>
                        <label htmlFor="opt-out-email" className={labelCls}>Email address</label>
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
                        <label htmlFor="opt-out-note" className={labelCls}>Note <span className="font-normal">(optional)</span></label>
                        <input
                            id="opt-out-note"
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="e.g. replied to invitation"
                            className={fieldCls}
                        />
                    </div>
                    <Button type="submit" variant="primary" disabled={!isValid || alreadyListed} loading={add.isPending}>
                        {!add.isPending && <Plus size={14} />}
                        Unsubscribe
                    </Button>
                </form>
                {email.trim() && !isValid && (
                    <p className="text-xs text-status-rejected -mt-2">Enter a valid email address.</p>
                )}
                {isValid && alreadyListed && (
                    <p className="text-xs text-muted -mt-2">This email is already unsubscribed.</p>
                )}

                {optOuts.length > 5 && (
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search unsubscribed emails…"
                            aria-label="Search unsubscribed emails"
                            className={`${fieldCls} pl-9`}
                        />
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center"><Loader2 size={16} className="animate-spin" /> Loading…</div>
                ) : error ? (
                    <div className={`${calloutCls.danger} text-sm p-3`}>
                        Couldn't load the unsubscribe list: {(error as Error).message}. Make sure migration 62 has been applied.
                    </div>
                ) : optOuts.length === 0 ? (
                    <p className="text-sm text-muted text-center py-6">Nobody has unsubscribed yet.</p>
                ) : visible.length === 0 ? (
                    <p className="text-sm text-muted text-center py-6">No emails match.</p>
                ) : (
                    <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                        {visible.map(o => (
                            <li key={o.email} data-testid="opt-out-row" className="flex items-center gap-3 px-3.5 py-3 hover:bg-surface-elevated/40 transition-colors">
                                <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-danger/10 text-status-rejected">
                                    <MailX size={15} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-semibold text-primary truncate">{o.email}</p>
                                    <p className="text-[11px] text-muted truncate">
                                        Unsubscribed {formatDateDMY(o.opted_out_at)}
                                        {o.note ? ` · ${o.note}` : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setConfirmOptIn(o)}
                                    disabled={remove.isPending}
                                    className="h-8 px-2.5 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 border border-brand-500/20 hover:bg-brand-500/15 inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                                >
                                    {remove.isPending && remove.variables === o.email ? <Loader2 size={13} className="animate-spin" /> : <MailCheck size={13} />}
                                    <span className="hidden sm:inline">Resubscribe</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <p className="text-[11px] text-muted flex items-start gap-1.5">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    Unsubscribed people are skipped when sending course invitations, outcome surveys and outreach surveys. If they register again through the Google Form, emails are turned back on automatically.
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

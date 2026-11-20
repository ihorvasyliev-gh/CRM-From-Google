import { useState, useEffect } from 'react';
import { Send, Mail, X, Plus, CalendarRange, CalendarClock, AlertCircle, AlertTriangle, Link2, Check, Loader2 } from 'lucide-react';
import { formatDayDateShort, todayISO, formatDisplayDate } from '../../lib/dateUtils';
import { DateInput } from '../ui/DatePicker';
import type { InviteFlow } from '../../hooks/useInviteFlow';
import SessionScheduleEditor from './SessionScheduleEditor';
import DialogLayer from '../ui/DialogLayer';
import { useLastPresent } from '../../hooks/usePresence';
import { describePeople } from './dialogPeople';
import { normalizeEmail } from '../../lib/emailOptOut';
import { fullName } from '../../lib/types';

interface InviteDateModalProps {
    inviteFlow: InviteFlow;
    optedOutEmails?: ReadonlySet<string>;
}

const RESPONSE_DAY_PRESETS = [3, 5, 7, 14] as const;
const EMPTY_OPTED_OUT: ReadonlySet<string> = new Set();

/**
 * Invite dialog: one date or several (the student picks), the time, place and days of each
 * date, response days, recipient & capacity pre-checks, copy link for WhatsApp, and invite with or without email.
 */
export default function InviteDateModal({ inviteFlow, optedOutEmails = EMPTY_OPTED_OUT }: InviteDateModalProps) {
    // While it animates out, the dialog keeps showing the invitation it was for
    const target = useLastPresent(inviteFlow.inviteDateTarget);
    const [daysText, setDaysText] = useState(String(inviteFlow.responseDays));
    const [linkCopied, setLinkCopied] = useState(false);

    useEffect(() => {
        setDaysText(String(inviteFlow.responseDays));
    }, [inviteFlow.responseDays]);

    useEffect(() => {
        if (!linkCopied) return;
        const timer = setTimeout(() => setLinkCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [linkCopied]);

    if (!target) return null;

    const who = describePeople(target.people);
    const people = target.people;
    const noEmailPeople = people.filter(e => !e.students?.email?.trim());
    const unsubPeople = people.filter(e => {
        const em = normalizeEmail(e.students?.email);
        return !!em && optedOutEmails.has(em);
    });
    const emailableCount = people.length - noEmailPeople.length - unsubPeople.length;

    // Live capacity warnings per selected date
    const capacityWarnings = inviteFlow.targetMaxCapacity != null
        ? inviteFlow.selectedDates.map(d => {
            const stats = inviteFlow.getDateStats(d);
            // Exclude people already counted as confirmed or active pending on this date
            const adding = people.filter(e => {
                const confD = e.confirmed_date?.split('T')[0];
                if (e.status === 'confirmed' && confD === d) return false;
                if (e.status === 'invited') {
                    const offered = e.invited_dates?.length ? e.invited_dates.map(x => x.split('T')[0]) : (e.invited_date ? [e.invited_date.split('T')[0]] : []);
                    const days = e.response_days ?? 7;
                    const expired = e.invited_at ? new Date(e.invited_at).getTime() + days * 86400000 < Date.now() : false;
                    if (!expired && offered.includes(d)) return false;
                }
                return true;
            }).length;
            const projected = stats.confirmed + stats.pending + adding;
            return { date: d, confirmed: stats.confirmed, pending: stats.pending, adding, projected, max: inviteFlow.targetMaxCapacity! };
        }).filter(w => w.projected > w.max)
        : [];

    const namePreview = (list: typeof people) =>
        list.length <= 2 ? list.map(e => fullName(e.students) || 'Student').join(', ') : `${list.length} people`;

    const onCopyLink = async () => {
        if (await inviteFlow.handleCopyConfirmLink()) {
            setLinkCopied(true);
        }
    };

    const busy = inviteFlow.submitting;

    return (
        <DialogLayer
            open={!!inviteFlow.inviteDateTarget}
            onClose={() => inviteFlow.setInviteDateTarget(null)}
            dismissible={!busy}
            label="Invite to Course"
            className="z-60 flex items-center justify-center"
            panelClassName="bg-surface rounded-2xl shadow-float border border-border-subtle w-full max-w-lg mx-4 max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden"
        >
            {/* The settings scroll; the buttons below stay in view (on a laptop they sat below the fold) */}
            <div className="p-6 pb-4 overflow-y-auto overscroll-contain min-h-0">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 bg-blue-500/10 rounded-xl text-status-invited">
                        <Send size={22} />
                    </div>
                    <div>
                        <h3 className="font-bold text-primary">Invite to Course</h3>
                        {who && <p className="text-sm font-semibold text-primary mt-0.5 break-words" data-testid="invite-who">{who}</p>}
                        <p className="text-xs text-muted mt-0.5">
                            {inviteFlow.multiDate
                                ? 'Offer several dates — each student picks one'
                                : target.ids.length === 1
                                    ? 'Select the date for this invitation'
                                    : `Select the date for ${target.ids.length} invitations`
                            }
                        </p>
                    </div>
                </div>

                {/* Recipient pre-check warning (unsubscribed / missing email) */}
                {(unsubPeople.length > 0 || noEmailPeople.length > 0) && (
                    <div role="status" className="mb-4 px-3 py-2.5 rounded-xl bg-warning/10 border border-warning/30 text-xs text-status-requested space-y-1">
                        <div className="flex items-start gap-2 font-semibold">
                            <AlertTriangle size={14} className="shrink-0 mt-px" />
                            <div>
                                {unsubPeople.length > 0 && (
                                    <p>Unsubscribed ({unsubPeople.length}): {namePreview(unsubPeople)}</p>
                                )}
                                {noEmailPeople.length > 0 && (
                                    <p>No email ({noEmailPeople.length}): {namePreview(noEmailPeople)}</p>
                                )}
                            </div>
                        </div>
                        <p className="text-[11px] opacity-85 pl-5">
                            {emailableCount > 0
                                ? `“Invite & Email” will skip them and email ${emailableCount}. Use “Just Invite” + “Copy confirm link” for phone/WhatsApp.`
                                : 'Nobody here can receive email — use “Just Invite” and copy the confirmation link for WhatsApp/SMS.'}
                        </p>
                    </div>
                )}

                <label className="flex items-start gap-3 mb-4 p-3 rounded-xl border border-border-subtle bg-surface cursor-pointer select-none hover:border-blue-300 transition-colors">
                    <input
                        type="checkbox"
                        id="invite-multi-date"
                        checked={inviteFlow.multiDate}
                        onChange={e => inviteFlow.setMultiDate(e.target.checked)}
                        className="mt-0.5 rounded-sm border-border-subtle text-blue-600 focus:ring-blue-500/20"
                    />
                    <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                            <CalendarRange size={14} className="text-blue-500" /> Multiple dates
                        </span>
                        <span className="block text-xs text-muted mt-0.5">
                            Same course in several groups — the student chooses a date on the confirmation page.
                        </span>
                    </span>
                </label>

                {inviteFlow.savedInviteDates.length > 0 && (
                    <div className="mb-4">
                        <label className="block text-xs font-medium text-muted mb-2">Saved dates</label>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {inviteFlow.savedInviteDates.map(d => {
                                const stats = inviteFlow.getDateStats(d);
                                const isSelected = inviteFlow.multiDate
                                    ? inviteFlow.inviteDates.includes(d)
                                    : inviteFlow.inviteDate === d;
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => inviteFlow.multiDate ? inviteFlow.toggleInviteDate(d) : inviteFlow.setInviteDate(d)}
                                        className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all text-left ${
                                            isSelected
                                                ? 'bg-info/10 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                                                : 'bg-surface border-border-subtle hover:border-blue-300 hover:bg-surface-elevated'
                                        }`}
                                    >
                                        {/* The date is never cut short: on a narrow phone the counters wrap instead */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className={`w-2 h-2 ${inviteFlow.multiDate ? 'rounded-xs' : 'rounded-full'} shrink-0 ${isSelected ? 'bg-blue-500' : 'bg-transparent border border-border-subtle'}`} />
                                            <span className={`text-xs font-semibold whitespace-nowrap ${isSelected ? 'text-status-invited font-bold' : 'text-primary'}`}>
                                                {inviteFlow.multiDate ? formatDayDateShort(d) : formatDisplayDate(d)}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-confirmed bg-success/10 px-2 py-0.5 rounded-sm border border-success/25" title="Confirmed students on this date">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                {stats.confirmed}{inviteFlow.targetMaxCapacity ? `/${inviteFlow.targetMaxCapacity}` : ''} confirmed
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-invited bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded-sm border border-sky-200/50 dark:border-sky-800/50" title="Active pending invitations">
                                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                                {stats.pending} pending
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {inviteFlow.multiDate ? (
                    <div>
                        <label htmlFor="invite-date" className="block text-sm font-medium text-primary mb-1.5">
                            {inviteFlow.savedInviteDates.length > 0 ? 'Or add a new date' : 'Add course dates'}
                        </label>
                        <div className="flex gap-2">
                            <DateInput
                                id="invite-date"
                                value={inviteFlow.inviteDate}
                                min={todayISO()}
                                onChange={inviteFlow.setInviteDate}
                                className="flex-1 min-w-0 px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-surface"
                            />
                            <button
                                type="button"
                                onClick={() => inviteFlow.toggleInviteDate(inviteFlow.inviteDate)}
                                disabled={!inviteFlow.inviteDate || inviteFlow.inviteDates.includes(inviteFlow.inviteDate)}
                                className="disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 px-3 py-2 text-sm font-semibold text-status-invited bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl transition-all"
                            >
                                <Plus size={14} /> Add
                            </button>
                        </div>

                        <div className="mt-3">
                            <div className="text-xs font-medium text-muted mb-1.5">
                                Offered dates ({inviteFlow.inviteDates.length})
                            </div>
                            {inviteFlow.inviteDates.length === 0 ? (
                                <p className="text-xs text-muted opacity-70">Select at least two dates.</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {inviteFlow.inviteDates.map(d => {
                                        const stats = inviteFlow.getDateStats(d);
                                        return (
                                            <span key={d} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-info/10 border border-blue-500/30 text-xs font-semibold text-status-invited">
                                                {formatDayDateShort(d)}
                                                <span className="font-normal text-muted" title="Confirmed / pending on this date">
                                                    {stats.confirmed}{inviteFlow.targetMaxCapacity ? `/${inviteFlow.targetMaxCapacity}` : ''} · {stats.pending}p
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${formatDisplayDate(d)}`}
                                                    onClick={() => inviteFlow.toggleInviteDate(d)}
                                                    className="p-0.5 rounded-sm hover:bg-blue-500/20"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                            {inviteFlow.inviteDates.length === 1 && (
                                <p className="text-xs text-status-requested mt-1.5">Add one more date, or switch off “Multiple dates”.</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div>
                    <label className="block text-sm font-medium text-primary mb-1.5">
                        {inviteFlow.savedInviteDates.length > 0 ? 'Or pick a new date' : 'Invitation Date'}
                    </label>
                    <DateInput
                        id="invite-date"
                        value={inviteFlow.inviteDate}
                        min={todayISO()}
                        onChange={inviteFlow.setInviteDate}
                        className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-surface"
                    />
                    {inviteFlow.inviteDate && !inviteFlow.savedInviteDates.includes(inviteFlow.inviteDate) && (
                        <div className="flex items-center gap-2 mt-1.5 px-1">
                            <span className="text-xs text-muted">On this date:</span>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-confirmed">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {inviteFlow.getDateStats(inviteFlow.inviteDate).confirmed}{inviteFlow.targetMaxCapacity ? `/${inviteFlow.targetMaxCapacity}` : ''} confirmed
                            </span>
                            <span className="text-border-subtle">•</span>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-invited">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                {inviteFlow.getDateStats(inviteFlow.inviteDate).pending} pending
                            </span>
                        </div>
                    )}
                    </div>
                )}

                {/* Capacity warning when confirmed + pending + newly invited exceeds course limit */}
                {capacityWarnings.length > 0 && (
                    <div role="alert" className="mt-3 px-3 py-2 rounded-xl bg-warning/10 border border-warning/30 text-xs font-medium text-status-requested space-y-1">
                        {capacityWarnings.map(w => (
                            <p key={w.date} className="flex items-start gap-2">
                                <AlertTriangle size={14} className="shrink-0 mt-px" />
                                <span>
                                    {formatDayDateShort(w.date)} may exceed capacity: {w.confirmed} confirmed + {w.pending} pending + {w.adding} new = <strong>{w.projected}</strong> for {w.max} places.
                                </span>
                            </p>
                        ))}
                    </div>
                )}

                {inviteFlow.scheduleSupported ? inviteFlow.selectedDates.length > 0 && (
                    <div className="mt-4">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-primary mb-1.5">
                            <CalendarClock size={15} className="text-blue-500" /> Time, place &amp; days
                            <span className="text-xs font-normal text-muted">— optional, shown in the email</span>
                        </div>
                        <div className="space-y-2">
                            {inviteFlow.selectedDates.map((d, i) => (
                                <SessionScheduleEditor
                                    key={d}
                                    session={inviteFlow.sessionFor(d)}
                                    onChange={patch => inviteFlow.updateSession(d, patch)}
                                    title={inviteFlow.multiDate ? `Option ${i + 1}` : undefined}
                                    locationSuggestions={inviteFlow.locationSuggestions}
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="mt-4 text-xs text-muted">Time, place and course days can be added once database migration 79 is applied.</p>
                )}

                <div className="mt-4">
                    <label htmlFor="response-days" className="block text-sm font-medium text-primary mb-1.5">
                        Response Deadline
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="number"
                            id="response-days"
                            name="responseDays"
                            value={daysText}
                            min={1}
                            max={90}
                            onChange={e => {
                                const raw = e.target.value;
                                setDaysText(raw);
                                const parsed = parseInt(raw, 10);
                                if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 90) {
                                    inviteFlow.setResponseDays(parsed);
                                }
                            }}
                            onBlur={() => {
                                const parsed = parseInt(daysText, 10);
                                const clamped = Number.isNaN(parsed) ? 7 : Math.min(90, Math.max(1, parsed));
                                inviteFlow.setResponseDays(clamped);
                                setDaysText(String(clamped));
                            }}
                            className="w-20 px-3 py-2 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-surface text-center tabular-nums"
                        />
                        <span className="text-sm text-muted">days</span>
                        <div className="flex items-center gap-1 ml-auto">
                            {RESPONSE_DAY_PRESETS.map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => inviteFlow.setResponseDays(d)}
                                    aria-pressed={inviteFlow.responseDays === d}
                                    className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                        inviteFlow.responseDays === d
                                            ? 'bg-blue-500 text-white border-blue-500'
                                            : 'bg-surface-elevated text-muted border-border-subtle hover:text-primary hover:border-blue-400'
                                    }`}
                                >
                                    {d}d
                                </button>
                            ))}
                        </div>
                    </div>
                    <p className="text-xs text-muted mt-1.5 opacity-70">
                        The participant will see this deadline in the invitation email
                    </p>
                </div>

                {inviteFlow.scheduleError && (
                    <p role="alert" className="flex items-center gap-1.5 mt-4 text-xs font-medium text-status-rejected">
                        <AlertCircle size={14} className="shrink-0" /> {inviteFlow.scheduleError}
                    </p>
                )}
            </div>

            <div className="px-6 py-4 border-t border-border-subtle space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={onCopyLink}
                        disabled={!inviteFlow.canInvite || inviteFlow.copyingLink || busy}
                        className="disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/15 border border-brand-500/25 rounded-lg transition-colors cursor-pointer"
                        title="Generate & copy short confirmation link for WhatsApp or SMS"
                    >
                        {inviteFlow.copyingLink ? (
                            <Loader2 size={13} className="animate-spin" />
                        ) : linkCopied ? (
                            <Check size={13} />
                        ) : (
                            <Link2 size={13} />
                        )}
                        {linkCopied ? 'Link copied!' : 'Copy confirm link'}
                    </button>
                    <span className="text-[11px] text-muted hidden sm:inline">For WhatsApp or SMS</span>
                </div>

                <div className="flex gap-2.5">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => inviteFlow.setInviteDateTarget(null)}
                        className="px-4 py-2.5 text-sm font-medium text-muted hover:text-primary bg-surface-elevated hover:bg-surface border border-border-subtle rounded-xl transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={inviteFlow.handleInviteWithDate}
                        disabled={!inviteFlow.canInvite || busy}
                        className="disabled:opacity-50 disabled:cursor-not-allowed flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-all shadow-xs"
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Just Invite
                    </button>
                    <button
                        type="button"
                        onClick={inviteFlow.handleInviteAndEmail}
                        disabled={!inviteFlow.canInvite || busy || emailableCount === 0}
                        className="disabled:opacity-50 disabled:cursor-not-allowed flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-xs"
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Invite & Email
                    </button>
                </div>
            </div>
        </DialogLayer>
    );
}

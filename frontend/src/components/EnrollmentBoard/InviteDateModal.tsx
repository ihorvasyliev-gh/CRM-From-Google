import { Send, Mail, X, Plus, CalendarRange } from 'lucide-react';
import { formatDateLong, formatDayDateShort, todayISO } from '../../lib/dateUtils';
import { DateInput } from '../ui/DatePicker';
import type { InviteFlow } from '../../hooks/useInviteFlow';

interface InviteDateModalProps {
    inviteFlow: InviteFlow;
}

/** Invite dialog: one date or several (the student picks), response days, invite with or without the email. */
export default function InviteDateModal({ inviteFlow }: InviteDateModalProps) {
    if (!inviteFlow.inviteDateTarget) return null;
    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fadeIn" onClick={() => inviteFlow.setInviteDateTarget(null)}>
            <div
                className="bg-surface rounded-2xl shadow-float border border-border-subtle p-6 w-full max-w-md mx-4 animate-scaleIn"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 bg-blue-500/10 rounded-xl text-status-invited">
                        <Send size={22} />
                    </div>
                    <div>
                        <h3 className="font-bold text-primary">Invite to Course</h3>
                        <p className="text-xs text-muted mt-0.5">
                            {inviteFlow.multiDate
                                ? 'Offer several dates — each student picks one'
                                : inviteFlow.inviteDateTarget.ids.length === 1
                                    ? 'Select the date for this invitation'
                                    : `Select the date for ${inviteFlow.inviteDateTarget.ids.length} invitations`
                            }
                        </p>
                    </div>
                </div>

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
                                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left ${
                                            isSelected
                                                ? 'bg-info/10 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                                                : 'bg-surface border-border-subtle hover:border-blue-300 hover:bg-surface-elevated'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className={`w-2 h-2 ${inviteFlow.multiDate ? 'rounded-xs' : 'rounded-full'} shrink-0 ${isSelected ? 'bg-blue-500' : 'bg-transparent border border-border-subtle'}`} />
                                            <span className={`text-xs font-semibold truncate ${isSelected ? 'text-status-invited font-bold' : 'text-primary'}`}>
                                                {inviteFlow.multiDate ? formatDayDateShort(d) : formatDateLong(d)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-confirmed bg-success/10 px-2 py-0.5 rounded-sm border border-success/25" title="Confirmed students on this date">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                {stats.confirmed}{inviteFlow.targetMaxCapacity ? `/${inviteFlow.targetMaxCapacity}` : ''} confirmed
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-invited bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded-sm border border-sky-200/50 dark:border-sky-800/50" title="Active pending invitations">
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
                                                    aria-label={`Remove ${formatDateLong(d)}`}
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
                            <span className="text-[11px] text-muted">On this date:</span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-confirmed">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {inviteFlow.getDateStats(inviteFlow.inviteDate).confirmed}{inviteFlow.targetMaxCapacity ? `/${inviteFlow.targetMaxCapacity}` : ''} confirmed
                            </span>
                            <span className="text-border-subtle">•</span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-invited">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                {inviteFlow.getDateStats(inviteFlow.inviteDate).pending} pending
                            </span>
                        </div>
                    )}
                    </div>
                )}

                <div className="mt-4">
                    <label className="block text-sm font-medium text-primary mb-1.5">
                        Response Deadline
                    </label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            id="response-days"
                            name="responseDays"
                            value={inviteFlow.responseDays}
                            min={1}
                            max={90}
                            onChange={e => inviteFlow.setResponseDays(Math.max(1, parseInt(e.target.value) || 7))}
                            className="w-24 px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-surface text-center"
                        />
                        <span className="text-sm text-muted">days to confirm</span>
                    </div>
                    <p className="text-xs text-muted mt-1.5 opacity-70">
                        The participant will see this deadline in the invitation email
                    </p>
                </div>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={() => inviteFlow.setInviteDateTarget(null)}
                        className="px-4 py-2.5 text-sm font-medium text-muted hover:text-primary bg-surface-elevated hover:bg-surface border border-border-subtle rounded-xl transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={inviteFlow.handleInviteWithDate}
                        disabled={!inviteFlow.canInvite}
                        className="disabled:opacity-50 disabled:cursor-not-allowed flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-all shadow-xs"
                    >
                        <Send size={14} /> Just Invite
                    </button>
                    <button
                        onClick={inviteFlow.handleInviteAndEmail}
                        disabled={!inviteFlow.canInvite}
                        className="disabled:opacity-50 disabled:cursor-not-allowed flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-xs"
                    >
                        <Mail size={14} /> Invite & Email
                    </button>
                </div>
            </div>
        </div>
    );
}

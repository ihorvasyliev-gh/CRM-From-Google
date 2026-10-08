import { CheckCircle, Loader2 } from 'lucide-react';
import { formatDateLong } from '../../lib/dateUtils';
import { DateInput } from '../ui/DatePicker';
import type { InviteFlow } from '../../hooks/useInviteFlow';
import DialogLayer from '../ui/DialogLayer';
import { useLastPresent } from '../../hooks/usePresence';

interface ConfirmDateModalProps {
    target: { ids: string[] } | null;
    date: string;
    onDateChange: (date: string) => void;
    busy: boolean;
    onConfirm: () => void;
    onClose: () => void;
    savedDates: string[];
    getDateStats: InviteFlow["getDateStats"];
}

/** Confirm dialog: the course date for one or several confirmations, with the saved dates and how full each is. */
export default function ConfirmDateModal({ target, date, onDateChange, busy, onConfirm, onClose, savedDates, getDateStats }: ConfirmDateModalProps) {
    const shown = useLastPresent(target);
    if (!shown) return null;
    return (
        <DialogLayer
            open={!!target}
            onClose={onClose}
            dismissible={!busy}
            label="Confirm Enrollment"
            className="z-60 flex items-center justify-center"
            panelClassName="bg-surface rounded-2xl shadow-float border border-border-subtle p-6 w-full max-w-md mx-4"
        >
            <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-success/10 rounded-xl text-status-confirmed">
                    <CheckCircle size={22} />
                </div>
                <div>
                    <h3 className="font-bold text-primary">Confirm Enrollment</h3>
                    <p className="text-xs text-muted mt-0.5">
                        {shown.ids.length === 1
                            ? 'Set the confirmation date for this enrollment'
                            : `Set the confirmation date for ${shown.ids.length} enrollments`
                        }
                    </p>
                </div>
            </div>

            {savedDates.length > 0 && (
                <div className="mb-4">
                    <label className="block text-xs font-medium text-muted mb-2">Saved Course Dates</label>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {savedDates.map(d => {
                            const stats = getDateStats(d);
                            const isSelected = date === d;
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => onDateChange(d)}
                                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left ${
                                        isSelected
                                            ? 'bg-success/10 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                                            : 'bg-surface border-border-subtle hover:border-emerald-300 hover:bg-surface-elevated'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-emerald-500' : 'bg-transparent border border-border-subtle'}`} />
                                        <span className={`text-xs font-semibold truncate ${isSelected ? 'text-status-confirmed font-bold' : 'text-primary'}`}>
                                            {formatDateLong(d)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-confirmed bg-success/10 px-2 py-0.5 rounded-sm border border-success/25" title="Confirmed students on this date">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            {stats.confirmed} confirmed
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

            <label className="block text-sm font-medium text-primary mb-1.5">
                {savedDates.length > 0 ? 'Or pick a new date' : 'Confirmation Date'}
            </label>
            <DateInput
                id="confirm-date"
                value={date}
                onChange={onDateChange}
                className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-surface"
            />
            {date && !savedDates.includes(date) && (
                <div className="flex items-center gap-2 mt-1.5 px-1">
                    <span className="text-[11px] text-muted">On this date:</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-confirmed">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {getDateStats(date).confirmed} confirmed
                    </span>
                    <span className="text-border-subtle">•</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-invited">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                        {getDateStats(date).pending} pending
                    </span>
                </div>
            )}

            <div className="flex gap-3 mt-6">
                <button
                    onClick={() => onClose()}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-muted hover:text-primary bg-surface-elevated hover:bg-surface border border-border-subtle rounded-xl transition-all"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    disabled={!date || busy}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {busy && <Loader2 size={14} className="animate-spin" />}
                    Confirm
                </button>
            </div>
        </DialogLayer>
    );
}

import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, AlertTriangle, ShieldCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import { useRequestCompletion } from '../../hooks/useApprovals';
import { todayISO } from '../../lib/dateUtils';
import { toast } from '../../lib/toast';
import { addDaysISO, daysFromToday, pluralize, weekdayDate } from './viewerUtils';
import { Button } from './ViewerUI';
import { DateInput } from '../ui/DatePicker';

export interface CompletionTarget {
    enrollmentId: string;
    name: string;
    /** Scheduled course date (confirmed / invited) — offered as a quick pick */
    sessionDate?: string | null;
}

const FORM_ID = 'completion-request-form';

/**
 * Asks for the completion date and submits a completion request for admin approval.
 * Quick picks cover the common cases (course day, today, yesterday); any other day comes
 * from the app's calendar. A bottom sheet on phones.
 */
export default function CompletionRequestModal({
    open,
    targets,
    context,
    onClose,
    onSubmitted,
}: {
    open: boolean;
    targets: CompletionTarget[];
    /** e.g. the course name */
    context?: string;
    onClose: () => void;
    onSubmitted?: () => void;
}) {
    const mutation = useRequestCompletion();

    const sessionDates = useMemo(() => {
        const set = new Set(targets.map(t => t.sessionDate).filter((d): d is string => !!d));
        return Array.from(set).sort();
    }, [targets]);

    // Default: the shared session date if all targets have the same one, otherwise today
    const [date, setDate] = useState(() => (sessionDates.length === 1 && targets.every(t => t.sessionDate === sessionDates[0]) ? sessionDates[0] : todayISO()));

    useEffect(() => {
        document.getElementById('completion-date-input')?.focus();
    }, []);

    const inFuture = (daysFromToday(date) ?? 0) > 0;

    const quickPicks = useMemo(() => {
        const picks: { label: string; value: string }[] = [];
        sessionDates.slice(0, 3).forEach(d => picks.push({ label: `Course day · ${weekdayDate(d)}`, value: d }));
        const today = todayISO();
        const yesterday = addDaysISO(-1);
        if (!picks.some(p => p.value === today)) picks.push({ label: 'Today', value: today });
        if (!picks.some(p => p.value === yesterday)) picks.push({ label: 'Yesterday', value: yesterday });
        return picks;
    }, [sessionDates]);

    const submit = async () => {
        if (!date || mutation.isPending) return;
        try {
            await mutation.mutateAsync({ enrollmentIds: targets.map(t => t.enrollmentId), completedDate: date });
            toast.success(`Completion requested for ${targets.length === 1 ? targets[0].name : pluralize(targets.length, 'student')}, waiting for admin approval`);
            onSubmitted?.();
            onClose();
        } catch (err) {
            toast.error((err as Error)?.message || "Couldn't send the request. Please try again.");
        }
    };

    const shown = targets.slice(0, 6);
    const rest = targets.length - shown.length;
    const busy = mutation.isPending;

    return (
        <Modal
            open={open}
            onClose={onClose}
            dismissible={!busy}
            labelId="completion-title"
            zIndex="z-70"
            sheetOnMobile
            icon={GraduationCap}
            tone="success"
            title="Request completion"
            subtitle={context}
            footer={
                <div className="flex w-full sm:w-auto items-center justify-end gap-2 pb-[env(safe-area-inset-bottom)] sm:pb-0">
                    <Button variant="ghost" onClick={onClose} disabled={busy} className="flex-1 sm:flex-none">Cancel</Button>
                    <Button type="submit" form={FORM_ID} variant="success" loading={busy} disabled={!date} className="flex-1 sm:flex-none">
                        {!busy && <GraduationCap size={14} />}
                        Submit request
                    </Button>
                </div>
            }
        >
            <form id={FORM_ID} onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-5">
                {targets.length === 1 ? (
                    <p className="text-sm text-primary">
                        Ask an admin to mark <strong className="font-semibold">{targets[0].name}</strong> as completed.
                    </p>
                ) : (
                    <div className="space-y-2">
                        <p className="text-sm text-primary">
                            Ask an admin to mark <strong className="font-semibold">{pluralize(targets.length, 'student')}</strong> as completed.
                        </p>
                        <div className="flex flex-wrap gap-1.5" aria-label="Students">
                            {shown.map(t => (
                                <span key={t.enrollmentId} className="px-2 py-0.5 rounded-full bg-surface-elevated border border-border-subtle text-xs font-medium text-primary">
                                    {t.name}
                                </span>
                            ))}
                            {rest > 0 && <span className="px-2 py-0.5 text-xs font-semibold text-muted">+{rest} more</span>}
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    <label htmlFor="completion-date-input" className="block text-sm font-medium text-primary">
                        Completion date
                    </label>
                    <p className="text-xs text-muted -mt-1">The day {targets.length === 1 ? 'they' : 'these students'} finished the course.</p>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick dates">
                        {quickPicks.map(p => (
                            <button
                                key={p.value + p.label}
                                type="button"
                                onClick={() => setDate(p.value)}
                                aria-pressed={date === p.value}
                                className={`px-3 h-9 sm:h-8 rounded-lg text-xs font-semibold border transition-colors ${
                                    date === p.value
                                        ? 'bg-success/15 text-status-confirmed border-emerald-500/50'
                                        : 'bg-surface text-primary border-border-subtle hover:border-border-strong'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <DateInput
                        id="completion-date-input"
                        value={date}
                        onChange={setDate}
                        placeholder="Pick a date"
                        className="w-full h-10 px-3 bg-surface border border-border-subtle rounded-xl text-sm text-primary focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    />
                    {inFuture && (
                        <p role="alert" className="flex items-start gap-1.5 px-3 py-2 rounded-xl bg-warning/10 border border-warning/30 text-xs font-medium text-status-requested">
                            <AlertTriangle size={13} className="shrink-0 mt-px" />
                            This date is in the future. Check it before you submit.
                        </p>
                    )}
                </div>

                <p className="flex items-start gap-2 text-xs text-muted">
                    <ShieldCheck size={14} className="shrink-0 mt-px text-brand-500" />
                    An admin checks every request. The student shows as completed once it is approved.
                </p>
            </form>
        </Modal>
    );
}

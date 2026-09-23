import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2, AlertTriangle, X } from 'lucide-react';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { useRequestCompletion } from '../../hooks/useApprovals';
import { todayISO } from '../../lib/dateUtils';
import { toast } from '../../lib/toast';
import { addDaysISO, daysFromToday, pluralize, weekdayDate } from './viewerUtils';
import { Button } from './ViewerUI';

export interface CompletionTarget {
    enrollmentId: string;
    name: string;
    /** Scheduled course date (confirmed / invited) — offered as a quick pick */
    sessionDate?: string | null;
}

/**
 * Asks for the completion date and submits a completion request for admin approval.
 * Quick picks cover the common cases (session date, today, yesterday).
 */
export default function CompletionRequestModal({
    targets,
    context,
    onClose,
    onSubmitted,
}: {
    targets: CompletionTarget[];
    /** e.g. the course name */
    context?: string;
    onClose: () => void;
    onSubmitted?: () => void;
}) {
    const mutation = useRequestCompletion();
    useModalBehavior(true, onClose, { closeOnEscape: !mutation.isPending });

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
            toast.success(`Completion requested for ${targets.length === 1 ? targets[0].name : pluralize(targets.length, 'student')} — waiting for admin approval`);
            onSubmitted?.();
            onClose();
        } catch (err) {
            toast.error((err as Error)?.message || 'Failed to submit completion request');
        }
    };

    const shown = targets.slice(0, 6);
    const rest = targets.length - shown.length;

    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !mutation.isPending && onClose()} />
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="completion-title"
                onSubmit={e => { e.preventDefault(); submit(); }}
                className="relative w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-2xl border border-border-subtle shadow-2xl p-5 sm:p-6 space-y-4 animate-sheetSlideUp sm:animate-scaleIn pb-[max(env(safe-area-inset-bottom),1.25rem)]"
            >
                <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
                        <GraduationCap size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 id="completion-title" className="font-bold text-base text-primary">Request completion</h3>
                        <p className="text-xs text-muted truncate">
                            {pluralize(targets.length, 'student')}{context ? ` · ${context}` : ''}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={mutation.isPending} aria-label="Close" className="p-1.5 -m-1 text-muted hover:text-primary rounded-lg hover:bg-surface-elevated">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {shown.map(t => (
                        <span key={t.enrollmentId} className="px-2 py-0.5 rounded-full bg-surface-elevated border border-border-subtle text-[11px] font-medium text-primary">
                            {t.name}
                        </span>
                    ))}
                    {rest > 0 && <span className="px-2 py-0.5 text-[11px] font-semibold text-muted">+{rest} more</span>}
                </div>

                <div className="space-y-2">
                    <label htmlFor="completion-date-input" className="text-[11px] font-bold text-muted uppercase tracking-wider block">
                        Completion date
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {quickPicks.map(p => (
                            <button
                                key={p.value + p.label}
                                type="button"
                                onClick={() => setDate(p.value)}
                                className={`px-2.5 h-7 rounded-lg text-xs font-semibold border transition-colors ${
                                    date === p.value
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : 'bg-surface-elevated text-primary border-border-subtle hover:border-border-strong'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <input
                        id="completion-date-input"
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        className="w-full h-10 px-3 bg-surface-elevated border border-border-subtle rounded-xl text-sm text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    />
                    {inFuture ? (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle size={12} /> This date is in the future — double-check before submitting.
                        </p>
                    ) : (
                        <p className="text-[11px] text-muted">An admin reviews every request before the student is marked completed.</p>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                    <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
                    <Button type="submit" variant="success" disabled={mutation.isPending || !date}>
                        {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <GraduationCap size={14} />}
                        Submit request
                    </Button>
                </div>
            </form>
        </div>
    );
}

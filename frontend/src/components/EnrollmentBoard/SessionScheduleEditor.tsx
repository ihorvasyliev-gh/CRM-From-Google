import { useId, useState } from 'react';
import { Clock, MapPin, Plus, Repeat, X } from 'lucide-react';
import { DateInput } from '../ui/DatePicker';
import { formatDateLongWithWeekday } from '../../lib/dateUtils';
import { sessionDays, weeklyDates, type CourseSession, type SessionDay } from '../../lib/courseSessions';

interface SessionScheduleEditorProps {
    session: CourseSession;
    onChange: (patch: Partial<Omit<CourseSession, 'date'>>) => void;
    /** Heading above the editor, e.g. "Option 1" when the student picks one of several dates */
    title?: string;
    /** Places used before, offered as suggestions */
    locationSuggestions?: string[];
}

const timeInput = 'w-full min-w-0 px-2.5 py-2 border border-border-subtle rounded-lg text-sm bg-surface focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 tabular-nums';
const smallBtn = 'inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/** YYYY-MM-DD `n` days after `date`. */
function addDays(date: string, n: number): string {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Time, place and days of one course date in the invite dialog. */
export default function SessionScheduleEditor({ session, onChange, title, locationSuggestions = [] }: SessionScheduleEditorProps) {
    const uid = useId();
    const days = sessionDays(session);
    // Days whose own time is shown (a day with its own time is always shown)
    const [ownTimeOpen, setOwnTimeOpen] = useState<Set<string>>(new Set());
    const [weeks, setWeeks] = useState(8);

    const setDays = (next: SessionDay[]) => {
        const byDate = new Map<string, SessionDay>();
        for (const d of next) if (d.date && !byDate.has(d.date)) byDate.set(d.date, d);
        const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
        onChange({ days: sorted.length > 1 ? sorted : null });
    };

    const changeDay = (index: number, patch: Partial<SessionDay>) =>
        setDays(days.map((d, i) => (i === index ? { ...d, ...patch } : d)));

    const toggleOwnTime = (day: SessionDay, index: number) => {
        const open = ownTimeOpen.has(day.date) || !!day.start || !!day.end;
        setOwnTimeOpen(prev => {
            const next = new Set(prev);
            if (open) next.delete(day.date); else next.add(day.date);
            return next;
        });
        // Closing goes back to the default time
        if (open) changeDay(index, { start: undefined, end: undefined });
    };

    const last = days[days.length - 1].date;
    const suggestions = [...new Set(locationSuggestions.filter(Boolean))];

    return (
        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3 space-y-3">
            {title && (
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-primary">{title}</span>
                    <span className="text-[11px] text-muted">{formatDateLongWithWeekday(session.date)} · {days.length} {days.length === 1 ? 'day' : 'days'}</span>
                </div>
            )}

            <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-2">
                <label htmlFor={`${uid}-start`} className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <Clock size={13} className="text-blue-500" /> Time
                </label>
                <div className="flex items-center gap-1.5 min-w-0">
                    <input
                        id={`${uid}-start`}
                        type="time"
                        aria-label="Start time"
                        value={session.start_time ?? ''}
                        onChange={e => onChange({ start_time: e.target.value || null })}
                        className={timeInput}
                    />
                    <span className="text-muted text-sm">–</span>
                    <input
                        type="time"
                        aria-label="End time"
                        value={session.end_time ?? ''}
                        onChange={e => onChange({ end_time: e.target.value || null })}
                        className={timeInput}
                    />
                </div>

                <label htmlFor={`${uid}-place`} className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <MapPin size={13} className="text-blue-500" /> Place
                </label>
                <input
                    id={`${uid}-place`}
                    type="text"
                    list={suggestions.length > 0 ? `${uid}-places` : undefined}
                    value={session.location ?? ''}
                    maxLength={500}
                    placeholder="Address or room"
                    onChange={e => onChange({ location: e.target.value === '' ? null : e.target.value })}
                    className="w-full min-w-0 px-2.5 py-2 border border-border-subtle rounded-lg text-sm bg-surface focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
                {suggestions.length > 0 && (
                    <datalist id={`${uid}-places`}>
                        {suggestions.map(l => <option key={l} value={l} />)}
                    </datalist>
                )}
            </div>

            <div>
                <div className="text-xs font-medium text-muted mb-1.5">
                    Course days <span className="opacity-70">— the course runs on all of them</span>
                </div>
                <ul className="space-y-1.5">
                    {days.map((d, i) => {
                        const ownTime = ownTimeOpen.has(d.date) || !!d.start || !!d.end;
                        return (
                            <li key={d.date} className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-10 shrink-0 text-[11px] font-semibold text-muted">Day {i + 1}</span>
                                    {i === 0 ? (
                                        <span className="flex-1 min-w-0 px-2.5 py-2 text-sm font-semibold text-status-invited">
                                            {formatDateLongWithWeekday(d.date)}
                                        </span>
                                    ) : (
                                        <DateInput
                                            value={d.date}
                                            min={addDays(session.date, 1)}
                                            onChange={v => v && changeDay(i, { date: v })}
                                            className="flex-1 min-w-0 px-2.5 py-2 border border-border-subtle rounded-lg text-sm bg-surface"
                                        />
                                    )}
                                    {days.length > 1 && <button
                                        type="button"
                                        aria-pressed={ownTime}
                                        aria-label={`Day ${i + 1}: ${ownTime ? 'use the usual time' : 'set its own time'}`}
                                        title={ownTime ? 'Use the usual time' : 'Different time on this day'}
                                        onClick={() => toggleOwnTime(d, i)}
                                        className={`p-1.5 rounded-lg border transition-colors ${ownTime ? 'text-status-invited bg-blue-500/10 border-blue-500/30' : 'text-muted border-transparent hover:border-border-subtle hover:text-primary'}`}
                                    >
                                        <Clock size={14} />
                                    </button>}
                                    {i > 0 ? (
                                        <button
                                            type="button"
                                            aria-label={`Remove day ${i + 1}`}
                                            onClick={() => setDays(days.filter((_, j) => j !== i))}
                                            className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    ) : days.length > 1 && <span className="w-[28px] shrink-0" aria-hidden="true" />}
                                </div>
                                {ownTime && days.length > 1 && (
                                    <div className="flex items-center gap-1.5 pl-12 pr-[72px]">
                                        <input
                                            type="time"
                                            aria-label={`Day ${i + 1} start time`}
                                            value={d.start ?? session.start_time ?? ''}
                                            onChange={e => changeDay(i, { start: e.target.value || undefined })}
                                            className={timeInput}
                                        />
                                        <span className="text-muted text-sm">–</span>
                                        <input
                                            type="time"
                                            aria-label={`Day ${i + 1} end time`}
                                            value={d.end ?? session.end_time ?? ''}
                                            onChange={e => changeDay(i, { end: e.target.value || undefined })}
                                            className={timeInput}
                                        />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button
                        type="button"
                        onClick={() => setDays([...days, { date: addDays(last, 7) }])}
                        className={`${smallBtn} text-status-invited bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20`}
                    >
                        <Plus size={13} /> Add day
                    </button>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                        <span>or every week ×</span>
                        <input
                            type="number"
                            aria-label="Number of weeks"
                            min={2}
                            max={52}
                            value={weeks}
                            onChange={e => setWeeks(Math.min(52, Math.max(2, parseInt(e.target.value) || 2)))}
                            className="w-14 px-2 py-1.5 border border-border-subtle rounded-lg text-xs bg-surface text-center"
                        />
                        <button
                            type="button"
                            onClick={() => { setOwnTimeOpen(new Set()); setDays(weeklyDates(session.date, weeks).map(date => ({ date }))); }}
                            className={`${smallBtn} text-primary bg-surface hover:bg-surface-elevated border-border-subtle`}
                        >
                            <Repeat size={13} /> Fill
                        </button>
                    </span>
                    {days.length > 1 && (
                        <button
                            type="button"
                            onClick={() => { setOwnTimeOpen(new Set()); setDays(days.slice(0, 1)); }}
                            className="ml-auto text-xs text-muted hover:text-primary underline"
                        >
                            One day only
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

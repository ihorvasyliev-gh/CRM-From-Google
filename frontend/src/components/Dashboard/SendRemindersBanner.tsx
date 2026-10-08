import { useState } from 'react';
import { BellRing, Check, ChevronDown, Mail } from 'lucide-react';
import { ReminderItem, untilLabel } from './dashboardUtils';
import { formatDateLongWithWeekday } from '../../lib/dateUtils';
import AnimatedList from '../ui/AnimatedList';

export interface SendRemindersBannerProps {
    /** Course dates within a week whose reminder isn't marked as sent (tomorrow's wait for the day-before one) */
    items: ReminderItem[];
    onSend: (item: ReminderItem) => void;
    onMarkSent: (item: ReminderItem) => void;
}

/** Reminders listed before "Show all": the soonest dates (a busy week has 15 and filled the screen). */
const COLLAPSED_COUNT = 3;

/** Stays on the dashboard until each reminder is marked as sent. */
export default function SendRemindersBanner({ items, onSend, onMarkSent }: SendRemindersBannerProps) {
    const [expanded, setExpanded] = useState(false);
    if (items.length === 0) return null;
    // Hiding a single row would save nothing
    const collapsible = items.length > COLLAPSED_COUNT + 1;
    const shown = collapsible && !expanded ? items.slice(0, COLLAPSED_COUNT) : items;
    return (
        <div className="p-3 pl-4 rounded-2xl bg-sky-500/10 border border-sky-500/40 ring-1 ring-sky-500/20 space-y-2.5">
            <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-400 shrink-0">
                    <BellRing size={16} className="animate-pulse" />
                </span>
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-primary">
                        Send reminders — {items.length} course date{items.length > 1 ? 's' : ''} in the next 7 days
                    </p>
                    <p className="text-[11px] text-muted hidden sm:block">Remind confirmed people to come, then mark it as sent</p>
                </div>
            </div>
            <AnimatedList className="space-y-1.5">
                {shown.map(item => (
                    <li
                        key={`${item.courseId}|${item.date}`}
                        className="flex flex-wrap items-center justify-between gap-2 p-2 pl-3 rounded-xl bg-surface border border-border-subtle"
                    >
                        <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-primary truncate">{item.courseName}</p>
                            <p className="text-[11px] text-muted">
                                {formatDateLongWithWeekday(item.date)} · <span className="font-semibold text-sky-600 dark:text-sky-400">{untilLabel(item.date)}</span> · {item.confirmedCount} confirmed
                                {item.dayBefore && <> · day-before reminder</>}
                            </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                type="button"
                                onClick={() => onSend(item)}
                                className="flex items-center gap-1 h-8 px-3 text-xs font-semibold bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors cursor-pointer"
                            >
                                <Mail size={13} /> Send reminder
                            </button>
                            <button
                                type="button"
                                onClick={() => onMarkSent(item)}
                                className="flex items-center gap-1 h-8 px-3 text-xs font-semibold bg-surface text-primary border border-border-subtle rounded-lg hover:border-border-strong transition-colors cursor-pointer"
                            >
                                <Check size={13} /> I've sent it
                            </button>
                        </div>
                    </li>
                ))}
            </AnimatedList>
            {collapsible && (
                <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    aria-expanded={expanded}
                    className="w-full flex items-center justify-center gap-1 h-8 text-xs font-semibold text-sky-700 dark:text-sky-300 rounded-lg hover:bg-sky-500/10 transition-colors cursor-pointer"
                >
                    {expanded ? 'Show fewer' : `Show all ${items.length}`}
                    <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
            )}
        </div>
    );
}

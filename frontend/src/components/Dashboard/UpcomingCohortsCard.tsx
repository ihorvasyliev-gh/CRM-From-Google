import { useState } from 'react';
import { CalendarDays, Users, ChevronRight, ChevronDown } from 'lucide-react';
import { UpcomingCohortItem, daysBetween, localDateKey, untilLabel } from './dashboardUtils';
import DashboardCard from './DashboardCard';

/** Course dates shown before the "Show more" toggle (desktop grid only; mobile scrolls horizontally). */
const COLLAPSED_COUNT = 6;

export interface UpcomingCohortsCardProps {
    cohorts?: UpcomingCohortItem[];
    onNavigate?: (tab: string, filter?: any) => void;
    className?: string;
}

function dateParts(dateKey: string) {
    const d = new Date(`${dateKey}T12:00:00`);
    return {
        weekday: d.toLocaleDateString('en-IE', { weekday: 'short' }),
        day: d.getDate(),
        month: d.toLocaleDateString('en-IE', { month: 'short' }),
    };
}

export default function UpcomingCohortsCard({ cohorts = [], onNavigate, className = '' }: UpcomingCohortsCardProps) {
    const [showAll, setShowAll] = useState(false);
    const todayKey = localDateKey(new Date());
    const hiddenCount = Math.max(cohorts.length - COLLAPSED_COUNT, 0);

    const openBoard = (
        <button
            type="button"
            onClick={() => onNavigate?.('enrollments')}
            className="text-xs font-semibold text-brand-500 hover:text-brand-600 hover:underline cursor-pointer"
        >
            Open Board →
        </button>
    );

    return (
        <DashboardCard
            title="Upcoming Courses"
            subtitle={cohorts.length > 0 ? `Next ${cohorts.length} dates` : 'Confirmed course dates'}
            icon={CalendarDays}
            action={openBoard}
            className={className}
        >
            {cohorts.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-border-strong/70 text-muted">
                    <CalendarDays size={18} className="flex-shrink-0 opacity-60" />
                    <span className="text-xs">No upcoming courses scheduled</span>
                </div>
            ) : (
                <div className="flex sm:grid sm:grid-cols-2 2xl:grid-cols-3 gap-2.5 overflow-x-auto sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0 snap-x scrollbar-none">
                    {cohorts.map((c, idx) => {
                        const { weekday, day, month } = dateParts(c.date);
                        const soon = daysBetween(todayKey, c.date) <= 7;
                        return (
                            <button
                                type="button"
                                key={`${c.date}:::${c.courseId}`}
                                onClick={() => onNavigate?.('enrollments', { courseId: c.courseId, courseDate: c.date })}
                                aria-label={`Course: ${c.courseName} on ${c.date}, ${c.confirmedCount} confirmed`}
                                className={`group snap-start flex-shrink-0 w-72 sm:w-auto ${!showAll && idx >= COLLAPSED_COUNT ? 'sm:hidden' : 'sm:flex'} flex items-center gap-3 p-2.5 rounded-xl bg-surface-elevated border border-border-subtle hover:border-brand-500/40 hover:shadow-card-hover transition-all duration-200 text-left active:scale-[0.98] cursor-pointer`}
                            >
                                <span
                                    className={`flex flex-col items-center justify-center w-12 h-14 rounded-lg flex-shrink-0 leading-none ${
                                        soon ? 'bg-brand-500 text-white shadow-glow-sm' : 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                                    }`}
                                >
                                    <span className="text-[10px] font-semibold uppercase opacity-80">{weekday}</span>
                                    <span className="text-lg font-bold tabular-nums my-0.5">{day}</span>
                                    <span className="text-[10px] font-semibold uppercase opacity-80">{month}</span>
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-semibold text-primary truncate" title={c.courseName}>
                                        {c.courseName}
                                    </span>
                                    <span className="mt-1 flex items-center gap-2 text-[11px] whitespace-nowrap">
                                        <span className={soon ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-muted'}>
                                            {untilLabel(c.date, todayKey)}
                                        </span>
                                        <span className="w-1 h-1 rounded-full bg-border-strong" aria-hidden />
                                        <span className="inline-flex items-center gap-1 font-semibold text-success">
                                            <Users size={11} />
                                            {c.confirmedCount} confirmed
                                        </span>
                                    </span>
                                </span>
                                <ChevronRight size={16} className="text-muted group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                            </button>
                        );
                    })}
                </div>
            )}

            {hiddenCount > 0 && (
                <button
                    type="button"
                    onClick={() => setShowAll(v => !v)}
                    aria-expanded={showAll}
                    className="hidden sm:flex mt-2.5 w-full items-center justify-center gap-1 h-8 rounded-lg text-xs font-semibold text-muted hover:text-brand-500 hover:bg-brand-500/5 transition-colors cursor-pointer"
                >
                    <ChevronDown size={14} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
                    {showAll ? 'Show less' : `Show ${hiddenCount} more`}
                </button>
            )}
        </DashboardCard>
    );
}

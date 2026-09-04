import { Calendar, Users, ArrowUpRight } from 'lucide-react';
import { UpcomingCohortItem } from './dashboardUtils';
import { formatDayDateShort } from '../../lib/dateUtils';

export interface UpcomingCohortsCardProps {
    cohorts?: UpcomingCohortItem[];
    onNavigate?: (tab: string, filter?: any) => void;
}

export default function UpcomingCohortsCard({ cohorts = [], onNavigate }: UpcomingCohortsCardProps) {
    if (cohorts.length === 0) {
        return (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border-subtle flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2 text-muted">
                    <Calendar size={16} />
                    <span className="text-xs">No upcoming course cohorts scheduled</span>
                </div>
                <button
                    type="button"
                    onClick={() => onNavigate?.('enrollments')}
                    className="text-xs font-bold text-brand-500 hover:underline cursor-pointer"
                >
                    Open Board →
                </button>
            </div>
        );
    }

    return (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border-subtle shadow-card">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={14} className="text-brand-500" />
                    Upcoming Cohorts by Date
                </h3>
                <span className="text-[11px] text-muted">
                    Next {cohorts.length} dates
                </span>
            </div>

            {/* Mobile horizontal scroll / Desktop grid */}
            <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {cohorts.map(c => (
                    <button
                        type="button"
                        key={`${c.date}:::${c.courseId}`}
                        onClick={() => onNavigate?.('enrollments', { courseId: c.courseId, courseDate: c.date })}
                        aria-label={`Cohort: ${c.courseName} on ${c.date}, ${c.confirmedCount} confirmed`}
                        className="flex-shrink-0 w-52 sm:w-auto p-2.5 sm:p-3 rounded-xl bg-surface-elevated/50 hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/30 transition-all duration-300 text-left group active:scale-[0.98] shadow-xs cursor-pointer"
                    >
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-500/20">
                                📅 {formatDayDateShort(c.date)}
                            </span>
                            <ArrowUpRight size={13} className="text-muted group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <span className="block text-xs font-semibold text-primary truncate leading-tight mb-1.5" title={c.courseName}>
                            {c.courseName}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted">
                            <Users size={12} className="text-emerald-500" />
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                                {c.confirmedCount} confirmed
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

import type { JSX } from 'react';
import { AlarmClock, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { ExpiredInviteItem } from './dashboardUtils';
import DashboardCard from '../ui/Card';
import StudentAvatar from './StudentAvatar';

export interface ExpiredInvitesCardProps {
    items: ExpiredInviteItem[];
    onNavigate?: (tab: string, filter?: any) => void;
    onOpenStudentDetail?: (studentId: string) => void;
    className?: string;
}

const MAX_VISIBLE = 5;

export default function ExpiredInvitesCard({
    items,
    onNavigate,
    onOpenStudentDetail,
    className = '',
}: ExpiredInvitesCardProps): JSX.Element {
    if (items.length === 0) {
        return (
            <div className={`flex items-center gap-3 p-4 rounded-2xl bg-surface border border-border-subtle shadow-card ${className}`}>
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-success/15 text-success shrink-0">
                    <CheckCircle2 size={16} />
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary">All invites on track</p>
                    <p className="text-[11px] text-muted">No students currently past their response deadline</p>
                </div>
            </div>
        );
    }

    const overdue = items.filter(i => i.isExpired).length;
    const dueSoon = items.length - overdue;

    return (
        <DashboardCard
            title="Expired Invites"
            subtitle="Awaiting response past deadline"
            icon={AlarmClock}
            iconClassName="text-amber-600 dark:text-amber-400 bg-amber-500/15"
            className={`ring-1 ring-amber-500/20 ${className}`}
            action={
                <div className="flex items-center gap-1.5">
                    {overdue > 0 && (
                        <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-danger/10 text-danger border border-danger/20 tabular-nums">
                            {overdue} overdue
                        </span>
                    )}
                    {dueSoon > 0 && (
                        <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 tabular-nums">
                            {dueSoon} due soon
                        </span>
                    )}
                </div>
            }
        >
            <ul className="divide-y divide-border-subtle -mx-2">
                {items.slice(0, MAX_VISIBLE).map(item => (
                    <li key={item.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-elevated transition-colors">
                        <StudentAvatar name={item.studentName} seed={item.studentId} size="sm" />
                        <div className="min-w-0 flex-1">
                            <button
                                type="button"
                                onClick={() => {
                                    if (onOpenStudentDetail) {
                                        onOpenStudentDetail(item.studentId);
                                    } else {
                                        onNavigate?.('enrollments', { courseId: item.courseId });
                                    }
                                }}
                                className="block max-w-full text-[13px] font-semibold text-primary hover:text-brand-500 hover:underline truncate cursor-pointer text-left"
                            >
                                {item.studentName}
                            </button>
                            <span className="block text-[11px] text-muted truncate">{item.courseName}</span>
                        </div>
                        <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${
                                item.isExpired
                                    ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                            }`}
                        >
                            {item.timeLabel}
                        </span>
                        <button
                            type="button"
                            onClick={() => onNavigate?.('enrollments', { courseId: item.courseId })}
                            aria-label={`Open ${item.courseName} board`}
                            title={`Open ${item.courseName} board`}
                            className="p-1.5 rounded-lg text-muted hover:text-brand-500 hover:bg-brand-500/10 transition-colors cursor-pointer shrink-0"
                        >
                            <ArrowUpRight size={14} />
                        </button>
                    </li>
                ))}
            </ul>

            {items.length > MAX_VISIBLE && (
                <button
                    type="button"
                    onClick={() => onNavigate?.('enrollments', { status: 'invited' })}
                    className="mt-2 w-full text-center text-xs font-semibold text-brand-500 hover:bg-brand-500/5 rounded-lg py-2 cursor-pointer transition-colors"
                >
                    View all {items.length} in Kanban →
                </button>
            )}
        </DashboardCard>
    );
}

import type { JSX } from 'react';
import { AlertCircle, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { ExpiredInviteItem } from './dashboardUtils';

export interface ExpiredInvitesCardProps {
    items: ExpiredInviteItem[];
    onNavigate?: (tab: string, filter?: any) => void;
    onOpenStudentDetail?: (studentId: string) => void;
}

export default function ExpiredInvitesCard({
    items,
    onNavigate,
    onOpenStudentDetail,
}: ExpiredInvitesCardProps): JSX.Element {
    const hasItems = items.length > 0;

    return (
        <div
            className={`rounded-2xl border transition-all duration-300 ${
                hasItems
                    ? 'bg-surface border-amber-500/30 shadow-card'
                    : 'bg-surface/60 border-border-subtle p-3.5 sm:p-4'
            }`}
        >
            {hasItems ? (
                <div className="p-3.5 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                <AlertCircle size={16} />
                            </span>
                            <div>
                                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
                                    Expired Invites
                                </h3>
                                <span className="text-[10px] text-muted">Awaiting response past deadline</span>
                            </div>
                        </div>
                        <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full border border-amber-500/25">
                            {items.length} overdue
                        </span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {items.slice(0, 5).map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-elevated/60 hover:bg-surface-elevated border border-border-subtle hover:border-amber-500/30 transition-all text-left group"
                            >
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
                                        className="text-xs font-bold text-primary hover:text-brand-500 hover:underline truncate block cursor-pointer"
                                    >
                                        {item.studentName}
                                    </button>
                                    <span className="text-[10px] text-muted truncate block">
                                        {item.courseName}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                            item.isExpired
                                                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                                : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                        }`}
                                    >
                                        {item.timeLabel}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onNavigate?.('enrollments', { courseId: item.courseId })}
                                        aria-label={`Open ${item.courseName} board`}
                                        className="p-1 rounded-lg text-muted hover:text-amber-600 hover:bg-amber-500/10 transition-colors cursor-pointer"
                                    >
                                        <ArrowUpRight size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {items.length > 5 && (
                        <button
                            type="button"
                            onClick={() => onNavigate?.('enrollments', { status: 'invited' })}
                            className="mt-2.5 w-full text-center text-[11px] font-bold text-brand-500 hover:underline py-1 cursor-pointer"
                        >
                            View all {items.length} in Kanban →
                        </button>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-2.5">
                    <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                        <CheckCircle2 size={16} />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-primary">All invites on track</p>
                        <p className="text-[10px] text-muted">No students currently past their response deadline</p>
                    </div>
                </div>
            )}
        </div>
    );
}

import { useMemo } from 'react';
import { ArrowRight, Calendar, Check, CheckCircle2, CheckSquare, Pin, Plus } from 'lucide-react';
import type { NavigateFn } from '../../lib/navigation';
import { todayISO } from '../../lib/dateUtils';
import {
    computeTodoStats,
    formatDueLabel,
    getDueState,
    selectDashboardTodos,
    type AdminTodo,
} from '../../lib/todos';
import { useAdminTodos, useUpdateTodo } from '../../hooks/useTodos';
import { toast } from '../../lib/toast';
import { errorMessage } from '../../lib/errors';
import DashboardCard from '../ui/Card';
import AnimatedList from '../ui/AnimatedList';
import { CATEGORY_META } from '../Todos/todoMeta';

export interface TodoSummaryCardProps {
    onNavigate?: NavigateFn;
    className?: string;
}

const MAX_VISIBLE = 5;

export default function TodoSummaryCard({ onNavigate, className = '' }: TodoSummaryCardProps) {
    const { data, isLoading } = useAdminTodos();
    const updateTodo = useUpdateTodo();
    const today = todayISO();

    const todos = useMemo(() => data?.rows ?? [], [data?.rows]);
    const available = data?.available ?? true;
    const stats = useMemo(() => computeTodoStats(todos, today), [todos, today]);
    const topItems = useMemo(() => selectDashboardTodos(todos, today, MAX_VISIBLE), [todos, today]);

    // Stay invisible while migration 96 isn't applied yet so the dashboard isn't cluttered
    if (!available) return null;

    const handleComplete = async (todo: AdminTodo) => {
        const previousStatus = todo.status;
        try {
            await updateTodo.mutateAsync({ id: todo.id, patch: { status: 'done' } });
            toast.success(`Completed "${todo.title}"`, {
                action: {
                    label: 'Undo',
                    onClick: () => {
                        void updateTodo.mutateAsync({ id: todo.id, patch: { status: previousStatus } });
                    },
                },
            });
        } catch (err) {
            toast.error(errorMessage(err, 'Could not complete to-do'));
        }
    };

    if (!isLoading && topItems.length === 0) {
        return (
            <div className={`flex items-center justify-between gap-3 p-4 rounded-2xl bg-surface border border-border-subtle shadow-card ${className}`}>
                <div className="flex items-center gap-3 min-w-0">
                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0">
                        <CheckCircle2 size={16} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-primary">Team To-Do is clear</p>
                        <p className="text-xs text-muted">Shared notes, bookings and tasks for admins</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onNavigate?.('todos', { newTodo: true })}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-600 dark:text-brand-400 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                >
                    <Plus size={13} />
                    Add
                </button>
            </div>
        );
    }

    return (
        <DashboardCard
            title="Team To-Do"
            subtitle="Pinned notes, bookings & open tasks"
            icon={CheckSquare}
            tone="brand"
            className={className}
            action={
                <div className="flex items-center gap-1.5">
                    {stats.overdueCount > 0 && (
                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-danger/10 text-status-rejected border border-danger/20 tabular-nums">
                            {stats.overdueCount} overdue
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => onNavigate?.('todos', { newTodo: true })}
                        aria-label="Add team to-do"
                        title="Add team to-do"
                        className="hit-area inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-600 dark:text-brand-400 transition-colors cursor-pointer"
                    >
                        <Plus size={14} />
                    </button>
                </div>
            }
        >
            {isLoading ? (
                <div className="space-y-2 py-1">
                    <div className="h-9 rounded-xl bg-surface-elevated animate-pulse" />
                    <div className="h-9 rounded-xl bg-surface-elevated animate-pulse" />
                </div>
            ) : (
                <>
                    <AnimatedList className="divide-y divide-border-subtle -mx-2">
                        {topItems.map(item => {
                            const dueState = getDueState(item.due_date, item.status, today);
                            const dueLabel = formatDueLabel(item.due_date, item.status, today);
                            const cat = CATEGORY_META[item.category];
                            return (
                                <li
                                    key={item.id}
                                    className="flex items-start gap-2.5 px-2 py-2 rounded-xl hover:bg-surface-elevated transition-colors"
                                >
                                    <button
                                        type="button"
                                        onClick={() => void handleComplete(item)}
                                        aria-label={`Complete "${item.title}"`}
                                        className="mt-0.5 flex items-center justify-center w-4 h-4 rounded-sm border-2 border-border-strong hover:border-brand-500 text-transparent hover:text-brand-500 transition-colors shrink-0 cursor-pointer"
                                    >
                                        <Check size={10} strokeWidth={3} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onNavigate?.('todos', { todoId: item.id })}
                                        className="flex-1 min-w-0 text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            {item.is_pinned && <Pin size={11} className="text-amber-500 shrink-0" />}
                                            <span className="text-[13px] font-semibold text-primary hover:text-brand-500 truncate">
                                                {item.title}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium text-muted`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${cat.dotCls}`} aria-hidden />
                                                {cat.shortLabel}
                                            </span>
                                            {item.due_date && (
                                                <span
                                                    className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                                                        dueState === 'overdue'
                                                            ? 'text-status-rejected'
                                                            : dueState === 'today'
                                                                ? 'text-status-requested'
                                                                : 'text-muted'
                                                    }`}
                                                >
                                                    <Calendar size={10} />
                                                    {dueLabel}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </AnimatedList>

                    <button
                        type="button"
                        onClick={() => onNavigate?.('todos')}
                        className="mt-2 w-full inline-flex items-center justify-center gap-1 text-xs font-semibold text-brand-500 hover:bg-brand-500/5 rounded-lg py-2 cursor-pointer transition-colors"
                    >
                        <span>
                            {stats.openCount > MAX_VISIBLE
                                ? `View all ${stats.openCount} open items`
                                : 'Open Team To-Do'}
                        </span>
                        <ArrowRight size={13} />
                    </button>
                </>
            )}
        </DashboardCard>
    );
}

import {
    BookOpen,
    Calendar,
    Check,
    Clock,
    ListChecks,
    MessageSquare,
    Pin,
    RotateCcw,
    Trash2,
    User,
} from 'lucide-react';
import { formatShortDate, todayISO } from '../../lib/dateUtils';
import { fullName } from '../../lib/types';
import {
    adminShortName,
    checklistProgress,
    formatDueLabel,
    getDueState,
    type AdminProfile,
    type AdminTodo,
} from '../../lib/todos';
import { IconButton } from '../ui/Button';
import AdminAvatar from './AdminAvatar';
import { CATEGORY_META, formatRelativeTimestamp, PRIORITY_META } from './todoMeta';

export interface TodoRowProps {
    todo: AdminTodo;
    profilesById: ReadonlyMap<string, AdminProfile>;
    onOpen: (todo: AdminTodo) => void;
    onToggleDone: (todo: AdminTodo) => void;
    onToggleInProgress: (todo: AdminTodo) => void;
    onTogglePin: (todo: AdminTodo) => void;
    onDelete: (todo: AdminTodo) => void;
    onOpenCourse?: (courseId: string, courseDate?: string | null) => void;
    onOpenStudent?: (studentId: string) => void;
}

export default function TodoRow({
    todo,
    profilesById,
    onOpen,
    onToggleDone,
    onToggleInProgress,
    onTogglePin,
    onDelete,
    onOpenCourse,
    onOpenStudent,
}: TodoRowProps) {
    const isDone = todo.status === 'done';
    const isInProgress = todo.status === 'in_progress';
    const today = todayISO();
    const dueState = getDueState(todo.due_date, todo.status, today);
    const dueLabel = formatDueLabel(todo.due_date, todo.status, today);
    const cat = CATEGORY_META[todo.category];
    const CatIcon = cat.icon;
    const priority = PRIORITY_META[todo.priority];
    const PriorityIcon = priority.icon;
    const progress = checklistProgress(todo.checklist);

    const assignee = todo.assignee_id ? profilesById.get(todo.assignee_id) : null;
    const author = todo.created_by ? profilesById.get(todo.created_by) : null;
    const completer = todo.completed_by ? profilesById.get(todo.completed_by) : null;

    const duePillCls =
        dueState === 'overdue'
            ? 'bg-danger/10 text-status-rejected border-danger/25'
            : dueState === 'today'
                ? 'bg-warning/15 text-status-requested border-warning/30'
                : 'bg-surface-elevated text-muted border-border-subtle';

    return (
        <li
            className={`group relative flex items-start gap-3 px-3.5 sm:px-4 py-3 transition-colors hover:bg-surface-elevated/50 ${
                todo.is_pinned && !isDone ? 'bg-amber-500/[0.03]' : ''
            }`}
        >
            {/* Complete Checkbox */}
            <button
                type="button"
                onClick={() => onToggleDone(todo)}
                aria-label={isDone ? `Mark "${todo.title}" as open` : `Mark "${todo.title}" as done`}
                aria-pressed={isDone}
                className={`mt-0.5 flex items-center justify-center w-5 h-5 rounded-md border-2 transition-all shrink-0 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                    isDone
                        ? 'bg-success border-success text-white'
                        : isInProgress
                            ? 'border-brand-500 bg-brand-500/10 hover:bg-brand-500/20 text-transparent hover:text-brand-500'
                            : 'border-border-strong bg-surface hover:border-brand-500 text-transparent hover:text-brand-500/70'
                }`}
            >
                <Check size={12} strokeWidth={3} />
            </button>

            {/* Main Clickable Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                    <button
                        type="button"
                        onClick={() => onOpen(todo)}
                        className="text-left flex-1 min-w-0 group/title cursor-pointer focus-visible:outline-hidden"
                    >
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {todo.is_pinned && !isDone && (
                                <Pin size={12} className="text-amber-500 shrink-0" aria-label="Pinned" />
                            )}
                            <span
                                className={`text-sm font-semibold leading-snug group-hover/title:text-brand-600 dark:group-hover/title:text-brand-400 transition-colors ${
                                    isDone ? 'line-through text-muted' : 'text-primary'
                                }`}
                            >
                                {todo.title}
                            </span>
                        </div>
                        {todo.description && (
                            <p className="text-xs text-muted line-clamp-1 mt-0.5">{todo.description}</p>
                        )}
                    </button>
                </div>

                {/* Pills & Metadata Row */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {/* Category */}
                    <span className={`inline-flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-semibold border ${cat.pillCls}`}>
                        <CatIcon size={11} />
                        {cat.shortLabel}
                    </span>

                    {/* In Progress badge */}
                    {isInProgress && (
                        <span className="inline-flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-semibold border bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/25">
                            <Clock size={11} />
                            In Progress
                        </span>
                    )}

                    {/* Priority (High / Urgent only) */}
                    {!isDone && todo.priority !== 'normal' && (
                        <span className={`inline-flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-semibold border ${priority.pillCls}`}>
                            {PriorityIcon && <PriorityIcon size={11} />}
                            {priority.label}
                        </span>
                    )}

                    {/* Due Date */}
                    {todo.due_date && (
                        <span className={`inline-flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-semibold border tabular-nums ${duePillCls}`}>
                            <Calendar size={11} />
                            {dueLabel}
                        </span>
                    )}

                    {/* Checklist Progress */}
                    {progress.total > 0 && (
                        <button
                            type="button"
                            onClick={() => onOpen(todo)}
                            className={`inline-flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-semibold border tabular-nums cursor-pointer transition-colors ${
                                progress.done === progress.total
                                    ? 'bg-success/10 text-status-confirmed border-success/25'
                                    : 'bg-surface-elevated text-muted border-border-subtle hover:text-primary'
                            }`}
                            title="Open checklist"
                        >
                            <ListChecks size={11} />
                            {progress.done}/{progress.total}
                        </button>
                    )}

                    {/* Comments count */}
                    {todo.comment_count > 0 && (
                        <button
                            type="button"
                            onClick={() => onOpen(todo)}
                            className="inline-flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-semibold border bg-surface-elevated text-muted border-border-subtle hover:text-primary cursor-pointer tabular-nums"
                            title={`${todo.comment_count} comment${todo.comment_count === 1 ? '' : 's'}`}
                        >
                            <MessageSquare size={11} />
                            {todo.comment_count}
                        </button>
                    )}

                    {/* Linked Course (+ optional Date) */}
                    {todo.course_id && todo.courses && (
                        <button
                            type="button"
                            onClick={() => onOpenCourse?.(todo.course_id!, todo.course_date)}
                            className="inline-flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-semibold border bg-brand-500/8 text-brand-600 dark:text-brand-400 border-brand-500/20 hover:bg-brand-500/15 transition-colors cursor-pointer max-w-[220px]"
                            title="Open course on Enrollment Board"
                        >
                            <BookOpen size={11} className="shrink-0" />
                            <span className="truncate">
                                {todo.courses.name}
                                {todo.course_date ? ` · ${formatShortDate(todo.course_date)}` : ''}
                            </span>
                        </button>
                    )}

                    {/* Linked Student */}
                    {todo.student_id && todo.students && (
                        <button
                            type="button"
                            onClick={() => onOpenStudent?.(todo.student_id!)}
                            className="inline-flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-semibold border bg-info/10 text-status-invited border-info/25 hover:bg-info/20 transition-colors cursor-pointer max-w-[180px]"
                            title="Open student details"
                        >
                            <User size={11} className="shrink-0" />
                            <span className="truncate">{fullName(todo.students) || 'Student'}</span>
                        </button>
                    )}

                    {/* Assignee + Author / Completed audit */}
                    <div className="inline-flex items-center gap-2 ml-auto text-[11px] text-muted">
                        {todo.assignee_id && (
                            <span className="inline-flex items-center gap-1 text-primary font-medium">
                                <AdminAvatar profile={assignee} seed={todo.assignee_id} />
                                <span>{adminShortName(assignee)}</span>
                            </span>
                        )}
                        <span className="hidden sm:inline">
                            {isDone && todo.completed_at
                                ? `Done by ${adminShortName(completer)} · ${formatRelativeTimestamp(todo.completed_at)}`
                                : `Added by ${adminShortName(author)} · ${formatRelativeTimestamp(todo.created_at)}`}
                        </span>
                    </div>
                </div>
            </div>

            {/* Quick Row Actions */}
            <div className="flex items-center gap-0.5 shrink-0 sm:opacity-70 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                {!isDone ? (
                    <>
                        <IconButton
                            size="sm"
                            tone="brand"
                            active={isInProgress}
                            label={isInProgress ? 'Move back to Open' : 'Mark In Progress'}
                            onClick={() => onToggleInProgress(todo)}
                        >
                            <Clock size={14} />
                        </IconButton>
                        <IconButton
                            size="sm"
                            active={todo.is_pinned}
                            label={todo.is_pinned ? 'Unpin' : 'Pin to top'}
                            onClick={() => onTogglePin(todo)}
                        >
                            <Pin size={14} />
                        </IconButton>
                    </>
                ) : (
                    <IconButton
                        size="sm"
                        tone="brand"
                        label="Reopen task"
                        onClick={() => onToggleDone(todo)}
                    >
                        <RotateCcw size={14} />
                    </IconButton>
                )}
                <IconButton
                    size="sm"
                    tone="danger"
                    label="Delete to-do"
                    onClick={() => onDelete(todo)}
                >
                    <Trash2 size={14} />
                </IconButton>
            </div>
        </li>
    );
}

import { useEffect, useMemo, useState } from 'react';
import {
    ArrowUpRight,
    BookOpen,
    Check,
    CheckSquare,
    ListChecks,
    MessageSquare,
    Pin,
    Plus,
    Send,
    Trash2,
    User,
    X,
} from 'lucide-react';
import type { Course } from '../../lib/types';
import { formatShortDate, todayISO } from '../../lib/dateUtils';
import {
    addDaysISO,
    adminDisplayName,
    checklistProgress,
    createChecklistItem,
    TODO_CATEGORIES,
    TODO_PRIORITIES,
    TODO_STATUSES,
    type AdminProfile,
    type AdminTodo,
    type TodoCategory,
    type TodoChecklistItem,
    type TodoLinkedStudent,
    type TodoPriority,
    type TodoStatus,
} from '../../lib/todos';
import { useAddTodoComment, useDeleteTodoComment, useTodoComments, type UpdateTodoInput } from '../../hooks/useTodos';
import { useCourseSessions } from '../../hooks/useCourseSessions';
import { toast } from '../../lib/toast';
import { errorMessage } from '../../lib/errors';
import Modal from '../ui/Modal';
import { Button, IconButton } from '../ui/Button';
import { DateInput } from '../ui/DatePicker';
import { Segmented } from '../ui/Tabs';
import { fieldCls, inputCls, labelCls, panelCls } from '../ui/styles';
import AdminAvatar from './AdminAvatar';
import { CATEGORY_META, formatRelativeTimestamp, PRIORITY_META, STATUS_META } from './todoMeta';
import TodoStudentPicker from './TodoStudentPicker';

export interface TodoDetailModalProps {
    open: boolean;
    todo: AdminTodo | null;
    courses: readonly Course[];
    profiles: readonly AdminProfile[];
    profilesById: ReadonlyMap<string, AdminProfile>;
    currentUserId?: string;
    saving?: boolean;
    onClose: () => void;
    onSave: (input: UpdateTodoInput) => Promise<void> | void;
    onRequestDelete: (todo: AdminTodo) => void;
    onOpenCourse?: (courseId: string, courseDate?: string | null) => void;
    onOpenStudent?: (studentId: string) => void;
}

export default function TodoDetailModal({
    open,
    todo,
    courses,
    profiles,
    profilesById,
    currentUserId,
    saving = false,
    onClose,
    onSave,
    onRequestDelete,
    onOpenCourse,
    onOpenStudent,
}: TodoDetailModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<TodoCategory>('general');
    const [status, setStatus] = useState<TodoStatus>('open');
    const [priority, setPriority] = useState<TodoPriority>('normal');
    const [isPinned, setIsPinned] = useState(false);
    const [dueDate, setDueDate] = useState('');
    const [assigneeId, setAssigneeId] = useState('');
    const [courseId, setCourseId] = useState('');
    const [courseDate, setCourseDate] = useState('');
    const [student, setStudent] = useState<TodoLinkedStudent | null>(null);
    const [checklist, setChecklist] = useState<TodoChecklistItem[]>([]);
    const [newCheckText, setNewCheckText] = useState('');
    const [commentText, setCommentText] = useState('');

    // Re-sync local form state whenever a different todo is opened
    const todoId = todo?.id ?? null;
    useEffect(() => {
        if (!todo) return;
        setTitle(todo.title);
        setDescription(todo.description);
        setCategory(todo.category);
        setStatus(todo.status);
        setPriority(todo.priority);
        setIsPinned(todo.is_pinned);
        setDueDate(todo.due_date ?? '');
        setAssigneeId(todo.assignee_id ?? '');
        setCourseId(todo.course_id ?? '');
        setCourseDate(todo.course_date ?? '');
        setStudent(todo.students ?? null);
        setChecklist(todo.checklist);
        setNewCheckText('');
        setCommentText('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todoId]);

    const sessionsMap = useCourseSessions(open && Boolean(courseId));
    const suggestedCourseDates = useMemo(() => {
        if (!courseId) return [];
        const today = todayISO();
        const prefix = `${courseId}|`;
        const dates: string[] = [];
        sessionsMap.forEach((session, key) => {
            if (key.startsWith(prefix) && session.date >= today) {
                dates.push(session.date);
            }
        });
        return dates.sort().slice(0, 5);
    }, [courseId, sessionsMap]);

    const { data: comments = [], isLoading: commentsLoading } = useTodoComments(open ? todoId : null);
    const addComment = useAddTodoComment();
    const deleteComment = useDeleteTodoComment();

    if (!todo) return null;

    const isDirty =
        title.trim() !== todo.title ||
        description.trim() !== todo.description ||
        category !== todo.category ||
        status !== todo.status ||
        priority !== todo.priority ||
        isPinned !== todo.is_pinned ||
        (dueDate || null) !== todo.due_date ||
        (assigneeId || null) !== todo.assignee_id ||
        (courseId || null) !== todo.course_id ||
        (courseId ? (courseDate || null) : null) !== todo.course_date ||
        (student?.id ?? null) !== todo.student_id ||
        JSON.stringify(checklist) !== JSON.stringify(todo.checklist);

    const handleSave = async () => {
        const trimmed = title.trim();
        if (!trimmed) {
            toast.error('Title cannot be empty');
            return;
        }
        await onSave({
            id: todo.id,
            patch: {
                title: trimmed,
                description: description.trim(),
                category,
                status,
                priority,
                is_pinned: isPinned,
                due_date: dueDate || null,
                assignee_id: assigneeId || null,
                course_id: courseId || null,
                course_date: courseId ? (courseDate || null) : null,
                student_id: student?.id ?? null,
                checklist,
            },
        });
        onClose();
    };

    const persistChecklist = async (next: TodoChecklistItem[]) => {
        setChecklist(next);
        try {
            await onSave({ id: todo.id, patch: { checklist: next } });
        } catch (err) {
            toast.error(errorMessage(err, 'Could not update checklist'));
        }
    };

    const handleAddChecklistItem = async () => {
        const trimmed = newCheckText.trim();
        if (!trimmed) return;
        const next = [...checklist, createChecklistItem(trimmed)];
        setNewCheckText('');
        await persistChecklist(next);
    };

    const handleToggleChecklistItem = async (itemId: string) => {
        const next = checklist.map(item => (item.id === itemId ? { ...item, done: !item.done } : item));
        await persistChecklist(next);
    };

    const handleRemoveChecklistItem = async (itemId: string) => {
        const next = checklist.filter(item => item.id !== itemId);
        await persistChecklist(next);
    };

    const handlePostComment = async () => {
        const trimmed = commentText.trim();
        if (!trimmed || addComment.isPending) return;
        try {
            await addComment.mutateAsync({ todoId: todo.id, body: trimmed });
            setCommentText('');
        } catch (err) {
            toast.error(errorMessage(err, 'Could not post comment'));
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            await deleteComment.mutateAsync({ id: commentId, todoId: todo.id });
        } catch (err) {
            toast.error(errorMessage(err, 'Could not delete comment'));
        }
    };

    const author = todo.created_by ? profilesById.get(todo.created_by) : null;
    const completer = todo.completed_by ? profilesById.get(todo.completed_by) : null;
    const progress = checklistProgress(checklist);
    const today = todayISO();

    const statusOptions = TODO_STATUSES.map(s => {
        const meta = STATUS_META[s];
        const Icon = meta.icon;
        return { value: s, label: meta.label, icon: <Icon size={13} /> };
    });

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="xl"
            sheetOnMobile
            icon={CheckSquare}
            tone="brand"
            title="To-Do Details"
            subtitle={`Created by ${adminDisplayName(author)} · ${formatRelativeTimestamp(todo.created_at)}${
                todo.completed_at ? ` · Completed by ${adminDisplayName(completer)} ${formatRelativeTimestamp(todo.completed_at)}` : ''
            }`}
            headerAction={
                <div className="flex items-center gap-1">
                    <IconButton
                        size="sm"
                        active={isPinned}
                        label={isPinned ? 'Unpin' : 'Pin to top'}
                        onClick={() => setIsPinned(p => !p)}
                    >
                        <Pin size={15} />
                    </IconButton>
                    <IconButton
                        size="sm"
                        tone="danger"
                        label="Delete to-do"
                        onClick={() => onRequestDelete(todo)}
                    >
                        <Trash2 size={15} />
                    </IconButton>
                </div>
            }
            footer={
                <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                        {isDirty ? 'Unsaved changes' : 'All changes saved'}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={onClose}>
                            Close
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={!isDirty || !title.trim()}
                            loading={saving}
                            onClick={handleSave}
                        >
                            Save changes
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-5">
                {/* Title & Status */}
                <div className="space-y-3">
                    <div>
                        <label htmlFor="todo-detail-title" className={labelCls}>Title</label>
                        <input
                            id="todo-detail-title"
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            maxLength={300}
                            className={`${fieldCls} font-semibold`}
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Segmented
                            ariaLabel="To-Do status"
                            options={statusOptions}
                            value={status}
                            onChange={setStatus}
                        />

                        <div className="flex items-center gap-1" role="group" aria-label="Priority">
                            {TODO_PRIORITIES.map(pKey => {
                                const meta = PRIORITY_META[pKey];
                                const active = priority === pKey;
                                return (
                                    <button
                                        key={pKey}
                                        type="button"
                                        onClick={() => setPriority(pKey)}
                                        aria-pressed={active}
                                        className={`h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                            active
                                                ? meta.pillCls
                                                : 'bg-surface text-muted border-border-subtle hover:text-primary hover:bg-surface-elevated'
                                        }`}
                                    >
                                        {meta.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Metadata Grid: Category, Due Date, Assignee */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label htmlFor="todo-detail-category" className={labelCls}>Category</label>
                        <select
                            id="todo-detail-category"
                            value={category}
                            onChange={e => setCategory(e.target.value as TodoCategory)}
                            className={fieldCls}
                        >
                            {TODO_CATEGORIES.map(catKey => (
                                <option key={catKey} value={catKey}>
                                    {CATEGORY_META[catKey].label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="todo-detail-due" className={labelCls}>Due date</label>
                        <div className="flex items-center gap-1">
                            <DateInput
                                id="todo-detail-due"
                                value={dueDate}
                                onChange={setDueDate}
                                placeholder="No due date"
                                className={`${fieldCls} flex-1 min-w-0`}
                            />
                            {dueDate ? (
                                <button
                                    type="button"
                                    onClick={() => setDueDate('')}
                                    aria-label="Clear due date"
                                    className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle text-muted hover:text-primary cursor-pointer shrink-0"
                                >
                                    <X size={14} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setDueDate(addDaysISO(today, 0))}
                                    className="h-9 px-2.5 rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle text-xs font-medium text-muted hover:text-primary cursor-pointer shrink-0"
                                >
                                    Today
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="todo-detail-assignee" className={labelCls}>Assignee</label>
                        <select
                            id="todo-detail-assignee"
                            value={assigneeId}
                            onChange={e => setAssigneeId(e.target.value)}
                            className={fieldCls}
                        >
                            <option value="">Anyone (Unassigned)</option>
                            {profiles.map(p => (
                                <option key={p.id} value={p.id}>
                                    {adminDisplayName(p)}{p.id === currentUserId ? ' (me)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Description */}
                <div>
                    <label htmlFor="todo-detail-desc" className={labelCls}>Notes & Details</label>
                    <textarea
                        id="todo-detail-desc"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={3}
                        maxLength={5000}
                        placeholder="Add venue details, trainer contact, booking confirmation numbers, follow-up context…"
                        className={`${inputCls} py-2.5 resize-y`}
                    />
                </div>

                {/* CRM Links: Course (+ date) & Student */}
                <div className={`${panelCls} p-3.5 space-y-3`}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">CRM Links (optional)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <label htmlFor="todo-detail-course" className="text-xs font-semibold text-primary flex items-center gap-1.5">
                                    <BookOpen size={13} className="text-brand-500" />
                                    Course &amp; session date
                                </label>
                                {courseId && onOpenCourse && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            onOpenCourse(courseId, courseDate || null);
                                        }}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                                    >
                                        Open board <ArrowUpRight size={12} />
                                    </button>
                                )}
                            </div>
                            <select
                                id="todo-detail-course"
                                value={courseId}
                                onChange={e => {
                                    setCourseId(e.target.value);
                                    if (!e.target.value) setCourseDate('');
                                }}
                                className={fieldCls}
                            >
                                <option value="">None</option>
                                {courses.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>

                            {courseId && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1">
                                        <DateInput
                                            value={courseDate}
                                            onChange={setCourseDate}
                                            placeholder="Optional session date"
                                            className={`${fieldCls} flex-1 min-w-0`}
                                        />
                                        {courseDate && (
                                            <button
                                                type="button"
                                                onClick={() => setCourseDate('')}
                                                aria-label="Clear session date"
                                                className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle text-muted hover:text-primary cursor-pointer shrink-0"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    {suggestedCourseDates.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1">
                                            <span className="text-[11px] text-muted mr-0.5">Upcoming:</span>
                                            {suggestedCourseDates.map(d => (
                                                <button
                                                    key={d}
                                                    type="button"
                                                    onClick={() => setCourseDate(d)}
                                                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                                                        courseDate === d
                                                            ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border-brand-500/30'
                                                            : 'bg-surface text-muted border-border-subtle hover:text-primary'
                                                    }`}
                                                >
                                                    {formatShortDate(d)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                                    <User size={13} className="text-status-invited" />
                                    Student
                                </span>
                                {student && onOpenStudent && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            onOpenStudent(student.id);
                                        }}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                                    >
                                        Open profile <ArrowUpRight size={12} />
                                    </button>
                                )}
                            </div>
                            <TodoStudentPicker value={student} onChange={setStudent} />
                        </div>
                    </div>
                </div>

                {/* Checklist Section */}
                <div className={`${panelCls} p-3.5 space-y-2.5`}>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                            <ListChecks size={14} className="text-brand-500" />
                            Checklist
                        </span>
                        {progress.total > 0 && (
                            <span className="text-xs font-bold text-muted tabular-nums">
                                {progress.done} / {progress.total} done
                            </span>
                        )}
                    </div>

                    {progress.total > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                            <div
                                className="h-full bg-brand-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                            />
                        </div>
                    )}

                    {checklist.length > 0 && (
                        <ul className="space-y-1.5">
                            {checklist.map(item => (
                                <li
                                    key={item.id}
                                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle/80 group"
                                >
                                    <button
                                        type="button"
                                        onClick={() => void handleToggleChecklistItem(item.id)}
                                        aria-label={item.done ? `Uncheck "${item.text}"` : `Check "${item.text}"`}
                                        aria-pressed={item.done}
                                        className={`flex items-center justify-center w-4 h-4 rounded-sm border transition-colors shrink-0 cursor-pointer ${
                                            item.done
                                                ? 'bg-success border-success text-white'
                                                : 'border-border-strong hover:border-brand-500 text-transparent'
                                        }`}
                                    >
                                        <Check size={11} strokeWidth={3} />
                                    </button>
                                    <span className={`flex-1 text-xs leading-snug ${item.done ? 'line-through text-muted' : 'text-primary'}`}>
                                        {item.text}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => void handleRemoveChecklistItem(item.id)}
                                        aria-label={`Remove "${item.text}"`}
                                        className="p-1 text-muted hover:text-status-rejected opacity-60 group-hover:opacity-100 cursor-pointer shrink-0"
                                    >
                                        <X size={12} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newCheckText}
                            onChange={e => setNewCheckText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleAddChecklistItem();
                                }
                            }}
                            placeholder="Add a step (e.g. Book room, Confirm trainer)…"
                            maxLength={200}
                            className={`${fieldCls} flex-1 h-8 text-xs`}
                        />
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={!newCheckText.trim()}
                            onClick={() => void handleAddChecklistItem()}
                        >
                            <Plus size={13} />
                            Add
                        </Button>
                    </div>
                </div>

                {/* Comments Thread */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                            <MessageSquare size={14} className="text-brand-500" />
                            Comments ({comments.length})
                        </span>
                    </div>

                    {commentsLoading ? (
                        <p className="text-xs text-muted">Loading comments…</p>
                    ) : comments.length === 0 ? (
                        <p className="text-xs text-muted italic">No comments yet — leave a handoff note for other admins.</p>
                    ) : (
                        <ul className="space-y-2">
                            {comments.map(c => {
                                const commentAuthor = c.created_by ? profilesById.get(c.created_by) : null;
                                return (
                                    <li
                                        key={c.id}
                                        className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-elevated/60 border border-border-subtle group"
                                    >
                                        <AdminAvatar profile={commentAuthor} seed={c.created_by ?? c.id} size="sm" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="text-xs font-semibold text-primary truncate">
                                                        {adminDisplayName(commentAuthor)}
                                                    </span>
                                                    <span className="text-[11px] text-muted shrink-0">
                                                        {formatRelativeTimestamp(c.created_at)}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleDeleteComment(c.id)}
                                                    aria-label="Delete comment"
                                                    className="p-1 text-muted hover:text-status-rejected opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer shrink-0"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                            <p className="text-xs text-primary whitespace-pre-wrap wrap-break-word mt-1 leading-relaxed">
                                                {c.body}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <div className="flex items-end gap-2">
                        <textarea
                            value={commentText}
                            onChange={e => setCommentText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    void handlePostComment();
                                }
                            }}
                            rows={2}
                            maxLength={2000}
                            placeholder="Write an update or handoff note… (Ctrl+Enter to post)"
                            className={`${inputCls} py-2 text-xs flex-1 resize-none`}
                        />
                        <Button
                            size="sm"
                            variant="primary"
                            disabled={!commentText.trim()}
                            loading={addComment.isPending}
                            onClick={() => void handlePostComment()}
                        >
                            <Send size={13} />
                            Post
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

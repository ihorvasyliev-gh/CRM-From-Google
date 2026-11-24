import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInRouterContext, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    AlertCircle,
    CheckCircle2,
    CheckSquare,
    Clock,
    Database,
    Pin,
    RefreshCw,
    Trash2,
    UserCheck,
    X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchCourses } from '../lib/queries';
import type { NavigateFn, NavState } from '../lib/navigation';
import { todayISO } from '../lib/dateUtils';
import { errorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import {
    adminDisplayName,
    computeTodoStats,
    filterTodos,
    TODO_CATEGORIES,
    type AdminTodo,
    type TodoFilterState,
    type TodoLinkedStudent,
} from '../lib/todos';
import {
    useAdminProfiles,
    useAdminTodos,
    useClearCompletedTodos,
    useCreateTodo,
    useDeleteTodo,
    useUpdateTodo,
    type CreateTodoInput,
    type UpdateTodoInput,
} from '../hooks/useTodos';
import { useDialogMount, useLastPresent } from '../hooks/usePresence';
import { usePersistentState } from '../hooks/usePersistentState';
import Card from './ui/Card';
import Badge from './ui/Badge';
import { Button, IconButton } from './ui/Button';
import SearchInput from './ui/SearchInput';
import { Segmented, UnderlineTabs, type SegmentOption, type UnderlineTab } from './ui/Tabs';
import { EmptyState, SkeletonRows } from './ui/States';
import { calloutCls } from './ui/styles';
import AnimatedList from './ui/AnimatedList';
import ConfirmDialog from './ConfirmDialog';
import TodoQuickAdd, { type TodoDraftSeed } from './Todos/TodoQuickAdd';
import TodoRow from './Todos/TodoRow';
import TodoDetailModal from './Todos/TodoDetailModal';
import { CATEGORY_META } from './Todos/todoMeta';

export interface TodosProps {
    onNavigate?: NavigateFn;
    onOpenStudentDetail?: (studentId: string) => void;
    /** Optional router state passed when opening /todos from Dashboard, Cmd+K or StudentDetail. */
    navState?: NavState | null;
    /** Unique token incremented on navigation into /todos so kept-alive page reacts to new navState. */
    navKey?: string;
}

const DEFAULT_FILTERS: TodoFilterState = {
    tab: 'active',
    search: '',
    category: 'all',
    assignee: 'all',
    focus: 'all',
};

const VALID_CATEGORY_FILTERS = new Set<string>(['all', ...TODO_CATEGORIES]);
const VALID_FOCUS_FILTERS = new Set<string>(['all', 'in_progress', 'due_soon', 'pinned']);

function isValidTodoFilters(value: unknown): value is TodoFilterState {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        (v.tab === 'active' || v.tab === 'done') &&
        typeof v.search === 'string' &&
        typeof v.category === 'string' &&
        VALID_CATEGORY_FILTERS.has(v.category) &&
        typeof v.assignee === 'string' &&
        typeof v.focus === 'string' &&
        VALID_FOCUS_FILTERS.has(v.focus)
    );
}

/** Syncs `?todo=<id>` search param with selected task state when rendered inside React Router. */
function RouterTodoSync({
    selectedTodoId,
    onTodoFromUrl,
    registerSyncUrl,
}: {
    selectedTodoId: string | null;
    onTodoFromUrl: (id: string | null) => void;
    registerSyncUrl: (fn: ((id: string | null) => void) | null) => void;
}) {
    const [searchParams, setSearchParams] = useSearchParams();
    const urlTodoId = searchParams.get('todo');
    const prevUrlTodoRef = useRef<string | null | undefined>(undefined);

    useEffect(() => {
        if (prevUrlTodoRef.current === urlTodoId) return;
        prevUrlTodoRef.current = urlTodoId;
        if (urlTodoId) {
            onTodoFromUrl(urlTodoId);
        } else if (selectedTodoId !== null) {
            onTodoFromUrl(null);
        }
    }, [urlTodoId, selectedTodoId, onTodoFromUrl]);

    useEffect(() => {
        registerSyncUrl(nextId => {
            prevUrlTodoRef.current = nextId;
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    if (nextId) next.set('todo', nextId);
                    else next.delete('todo');
                    return next;
                },
                { replace: true },
            );
        });
        return () => registerSyncUrl(null);
    }, [registerSyncUrl, setSearchParams]);

    return null;
}

function splitStudentName(name?: string): { first_name: string; last_name: string } {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return { first_name: 'Student', last_name: '' };
    const idx = trimmed.indexOf(' ');
    if (idx === -1) return { first_name: trimmed, last_name: '' };
    return { first_name: trimmed.slice(0, idx), last_name: trimmed.slice(idx + 1).trim() };
}

export default function Todos({
    onNavigate,
    onOpenStudentDetail,
    navState,
    navKey,
}: TodosProps) {
    const inRouter = useInRouterContext();
    const { user } = useAuth();
    const [filters, setFilters] = usePersistentState<TodoFilterState>('todos.filters', DEFAULT_FILTERS, {
        validate: isValidTodoFilters,
    });
    const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminTodo | null>(null);
    const [clearDoneOpen, setClearDoneOpen] = useState(false);
    const [draftSeed, setDraftSeed] = useState<TodoDraftSeed | null>(null);

    const syncUrlTodoRef = useRef<((id: string | null) => void) | null>(null);
    const registerSyncUrl = useCallback((fn: ((id: string | null) => void) | null) => {
        syncUrlTodoRef.current = fn;
    }, []);
    const selectTodo = useCallback((id: string | null) => {
        setSelectedTodoId(id);
        syncUrlTodoRef.current?.(id);
    }, []);

    const { data, isLoading, isFetching, error, refetch } = useAdminTodos();
    const { profiles, byId: profilesById } = useAdminProfiles();
    const { data: courses = [] } = useQuery({
        queryKey: ['courses'],
        queryFn: fetchCourses,
        staleTime: 5 * 60_000,
    });

    const createTodo = useCreateTodo();
    const updateTodo = useUpdateTodo();
    const deleteTodo = useDeleteTodo();
    const clearCompleted = useClearCompletedTodos();

    const todos = useMemo(() => data?.rows ?? [], [data?.rows]);
    const available = data?.available ?? true;
    const today = todayISO();

    // React to incoming navigation intents (Dashboard "+ Add", StudentDetail "Add To-Do", Cmd+K, clicking a card item)
    const handledNavKeyRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!navState || !navKey || handledNavKeyRef.current === navKey) return;
        handledNavKeyRef.current = navKey;

        if (navState.todoId) {
            selectTodo(navState.todoId);
            return;
        }
        if (navState.newTodo || navState.studentId) {
            setFilters(prev => ({ ...prev, tab: 'active' }));
            const linkedStudent: TodoLinkedStudent | null = navState.studentId
                ? { id: navState.studentId, ...splitStudentName(navState.studentName) }
                : null;
            setDraftSeed({
                key: Date.now(),
                focus: true,
                category: navState.studentId ? 'student' : navState.courseId ? 'course' : undefined,
                student: linkedStudent,
                courseId: navState.courseId ?? null,
                courseDate: navState.courseDate ?? null,
            });
        }
    }, [navState, navKey, selectTodo, setFilters]);

    const stats = useMemo(() => computeTodoStats(todos, today), [todos, today]);

    const filtered = useMemo(
        () => filterTodos(todos, filters, user?.id, profilesById, today),
        [todos, filters, user?.id, profilesById, today],
    );

    const pinnedItems = useMemo(
        () => (filters.tab === 'active' ? filtered.filter(t => t.is_pinned) : []),
        [filtered, filters.tab],
    );
    const regularItems = useMemo(
        () => (filters.tab === 'active' ? filtered.filter(t => !t.is_pinned) : filtered),
        [filtered, filters.tab],
    );

    const selectedTodo = useMemo(
        () => (selectedTodoId ? todos.find(t => t.id === selectedTodoId) ?? null : null),
        [todos, selectedTodoId],
    );
    const detailMount = useDialogMount(Boolean(selectedTodo));
    const shownDetailTodo = useLastPresent(selectedTodo);

    const hasActiveFilters =
        filters.search.trim().length > 0 ||
        filters.category !== 'all' ||
        filters.assignee !== 'all' ||
        (filters.tab === 'active' && filters.focus !== 'all');

    const handleCreate = async (input: CreateTodoInput) => {
        try {
            await createTodo.mutateAsync(input);
            toast.success('To-Do added');
        } catch (err) {
            toast.error(errorMessage(err, 'Could not add to-do'));
        }
    };

    const handleSaveDetail = async (input: UpdateTodoInput) => {
        try {
            await updateTodo.mutateAsync(input);
            toast.success('Changes saved');
        } catch (err) {
            toast.error(errorMessage(err, 'Could not save changes'));
            throw err;
        }
    };

    const handleToggleDone = async (todo: AdminTodo) => {
        const previousStatus = todo.status;
        const nextStatus = todo.status === 'done' ? 'open' : 'done';
        try {
            await updateTodo.mutateAsync({ id: todo.id, patch: { status: nextStatus } });
            if (nextStatus === 'done') {
                toast.success(`Completed "${todo.title}"`, {
                    action: {
                        label: 'Undo',
                        onClick: () => {
                            void updateTodo.mutateAsync({ id: todo.id, patch: { status: previousStatus } });
                        },
                    },
                });
            } else {
                toast.info(`Reopened "${todo.title}"`);
            }
        } catch (err) {
            toast.error(errorMessage(err, 'Could not update status'));
        }
    };

    const handleToggleInProgress = async (todo: AdminTodo) => {
        const nextStatus = todo.status === 'in_progress' ? 'open' : 'in_progress';
        try {
            await updateTodo.mutateAsync({ id: todo.id, patch: { status: nextStatus } });
        } catch (err) {
            toast.error(errorMessage(err, 'Could not update status'));
        }
    };

    const handleTogglePin = async (todo: AdminTodo) => {
        try {
            await updateTodo.mutateAsync({ id: todo.id, patch: { is_pinned: !todo.is_pinned } });
        } catch (err) {
            toast.error(errorMessage(err, 'Could not update pin'));
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        const target = deleteTarget;
        setDeleteTarget(null);
        if (selectedTodoId === target.id) selectTodo(null);
        try {
            await deleteTodo.mutateAsync(target.id);
            toast.success('To-Do deleted');
        } catch (err) {
            toast.error(errorMessage(err, 'Could not delete to-do'));
        }
    };

    const handleClearCompleted = async () => {
        const doneIds = todos.filter(t => t.status === 'done').map(t => t.id);
        setClearDoneOpen(false);
        if (doneIds.length === 0) return;
        try {
            const count = await clearCompleted.mutateAsync(doneIds);
            toast.success(`Cleared ${count} completed item${count === 1 ? '' : 's'}`);
        } catch (err) {
            toast.error(errorMessage(err, 'Could not clear completed items'));
        }
    };

    const handleOpenCourse = (courseId: string, courseDate?: string | null) => {
        onNavigate?.('enrollments', { courseId, ...(courseDate ? { courseDate } : {}) });
    };

    const tabs: UnderlineTab<'active' | 'done'>[] = [
        {
            value: 'active',
            label: 'Active',
            icon: CheckSquare,
            count: stats.openCount,
            countTone: stats.overdueCount > 0 ? 'danger' : 'brand',
        },
        {
            value: 'done',
            label: 'Done',
            icon: CheckCircle2,
            count: stats.doneCount,
            countTone: 'default',
        },
    ];

    const focusOptions: SegmentOption<TodoFilterState['focus']>[] = [
        { value: 'all', label: 'All' },
        { value: 'in_progress', label: 'In Progress', count: stats.inProgressCount || undefined },
        { value: 'due_soon', label: 'Due soon', count: (stats.overdueCount + stats.dueTodayCount) || undefined },
        { value: 'pinned', label: 'Pinned', count: stats.pinnedCount || undefined },
    ];

    return (
        <div className="w-full max-w-5xl mx-auto space-y-4 sm:space-y-5">
            {inRouter && (
                <RouterTodoSync
                    selectedTodoId={selectedTodoId}
                    onTodoFromUrl={setSelectedTodoId}
                    registerSyncUrl={registerSyncUrl}
                />
            )}
            {/* Migration notice if migration 96 hasn't been run yet */}
            {!available && (
                <div className={`${calloutCls.warning} p-4 flex items-start gap-3`}>
                    <Database size={18} className="text-status-requested shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1 min-w-0">
                        <p className="font-semibold text-sm text-primary">Database migration required</p>
                        <p className="text-muted leading-relaxed">
                            Run <code className="font-mono text-primary bg-surface px-1.5 py-0.5 rounded-sm border border-border-subtle">supabase/96_admin_todos.sql</code> in the Supabase SQL Editor to enable the shared admin To-Do workspace.
                        </p>
                    </div>
                </div>
            )}

            {/* Header Tabs + Status Summary */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <UnderlineTabs
                    ariaLabel="To-Do views"
                    tabs={tabs}
                    value={filters.tab}
                    onChange={tab => setFilters(prev => ({ ...prev, tab }))}
                    className="flex-1 min-w-[200px]"
                />

                <div className="flex items-center gap-2 shrink-0">
                    {stats.overdueCount > 0 && (
                        <Badge tone="danger" shape="pill" className="tabular-nums">
                            {stats.overdueCount} overdue
                        </Badge>
                    )}
                    {stats.dueTodayCount > 0 && (
                        <Badge tone="warning" shape="pill" className="tabular-nums">
                            {stats.dueTodayCount} due today
                        </Badge>
                    )}
                    {stats.inProgressCount > 0 && (
                        <Badge tone="brand" shape="pill" className="tabular-nums hidden sm:inline-flex">
                            <Clock size={11} />
                            {stats.inProgressCount} in progress
                        </Badge>
                    )}
                    <IconButton
                        size="sm"
                        label="Refresh to-dos"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                    </IconButton>
                </div>
            </div>

            {/* Quick Add Bar (shown on Active tab) */}
            {filters.tab === 'active' && (
                <TodoQuickAdd
                    courses={courses}
                    profiles={profiles}
                    currentUserId={user?.id}
                    disabled={!available}
                    submitting={createTodo.isPending}
                    seed={draftSeed}
                    onSubmit={handleCreate}
                />
            )}

            {/* Search & Filters Toolbar */}
            <div className="rounded-2xl bg-surface border border-border-subtle shadow-card p-3 sm:p-3.5 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <SearchInput
                        value={filters.search}
                        onChange={search => setFilters(prev => ({ ...prev, search }))}
                        placeholder="Search tasks, bookings, courses, students, notes…"
                        className="flex-1 min-w-0"
                    />

                    <div className="flex items-center gap-2 flex-wrap">
                        {filters.tab === 'active' && (
                            <Segmented
                                ariaLabel="Quick filter"
                                options={focusOptions}
                                value={filters.focus}
                                onChange={focus => setFilters(prev => ({ ...prev, focus }))}
                                size="sm"
                            />
                        )}

                        <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-surface-elevated border border-border-subtle text-xs text-muted">
                            <UserCheck size={13} className="shrink-0" />
                            <select
                                aria-label="Filter by assignee"
                                value={filters.assignee}
                                onChange={e => setFilters(prev => ({ ...prev, assignee: e.target.value }))}
                                className="bg-transparent text-xs font-semibold text-primary focus:outline-hidden cursor-pointer max-w-[140px]"
                            >
                                <option value="all">All assignees</option>
                                <option value="mine">Assigned to me</option>
                                <option value="unassigned">Unassigned</option>
                                {profiles.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {adminDisplayName(p)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {filters.tab === 'done' && stats.doneCount > 0 && (
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={() => setClearDoneOpen(true)}
                                loading={clearCompleted.isPending}
                            >
                                <Trash2 size={13} />
                                Clear done
                            </Button>
                        )}
                    </div>
                </div>

                {/* Category Filter Strip */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setFilters(prev => ({ ...prev, category: 'all' }))}
                        aria-pressed={filters.category === 'all'}
                        className={`h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                            filters.category === 'all'
                                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/25'
                                : 'bg-surface-elevated/60 text-muted border-border-subtle hover:text-primary'
                        }`}
                    >
                        All categories
                    </button>
                    {TODO_CATEGORIES.map(catKey => {
                        const meta = CATEGORY_META[catKey];
                        const Icon = meta.icon;
                        const active = filters.category === catKey;
                        return (
                            <button
                                key={catKey}
                                type="button"
                                onClick={() => setFilters(prev => ({ ...prev, category: active ? 'all' : catKey }))}
                                aria-pressed={active}
                                className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                    active
                                        ? meta.pillCls
                                        : 'bg-surface-elevated/60 text-muted border-border-subtle hover:text-primary'
                                }`}
                            >
                                <Icon size={12} />
                                <span>{meta.label}</span>
                            </button>
                        );
                    })}

                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={() => setFilters(prev => ({ ...DEFAULT_FILTERS, tab: prev.tab }))}
                            className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-semibold text-muted hover:text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                        >
                            <X size={12} />
                            Reset filters
                        </button>
                    )}
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className={`${calloutCls.danger} p-4 flex items-center justify-between gap-3`}>
                    <div className="flex items-center gap-2.5 text-sm">
                        <AlertCircle size={17} className="text-status-rejected shrink-0" />
                        <span>{errorMessage(error, 'Failed to load team to-dos')}</span>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => refetch()}>
                        Retry
                    </Button>
                </div>
            )}

            {/* Loading State */}
            {isLoading ? (
                <Card flush>
                    <div className="p-4">
                        <SkeletonRows rows={5} />
                    </div>
                </Card>
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={filters.tab === 'done' ? <CheckCircle2 size={22} /> : <CheckSquare size={22} />}
                    title={
                        hasActiveFilters
                            ? 'No matching to-dos'
                            : filters.tab === 'done'
                                ? 'No completed items yet'
                                : 'Nothing on the list yet'
                    }
                    description={
                        hasActiveFilters
                            ? 'Try clearing your search or switching category / assignee filters.'
                            : filters.tab === 'done'
                                ? 'Completed tasks and bookings will appear here as team history.'
                                : 'Add a task, record who booked a room or trainer, or pin an important note for all admins above.'
                    }
                    action={
                        hasActiveFilters ? (
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setFilters(prev => ({ ...DEFAULT_FILTERS, tab: prev.tab }))}
                            >
                                Reset filters
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <div className="space-y-4">
                    {/* Pinned Section (Active tab) */}
                    {pinnedItems.length > 0 && (
                        <Card
                            title={
                                <span className="inline-flex items-center gap-2">
                                    <span>Pinned</span>
                                    <Badge tone="warning" shape="pill" className="tabular-nums">
                                        {pinnedItems.length}
                                    </Badge>
                                </span>
                            }
                            subtitle="Important notes, active bookings and key reminders visible at the top"
                            icon={Pin}
                            tone="warning"
                            divided
                            flush
                        >
                            <AnimatedList className="divide-y divide-border-subtle">
                                {pinnedItems.map(todo => (
                                    <TodoRow
                                        key={todo.id}
                                        todo={todo}
                                        profilesById={profilesById}
                                        onOpen={item => selectTodo(item.id)}
                                        onToggleDone={handleToggleDone}
                                        onToggleInProgress={handleToggleInProgress}
                                        onTogglePin={handleTogglePin}
                                        onDelete={setDeleteTarget}
                                        onOpenCourse={handleOpenCourse}
                                        onOpenStudent={onOpenStudentDetail}
                                    />
                                ))}
                            </AnimatedList>
                        </Card>
                    )}

                    {/* Main List (Unpinned Active or Done History) */}
                    {regularItems.length > 0 && (
                        <Card
                            title={
                                <span className="inline-flex items-center gap-2">
                                    <span>{filters.tab === 'done' ? 'Completed History' : pinnedItems.length > 0 ? 'Tasks & Notes' : 'Team To-Do'}</span>
                                    <Badge tone={filters.tab === 'done' ? 'neutral' : 'brand'} shape="pill" className="tabular-nums">
                                        {regularItems.length}
                                    </Badge>
                                </span>
                            }
                            subtitle={
                                filters.tab === 'done'
                                    ? 'Click any item to review details or reopen it'
                                    : 'Visible to all CRM admins in real time'
                            }
                            icon={filters.tab === 'done' ? CheckCircle2 : CheckSquare}
                            tone={filters.tab === 'done' ? 'success' : 'brand'}
                            divided
                            flush
                        >
                            <AnimatedList className="divide-y divide-border-subtle">
                                {regularItems.map(todo => (
                                    <TodoRow
                                        key={todo.id}
                                        todo={todo}
                                        profilesById={profilesById}
                                        onOpen={item => selectTodo(item.id)}
                                        onToggleDone={handleToggleDone}
                                        onToggleInProgress={handleToggleInProgress}
                                        onTogglePin={handleTogglePin}
                                        onDelete={setDeleteTarget}
                                        onOpenCourse={handleOpenCourse}
                                        onOpenStudent={onOpenStudentDetail}
                                    />
                                ))}
                            </AnimatedList>
                        </Card>
                    )}
                </div>
            )}

            {/* Detail / Edit Modal */}
            {detailMount.mounted && shownDetailTodo && (
                <TodoDetailModal
                    key={detailMount.key}
                    open={Boolean(selectedTodo)}
                    todo={shownDetailTodo}
                    courses={courses}
                    profiles={profiles}
                    profilesById={profilesById}
                    currentUserId={user?.id}
                    saving={updateTodo.isPending}
                    onClose={() => selectTodo(null)}
                    onSave={handleSaveDetail}
                    onRequestDelete={item => setDeleteTarget(item)}
                    onOpenCourse={handleOpenCourse}
                    onOpenStudent={onOpenStudentDetail}
                />
            )}

            {/* Confirm Single Delete */}
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() => void handleConfirmDelete()}
                title="Delete To-Do?"
                message={
                    deleteTarget
                        ? `Delete "${deleteTarget.title}"? This will remove the item and its comments for all admins.`
                        : ''
                }
                confirmLabel="Delete"
                variant="danger"
            />

            {/* Confirm Clear Completed */}
            <ConfirmDialog
                open={clearDoneOpen}
                onCancel={() => setClearDoneOpen(false)}
                onConfirm={() => void handleClearCompleted()}
                title="Clear completed items?"
                message={`Permanently remove all ${stats.doneCount} completed item${stats.doneCount === 1 ? '' : 's'} from history?`}
                confirmLabel="Clear all"
                variant="danger"
            />
        </div>
    );
}

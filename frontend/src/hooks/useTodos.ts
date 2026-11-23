import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/queries';
import { useOptionalAuth } from '../contexts/AuthContext';
import {
    computeTodoStats,
    normalizeChecklist,
    TODO_CATEGORIES,
    TODO_PRIORITIES,
    TODO_STATUSES,
    type AdminProfile,
    type AdminTodo,
    type AdminTodoComment,
    type TodoCategory,
    type TodoChecklistItem,
    type TodoLinkedCourse,
    type TodoLinkedStudent,
    type TodoPriority,
    type TodoStatus,
} from '../lib/todos';

export const TODOS_KEY = ['admin_todos'] as const;
export const ADMIN_PROFILES_KEY = ['admin_profiles'] as const;
export const TODO_COMMENTS_PREFIX = 'admin_todo_comments';
export const todoCommentsKey = (todoId: string) => [TODO_COMMENTS_PREFIX, todoId] as const;

export interface AdminTodosResult {
    rows: AdminTodo[];
    /** false until migration 96 is applied */
    available: boolean;
}

const VALID_CATEGORIES = new Set<string>(TODO_CATEGORIES);
const VALID_STATUSES = new Set<string>(TODO_STATUSES);
const VALID_PRIORITIES = new Set<string>(TODO_PRIORITIES);

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST202' || error.code === '42883') return true;
    const msg = (error.message ?? '').toLowerCase();
    return msg.includes('could not find the table') || msg.includes('could not find the function');
}

interface RawTodoRow {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    status?: string | null;
    priority?: string | null;
    is_pinned?: boolean | null;
    due_date?: string | null;
    course_id?: string | null;
    course_date?: string | null;
    student_id?: string | null;
    checklist?: unknown;
    assignee_id?: string | null;
    created_by?: string | null;
    completed_by?: string | null;
    completed_at?: string | null;
    created_at: string;
    updated_at: string;
    courses?: TodoLinkedCourse | TodoLinkedCourse[] | null;
    students?: TodoLinkedStudent | TodoLinkedStudent[] | null;
    admin_todo_comments?: { count?: number }[] | null;
}

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function normalizeTodoRow(row: RawTodoRow): AdminTodo {
    const category = row.category && VALID_CATEGORIES.has(row.category) ? (row.category as TodoCategory) : 'general';
    const status = row.status && VALID_STATUSES.has(row.status) ? (row.status as TodoStatus) : 'open';
    const priority = row.priority && VALID_PRIORITIES.has(row.priority) ? (row.priority as TodoPriority) : 'normal';
    const commentCount = Array.isArray(row.admin_todo_comments) ? Number(row.admin_todo_comments[0]?.count ?? 0) : 0;

    return {
        id: row.id,
        title: row.title ?? '',
        description: row.description ?? '',
        category,
        status,
        priority,
        is_pinned: Boolean(row.is_pinned),
        due_date: row.due_date ? row.due_date.slice(0, 10) : null,
        course_id: row.course_id ?? null,
        course_date: row.course_date ? row.course_date.slice(0, 10) : null,
        student_id: row.student_id ?? null,
        checklist: normalizeChecklist(row.checklist),
        assignee_id: row.assignee_id ?? null,
        created_by: row.created_by ?? null,
        completed_by: row.completed_by ?? null,
        completed_at: row.completed_at ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        courses: unwrapSingle(row.courses),
        students: unwrapSingle(row.students),
        comment_count: Number.isFinite(commentCount) ? commentCount : 0,
    };
}

const TODO_SELECT = `
    id, title, description, category, status, priority, is_pinned, due_date,
    course_id, course_date, student_id, checklist,
    assignee_id, created_by, completed_by, completed_at, created_at, updated_at,
    courses ( id, name ),
    students ( id, first_name, last_name ),
    admin_todo_comments ( count )
`;

export async function fetchAdminTodos(): Promise<AdminTodosResult> {
    try {
        const data = await fetchAllPages<RawTodoRow>((from, to) =>
            supabase
                .from('admin_todos')
                .select(TODO_SELECT)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(from, to),
        );
        return { rows: data.map(normalizeTodoRow), available: true };
    } catch (error) {
        if (isMissingRelation(error as { code?: string; message?: string } | null)) {
            return { rows: [], available: false };
        }
        throw error;
    }
}

export async function fetchAdminProfiles(): Promise<AdminProfile[]> {
    const { data, error } = await supabase.rpc('list_admin_profiles');
    if (!error && Array.isArray(data)) {
        return (data as AdminProfile[]).map(p => ({
            id: p.id,
            email: p.email ?? '',
            full_name: p.full_name ?? null,
        }));
    }

    // Fallback before migration 96 is applied: derive admins from list_app_users
    if (isMissingRelation(error)) {
        const fallback = await supabase.rpc('list_app_users');
        if (!fallback.error && Array.isArray(fallback.data)) {
            return (fallback.data as { id: string; email: string; role: string }[])
                .filter(u => !u.role || u.role === 'admin')
                .map(u => ({ id: u.id, email: u.email, full_name: null }));
        }
        return [];
    }

    throw error;
}

export function useAdminTodos(enabled = true) {
    return useQuery({
        queryKey: TODOS_KEY,
        queryFn: fetchAdminTodos,
        enabled,
        staleTime: 60_000,
    });
}

export function useAdminTodoStats(enabled = true) {
    const query = useAdminTodos(enabled);
    const stats = useMemo(() => computeTodoStats(query.data?.rows ?? []), [query.data?.rows]);
    return {
        ...stats,
        available: query.data?.available ?? true,
        isLoading: query.isLoading,
    };
}

export function useAdminProfiles(enabled = true) {
    const user = useOptionalAuth()?.user ?? null;
    const query = useQuery({
        queryKey: ADMIN_PROFILES_KEY,
        queryFn: fetchAdminProfiles,
        enabled,
        staleTime: 5 * 60_000,
    });

    const profiles = useMemo(() => {
        const list = query.data ?? [];
        if (user && !list.some(p => p.id === user.id)) {
            const fullName =
                typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()
                    ? user.user_metadata.full_name.trim()
                    : null;
            return [{ id: user.id, email: user.email ?? '', full_name: fullName }, ...list];
        }
        return list;
    }, [query.data, user]);

    const byId = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

    return {
        ...query,
        profiles,
        byId,
    };
}

export interface CreateTodoInput {
    title: string;
    description?: string;
    category?: TodoCategory;
    status?: TodoStatus;
    priority?: TodoPriority;
    is_pinned?: boolean;
    due_date?: string | null;
    course_id?: string | null;
    course_date?: string | null;
    student_id?: string | null;
    checklist?: TodoChecklistItem[];
    assignee_id?: string | null;
}

export function useCreateTodo() {
    const queryClient = useQueryClient();
    const user = useOptionalAuth()?.user ?? null;

    return useMutation({
        mutationFn: async (input: CreateTodoInput): Promise<AdminTodo> => {
            const payload = {
                title: input.title.trim(),
                description: (input.description ?? '').trim(),
                category: input.category ?? 'general',
                status: input.status ?? 'open',
                priority: input.priority ?? 'normal',
                is_pinned: Boolean(input.is_pinned),
                due_date: input.due_date || null,
                course_id: input.course_id || null,
                course_date: input.course_id ? (input.course_date || null) : null,
                student_id: input.student_id || null,
                checklist: input.checklist ?? [],
                assignee_id: input.assignee_id || null,
                created_by: user?.id ?? null,
            };
            const { data, error } = await supabase
                .from('admin_todos')
                .insert(payload)
                .select(TODO_SELECT)
                .single();
            if (error) throw error;
            return normalizeTodoRow(data as RawTodoRow);
        },
        onSuccess: created => {
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, prev =>
                prev ? { available: true, rows: [created, ...prev.rows.filter(r => r.id !== created.id)] } : { available: true, rows: [created] },
            );
            queryClient.invalidateQueries({ queryKey: TODOS_KEY });
        },
    });
}

export interface UpdateTodoInput {
    id: string;
    patch: {
        title?: string;
        description?: string;
        category?: TodoCategory;
        status?: TodoStatus;
        priority?: TodoPriority;
        is_pinned?: boolean;
        due_date?: string | null;
        course_id?: string | null;
        course_date?: string | null;
        student_id?: string | null;
        checklist?: TodoChecklistItem[];
        assignee_id?: string | null;
    };
}

export function useUpdateTodo() {
    const queryClient = useQueryClient();
    const user = useOptionalAuth()?.user ?? null;

    return useMutation({
        mutationFn: async ({ id, patch }: UpdateTodoInput): Promise<AdminTodo> => {
            const payload: Record<string, unknown> = { ...patch };
            if (typeof payload.title === 'string') payload.title = payload.title.trim();
            if (typeof payload.description === 'string') payload.description = payload.description.trim();
            if ('course_id' in payload && !payload.course_id) {
                payload.course_id = null;
                payload.course_date = null;
            }
            if (patch.status === 'done') {
                payload.completed_by = user?.id ?? null;
                payload.completed_at = new Date().toISOString();
            } else if (patch.status === 'open' || patch.status === 'in_progress') {
                payload.completed_by = null;
                payload.completed_at = null;
            }

            const { data, error } = await supabase
                .from('admin_todos')
                .update(payload)
                .eq('id', id)
                .select(TODO_SELECT)
                .single();
            if (error) throw error;
            return normalizeTodoRow(data as RawTodoRow);
        },
        onMutate: async ({ id, patch }) => {
            await queryClient.cancelQueries({ queryKey: TODOS_KEY });
            const previous = queryClient.getQueryData<AdminTodosResult>(TODOS_KEY);
            if (previous) {
                const nowIso = new Date().toISOString();
                queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, {
                    ...previous,
                    rows: previous.rows.map(row => {
                        if (row.id !== id) return row;
                        const nextStatus = patch.status ?? row.status;
                        return {
                            ...row,
                            ...patch,
                            status: nextStatus,
                            completed_by:
                                patch.status === 'done'
                                    ? (user?.id ?? row.completed_by)
                                    : patch.status
                                        ? null
                                        : row.completed_by,
                            completed_at:
                                patch.status === 'done'
                                    ? nowIso
                                    : patch.status
                                        ? null
                                        : row.completed_at,
                            updated_at: nowIso,
                        };
                    }),
                });
            }
            return { previous };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(TODOS_KEY, context.previous);
        },
        onSuccess: updated => {
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, prev =>
                prev ? { ...prev, rows: prev.rows.map(r => (r.id === updated.id ? updated : r)) } : { available: true, rows: [updated] },
            );
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: TODOS_KEY });
        },
    });
}

export function useDeleteTodo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('admin_todos').delete().eq('id', id);
            if (error) throw error;
            return id;
        },
        onMutate: async id => {
            await queryClient.cancelQueries({ queryKey: TODOS_KEY });
            const previous = queryClient.getQueryData<AdminTodosResult>(TODOS_KEY);
            if (previous) {
                queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, {
                    ...previous,
                    rows: previous.rows.filter(r => r.id !== id),
                });
            }
            return { previous };
        },
        onError: (_err, _id, context) => {
            if (context?.previous) queryClient.setQueryData(TODOS_KEY, context.previous);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: TODOS_KEY });
        },
    });
}

export function useClearCompletedTodos() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (ids: string[]) => {
            if (ids.length === 0) return 0;
            const { error } = await supabase.from('admin_todos').delete().in('id', ids);
            if (error) throw error;
            return ids.length;
        },
        onSuccess: (_count, ids) => {
            const idSet = new Set(ids);
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, prev =>
                prev ? { ...prev, rows: prev.rows.filter(r => !idSet.has(r.id)) } : prev,
            );
            queryClient.invalidateQueries({ queryKey: TODOS_KEY });
        },
    });
}

export function useTodoComments(todoId: string | null | undefined) {
    return useQuery<AdminTodoComment[]>({
        queryKey: todoId ? todoCommentsKey(todoId) : [TODO_COMMENTS_PREFIX, 'none'],
        enabled: Boolean(todoId),
        queryFn: async () => {
            if (!todoId) return [];
            const { data, error } = await supabase
                .from('admin_todo_comments')
                .select('id, todo_id, body, created_by, created_at')
                .eq('todo_id', todoId)
                .order('created_at', { ascending: true });
            if (error) {
                if (isMissingRelation(error)) return [];
                throw error;
            }
            return (data ?? []) as AdminTodoComment[];
        },
        staleTime: 30_000,
    });
}

export function useAddTodoComment() {
    const queryClient = useQueryClient();
    const user = useOptionalAuth()?.user ?? null;

    return useMutation({
        mutationFn: async ({ todoId, body }: { todoId: string; body: string }): Promise<AdminTodoComment> => {
            const { data, error } = await supabase
                .from('admin_todo_comments')
                .insert({
                    todo_id: todoId,
                    body: body.trim(),
                    created_by: user?.id ?? null,
                })
                .select('id, todo_id, body, created_by, created_at')
                .single();
            if (error) throw error;
            return data as AdminTodoComment;
        },
        onSuccess: (comment, { todoId }) => {
            queryClient.setQueryData<AdminTodoComment[]>(todoCommentsKey(todoId), prev => [...(prev ?? []), comment]);
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, prev =>
                prev
                    ? {
                        ...prev,
                        rows: prev.rows.map(r => (r.id === todoId ? { ...r, comment_count: r.comment_count + 1 } : r)),
                    }
                    : prev,
            );
            queryClient.invalidateQueries({ queryKey: todoCommentsKey(todoId) });
            queryClient.invalidateQueries({ queryKey: TODOS_KEY });
        },
    });
}

export function useDeleteTodoComment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, todoId }: { id: string; todoId: string }) => {
            const { error } = await supabase.from('admin_todo_comments').delete().eq('id', id);
            if (error) throw error;
            return { id, todoId };
        },
        onSuccess: ({ id, todoId }) => {
            queryClient.setQueryData<AdminTodoComment[]>(todoCommentsKey(todoId), prev => (prev ?? []).filter(c => c.id !== id));
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, prev =>
                prev
                    ? {
                        ...prev,
                        rows: prev.rows.map(r => (r.id === todoId ? { ...r, comment_count: Math.max(0, r.comment_count - 1) } : r)),
                    }
                    : prev,
            );
            queryClient.invalidateQueries({ queryKey: todoCommentsKey(todoId) });
            queryClient.invalidateQueries({ queryKey: TODOS_KEY });
        },
    });
}

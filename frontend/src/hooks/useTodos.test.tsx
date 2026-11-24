import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
    useAdminTodos,
    useCreateTodo,
    useUpdateTodo,
    useDeleteTodo,
    useTodoRealtimeNotifier,
    TODOS_KEY,
    ADMIN_PROFILES_KEY,
    type AdminTodosResult,
} from './useTodos';
import { supabase } from '../lib/supabase';
import { subscribeToasts, type ToastData } from '../lib/toast';
import type { AdminProfile, AdminTodo } from '../lib/todos';

const mockUser = {
    id: 'admin-self',
    email: 'self@example.ie',
    user_metadata: { full_name: 'Self Admin' },
};

vi.mock('../contexts/AuthContext', () => ({
    useOptionalAuth: () => ({ user: mockUser }),
}));

vi.mock('../lib/notifications', () => ({
    showNotification: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
        rpc: vi.fn(),
        channel: vi.fn(),
        removeChannel: vi.fn(),
    },
}));

const mockFrom = vi.mocked(supabase.from);
const mockChannel = vi.mocked(supabase.channel);
const mockRemoveChannel = vi.mocked(supabase.removeChannel);

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

function createWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

function makeRawRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'todo-1',
        title: 'Call venue',
        description: 'Confirm room booking',
        category: 'course',
        status: 'open',
        priority: 'high',
        is_pinned: false,
        due_date: '2026-06-10T00:00:00Z',
        course_id: 'course-1',
        course_date: '2026-06-15',
        student_id: null,
        checklist: [{ id: 'c1', text: 'Send email', done: false }],
        assignee_id: 'admin-self',
        created_by: 'admin-other',
        completed_by: null,
        completed_at: null,
        created_at: '2026-06-01T09:00:00Z',
        updated_at: '2026-06-01T09:00:00Z',
        courses: [{ id: 'course-1', name: 'Safe Pass' }],
        students: null,
        admin_todo_comments: [{ count: 3 }],
        ...overrides,
    };
}

function makeTodo(overrides: Partial<AdminTodo> = {}): AdminTodo {
    return {
        id: 'todo-1',
        title: 'Call venue',
        description: 'Confirm room booking',
        category: 'course',
        status: 'open',
        priority: 'high',
        is_pinned: false,
        due_date: '2026-06-10',
        course_id: 'course-1',
        course_date: '2026-06-15',
        student_id: null,
        checklist: [],
        assignee_id: 'admin-other',
        created_by: 'admin-other',
        completed_by: null,
        completed_at: null,
        created_at: '2026-06-01T09:00:00Z',
        updated_at: '2026-06-01T09:00:00Z',
        courses: { id: 'course-1', name: 'Safe Pass' },
        students: null,
        comment_count: 0,
        ...overrides,
    };
}

function mockSelectPage(result: { data: unknown[] | null; error: unknown }) {
    const range = vi.fn().mockResolvedValue(result);
    const order2 = vi.fn(() => ({ range }));
    const order1 = vi.fn(() => ({ order: order2 }));
    const select = vi.fn(() => ({ order: order1 }));
    mockFrom.mockReturnValue({ select } as never);
    return { select, range };
}

describe('useTodos hooks', () => {
    let toasts: ToastData[];
    let unsubscribeToasts: () => void;

    beforeEach(() => {
        vi.clearAllMocks();
        toasts = [];
        unsubscribeToasts = subscribeToasts(t => toasts.push(t));
    });

    afterEach(() => {
        unsubscribeToasts();
    });

    describe('useAdminTodos', () => {
        it('loads and normalizes admin todo rows with available: true', async () => {
            mockSelectPage({ data: [makeRawRow()], error: null });
            const queryClient = makeQueryClient();

            const { result } = renderHook(() => useAdminTodos(true), {
                wrapper: createWrapper(queryClient),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(result.current.data?.available).toBe(true);
            expect(result.current.data?.rows).toHaveLength(1);
            expect(result.current.data?.rows[0]).toMatchObject({
                id: 'todo-1',
                title: 'Call venue',
                due_date: '2026-06-10',
                courses: { id: 'course-1', name: 'Safe Pass' },
                comment_count: 3,
            });
        });

        it('returns available: false with empty rows gracefully when admin_todos table is missing (PGRST205)', async () => {
            mockSelectPage({
                data: null,
                error: { code: 'PGRST205', message: "Could not find the table 'public.admin_todos'" },
            });
            const queryClient = makeQueryClient();

            const { result } = renderHook(() => useAdminTodos(true), {
                wrapper: createWrapper(queryClient),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual({ rows: [], available: false });
        });
    });

    describe('useCreateTodo', () => {
        it('inserts a todo and prepends it to the cached list on success', async () => {
            const existing = makeTodo({ id: 'todo-existing', title: 'Existing task' });
            const createdRaw = makeRawRow({ id: 'todo-new', title: 'New task', description: 'Details' });

            const single = vi.fn().mockResolvedValueOnce({ data: createdRaw, error: null });
            const select = vi.fn(() => ({ single }));
            const insert = vi.fn(() => ({ select }));
            mockFrom.mockReturnValue({ insert } as never);

            const queryClient = makeQueryClient();
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, {
                available: true,
                rows: [existing],
            });

            const { result } = renderHook(() => useCreateTodo(), {
                wrapper: createWrapper(queryClient),
            });

            await act(async () => {
                await result.current.mutateAsync({
                    title: '  New task  ',
                    description: '  Details  ',
                    priority: 'urgent',
                });
            });

            expect(insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'New task',
                    description: 'Details',
                    priority: 'urgent',
                    created_by: 'admin-self',
                }),
            );

            const cached = queryClient.getQueryData<AdminTodosResult>(TODOS_KEY);
            expect(cached?.rows.map(r => r.id)).toEqual(['todo-new', 'todo-existing']);
        });

        it('preserves existing cache and rejects when Supabase insert fails', async () => {
            const existing = makeTodo({ id: 'todo-existing', title: 'Existing task' });
            const single = vi.fn().mockResolvedValueOnce({
                data: null,
                error: { code: '42501', message: 'Permission denied' },
            });
            const select = vi.fn(() => ({ single }));
            const insert = vi.fn(() => ({ select }));
            mockFrom.mockReturnValue({ insert } as never);

            const queryClient = makeQueryClient();
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, {
                available: true,
                rows: [existing],
            });

            const { result } = renderHook(() => useCreateTodo(), {
                wrapper: createWrapper(queryClient),
            });

            await expect(
                result.current.mutateAsync({ title: 'Will fail' }),
            ).rejects.toMatchObject({ message: 'Permission denied' });

            const cached = queryClient.getQueryData<AdminTodosResult>(TODOS_KEY);
            expect(cached?.rows).toEqual([existing]);
        });
    });

    describe('useUpdateTodo', () => {
        it('optimistically updates the cache immediately and rolls back on Supabase error', async () => {
            const initial = makeTodo({ id: 'todo-opt-upd', title: 'Original title', status: 'open' });
            let resolveUpdate!: (value: { data: null; error: { message: string } }) => void;
            const single = vi.fn(
                () =>
                    new Promise(resolve => {
                        resolveUpdate = resolve;
                    }),
            );
            const select = vi.fn(() => ({ single }));
            const eq = vi.fn(() => ({ select }));
            const update = vi.fn(() => ({ eq }));
            mockFrom.mockReturnValue({ update } as never);

            const queryClient = makeQueryClient();
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, {
                available: true,
                rows: [initial],
            });

            const { result } = renderHook(() => useUpdateTodo(), {
                wrapper: createWrapper(queryClient),
            });

            let promise!: Promise<unknown>;
            act(() => {
                promise = result.current
                    .mutateAsync({ id: 'todo-opt-upd', patch: { title: 'Updated title', status: 'done' } })
                    .catch(err => err);
            });

            // Immediately updated optimistically before Supabase responds
            await waitFor(() => {
                const optimistic = queryClient.getQueryData<AdminTodosResult>(TODOS_KEY)?.rows[0];
                expect(optimistic?.title).toBe('Updated title');
                expect(optimistic?.status).toBe('done');
                expect(optimistic?.completed_by).toBe('admin-self');
            });

            // Simulate Supabase error -> rolls back to original cache
            resolveUpdate({ data: null, error: { message: 'Update failed' } });
            const err = await promise;
            expect(err).toMatchObject({ message: 'Update failed' });

            await waitFor(() => {
                const rolledBack = queryClient.getQueryData<AdminTodosResult>(TODOS_KEY)?.rows[0];
                expect(rolledBack?.title).toBe('Original title');
                expect(rolledBack?.status).toBe('open');
                expect(rolledBack?.completed_by).toBeNull();
            });
        });
    });

    describe('useDeleteTodo', () => {
        it('optimistically removes the todo immediately and restores it on Supabase error', async () => {
            const first = makeTodo({ id: 'todo-del-1', title: 'Keep me' });
            const second = makeTodo({ id: 'todo-del-2', title: 'Delete me' });

            let resolveDelete!: (value: { error: { message: string } }) => void;
            const eq = vi.fn(
                () =>
                    new Promise(resolve => {
                        resolveDelete = resolve;
                    }),
            );
            const del = vi.fn(() => ({ eq }));
            mockFrom.mockReturnValue({ delete: del } as never);

            const queryClient = makeQueryClient();
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, {
                available: true,
                rows: [first, second],
            });

            const { result } = renderHook(() => useDeleteTodo(), {
                wrapper: createWrapper(queryClient),
            });

            let promise!: Promise<unknown>;
            act(() => {
                promise = result.current.mutateAsync('todo-del-2').catch(err => err);
            });

            // Removed immediately before server replies
            await waitFor(() => {
                expect(queryClient.getQueryData<AdminTodosResult>(TODOS_KEY)?.rows.map(r => r.id)).toEqual(['todo-del-1']);
            });

            // Simulate failure -> rolled back to both rows
            resolveDelete({ error: { message: 'Delete blocked' } });
            const err = await promise;
            expect(err).toMatchObject({ message: 'Delete blocked' });

            await waitFor(() => {
                expect(queryClient.getQueryData<AdminTodosResult>(TODOS_KEY)?.rows.map(r => r.id)).toEqual([
                    'todo-del-1',
                    'todo-del-2',
                ]);
            });
        });
    });

    describe('useTodoRealtimeNotifier', () => {
        type PgHandler = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => void;

        function setupRealtimeChannel() {
            const handlers: Array<{ table: string; event: string; cb: PgHandler }> = [];
            const channelObj = {
                on: vi.fn((_type: string, filter: { table: string; event: string }, cb: PgHandler) => {
                    handlers.push({ table: filter.table, event: filter.event, cb });
                    return channelObj;
                }),
                subscribe: vi.fn(() => channelObj),
            };
            mockChannel.mockReturnValue(channelObj as never);

            const emit = (table: string, event: string, payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
                handlers
                    .filter(h => h.table === table && h.event === event)
                    .forEach(h => h.cb(payload));
            };

            return { channelObj, emit };
        }

        it('fires a toast when another admin assigns a task to the current user and opens it on action click', () => {
            const { emit } = setupRealtimeChannel();
            const queryClient = makeQueryClient();
            queryClient.setQueryData<AdminProfile[]>(ADMIN_PROFILES_KEY, [
                { id: 'admin-other', email: 'mary@example.ie', full_name: 'Mary O\'Connor' },
            ]);
            const onOpenTodo = vi.fn();

            const { unmount } = renderHook(() => useTodoRealtimeNotifier(true, onOpenTodo), {
                wrapper: createWrapper(queryClient),
            });

            // Another admin inserts a task assigned to admin-self
            act(() => {
                emit('admin_todos', 'INSERT', {
                    new: {
                        id: 'rt-insert-1',
                        title: 'Prepare Safe Pass packs',
                        assignee_id: 'admin-self',
                        created_by: 'admin-other',
                    },
                });
            });

            expect(toasts).toHaveLength(1);
            expect(toasts[0].type).toBe('info');
            expect(toasts[0].message).toBe('Mary O\'Connor assigned you "Prepare Safe Pass packs"');
            expect(toasts[0].action?.label).toBe('Open');

            toasts[0].action?.onClick();
            expect(onOpenTodo).toHaveBeenCalledWith('rt-insert-1');

            // Another admin reassigns an existing task to admin-self via UPDATE
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, {
                available: true,
                rows: [makeTodo({ id: 'rt-update-1', assignee_id: 'admin-other' })],
            });
            act(() => {
                emit('admin_todos', 'UPDATE', {
                    new: {
                        id: 'rt-update-1',
                        title: 'Follow up with tutor',
                        assignee_id: 'admin-self',
                        created_by: 'admin-other',
                    },
                    old: { assignee_id: 'admin-other' },
                });
            });

            expect(toasts).toHaveLength(2);
            expect(toasts[1].message).toBe('Task assigned to you: "Follow up with tutor"');

            unmount();
            expect(mockRemoveChannel).toHaveBeenCalled();
        });

        it('does not fire a toast for self-authored inserts, self-authored updates, or recent local writes', async () => {
            const { emit } = setupRealtimeChannel();
            const queryClient = makeQueryClient();
            queryClient.setQueryData<AdminTodosResult>(TODOS_KEY, {
                available: true,
                rows: [
                    makeTodo({ id: 'todo-local-write', assignee_id: 'admin-other' }),
                    makeTodo({ id: 'todo-already-mine', assignee_id: 'admin-self' }),
                ],
            });

            // Perform a local update on todo-local-write so it is marked as a recent local write
            const single = vi.fn().mockResolvedValueOnce({
                data: makeRawRow({ id: 'todo-local-write', assignee_id: 'admin-self' }),
                error: null,
            });
            const select = vi.fn(() => ({ single }));
            const eq = vi.fn(() => ({ select }));
            const update = vi.fn(() => ({ eq }));
            mockFrom.mockReturnValue({ update } as never);

            const { result: updateHook } = renderHook(() => useUpdateTodo(), {
                wrapper: createWrapper(queryClient),
            });
            await act(async () => {
                await updateHook.current.mutateAsync({
                    id: 'todo-local-write',
                    patch: { assignee_id: 'admin-self' },
                });
            });

            renderHook(() => useTodoRealtimeNotifier(true), {
                wrapper: createWrapper(queryClient),
            });

            act(() => {
                // 1. Self-authored INSERT assigned to self
                emit('admin_todos', 'INSERT', {
                    new: {
                        id: 'rt-self-insert',
                        title: 'My own reminder',
                        assignee_id: 'admin-self',
                        created_by: 'admin-self',
                    },
                });

                // 2. Echo of our own recent local write
                emit('admin_todos', 'UPDATE', {
                    new: {
                        id: 'todo-local-write',
                        title: 'Locally updated',
                        assignee_id: 'admin-self',
                        created_by: 'admin-other',
                    },
                    old: { assignee_id: 'admin-other' },
                });

                // 3. Task already assigned to admin-self in cache
                emit('admin_todos', 'UPDATE', {
                    new: {
                        id: 'todo-already-mine',
                        title: 'Already mine',
                        assignee_id: 'admin-self',
                        created_by: 'admin-other',
                    },
                });

                // 4. Uncached UPDATE where created_by is admin-self
                emit('admin_todos', 'UPDATE', {
                    new: {
                        id: 'rt-self-uncached',
                        title: 'Self created uncached',
                        assignee_id: 'admin-self',
                        created_by: 'admin-self',
                    },
                });
            });

            expect(toasts).toHaveLength(0);
        });
    });
});

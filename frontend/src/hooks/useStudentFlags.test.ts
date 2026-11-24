import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStudentFlags } from './useStudentFlags';
import { supabase } from '../lib/supabase';
import type { ShowToast } from '../lib/toast';
import type { StudentFlag } from '../lib/types';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
    },
}));

function makeFlag(overrides: Partial<StudentFlag> & { id: string; student_id: string }): StudentFlag {
    return {
        course_id: 'course-1',
        comment: 'No-show twice',
        created_at: '2026-03-01T10:00:00Z',
        courses: {
            id: overrides.course_id ?? 'course-1',
            name: 'Safe Pass',
            created_at: '2026-01-01T00:00:00Z',
        },
        ...overrides,
    };
}

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return {
        queryClient,
        wrapper: ({ children }: { children: React.ReactNode }) =>
            React.createElement(QueryClientProvider, { client: queryClient }, children),
    };
}

interface MockFlagsDb {
    rows: StudentFlag[];
    selectError?: { message: string } | null;
    insertHandler?: (payload: Record<string, unknown>) => Promise<{ data: StudentFlag | null; error: { message: string } | null }>;
    deleteHandler?: (id: string) => Promise<{ error: { message: string } | null }>;
    rangeCalls: Array<[number, number]>;
    insertPayloads: Array<Record<string, unknown>>;
    deleteIds: string[];
}

function setupSupabaseMock(db: MockFlagsDb) {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
        if (table !== 'student_flags') {
            throw new Error(`Unexpected table: ${table}`);
        }
        return {
            select: () => ({
                order: () => ({
                    order: () => ({
                        range: (from: number, to: number) => {
                            db.rangeCalls.push([from, to]);
                            if (db.selectError) {
                                return Promise.resolve({ data: null, error: db.selectError });
                            }
                            return Promise.resolve({
                                data: db.rows.slice(from, to + 1),
                                error: null,
                            });
                        },
                    }),
                }),
            }),
            insert: (payload: Record<string, unknown>) => {
                db.insertPayloads.push(payload);
                return {
                    select: () => ({
                        single: () => {
                            if (db.insertHandler) return db.insertHandler(payload);
                            return Promise.resolve({
                                data: makeFlag({
                                    id: 'flag-new',
                                    student_id: String(payload.student_id),
                                    course_id: String(payload.course_id),
                                    comment: (payload.comment as string | null) ?? null,
                                    created_at: '2026-04-01T12:00:00Z',
                                }),
                                error: null,
                            });
                        },
                    }),
                };
            },
            delete: () => ({
                eq: (_col: string, id: string) => {
                    db.deleteIds.push(id);
                    if (db.deleteHandler) return db.deleteHandler(id);
                    return Promise.resolve({ error: null });
                },
            }),
        };
    }) as never);
}

describe('useStudentFlags', () => {
    let showToast: ReturnType<typeof vi.fn<ShowToast>>;
    let db: MockFlagsDb;

    beforeEach(() => {
        vi.clearAllMocks();
        showToast = vi.fn<ShowToast>();
        db = {
            rows: [],
            rangeCalls: [],
            insertPayloads: [],
            deleteIds: [],
        };
        setupSupabaseMock(db);
    });

    it('fetches flags and groups multiple flags per student into flagsByStudentId', async () => {
        const flag1 = makeFlag({ id: 'f-1', student_id: 's-1', course_id: 'c-1', comment: 'Missed session 1', created_at: '2026-03-02T10:00:00Z' });
        const flag2 = makeFlag({ id: 'f-2', student_id: 's-1', course_id: 'c-2', comment: 'Missing ID document', created_at: '2026-03-01T10:00:00Z' });
        const flag3 = makeFlag({ id: 'f-3', student_id: 's-2', course_id: 'c-1', comment: null, created_at: '2026-02-28T10:00:00Z' });
        db.rows = [flag1, flag2, flag3];

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useStudentFlags(showToast), { wrapper });

        await waitFor(() => expect(result.current.flags).toHaveLength(3));

        expect(db.rangeCalls).toEqual([[0, 999]]);
        expect(result.current.flagsByStudentId.get('s-1')).toEqual([flag1, flag2]);
        expect(result.current.flagsByStudentId.get('s-2')).toEqual([flag3]);
        expect(result.current.flagsByStudentId.get('s-unknown')).toBeUndefined();
    });

    it('paginates across more than 1000 flags using fetchAllPages', async () => {
        db.rows = Array.from({ length: 1250 }, (_, i) =>
            makeFlag({
                id: `f-${i}`,
                student_id: `s-${i % 500}`,
                course_id: `c-${i % 3}`,
                comment: i % 2 === 0 ? `Note ${i}` : null,
            }),
        );

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useStudentFlags(showToast), { wrapper });

        await waitFor(() => expect(result.current.flags).toHaveLength(1250));

        expect(db.rangeCalls).toContainEqual([0, 999]);
        expect(db.rangeCalls).toContainEqual([1000, 1999]);
        expect(result.current.flagsByStudentId.size).toBe(500);
        // Student s-0 appears at indices 0, 500, 1000
        expect(result.current.flagsByStudentId.get('s-0')).toHaveLength(3);
    });

    it('returns empty list and empty map when no flags exist or query fails', async () => {
        db.selectError = { message: 'RLS denied' };

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useStudentFlags(showToast), { wrapper });

        await waitFor(() => expect(db.rangeCalls).toHaveLength(1));
        expect(result.current.flags).toEqual([]);
        expect(result.current.flagsByStudentId.size).toBe(0);
    });

    it('adds a flag, prepends it to cache, and shows success toast', async () => {
        const existing = makeFlag({ id: 'f-old', student_id: 's-1', comment: 'Earlier flag' });
        db.rows = [existing];

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useStudentFlags(showToast), { wrapper });

        await waitFor(() => expect(result.current.flags).toHaveLength(1));

        act(() => {
            result.current.addFlag('s-1', 'c-2', 'Opted out of SMS');
        });

        await waitFor(() => expect(result.current.flags).toHaveLength(2));

        expect(db.insertPayloads).toEqual([
            { student_id: 's-1', course_id: 'c-2', comment: 'Opted out of SMS' },
        ]);
        expect(result.current.flags[0].id).toBe('flag-new');
        expect(result.current.flagsByStudentId.get('s-1')?.map(f => f.id)).toEqual(['flag-new', 'f-old']);
        expect(showToast).toHaveBeenCalledWith('Student flagged', 'success');
    });

    it('normalizes empty comment string to null when adding a flag', async () => {
        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useStudentFlags(showToast), { wrapper });

        await waitFor(() => expect(db.rangeCalls).toHaveLength(1));

        act(() => {
            result.current.addFlag('s-9', 'c-1', '');
        });

        await waitFor(() => expect(result.current.flags).toHaveLength(1));

        expect(db.insertPayloads).toEqual([
            { student_id: 's-9', course_id: 'c-1', comment: null },
        ]);
        expect(result.current.flags[0].comment).toBeNull();
    });

    it('shows error toast and keeps cache intact when addFlag fails', async () => {
        const existing = makeFlag({ id: 'f-1', student_id: 's-1' });
        db.rows = [existing];
        db.insertHandler = async () => ({ data: null, error: { message: 'duplicate key violation' } });

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useStudentFlags(showToast), { wrapper });

        await waitFor(() => expect(result.current.flags).toHaveLength(1));

        act(() => {
            result.current.addFlag('s-1', 'c-1', 'Duplicate flag');
        });

        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Failed to add flag', 'error'));
        expect(result.current.flags).toEqual([existing]);
    });

    it('optimistically removes a flag before deletion settles and keeps sibling flags for the same student', async () => {
        const flag1 = makeFlag({ id: 'f-1', student_id: 's-1', course_id: 'c-1' });
        const flag2 = makeFlag({ id: 'f-2', student_id: 's-1', course_id: 'c-2' });
        db.rows = [flag1, flag2];

        let resolveDelete!: (v: { error: null }) => void;
        db.deleteHandler = () => new Promise(resolve => { resolveDelete = resolve; });

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useStudentFlags(showToast), { wrapper });

        await waitFor(() => expect(result.current.flags).toHaveLength(2));

        act(() => {
            result.current.removeFlag('f-1');
        });

        // Optimistic update happens before the network request finishes
        await waitFor(() => expect(result.current.flags).toHaveLength(1));
        expect(result.current.flagsByStudentId.get('s-1')).toEqual([flag2]);
        expect(showToast).not.toHaveBeenCalled();

        await act(async () => {
            resolveDelete({ error: null });
        });

        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Flag removed', 'success'));
        expect(db.deleteIds).toEqual(['f-1']);
        expect(result.current.flags).toEqual([flag2]);
    });

    it('rolls back optimistic removal and shows error toast when removeFlag fails', async () => {
        const flag1 = makeFlag({ id: 'f-1', student_id: 's-1' });
        const flag2 = makeFlag({ id: 'f-2', student_id: 's-2' });
        db.rows = [flag1, flag2];

        let resolveDelete!: (v: { error: { message: string } }) => void;
        db.deleteHandler = () => new Promise(resolve => { resolveDelete = resolve; });

        const { wrapper } = createWrapper();
        const { result } = renderHook(() => useStudentFlags(showToast), { wrapper });

        await waitFor(() => expect(result.current.flags).toHaveLength(2));

        act(() => {
            result.current.removeFlag('f-1');
        });

        await waitFor(() => expect(result.current.flags).toHaveLength(1));

        await act(async () => {
            resolveDelete({ error: { message: 'Network error' } });
        });

        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Failed to remove flag', 'error'));
        expect(result.current.flags).toEqual([flag1, flag2]);
        expect(result.current.flagsByStudentId.get('s-1')).toEqual([flag1]);
    });

    it('keeps addFlag and removeFlag callback references stable across rerenders', async () => {
        const { wrapper } = createWrapper();
        const { result, rerender } = renderHook(() => useStudentFlags(showToast), { wrapper });

        await waitFor(() => expect(db.rangeCalls).toHaveLength(1));
        const firstAdd = result.current.addFlag;
        const firstRemove = result.current.removeFlag;

        rerender();

        expect(result.current.addFlag).toBe(firstAdd);
        expect(result.current.removeFlag).toBe(firstRemove);
    });
});

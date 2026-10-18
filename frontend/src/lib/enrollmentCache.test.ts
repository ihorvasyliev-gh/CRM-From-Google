import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { EnrollmentWithRelations } from './documentRender';
import {
    mergeEnrollmentRows, patchCachedEnrollments, MAX_PATCHED_ENROLLMENTS, refreshCachedEnrollments, refreshStudentEnrollments,
    updateCachedRelations, removeCachedEnrollments, noteFullLoad, resetSyncPoint, syncCachedEnrollments, MAX_SYNCED_ENROLLMENTS,
    configureEnrollmentCache, shareRowsById, withHistory, restoreCachedRows, cancelListReload, markListPartial, isPartialList,
} from './enrollmentCache';
import type { ChangesSince } from './queries';

const fetchEnrollmentsByIds = vi.fn<(ids: string[]) => Promise<EnrollmentWithRelations[]>>();
const fetchEnrollmentsByStudentIds = vi.fn<(ids: string[]) => Promise<EnrollmentWithRelations[]>>();
const fetchChangesSince = vi.fn<(since: string, limit: number) => Promise<ChangesSince>>();
vi.mock('./queries', async importOriginal => ({
    ENROLLMENT_STUDENT_FIELDS: (await importOriginal<typeof import('./queries')>()).ENROLLMENT_STUDENT_FIELDS,
    ENROLLMENT_COURSE_FIELDS: (await importOriginal<typeof import('./queries')>()).ENROLLMENT_COURSE_FIELDS,
    fetchEnrollmentsByIds: (ids: string[]) => fetchEnrollmentsByIds(ids),
    fetchEnrollmentsByStudentIds: (ids: string[]) => fetchEnrollmentsByStudentIds(ids),
    fetchChangesSince: (since: string, limit: number) => fetchChangesSince(since, limit),
}));

const row = (id: string, created_at: string, status: EnrollmentWithRelations['status'] = 'requested') =>
    ({ id, created_at, status }) as EnrollmentWithRelations;

describe('mergeEnrollmentRows', () => {
    const a = row('a', '2026-03-03T10:00:00Z');
    const b = row('b', '2026-03-02T10:00:00Z');
    const c = row('c', '2026-03-01T10:00:00Z');

    it('replaces changed rows in place and keeps the others as they were', () => {
        const b2 = row('b', b.created_at, 'invited');
        const merged = mergeEnrollmentRows([a, b, c], new Set(['b']), [b2]);
        expect(merged).toEqual([a, b2, c]);
        expect(merged[0]).toBe(a);
        expect(merged[2]).toBe(c);
    });

    it('drops changed rows that no longer exist', () => {
        expect(mergeEnrollmentRows([a, b, c], new Set(['a', 'c']), [])).toEqual([b]);
    });

    it('adds new rows in reading order: newest first, then id', () => {
        const newest = row('d', '2026-03-04T10:00:00Z');
        const tie = row('aa', a.created_at);
        const merged = mergeEnrollmentRows([a, b, c], new Set(['d', 'aa']), [newest, tie]);
        expect(merged.map(r => r.id)).toEqual(['d', 'a', 'aa', 'b', 'c']);
    });
});

describe('patchCachedEnrollments', () => {
    beforeEach(() => {
        fetchEnrollmentsByIds.mockReset();
    });

    const cached = [row('a', '2026-03-03T10:00:00Z'), row('b', '2026-03-02T10:00:00Z')];
    const clientWith = (data?: EnrollmentWithRelations[]) => {
        const client = new QueryClient();
        if (data) client.setQueryData(['enrollments'], data);
        return client;
    };

    it('re-reads the changed rows into the cached list', async () => {
        const client = clientWith(cached);
        fetchEnrollmentsByIds.mockResolvedValue([row('b', cached[1].created_at, 'confirmed')]);

        expect(await patchCachedEnrollments(client, ['b'])).toBe(true);

        expect(fetchEnrollmentsByIds).toHaveBeenCalledWith(['b']);
        const data = client.getQueryData<EnrollmentWithRelations[]>(['enrollments'])!;
        expect(data.map(r => r.status)).toEqual(['requested', 'confirmed']);
        expect(data[0]).toBe(cached[0]);
    });

    it('asks for a reload when nothing is cached yet', async () => {
        expect(await patchCachedEnrollments(clientWith(), ['b'])).toBe(false);
        expect(fetchEnrollmentsByIds).not.toHaveBeenCalled();
    });

    it('asks for a reload after a large burst of changes', async () => {
        const ids = Array.from({ length: MAX_PATCHED_ENROLLMENTS + 1 }, (_, i) => `id-${i}`);
        expect(await patchCachedEnrollments(clientWith(cached), ids)).toBe(false);
        expect(fetchEnrollmentsByIds).not.toHaveBeenCalled();
    });

    it('asks for a reload when the rows cannot be read', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        fetchEnrollmentsByIds.mockRejectedValue(new Error('offline'));
        const client = clientWith(cached);
        expect(await patchCachedEnrollments(client, ['b'])).toBe(false);
        expect(client.getQueryData(['enrollments'])).toBe(cached);
    });
});

describe('patchCachedEnrollments while the list is loading', () => {
    beforeEach(() => {
        fetchEnrollmentsByIds.mockReset();
    });

    const before = [row('a', '2026-03-03T10:00:00Z'), row('b', '2026-03-02T10:00:00Z')];

    it('lets a running full load finish instead of restarting it, then re-reads the changed rows', async () => {
        const client = new QueryClient();
        client.setQueryData(['enrollments'], before);
        let finishLoad: (rows: EnrollmentWithRelations[]) => void = () => {};
        const loadAll = vi.fn(() => new Promise<EnrollmentWithRelations[]>(resolve => { finishLoad = resolve; }));
        const load = client.fetchQuery({ queryKey: ['enrollments'], queryFn: loadAll });
        fetchEnrollmentsByIds.mockResolvedValue([row('b', before[1].created_at, 'confirmed')]);

        const patch = patchCachedEnrollments(client, ['b']);
        await Promise.resolve();
        expect(fetchEnrollmentsByIds).not.toHaveBeenCalled(); // waits for the load

        // The load read 'b' before it changed
        finishLoad([...before]);
        await load;
        expect(await patch).toBe(true);

        expect(loadAll).toHaveBeenCalledTimes(1); // not restarted
        expect(fetchEnrollmentsByIds).toHaveBeenCalledWith(['b']);
        const data = client.getQueryData<EnrollmentWithRelations[]>(['enrollments'])!;
        expect(data.map(r => r.status)).toEqual(['requested', 'confirmed']);
    });

    it("is not held up by a student's own enrollments loading", async () => {
        const client = new QueryClient();
        client.setQueryData(['enrollments'], before);
        void client.fetchQuery({ queryKey: ['enrollments', 'by_student', 's-1'], queryFn: () => new Promise(() => {}) });
        fetchEnrollmentsByIds.mockResolvedValue([row('b', before[1].created_at, 'confirmed')]);

        expect(await patchCachedEnrollments(client, ['b'])).toBe(true);
        expect(client.getQueryData<EnrollmentWithRelations[]>(['enrollments'])!.map(r => r.status)).toEqual(['requested', 'confirmed']);
    });
});

/** A client set up as the app's is (main.tsx). */
const appClient = () => {
    const client = new QueryClient();
    configureEnrollmentCache(client);
    return client;
};
const listOf = (client: QueryClient) => client.getQueryData<EnrollmentWithRelations[]>(['enrollments'])!;
const isInvalidated = (client: QueryClient, key: unknown[]) =>
    client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated;

describe('refreshCachedEnrollments', () => {
    beforeEach(() => {
        fetchEnrollmentsByIds.mockReset();
    });

    it("re-reads the rows changed here, and the open student cards' own lists", async () => {
        const client = appClient();
        client.setQueryData(['enrollments'], [row('a', '2026-03-03T10:00:00Z')]);
        client.setQueryData(['enrollments', 'by_student', 's-1'], []);
        fetchEnrollmentsByIds.mockResolvedValue([row('a', '2026-03-03T10:00:00Z', 'invited')]);

        await refreshCachedEnrollments(client, ['a']);

        expect(listOf(client).map(r => r.status)).toEqual(['invited']);
        expect(isInvalidated(client, ['enrollments'])).toBe(false);
        expect(isInvalidated(client, ['enrollments', 'by_student', 's-1'])).toBe(true);
    });

    it('reloads the list when the rows cannot be read', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const client = appClient();
        client.setQueryData(['enrollments'], [row('a', '2026-03-03T10:00:00Z')]);
        fetchEnrollmentsByIds.mockRejectedValue(new Error('offline'));

        await refreshCachedEnrollments(client, ['a']);

        expect(isInvalidated(client, ['enrollments'])).toBe(true);
    });
});

describe('refreshStudentEnrollments', () => {
    beforeEach(() => {
        fetchEnrollmentsByStudentIds.mockReset();
    });

    const enrollment = (id: string, student_id: string, created_at = '2026-03-01T10:00:00Z') =>
        ({ ...row(id, created_at), student_id }) as EnrollmentWithRelations;

    it("replaces the students' enrollments with fresh ones, dropping the ones gone (a merge)", async () => {
        const other = enrollment('x', 's-3');
        const client = appClient();
        client.setQueryData(['enrollments'], [enrollment('a', 's-1'), enrollment('b', 's-2'), other]);
        fetchEnrollmentsByStudentIds.mockResolvedValue([enrollment('a', 's-1')]);

        await refreshStudentEnrollments(client, ['s-1', 's-2']);

        expect(fetchEnrollmentsByStudentIds).toHaveBeenCalledWith(['s-1', 's-2']);
        expect(listOf(client).map(r => r.id)).toEqual(['a', 'x']);
        expect(listOf(client)[1]).toBe(other);
    });

    it('reloads the list when they cannot be read', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const client = appClient();
        client.setQueryData(['enrollments'], [enrollment('a', 's-1')]);
        fetchEnrollmentsByStudentIds.mockRejectedValue(new Error('offline'));

        await refreshStudentEnrollments(client, ['s-1']);

        expect(isInvalidated(client, ['enrollments'])).toBe(true);
    });
});

describe('updateCachedRelations', () => {
    const withRelations = (id: string, student_id: string, course_id: string) => ({
        ...row(id, '2026-03-01T10:00:00Z'),
        student_id,
        course_id,
        students: { id: student_id, first_name: 'Ann', last_name: 'Lee' },
        courses: { id: course_id, name: 'Python', requires_english: false, max_capacity: null },
    }) as unknown as EnrollmentWithRelations;

    it("writes a student's and a course's new details into their enrollments only", () => {
        const untouched = withRelations('c', 's-2', 'c-2');
        const client = appClient();
        client.setQueryData(['enrollments'], [withRelations('a', 's-1', 'c-1'), withRelations('b', 's-2', 'c-1'), untouched]);

        updateCachedRelations(client, {
            // As a realtime event carries it: every column, of which only the carried ones are kept
            students: [{ id: 's-1', first_name: 'Anna', last_name: 'Lee', notes: 'not carried' }],
            courses: [{ id: 'c-1', name: 'Python 2' }],
        });

        const [a, b, c] = listOf(client);
        expect(a.students).toEqual({ id: 's-1', first_name: 'Anna', last_name: 'Lee' });
        expect(a.courses?.name).toBe('Python 2');
        expect(b.students?.first_name).toBe('Ann');
        expect(b.courses?.name).toBe('Python 2');
        expect(c).toBe(untouched);
    });

    it('keeps the list as it is when nothing differs', () => {
        const list = [withRelations('a', 's-1', 'c-1')];
        const client = appClient();
        client.setQueryData(['enrollments'], list);

        updateCachedRelations(client, { students: [{ id: 's-1', first_name: 'Ann' }], courses: [{ id: 'c-1', requires_english: false }] });

        expect(listOf(client)).toBe(list);
    });
});

describe('removeCachedEnrollments', () => {
    it('drops the matching rows (a deleted course or student)', () => {
        const client = appClient();
        client.setQueryData(['enrollments'], [
            { ...row('a', '2026-03-02T10:00:00Z'), course_id: 'c-1' },
            { ...row('b', '2026-03-01T10:00:00Z'), course_id: 'c-2' },
        ]);

        removeCachedEnrollments(client, e => e.course_id === 'c-1');

        expect(listOf(client).map(r => r.id)).toEqual(['b']);
    });
});

describe('syncCachedEnrollments', () => {
    beforeEach(() => {
        fetchChangesSince.mockReset();
        resetSyncPoint();
    });

    const at = (id: string, created_at: string, updated_at: string, status: EnrollmentWithRelations['status'] = 'requested') =>
        ({ ...row(id, created_at, status), updated_at, student_id: `s-${id}`, course_id: 'c-1', students: { id: `s-${id}`, first_name: id }, courses: null }) as unknown as EnrollmentWithRelations;
    const changes = (over: Partial<ChangesSince>): ChangesSince => ({ enrollments: [], total: 0, students: [], courses: [], ...over });

    const a = at('a', '2026-03-03T10:00:00Z', '2026-03-05T10:00:00Z');
    const b = at('b', '2026-03-02T10:00:00Z', '2026-03-02T10:00:00Z');
    const loaded = (rows = [a, b]) => {
        const client = appClient();
        client.setQueryData(['enrollments'], rows);
        noteFullLoad(rows);
        return client;
    };

    it('reads only what changed since the last load, a few minutes back', async () => {
        const client = loaded();
        fetchChangesSince.mockResolvedValue(changes({ total: 2 }));

        expect(await syncCachedEnrollments(client)).toBe(true);

        expect(fetchChangesSince).toHaveBeenCalledWith('2026-03-05T09:55:00.000Z', MAX_SYNCED_ENROLLMENTS);
        expect(listOf(client)).toEqual([a, b]);
    });

    it('merges changed and new rows and moves the sync point on', async () => {
        const client = loaded();
        const b2 = at('b', b.created_at, '2026-03-06T10:00:00Z', 'invited');
        const c = at('c', '2026-03-06T11:00:00Z', '2026-03-06T11:00:00Z');
        // 'a' is read again (the overlap) but has not changed: its object stays
        fetchChangesSince.mockResolvedValue(changes({ enrollments: [a, b2, c], total: 3 }));

        expect(await syncCachedEnrollments(client)).toBe(true);

        expect(listOf(client).map(r => [r.id, r.status])).toEqual([['c', 'requested'], ['a', 'requested'], ['b', 'invited']]);
        expect(listOf(client)[1]).toBe(a);

        fetchChangesSince.mockResolvedValue(changes({ total: 3 }));
        await syncCachedEnrollments(client);
        expect(fetchChangesSince).toHaveBeenLastCalledWith('2026-03-06T10:55:00.000Z', MAX_SYNCED_ENROLLMENTS);
    });

    it("writes edited students' details into their enrollments", async () => {
        const client = loaded();
        fetchChangesSince.mockResolvedValue(changes({
            total: 2,
            students: [{ id: 's-b', first_name: 'Bea', updated_at: '2026-03-07T10:00:00Z' } as ChangesSince['students'][number]],
        }));

        expect(await syncCachedEnrollments(client)).toBe(true);

        expect(listOf(client)[1].students?.first_name).toBe('Bea');
        expect(listOf(client)[0]).toBe(a);
    });

    it('asks for a reload when rows were deleted meanwhile', async () => {
        const client = loaded();
        fetchChangesSince.mockResolvedValue(changes({ total: 1 }));

        expect(await syncCachedEnrollments(client)).toBe(false);
        expect(listOf(client)).toEqual([a, b]);
    });

    it('asks for a reload after too many changes', async () => {
        const client = loaded();
        const many = Array.from({ length: MAX_SYNCED_ENROLLMENTS + 1 }, (_, i) => at(`n${i}`, '2026-03-06T10:00:00Z', '2026-03-06T10:00:00Z'));
        fetchChangesSince.mockResolvedValue(changes({ enrollments: many, total: 2 + many.length }));

        expect(await syncCachedEnrollments(client)).toBe(false);
    });

    it('asks for a reload when the changes cannot be read (e.g. before migration 84)', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const client = loaded();
        fetchChangesSince.mockRejectedValue(new Error('column students.updated_at does not exist'));

        expect(await syncCachedEnrollments(client)).toBe(false);
    });

    it('asks for a reload when the list was never loaded', async () => {
        const client = appClient();
        client.setQueryData(['enrollments'], [a]);
        expect(await syncCachedEnrollments(client)).toBe(false);
        expect(fetchChangesSince).not.toHaveBeenCalled();
    });
});

describe('shareRowsById', () => {
    const a = { id: 'a', status: 'requested', students: { id: 's-1', first_name: 'Ann' } };
    const b = { id: 'b', status: 'requested', students: { id: 's-2', first_name: 'Bo' } };

    it('keeps unchanged rows when a new one comes first, and copies nothing', () => {
        const c = { id: 'c', status: 'requested' };
        const shared = shareRowsById([a, b], [c, { ...a }, { ...b }]) as unknown[];
        expect(shared[0]).toBe(c);
        expect(shared[1]).toBe(a);
        expect(shared[2]).toBe(b);
    });

    it('returns the same list when nothing changed', () => {
        const list = [a, b];
        expect(shareRowsById(list, [{ ...a }, { ...b, students: { ...b.students } }])).toBe(list);
    });

    it('takes a changed row, sharing what in it is unchanged', () => {
        const shared = shareRowsById([a, b], [a, { ...b, status: 'invited', students: { ...b.students } }]) as typeof a[];
        expect(shared[1]).not.toBe(b);
        expect(shared[1].status).toBe('invited');
        expect(shared[1].students).toBe(b.students);
    });
});

describe('the first load in two parts', () => {
    const current = [row('a', '2026-03-03T10:00:00Z'), row('c', '2026-03-01T10:00:00Z', 'invited')];
    const history = [row('b', '2026-03-02T10:00:00Z', 'completed'), row('d', '2026-02-01T10:00:00Z', 'rejected')];

    /** Partway through a first load: its first part is cached and the rest still loading. */
    const midLoad = () => {
        const client = appClient();
        let finish: (rows: EnrollmentWithRelations[]) => void = () => {};
        const load = client.fetchQuery({
            queryKey: ['enrollments'],
            queryFn: () => new Promise<EnrollmentWithRelations[]>(resolve => {
                client.setQueryData(['enrollments'], current);
                markListPartial(client);
                finish = resolve;
            }),
        });
        return { client, load, finish: (rows: EnrollmentWithRelations[]) => finish(rows) };
    };

    it('puts the history among the current rows in reading order, keeping the cached copy of a row in both', () => {
        const changed = row('c', current[1].created_at, 'confirmed');
        const whole = withHistory([current[0], changed], [...history, row('c', current[1].created_at, 'invited')]);
        expect(whole.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(whole[2]).toBe(changed);
    });

    it('is whole once the load writes every row', async () => {
        const { client, load, finish } = midLoad();
        expect(isPartialList()).toBe(true);
        expect(listOf(client)).toEqual(current);

        finish(withHistory(current, history));
        await load;
        expect(isPartialList()).toBe(false);
        expect(listOf(client)).toHaveLength(4);
    });

    it('stays partial when the load is replaced, until the new one writes', async () => {
        const { client, load, finish } = midLoad();
        let finishReload: (rows: EnrollmentWithRelations[]) => void = () => {};
        const reload = client.fetchQuery({
            queryKey: ['enrollments'],
            queryFn: () => new Promise<EnrollmentWithRelations[]>(resolve => { finishReload = resolve; }),
            staleTime: 0,
        });
        void client.refetchQueries({ queryKey: ['enrollments'], exact: true });

        // The replaced load's function runs on, but what it returns is dropped
        finish(withHistory(current, history));
        await Promise.resolve();
        expect(isPartialList()).toBe(true);

        finishReload(withHistory(current, history));
        await reload.catch(() => {});
        await load.catch(() => {});
        await vi.waitFor(() => expect(isPartialList()).toBe(false));
    });

    it('is not partial after signing out (the cache is cleared)', async () => {
        const { client, load } = midLoad();
        client.clear();
        expect(isPartialList()).toBe(false);
        await load.catch(() => { /* cancelled by the clear */ });
    });

    it('never cancels the first load while its first part is shown', async () => {
        const { client, load, finish } = midLoad();
        cancelListReload(client);
        finish(withHistory(current, history));
        await load;
        expect(listOf(client)).toHaveLength(4);

    });

    it('cancels a later reload before an optimistic change', async () => {
        const client = appClient();
        client.setQueryData(['enrollments'], current);
        const reload = client.fetchQuery({ queryKey: ['enrollments'], queryFn: () => new Promise<EnrollmentWithRelations[]>(() => {}), staleTime: 0 });
        cancelListReload(client);
        expect(await reload).toEqual(current);
        expect(client.getQueryCache().find({ queryKey: ['enrollments'], exact: true })?.state.fetchStatus).toBe('idle');
    });

    it('undoes an optimistic change on its own rows only', () => {
        const client = appClient();
        const before = [row('a', '2026-03-03T10:00:00Z'), row('c', '2026-03-01T10:00:00Z')];
        client.setQueryData(['enrollments'], before);
        // The optimistic change to 'a', then the history arriving and a realtime change to 'c'
        const optimistic = row('a', before[0].created_at, 'invited');
        const realtime = row('c', before[1].created_at, 'confirmed');
        client.setQueryData(['enrollments'], [optimistic, ...history.slice(0, 1), realtime]);

        restoreCachedRows(client, before, ['a']);

        expect(listOf(client).map(r => `${r.id}:${r.status}`)).toEqual(['a:requested', 'b:completed', 'c:confirmed']);
    });
});

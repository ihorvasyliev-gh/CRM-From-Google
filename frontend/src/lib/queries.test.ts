import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages, fetchStudentsPage } from './queries';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }));

/** A students query that records its select() options and answers with `rows`. */
function studentsQuery(rows: unknown[], count: number | null) {
    const query: Record<string, unknown> = {};
    for (const method of ['order', 'or']) query[method] = vi.fn(() => query);
    query.select = vi.fn(() => query);
    query.range = vi.fn(() => Promise.resolve({ data: rows, count, error: null }));
    vi.mocked(supabase.from).mockReturnValue(query as never);
    return query as { select: ReturnType<typeof vi.fn> };
}

const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => ({ id: start + i }));

describe('fetchAllPages', () => {
    it('reads pages of 1000 until a short page and returns every row in order', async () => {
        const page = vi.fn()
            .mockResolvedValueOnce({ data: rows(1000), error: null })
            .mockResolvedValueOnce({ data: rows(1000, 1000), error: null })
            .mockResolvedValueOnce({ data: rows(5, 2000), error: null })
            .mockResolvedValue({ data: [], error: null });

        const all = await fetchAllPages(page);

        expect(all).toHaveLength(2005);
        expect(all[2004]).toEqual({ id: 2004 });
        // The first page alone, then the next three at once
        expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3999]]);
    });

    it('reads a single page when the table fits in it', async () => {
        const page = vi.fn().mockResolvedValueOnce({ data: rows(40), error: null });
        expect(await fetchAllPages(page)).toHaveLength(40);
        expect(page).toHaveBeenCalledTimes(1);
    });

    it('keeps requesting batches while every page is full', async () => {
        const page = vi.fn((from: number) => Promise.resolve({ data: from < 5000 ? rows(1000, from) : rows(7, from), error: null }));
        const all = await fetchAllPages(page);
        expect(all).toHaveLength(5007);
        expect(all.map(r => r.id)).toEqual(Array.from({ length: 5007 }, (_, i) => i));
        // 1 + 3 + 3 pages: three round trips instead of six
        expect(page).toHaveBeenCalledTimes(7);
    });

    it('stops on an empty page after a full one', async () => {
        const page = vi.fn()
            .mockResolvedValueOnce({ data: rows(1000), error: null })
            .mockResolvedValue({ data: [], error: null });
        expect(await fetchAllPages(page)).toHaveLength(1000);
    });

    it('ignores pages after the end even if they return rows', async () => {
        const page = vi.fn()
            .mockResolvedValueOnce({ data: rows(1000), error: null })
            .mockResolvedValueOnce({ data: rows(3, 1000), error: null })
            .mockResolvedValueOnce({ data: rows(1, 9999), error: null })
            .mockResolvedValue({ data: [], error: null });
        expect(await fetchAllPages(page)).toHaveLength(1003);
    });

    it('throws the first error instead of returning the rows read so far', async () => {
        const page = vi.fn()
            .mockResolvedValueOnce({ data: rows(1000), error: null })
            .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
            .mockResolvedValue({ data: [], error: null });
        await expect(fetchAllPages(page)).rejects.toEqual({ message: 'timeout' });
    });
});

describe('fetchStudentsPage', () => {
    it('counts the matching students on the first page only', async () => {
        const first = studentsQuery(rows(30), 95);
        const page0 = await fetchStudentsPage({ pageParam: 0, queryKey: ['students', 'ann'] });
        expect(first.select).toHaveBeenCalledWith('*', { count: 'exact' });
        expect(page0).toMatchObject({ count: 95, nextPage: 1 });

        const next = studentsQuery(rows(30, 30), null);
        const page1 = await fetchStudentsPage({ pageParam: 1, queryKey: ['students', 'ann'] });
        expect(next.select).toHaveBeenCalledWith('*', undefined);
        expect(page1).toMatchObject({ count: 0, nextPage: 2 });
    });
});

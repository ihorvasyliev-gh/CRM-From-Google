import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages } from './queries';

const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => ({ id: start + i }));

describe('fetchAllPages', () => {
    it('reads pages of 1000 until a short page and returns every row in order', async () => {
        const page = vi.fn()
            .mockResolvedValueOnce({ data: rows(1000), error: null })
            .mockResolvedValueOnce({ data: rows(1000, 1000), error: null })
            .mockResolvedValueOnce({ data: rows(5, 2000), error: null });

        const all = await fetchAllPages(page);

        expect(all).toHaveLength(2005);
        expect(all[2004]).toEqual({ id: 2004 });
        expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    });

    it('stops on an empty page after a full one', async () => {
        const page = vi.fn()
            .mockResolvedValueOnce({ data: rows(1000), error: null })
            .mockResolvedValueOnce({ data: [], error: null });
        expect(await fetchAllPages(page)).toHaveLength(1000);
        expect(page).toHaveBeenCalledTimes(2);
    });

    it('throws the first error instead of returning the rows read so far', async () => {
        const page = vi.fn()
            .mockResolvedValueOnce({ data: rows(1000), error: null })
            .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
        await expect(fetchAllPages(page)).rejects.toEqual({ message: 'timeout' });
    });
});

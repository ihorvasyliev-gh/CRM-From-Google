import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { EnrollmentWithRelations } from './documentRender';
import { mergeEnrollmentRows, patchCachedEnrollments, MAX_PATCHED_ENROLLMENTS } from './enrollmentCache';

const fetchEnrollmentsByIds = vi.fn<(ids: string[]) => Promise<EnrollmentWithRelations[]>>();
vi.mock('./queries', () => ({
    fetchEnrollmentsByIds: (ids: string[]) => fetchEnrollmentsByIds(ids),
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

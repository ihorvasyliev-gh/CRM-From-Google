import { describe, it, expect, vi, beforeEach } from 'vitest';

const inMock = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({
    supabase: {
        from: () => ({
            select: () => ({ in: inMock }),
        }),
    },
}));

import { fetchOptedOutEmails, normalizeEmail, partitionByOptOut, skippedNote } from './emailOptOut';

describe('emailOptOut', () => {
    beforeEach(() => inMock.mockReset());

    it('normalizes emails', () => {
        expect(normalizeEmail('  John.Doe@Mail.COM ')).toBe('john.doe@mail.com');
        expect(normalizeEmail(null)).toBe('');
    });

    it('splits recipients regardless of email case and spacing', () => {
        const people = [
            { id: 1, email: 'A@x.com' },
            { id: 2, email: 'b@x.com ' },
            { id: 3, email: null },
        ];
        const { allowed, skipped } = partitionByOptOut(people, p => p.email, new Set(['a@x.com']));
        expect(allowed.map(p => p.id)).toEqual([2, 3]);
        expect(skipped.map(p => p.id)).toEqual([1]);
    });

    it('describes skipped people only when there are any', () => {
        expect(skippedNote(0)).toBe('');
        expect(skippedNote(2)).toBe(' · 2 unsubscribed skipped');
    });

    it('looks up unique normalized emails and skips the query when there are none', async () => {
        expect(await fetchOptedOutEmails([null, ' '])).toEqual(new Set());
        expect(inMock).not.toHaveBeenCalled();

        inMock.mockResolvedValueOnce({ data: [{ email: 'a@x.com' }], error: null });
        const result = await fetchOptedOutEmails(['A@x.com', 'a@x.com', 'b@x.com']);
        expect(inMock).toHaveBeenCalledWith('email', ['a@x.com', 'b@x.com']);
        expect(result).toEqual(new Set(['a@x.com']));
    });

    it('treats a missing table (migration not applied) as an empty list', async () => {
        inMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST205', message: 'missing' } });
        expect(await fetchOptedOutEmails(['a@x.com'])).toEqual(new Set());
    });

    it('throws on other errors so a mailing never ignores the list', async () => {
        inMock.mockResolvedValueOnce({ data: null, error: { code: '500', message: 'boom' } });
        await expect(fetchOptedOutEmails(['a@x.com'])).rejects.toMatchObject({ message: 'boom' });
    });
});

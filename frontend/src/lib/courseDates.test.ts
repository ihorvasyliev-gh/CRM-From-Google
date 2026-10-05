import { describe, it, expect } from 'vitest';
import { courseDatesOf } from './courseDates';

const base = { status: 'requested' as const, confirmed_date: null, invited_date: null, invited_dates: null, completed_date: null };

describe('courseDatesOf', () => {
    it('returns nothing for an enrollment without dates', () => {
        expect(courseDatesOf(base)).toEqual([]);
    });

    it('uses the confirmed date first', () => {
        expect(courseDatesOf({ ...base, status: 'confirmed', confirmed_date: '2026-10-21', invited_date: '2026-10-20', invited_dates: ['2026-10-20', '2026-10-21'] }))
            .toEqual(['2026-10-21']);
    });

    it('puts an open multi-date invitation on every offered date', () => {
        expect(courseDatesOf({ ...base, status: 'invited', invited_date: '2026-10-20', invited_dates: ['2026-10-22', '2026-10-20T00:00:00', '2026-10-21', '2026-10-20'] }))
            .toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    });

    it('uses the single invited date for a single-date invite', () => {
        expect(courseDatesOf({ ...base, status: 'invited', invited_date: '2026-10-20T00:00:00' })).toEqual(['2026-10-20']);
    });

    it('falls back to the first offered date once the invite is no longer open', () => {
        expect(courseDatesOf({ ...base, status: 'requested', invited_date: '2026-10-20', invited_dates: ['2026-10-20', '2026-10-21'] }))
            .toEqual(['2026-10-20']);
    });

    it('uses the completed date when there is nothing else', () => {
        expect(courseDatesOf({ ...base, status: 'completed', completed_date: '2026-08-27' })).toEqual(['2026-08-27']);
    });
});

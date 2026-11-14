import { describe, it, expect } from 'vitest';
import { sortColumn } from './boardSort';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

function row(id: string, over: Partial<EnrollmentRow> = {}): EnrollmentRow {
    return {
        id, is_priority: false, created_at: `2026-01-0${id.length}T00:00:00Z`,
        invited_date: null, invited_dates: null, confirmed_date: null, completed_date: null,
        students: { first_name: id, last_name: id },
        ...over,
    } as EnrollmentRow;
}
const ids = (rows: EnrollmentRow[]) => rows.map(r => r.id);

describe('sortColumn', () => {
    it('orders the queue by when people asked, and reverses for newest first', () => {
        const rows = () => [row('b', { created_at: '2026-02-02T00:00:00Z' }), row('a', { created_at: '2026-01-01T00:00:00Z' })];
        expect(ids(sortColumn(rows(), 'requested', 'date-asc'))).toEqual(['a', 'b']);
        expect(ids(sortColumn(rows(), 'requested', 'date-desc'))).toEqual(['b', 'a']);
    });

    it('orders Invited by course date, nearest first, not by when the person asked', () => {
        const rows = [
            row('late', { created_at: '2026-01-01T00:00:00Z', invited_date: '2026-12-04' }),
            row('soon', { created_at: '2026-03-01T00:00:00Z', invited_date: '2026-11-20T00:00:00' }),
            row('choice', { created_at: '2026-02-01T00:00:00Z', invited_date: '2026-12-11', invited_dates: ['2026-12-11', '2026-11-27'] }),
        ];
        expect(ids(sortColumn(rows, 'invited', 'date-asc'))).toEqual(['soon', 'choice', 'late']);
    });

    it('orders Confirmed by course date; the same date keeps the order people asked in', () => {
        const rows = [
            row('c', { created_at: '2026-01-03T00:00:00Z', confirmed_date: '2026-11-20' }),
            row('a', { created_at: '2026-01-01T00:00:00Z', confirmed_date: '2026-11-27' }),
            row('b', { created_at: '2026-01-02T00:00:00Z', confirmed_date: '2026-11-20' }),
        ];
        expect(ids(sortColumn(rows, 'confirmed', 'date-asc'))).toEqual(['b', 'c', 'a']);
        expect(ids(sortColumn(rows, 'confirmed', 'date-desc'))).toEqual(['a', 'b', 'c']);
    });

    it('shows the latest completions first whichever date order is chosen', () => {
        const rows = () => [
            row('old', { completed_date: '2026-02-01' }),
            row('new', { completed_date: '2026-10-01' }),
            row('undated'),
        ];
        expect(ids(sortColumn(rows(), 'completed', 'date-asc'))).toEqual(['new', 'old', 'undated']);
        expect(ids(sortColumn(rows(), 'completed', 'date-desc'))).toEqual(['new', 'old', 'undated']);
    });

    it('keeps starred people on top and sorts by surname for "by name"', () => {
        const rows = [
            row('x', { students: { first_name: 'Anna', last_name: 'Walsh' } as EnrollmentRow['students'] }),
            row('y', { students: { first_name: 'Zoe', last_name: 'Byrne' } as EnrollmentRow['students'] }),
            row('z', { is_priority: true, students: { first_name: 'Yan', last_name: 'Young' } as EnrollmentRow['students'] }),
        ];
        expect(ids(sortColumn(rows, 'invited', 'name'))).toEqual(['z', 'y', 'x']);
    });
});

import { describe, it, expect } from 'vitest';
import { sortOutcomeRows, type SortFields } from './outcomeSort';

const row = (last_name: string, extra: Partial<SortFields> = {}): SortFields => ({
    first_name: 'A', last_name, email: '', tracking_status: 'pending', is_working: null, employment_type: null, updated_at: null, ...extra,
});
const names = (rows: SortFields[]) => rows.map(r => r.last_name);

describe('sortOutcomeRows', () => {
    it('sorts by name both ways', () => {
        const rows = [row('Walsh'), row('Byrne'), row('Murphy')];
        expect(names(sortOutcomeRows(rows, { key: 'name', dir: 'asc' }, r => r))).toEqual(['Byrne', 'Murphy', 'Walsh']);
        expect(names(sortOutcomeRows(rows, { key: 'name', dir: 'desc' }, r => r))).toEqual(['Walsh', 'Murphy', 'Byrne']);
    });

    it('puts people not called yet before "called, no answer" inside a status', () => {
        const rows = [
            row('Responded', { tracking_status: 'responded' }),
            row('Called', { called_no_answer_at: '2026-11-11T10:00:00Z' }),
            row('NotCalled'),
            row('New', { tracking_status: 'not_contacted' }),
        ];
        expect(names(sortOutcomeRows(rows, { key: 'tracking', dir: 'asc' }, r => r))).toEqual(['New', 'NotCalled', 'Called', 'Responded']);
    });

    it('keeps empty dates and "no data" last whichever way', () => {
        const rows = [row('None'), row('Old', { updated_at: '2026-01-01' }), row('New', { updated_at: '2026-10-01' })];
        expect(names(sortOutcomeRows(rows, { key: 'updated', dir: 'desc' }, r => r))).toEqual(['New', 'Old', 'None']);
        expect(names(sortOutcomeRows(rows, { key: 'updated', dir: 'asc' }, r => r))).toEqual(['Old', 'New', 'None']);

        const emp = [
            row('NoData'),
            row('NotWorking', { tracking_status: 'responded', is_working: false }),
            row('FullTime', { tracking_status: 'responded', is_working: true, employment_type: 'full_time' }),
        ];
        expect(names(sortOutcomeRows(emp, { key: 'employment', dir: 'asc' }, r => r))).toEqual(['FullTime', 'NotWorking', 'NoData']);
        expect(names(sortOutcomeRows(emp, { key: 'employment', dir: 'desc' }, r => r))).toEqual(['NotWorking', 'FullTime', 'NoData']);
    });
});

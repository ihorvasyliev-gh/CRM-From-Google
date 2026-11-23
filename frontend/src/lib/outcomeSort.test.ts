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
            row('PrevNotWorking', { tracking_status: 'pending', is_working: false }),
            row('NotWorking', { tracking_status: 'responded', is_working: false }),
            row('WorkingUnspec', { tracking_status: 'responded', is_working: true, employment_type: null }),
            row('CeTus', { tracking_status: 'responded', is_working: true, employment_type: 'ce_tus' }),
            row('SelfEmployed', { tracking_status: 'responded', is_working: true, employment_type: 'self_employed' }),
            row('PartTime', { tracking_status: 'responded', is_working: true, employment_type: 'part_time' }),
            row('FullTime', { tracking_status: 'responded', is_working: true, employment_type: 'full_time' }),
        ];
        expect(names(sortOutcomeRows(emp, { key: 'employment', dir: 'asc' }, r => r))).toEqual([
            'FullTime', 'PartTime', 'SelfEmployed', 'CeTus', 'WorkingUnspec', 'NotWorking', 'PrevNotWorking', 'NoData',
        ]);
        expect(names(sortOutcomeRows(emp, { key: 'employment', dir: 'desc' }, r => r))).toEqual([
            'PrevNotWorking', 'NotWorking', 'WorkingUnspec', 'CeTus', 'SelfEmployed', 'PartTime', 'FullTime', 'NoData',
        ]);
    });

    it('treats not_contacted and pending with null is_working as no data last', () => {
        const emp = [
            row('NotContacted', { tracking_status: 'not_contacted', is_working: null }),
            row('PendingNoAnswer', { tracking_status: 'pending', is_working: null }),
            row('PrevNotWorking', { tracking_status: 'pending', is_working: false }),
            row('SelfEmployed', { tracking_status: 'responded', is_working: true, employment_type: 'self_employed' }),
        ];
        expect(names(sortOutcomeRows(emp, { key: 'employment', dir: 'asc' }, r => r))).toEqual([
            'SelfEmployed', 'PrevNotWorking', 'NotContacted', 'PendingNoAnswer',
        ]);
        expect(names(sortOutcomeRows(emp, { key: 'employment', dir: 'desc' }, r => r))).toEqual([
            'PrevNotWorking', 'SelfEmployed', 'NotContacted', 'PendingNoAnswer',
        ]);
    });

    it('sorts by completion date both ways and keeps missing dates last', () => {
        const rows = [
            row('NoDate', { completed_date: null }),
            row('Old', { completed_date: '2025-03-10' }),
            row('RecentB', { completed_date: '2026-11-15' }),
            row('RecentA', { completed_date: '2026-11-15' }),
        ];
        expect(names(sortOutcomeRows(rows, { key: 'completed', dir: 'desc' }, r => r))).toEqual([
            'RecentA', 'RecentB', 'Old', 'NoDate',
        ]);
        expect(names(sortOutcomeRows(rows, { key: 'completed', dir: 'asc' }, r => r))).toEqual([
            'Old', 'RecentA', 'RecentB', 'NoDate',
        ]);
    });
});

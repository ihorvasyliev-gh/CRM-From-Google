import { describe, it, expect } from 'vitest';
import { clickedRow } from './chartTheme';

describe('clickedRow', () => {
    const rows = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];

    it('returns the row at the active index recharts reports (a number or a numeric string)', () => {
        expect(clickedRow(rows, { activeIndex: 1 })).toEqual({ name: 'b' });
        expect(clickedRow(rows, { activeIndex: '2' })).toEqual({ name: 'c' });
        expect(clickedRow(rows, { activeIndex: '0' })).toEqual({ name: 'a' });
    });

    it('returns nothing when the click was not on a data point', () => {
        expect(clickedRow(rows, { activeIndex: undefined })).toBeUndefined();
        expect(clickedRow(rows, { activeIndex: null })).toBeUndefined();
        expect(clickedRow(rows, { activeIndex: '' })).toBeUndefined();
        expect(clickedRow(rows, { activeIndex: '5' })).toBeUndefined();
        expect(clickedRow(rows, { activeIndex: 'x' })).toBeUndefined();
    });
});

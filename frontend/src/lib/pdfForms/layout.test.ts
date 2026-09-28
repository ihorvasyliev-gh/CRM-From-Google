import { describe, expect, it } from 'vitest';
import { answerRectForLabel, buildLayout, cellAt, insetCell } from './layout';
import { makeLayout } from './testLayout';

describe('buildLayout', () => {
    const layout = makeLayout();

    it('finds symbol-font checkboxes with their labels, including wrapped and shared-item labels', () => {
        expect(layout.checkboxes.map(c => c.label)).toEqual([
            'Yes',
            'No',
            'People living in disadvantaged communities',
            'Refugees',
            'Travellers',
            'Not applicable',
        ]);
        const yes = layout.checkboxes[0];
        expect(yes.rect.page).toBe(0);
        // Measured on Word exports: the drawn square sits on the baseline, half an em wide
        expect(yes.rect.x).toBeCloseTo(400 + 0.047 * 17, 1);
        expect(yes.rect.w).toBeCloseTo(8.5, 1);
    });

    it('merges words into phrases but keeps table columns apart', () => {
        const texts = layout.phrases.filter(p => p.page === 0).map(p => p.text);
        expect(texts).toContain('First Name');
        expect(texts).toContain('Last Name');
        expect(texts).not.toContain('First Name Last Name');
    });

    it('finds outlined squares as checkboxes too', () => {
        const l = buildLayout(
            [{ w: 595, h: 842 }],
            [{ page: 0, x: 390, y: 306, str: 'No', w: 12, h: 10.5 }],
            [{ page: 0, x: 373, y: 304, w: 8.5, h: 11, stroke: true }],
        );
        expect(l.checkboxes).toHaveLength(1);
        expect(l.checkboxes[0].label).toBe('No');
        expect(l.edges).toHaveLength(0);
    });

    it('reads table cells from the borders and ignores page-sized paths', () => {
        const cell = cellAt(layout, 0, 200, 700);
        expect(cell).toMatchObject({ page: 0 });
        expect(cell!.x).toBeCloseTo(108.25, 1);
        expect(cell!.x + cell!.w).toBeCloseTo(577.25, 1);
        expect(cellAt(layout, 0, 200, 300)).toBeNull();
    });

    it('puts an answer in the cell right of its label', () => {
        const co = layout.phrases.find(p => p.text === 'CO Name')!;
        const rect = answerRectForLabel(layout, co);
        expect(rect.x).toBeGreaterThan(108);
        expect(rect.x + rect.w).toBeLessThan(577.5);
        expect(rect.y).toBeGreaterThan(687);

        const last = layout.phrases.find(p => p.text === 'Last Name')!;
        const lastRect = answerRectForLabel(layout, last);
        expect(lastRect.x).toBeGreaterThan(388);
    });

    it('pads cells so text does not touch the borders', () => {
        const inset = insetCell({ page: 0, x: 10, y: 10, w: 100, h: 20 });
        expect(inset).toEqual({ page: 0, x: 13, y: 13, w: 94, h: 14 });
    });
});

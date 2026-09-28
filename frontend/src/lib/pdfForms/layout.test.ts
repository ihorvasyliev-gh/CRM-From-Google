import { describe, expect, it } from 'vitest';
import { answerRectForLabel, buildLayout, cellAt, findDateBlanks, guessTitle, insetCell, ruledLines } from './layout';
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

describe('date blanks and ruled boxes', () => {
    const items = [
        { page: 0, x: 22, y: 402, str: 'Date of Registration', w: 95, h: 10.5 },
        { page: 0, x: 155, y: 402, str: '______/_______/20', w: 98, h: 10.5 },
        { page: 0, x: 22, y: 300, str: 'Date of Birth', w: 66, h: 10.5 },
        { page: 0, x: 152, y: 296, str: '——————/———————/———————', w: 259, h: 10.5 },
        { page: 0, x: 260, y: 296, str: '(dd/mm/yyyy)', w: 60, h: 8 },
        { page: 0, x: 171, y: 200, str: '_____/_________/________', w: 120, h: 10.5 },
        { page: 0, x: 292, y: 200, str: '(Use 01/01 if not known)', w: 150, h: 8 },
    ];
    const layout = buildLayout([{ w: 595, h: 842 }], items, []);
    const blanks = findDateBlanks(layout);

    it('finds day / month / year blanks with their label', () => {
        expect(blanks).toHaveLength(3);
        const reg = blanks.find(b => b.label === 'Date of Registration')!;
        expect(reg.yearDigits).toBe(2);
        expect(reg.day.x).toBeCloseTo(155, 0);
        expect(reg.month.x).toBeGreaterThan(reg.day.x + reg.day.w - 1);
        // "/20" has no blank after it: the year goes right after the printed century
        expect(reg.year.x).toBeGreaterThan(reg.month.x + reg.month.w);
        expect(blanks.find(b => b.label === 'Date of Birth')!.yearDigits).toBe(4);
    });

    it('keeps a note after a blank out of the blank', () => {
        expect(layout.phrases.map(p => p.text)).toContain('_____/_________/________');
    });

    it('finds rules drawn in pieces across a box', () => {
        const rules = [120, 140, 160].flatMap(y => [
            { page: 0, x: 140, y, w: 160, h: 0.5 },
            { page: 0, x: 300, y, w: 137, h: 0.5 },
        ]);
        const l = buildLayout([{ w: 595, h: 842 }], [], rules);
        const found = ruledLines(l, { page: 0, x: 142, y: 100, w: 292, h: 80 });
        expect(found.map(f => Math.round(f * 80 + 100))).toEqual([120, 140, 160]);
        expect(ruledLines(l, { page: 0, x: 142, y: 150, w: 292, h: 30 })).toEqual([]);
    });
});

describe('guessTitle', () => {
    it('names a form after the big heading on its first page', () => {
        const l = buildLayout(
            [{ w: 595, h: 842 }],
            [
                { page: 0, x: 180, y: 792, str: 'Community Organisation', w: 250, h: 24 },
                { page: 0, x: 220, y: 758, str: 'Registration Form', w: 220, h: 24 },
                { page: 0, x: 480, y: 758, str: '(Updated 14 Jan 2026)', w: 90, h: 9 },
                { page: 0, x: 20, y: 700, str: 'Thank you for taking the time', w: 200, h: 10.5 },
            ],
            [],
        );
        expect(guessTitle(l)).toBe('Community Organisation Registration Form');
    });

    it('gives up when nothing stands out', () => {
        expect(guessTitle(buildLayout([{ w: 595, h: 842 }], [{ page: 0, x: 20, y: 700, str: 'Name', w: 30, h: 10 }], []))).toBe('');
    });
});

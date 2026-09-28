import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import arimo from '../../assets/fonts/Arimo-Regular.ttf?inline';
import { fitRuled, fitText, FormFiller, oneLine, ruledRows, wrapText, type Measure } from './fill';
import { generateForms } from './generate';
import type { RowPlan } from './plan';
import { DEFAULT_SETTINGS, type FormField } from './types';

// 1 unit per character: easy to reason about
const measure: Measure = (text, size) => text.length * size * 0.5;

describe('fitText', () => {
    it('keeps a short value at the largest size', () => {
        expect(fitText('Anna', { w: 100, h: 14 }, 10, false, measure)).toEqual({ lines: ['Anna'], size: 10, truncated: false });
    });

    it('shrinks a long single-line value to fit the width', () => {
        const r = fitText('x'.repeat(30), { w: 100, h: 14 }, 10, false, measure);
        expect(r.size).toBeLessThan(10);
        expect(measure(r.lines[0], r.size)).toBeLessThanOrEqual(100);
        expect(r.truncated).toBe(false);
    });

    it('shortens with an ellipsis when even the smallest size is too big', () => {
        const r = fitText('x'.repeat(100), { w: 60, h: 14 }, 10, false, measure);
        expect(r.truncated).toBe(true);
        expect(r.lines[0].endsWith('…')).toBe(true);
        expect(r.size).toBe(6);
    });

    it('wraps multi-line values and shrinks until the lines fit the height', () => {
        const text = 'one two three four five six seven eight nine ten eleven twelve';
        const r = fitText(text, { w: 60, h: 40 }, 10, true, measure);
        expect(r.lines.length * r.size * 1.18).toBeLessThanOrEqual(40.5);
        expect(r.lines.join(' ')).toBe(text);
    });

    it('joins lines of a single-line value with commas', () => {
        expect(oneLine('Kerrigan Tyrell Centre\nTinkers Cross\n\nCork')).toBe('Kerrigan Tyrell Centre, Tinkers Cross, Cork');
    });

    it('breaks words longer than the box', () => {
        expect(wrapText('abcdefghij', 20, 10, measure)).toEqual(['abcd', 'efgh', 'ij']);
    });
});

async function blankTemplate(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    doc.addPage([595, 842]);
    return doc.save();
}

async function textOf(bytes: Uint8Array): Promise<string[]> {
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        pages.push(content.items.map(it => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim());
    }
    return pages;
}

const fields: FormField[] = [
    { id: 'name', kind: 'text', name: 'Name', source: '{Name}', rect: { page: 0, x: 100, y: 700, w: 300, h: 16 }, fontSize: 10, multiline: false, align: 'left' },
    { id: 'addr', kind: 'text', name: 'Address', source: '{Address}', rect: { page: 1, x: 100, y: 600, w: 200, h: 60 }, fontSize: 10, multiline: true, align: 'left' },
    { id: 'grp', kind: 'choice', name: 'Group', source: '{Group}', single: false, options: [{ id: 'o1', label: 'Yes', rect: { page: 0, x: 100, y: 650, w: 8, h: 10 }, aliases: [] }] },
];

function plan(name: string, fileName: string): RowPlan {
    return {
        index: 0,
        rowNumber: 2,
        title: name,
        fileName,
        notes: [],
        values: { name: { kind: 'text', text: name }, addr: { kind: 'text', text: 'Unit 7\nAvenue de Rennes\nMahon, Cork' }, grp: { kind: 'choice', ticked: ['o1'] } },
    };
}

describe('FormFiller', () => {
    beforeAll(() => {
        const bytes = Uint8Array.from(atob(arimo.split(',')[1]), c => c.charCodeAt(0));
        vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => bytes.buffer }));
    });

    it('prints Irish and Cyrillic names that can be read back', async () => {
        const filler = await FormFiller.create(await blankTemplate());
        const { bytes, warnings } = await filler.fill(fields, plan('Seán Ó Briain · Олена Коваль', 'x.pdf').values, DEFAULT_SETTINGS);
        expect(warnings).toEqual([]);
        const [page1, page2] = await textOf(bytes);
        expect(page1).toContain('Seán Ó Briain · Олена Коваль');
        expect(page2).toContain('Avenue de Rennes');
    });

    it('replaces characters the font lacks and says so', async () => {
        const filler = await FormFiller.create(await blankTemplate());
        const { warnings } = await filler.fill(fields, plan('雪 Anna', 'x.pdf').values, DEFAULT_SETTINGS);
        expect(warnings).toEqual(['"Name": some characters can\'t be printed and show as "?"']);
    });

    it('makes one combined file with every form, page after page', async () => {
        const filler = await FormFiller.create(await blankTemplate());
        const rows = ['Anna', 'Brian', 'Ciara'].map(n => plan(n, `${n}.pdf`).values);
        const { bytes } = await filler.combine(rows, fields, DEFAULT_SETTINGS);
        const pages = await textOf(bytes);
        expect(pages).toHaveLength(6);
        expect(pages[0]).toContain('Anna');
        expect(pages[4]).toContain('Ciara');
    });

    it('zips separate PDFs and adds the combined file', async () => {
        const rows = [plan('Anna', 'Anna.pdf'), plan('Brian', 'Brian.pdf')];
        const { files } = await generateForms(await blankTemplate(), fields, DEFAULT_SETTINGS, rows, { separate: true, combined: true, baseName: 'CO form' });
        expect(files.map(f => f.name)).toEqual(['CO form.zip', 'CO form (all 2).pdf']);
    });

    it('gives a single form as a plain PDF', async () => {
        const { files } = await generateForms(await blankTemplate(), fields, DEFAULT_SETTINGS, [plan('Anna', 'Anna.pdf')], { separate: true, combined: true, baseName: 'CO form' });
        expect(files.map(f => f.name)).toEqual(['Anna.pdf']);
    });
});

describe('ruled boxes', () => {
    it('splits a box into its ruled rows, top first', () => {
        expect(ruledRows(80, 4)).toEqual([20, 20, 20, 20]);
        expect(ruledRows(100, 3, [0.2, 0.5])).toEqual([50, 30, 20].map(n => expect.closeTo(n, 5)));
    });

    it('writes one line per rule when it fits, two smaller ones when it does not', () => {
        const short = fitRuled('one two three', 200, [20, 20, 20], 10, measure);
        expect(short.perRow).toBe(1);
        const long = fitRuled('word '.repeat(60), 200, [20, 20, 20], 10, measure);
        expect(long.perRow).toBeGreaterThan(1);
        expect(long.lines.length).toBeLessThanOrEqual(3 * long.perRow);
        expect(long.truncated).toBe(false);
    });
});

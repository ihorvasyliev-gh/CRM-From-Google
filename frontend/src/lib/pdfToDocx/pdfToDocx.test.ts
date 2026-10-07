import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { parseFontName, wordLineMetrics } from './fonts';
import { readOperators, type OpCodes } from './extract';
import { buildLines } from './lines';
import { buildDocx, xmlText, type DocxPageIn } from './docx';
import { checkPlaceholders, detectFields, fieldAt, placeholderForLabel, suggestedValues, type FieldDef, type TextFieldDef } from './fields';
import { filledDocx, fieldsForPage, fitSize, measureArial, valueSize } from './fill';
import type { ConvertedPage } from './convert';
import { checkTemplateBuffer, PLACEHOLDER_KEYS } from '../documentRender';
import Docxtemplater from 'docxtemplater';
import { dividersOf, layoutPage } from './convert';
import { makeLayout } from '../pdfForms/testLayout';
import type { FontFace, Glyph, VectorShape } from './types';

// The pieces of pdf.js's OPS table the reader uses (same numbers as pdf.js)
const OPS: OpCodes = {
    setLineWidth: 2, setGState: 9, save: 10, restore: 11, transform: 12, fill: 22, eoFill: 23, stroke: 20, closeStroke: 21, fillStroke: 24,
    eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, clip: 29, eoClip: 30, beginText: 31, endText: 32, setCharSpacing: 33,
    setWordSpacing: 34, setHScale: 35, setLeading: 36, setFont: 37, setTextRenderingMode: 38, setTextRise: 39, moveText: 40, setLeadingMoveText: 41,
    setTextMatrix: 42, nextLine: 43, showText: 44, showSpacedText: 45, nextLineShowText: 46, nextLineSetSpacingShowText: 47, setStrokeColorN: 53,
    setFillColorN: 55, setStrokeRGBColor: 58, setFillRGBColor: 59, paintXObject: 66, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75,
    beginGroup: 76, endGroup: 77, paintImageXObject: 85, paintInlineImageXObject: 86, paintImageXObjectRepeat: 88, paintSolidColorImageMask: 90,
    constructPath: 91, setStrokeTransparent: 92, setFillTransparent: 93,
};

const ARIAL: FontFace = { family: 'Arial', bold: false, italic: false, pdfName: 'ArialMT', ascent: 0.905, descent: -0.212 };

function ops(list: [string, unknown[]][]) {
    return { fnArray: list.map(([name]) => OPS[name]), argsArray: list.map(([, args]) => args) };
}

const g = (unicode: string, width: number) => ({ unicode, width, isSpace: unicode === ' ' });

function rectPath(x: number, y: number, w: number, h: number) {
    return [0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4];
}

/** Characters as the reader produces them, set naturally from x at size 10 */
function glyphs(text: string, x: number, y: number, opts: { size?: number; gapAfter?: Record<number, number>; z?: number } = {}): Glyph[] {
    const size = opts.size ?? 10;
    const out: Glyph[] = [];
    let at = x;
    [...text].forEach((ch, i) => {
        const em = ch === ' ' ? 0.278 : 0.556;
        const adv = em * size + (opts.gapAfter?.[i] ?? 0);
        out.push({ ch, x: at, y, adv, em, size, font: ARIAL, color: '000000', alpha: 1, z: opts.z ?? 0, angle: 0 });
        at += adv;
    });
    return out;
}

describe('fonts', () => {
    it('reads family and style from PDF font names', () => {
        expect(parseFontName('BCDEEE+Arial-BoldMT')).toMatchObject({ family: 'Arial', bold: true, italic: false, pdfName: 'Arial-BoldMT' });
        expect(parseFontName('ABCDEE+Arial-BoldItalicMT')).toMatchObject({ family: 'Arial', bold: true, italic: true });
        expect(parseFontName('TimesNewRomanPS-ItalicMT')).toMatchObject({ family: 'Times New Roman', italic: true, bold: false });
        expect(parseFontName('Calibri,Bold')).toMatchObject({ family: 'Calibri', bold: true });
        expect(parseFontName('CalibriLight')).toMatchObject({ family: 'Calibri Light' });
        expect(parseFontName('Helvetica-Oblique')).toMatchObject({ family: 'Arial', italic: true });
        expect(parseFontName('SegoeUI-Semibold')).toMatchObject({ family: 'Segoe UI', bold: true });
    });

    it("uses Word's own line metrics for known fonts", () => {
        expect(wordLineMetrics({ family: 'Calibri', ascent: 0.75, descent: -0.25 }).ascent).toBeCloseTo(0.952);
        expect(wordLineMetrics({ family: 'Unknown Sans', ascent: 0.8, descent: -0.2 })).toEqual({ ascent: 0.8, descent: 0.2 });
    });
});

describe('readOperators', () => {
    const fontFor = () => ({ name: 'BCDEEE+Arial-BoldMT', ascent: 0.905, descent: -0.212, fontMatrix: [0.001, 0, 0, 0.001, 0, 0] });

    it('places every character, counting kerning and character spacing', () => {
        const page = readOperators(
            ops([
                ['beginText', []],
                ['setFont', ['f1', 10]],
                ['setFillRGBColor', ['#ff0000']],
                ['setCharSpacing', [0.5]],
                ['setTextMatrix', [[1, 0, 0, 1, 100, 700]]],
                ['showText', [[g('A', 667), -500, g('B', 667)]]],
                ['endText', []],
            ]),
            OPS,
            fontFor,
            0,
            [0, 0, 595, 842],
        );
        expect(page.glyphs.map(x => x.ch)).toEqual(['A', 'B']);
        const [a, b] = page.glyphs;
        expect(a).toMatchObject({ x: 100, y: 700, size: 10, color: 'FF0000', em: 0.667 });
        expect(a.font).toMatchObject({ family: 'Arial', bold: true });
        // 6.67 advance + 0.5 spacing + 5 kerning (-500 thousandths of 10 pt)
        expect(b.x).toBeCloseTo(100 + 6.67 + 0.5 + 5);
        expect(a.adv).toBeCloseTo(7.17);
    });

    it('applies the CTM and the page origin, and drops invisible text', () => {
        const page = readOperators(
            ops([
                ['save', []],
                ['transform', [2, 0, 0, 2, 10, 20]],
                ['beginText', []],
                ['setFont', ['f1', 5]],
                ['setTextMatrix', [[1, 0, 0, 1, 50, 100]]],
                ['showText', [[g('X', 600)]]],
                ['setTextRenderingMode', [3]],
                ['showText', [[g('Y', 600)]]],
                ['endText', []],
                ['restore', []],
            ]),
            OPS,
            fontFor,
            0,
            [0, 10, 595, 852],
        );
        expect(page.glyphs).toHaveLength(1);
        expect(page.glyphs[0]).toMatchObject({ ch: 'X', x: 110, y: 210, size: 10 });
        expect(page.h).toBe(842);
    });

    it('records filled rectangles, strokes and colours in paint order, and restores state', () => {
        const page = readOperators(
            ops([
                ['save', []],
                ['setFillRGBColor', ['#ccecf9']],
                ['constructPath', [OPS.fill, [rectPath(10, 10, 100, 20)], null]],
                ['restore', []],
                ['setLineWidth', [2]],
                ['constructPath', [OPS.stroke, [[0, 0, 0, 1, 50, 0]], null]],
                ['constructPath', [OPS.fill, [[0, 0, 0, 2, 10, 10, 20, 10, 30, 0, 4]], null]],
            ]),
            OPS,
            fontFor,
            0,
            [0, 0, 595, 842],
        );
        expect(page.shapes).toHaveLength(3);
        const [cell, line, curve] = page.shapes;
        expect(cell).toMatchObject({ isRect: true, fill: { color: 'CCECF9', alpha: 1 }, stroke: null, box: { x: 10, y: 10, w: 100, h: 20 } });
        expect(line).toMatchObject({ isRect: false, fill: null, stroke: { color: '000000', width: 2 } });
        expect(curve.isRect).toBe(false);
        expect(curve.fill?.color).toBe('000000');
        expect(cell.z).toBeLessThan(line.z);
    });

    it('places images and remembers a clip that cuts them', () => {
        const page = readOperators(
            ops([
                ['save', []],
                ['eoClip', []],
                ['constructPath', [OPS.endPath, [rectPath(0, 0, 50, 50)], null]],
                ['transform', [100, 0, 0, 40, 20, 30]],
                ['paintImageXObject', ['img_p0_1', 300, 120]],
                ['restore', []],
            ]),
            OPS,
            fontFor,
            0,
            [0, 0, 595, 842],
        );
        expect(page.images).toHaveLength(1);
        expect(page.images[0]).toMatchObject({ source: { objId: 'img_p0_1' }, box: { x: 20, y: 30, w: 100, h: 40 }, flipV: false, clip: { x: 20, y: 30, w: 30, h: 20 } });
    });
});

describe('buildLines', () => {
    it('keeps a line as one run when Word would set it the same way', () => {
        const [line] = buildLines(glyphs('Hello world', 50, 700), 0);
        expect(line.runs).toHaveLength(1);
        expect(line.runs[0]).toMatchObject({ text: 'Hello world', family: 'Arial', halfPoints: 20, spacing: 0 });
        expect(line.ascent).toBeCloseTo(9.38);
    });

    it('widens a justified word gap with character spacing on the space', () => {
        const [line] = buildLines(glyphs('Hello world', 50, 700, { gapAfter: { 5: 2 } }), 0);
        expect(line.runs.map(r => [r.text, r.spacing])).toEqual([
            ['Hello', 0],
            [' ', 40],
            ['world', 0],
        ]);
    });

    it('splits a row at column gaps and at table borders', () => {
        const row = [...glyphs('Name', 20, 700), ...glyphs('Value', 200, 700)];
        expect(buildLines(row, 0).map(l => l.runs.map(r => r.text).join(''))).toEqual(['Name', 'Value']);
        const tight = [...glyphs('ab', 20, 700), ...glyphs('cd', 33, 700)];
        expect(buildLines(tight, 0)).toHaveLength(1);
        expect(buildLines(tight, 0, [{ x: 32, y0: 690, y1: 710 }])).toHaveLength(2);
    });

    it('splits text padded apart with several spaces', () => {
        const lines = buildLines(glyphs('__/__/____    (dd/mm/yyyy)', 20, 700), 0);
        expect(lines.map(l => l.runs.map(r => r.text).join(''))).toEqual(['__/__/____', '(dd/mm/yyyy)']);
        expect(buildLines(glyphs('one two', 20, 700), 0)).toHaveLength(1);
    });

    it('ignores spaces that other strings leave on top of words, and trims the ends', () => {
        const word = glyphs('Individual', 100, 700);
        const stray = glyphs(' ', 101, 700, { z: 5 });
        const [line] = buildLines([...word, ...stray, ...glyphs('  ', 160, 700)], 0);
        expect(line.runs.map(r => r.text).join('')).toBe('Individual');
    });

    it('skips characters it is told to (checkbox squares)', () => {
        const lines = buildLines(glyphs('\uF0FF Yes', 20, 700), 0, [], gl => gl.ch === '\uF0FF');
        expect(lines[0].runs.map(r => r.text).join('')).toBe('Yes');
        expect(lines[0].x).toBeGreaterThan(20);
    });
});

describe('layoutPage', () => {
    it('draws checkbox characters as frames and reports where they are', () => {
        const box: Glyph = { ...glyphs('x', 100, 500, { size: 17 })[0], ch: '\uF0FF', em: 0.6 };
        const out = layoutPage({ index: 0, w: 595, h: 842, glyphs: [box, ...glyphs('Yes', 120, 500)], shapes: [], images: [] });
        expect(out.boxes).toHaveLength(1);
        expect(out.boxes[0].rect.w).toBeCloseTo(8.5, 1);
        expect(out.shapes).toHaveLength(1);
        expect(out.shapes[0].fill).toBeTruthy();
        expect(out.lines.map(l => l.runs.map(r => r.text).join(''))).toEqual(['Yes']);
    });

    it('uses thin rules and cell edges as dividers', () => {
        const shapes: VectorShape[] = [
            { z: 0, segments: [], box: { x: 100, y: 10, w: 0.5, h: 50 }, fill: { color: '000000', alpha: 1 }, stroke: null, isRect: true },
            { z: 1, segments: [], box: { x: 200, y: 10, w: 100, h: 20 }, fill: { color: 'CCECF9', alpha: 1 }, stroke: null, isRect: true },
        ];
        expect(dividersOf(shapes).map(d => d.x)).toEqual([100.25, 200, 300]);
    });
});

describe('buildDocx', () => {
    const page: DocxPageIn = {
        w: 595.32,
        h: 841.92,
        lines: buildLines(glyphs('Name & <Email>', 20, 800), 0),
        shapes: [{ z: 0, segments: [], box: { x: 10, y: 10, w: 100, h: 20 }, fill: { color: 'CCECF9', alpha: 1 }, stroke: null, isRect: true }],
        pictures: [{ placement: { z: 1, source: { objId: 'a' }, box: { x: 0, y: 0, w: 50, h: 50 }, flipH: false, flipV: false, clip: null }, png: new Uint8Array([1, 2, 3]) }],
        fields: [
            { kind: 'text', name: 'First Name', rect: { x: 100, y: 700, w: 150, h: 14 }, value: 'Siobhán', fontSize: 10, multiline: false, align: 'left', valign: 'middle' },
            { kind: 'text', name: 'Email', rect: { x: 100, y: 680, w: 150, h: 14 }, value: '', fontSize: 10, multiline: false, align: 'left', valign: 'middle' },
            { kind: 'check', name: 'Yes', rect: { x: 300, y: 700, w: 8.5, h: 10.6 }, checked: true },
            { kind: 'check', name: 'No', rect: { x: 350, y: 700, w: 8.5, h: 10.6 }, checked: false },
        ],
    };

    function open(bytes: Uint8Array) {
        const zip = new PizZip(bytes);
        const xml = zip.file('word/document.xml')!.asText();
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        return { zip, xml, doc };
    }

    it('writes a complete package with well-formed XML', () => {
        const { zip, doc } = open(buildDocx([page, { ...page, fields: [] }], { title: 'Form' }));
        for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/settings.xml', 'word/fontTable.xml', 'docProps/core.xml']) {
            expect(zip.file(part)).toBeTruthy();
            expect(new DOMParser().parseFromString(zip.file(part)!.asText(), 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
        }
        expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
        // The same image twice is stored once
        expect(Object.keys(zip.files).filter(n => n.startsWith('word/media/'))).toEqual(['word/media/image1.png']);
        expect(zip.file('word/_rels/document.xml.rels')!.asText()).toContain('Target="media/image1.png"');
        expect(zip.file('[Content_Types].xml')!.asText()).toContain('Extension="png"');
    });

    it('sizes each page like the PDF and anchors everything to it', () => {
        const { xml } = open(buildDocx([page]));
        expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
        expect(xml).toContain('<wp:positionH relativeFrom="page"><wp:posOffset>254000</wp:posOffset>'); // 20 pt
        expect(xml).toContain('Name &amp; &lt;Email&gt;');
        expect(xml).toContain('<a:srgbClr val="CCECF9">');
    });

    it('writes answers in text boxes and check boxes as content controls', () => {
        const { xml } = open(buildDocx([page]));
        expect(xml).toContain('>Siobhán</w:t>');
        expect(xml).toContain('name="First Name');
        // Text answers are plain runs (no content control a generated value could break)
        expect(xml).not.toContain('<w:text');
        expect(xml.match(/<w14:checkbox>/g)).toHaveLength(2);
        expect(xml).toContain('<w14:checked w14:val="1"/>');
        expect(xml).toContain('<w14:checked w14:val="0"/>');
        expect(xml).toContain('<w:sym w:font="Wingdings" w:char="F0FC"/>');
        expect(open(buildDocx([page], { mark: 'cross' })).xml).toContain('w:char="F0FB"');
    });

    it('escapes text and drops characters XML cannot hold', () => {
        expect(xmlText('a\u0001<b>&')).toBe('a&lt;b&gt;&amp;');
    });
});

describe('fields', () => {
    it('suggests the Documents placeholder a label asks for', () => {
        expect(placeholderForLabel('First Name', false)).toBe('firstName');
        expect(placeholderForLabel('Surname', false)).toBe('lastName');
        expect(placeholderForLabel('Mobile Number', false)).toBe('mobileNumber');
        expect(placeholderForLabel('Phone Number', false)).toBe('phone');
        expect(placeholderForLabel('Email Address', false)).toBe('email');
        expect(placeholderForLabel('Address', false)).toBe('address');
        expect(placeholderForLabel('CO Address', false)).toBeUndefined();
        expect(placeholderForLabel('No Official Address (in Section 1)', false)).toBeUndefined();
        expect(placeholderForLabel('Eircode', false)).toBe('eircode');
        expect(placeholderForLabel('Course Name', false)).toBe('courseTitle');
        expect(placeholderForLabel('Community Organisation Name', false)).toBeUndefined();
        expect(placeholderForLabel('LDC Staff Member', false)).toBeUndefined();
        expect(placeholderForLabel('Date of Birth', true)).toBe('dateOfBirth');
        expect(placeholderForLabel('Date of Registration', true)).toBe('registeredAt');
        expect(placeholderForLabel('Start Date', true)).toBe('courseDate');
        expect(placeholderForLabel('Date', true)).toBe('today');
        expect(placeholderForLabel('End Date', true)).toBeUndefined();
        // Every suggestion is a placeholder Documents knows
        for (const label of ['First Name', 'Surname', 'Full name', 'Mobile', 'Phone', 'Email', 'Address', 'Eircode', 'Course title']) {
            expect(PLACEHOLDER_KEYS.has(placeholderForLabel(label, false)!)).toBe(true);
        }
        for (const label of ['Date of Birth', 'Date of Registration', 'Start Date', 'Date of completion', 'Date']) {
            expect(PLACEHOLDER_KEYS.has(placeholderForLabel(label, true)!)).toBe(true);
        }
    });

    it('finds empty answer cells and checkboxes, with their printed labels and placeholders', () => {
        const layout = makeLayout();
        const fields = detectFields({ layout, boxes: layout.checkboxes.map(c => ({ page: c.rect.page, rect: c.rect })), shapes: [[], []], images: [[], []] });
        const texts = fields.filter((f): f is TextFieldDef => f.kind === 'text');
        expect(texts.map(f => [f.label, f.placeholder])).toEqual([
            ['CO Name', undefined],
            ['First Name', 'firstName'],
            ['Last Name', 'lastName'],
        ]);
        const first = texts[1];
        expect(first.rect.x).toBeGreaterThan(108);
        expect(first.rect.x + first.rect.w).toBeLessThan(296);
        const checks = fields.filter(f => f.kind === 'check');
        expect(checks.map(c => c.label)).toEqual(['Yes', 'No', 'People living in disadvantaged communities', 'Refugees', 'Travellers', 'Not applicable']);
        expect(suggestedValues(fields)).toEqual({ [texts[1].id]: '{firstName}', [texts[2].id]: '{lastName}' });
    });

    it('adds a field where someone clicks: the whole cell, or a line-sized box in the margin', () => {
        const layout = makeLayout();
        const inCell = fieldAt(layout, 0, 200, 700, 'n1');
        expect(inCell.rect.x).toBeGreaterThan(108);
        expect(inCell.label).toBe('CO Name');
        const atEdge = fieldAt(layout, 0, 590, 300, 'n2');
        expect(atEdge.rect.w).toBeGreaterThan(0);
        expect(atEdge.rect.x + atEdge.rect.w).toBeLessThanOrEqual(585);
    });

    it('flags placeholders Documents does not know and braces that do not pair up', () => {
        const f = (id: string, label: string): FieldDef => ({ id, kind: 'text', page: 0, rect: { page: 0, x: 0, y: 0, w: 100, h: 14 }, label, multiline: false, align: 'left', valign: 'middle' });
        const fields = [f('a', 'First Name'), f('b', 'Name'), f('c', 'Notes'), f('d', 'Empty'), f('e', 'Fixed')];
        const values = { a: '{firstName}', b: '{fristName} {lastName}', c: '{lastName', d: '{}', e: 'Cork City' };
        expect(checkPlaceholders(fields, values, PLACEHOLDER_KEYS)).toEqual({ unknown: ['fristName'], broken: ['Notes', 'Empty'] });
    });
});

describe('fill', () => {
    it('measures Arial and shrinks long answers to fit', () => {
        expect(measureArial('Hello', 10)).toBeCloseTo(22.78, 1);
        expect(fitSize('Short', 100, 14, false)).toBe(10);
        const long = 'A rather long answer that will not fit on one line at ten points';
        expect(fitSize(long, 150, 14, false)).toBeLessThan(10);
        expect(fitSize(long, 150, 40, true)).toBe(10);
    });

    it('grows boxes shorter than a line, keeping the edge the text sits on', () => {
        const field: TextFieldDef = { id: 'd', kind: 'text', page: 0, rect: { page: 0, x: 10, y: 100, w: 20, h: 8 }, label: 'Day', multiline: false, align: 'center', valign: 'bottom' };
        const [out] = fieldsForPage([field], { d: '07' }, 0);
        expect(out.kind).toBe('text');
        if (out.kind !== 'text') return;
        expect(out.rect.y).toBe(100);
        expect(out.rect.h).toBeGreaterThan(11);
        expect(out.value).toBe('07');
    });
});

describe('Word template for Documents', () => {
    const rect = (x: number, y: number, w: number, h: number) => ({ page: 0, x, y, w, h });
    /** A page with "First Name" and a printed date blank, as the converter reads them */
    function form(): { pages: ConvertedPage[]; fields: FieldDef[] } {
        const lines = [...buildLines(glyphs('First Name', 20, 700), 0), ...buildLines(glyphs('_____/_____/20____', 120, 650), 0), ...buildLines(glyphs('Price {in euro}', 20, 600), 0)];
        const pages: ConvertedPage[] = [{ index: 0, w: 595, h: 842, base: { w: 595, h: 842, lines, shapes: [], pictures: [] }, boxes: [] }];
        const fields: FieldDef[] = [
            { id: 'f', kind: 'text', page: 0, rect: rect(120, 696, 150, 14), label: 'First Name', multiline: false, align: 'left', valign: 'middle', placeholder: 'firstName' },
            { id: 'd', kind: 'text', page: 0, rect: rect(120, 650, 100, 11), label: 'Date of Birth', multiline: false, align: 'left', valign: 'bottom', placeholder: 'dateOfBirth', blank: rect(118, 643, 104, 18) },
            { id: 'e', kind: 'text', page: 0, rect: rect(300, 696, 150, 14), label: 'Email', multiline: false, align: 'left', valign: 'middle' },
            { id: 'c', kind: 'check', page: 0, rect: rect(300, 650, 8, 10), label: 'Yes' },
        ];
        return { pages, fields };
    }
    const docXml = (bytes: Uint8Array) => new PizZip(bytes).file('word/document.xml')!.asText();

    it('passes the Documents template check and renders each student’s details', async () => {
        const { pages, fields } = form();
        const bytes = filledDocx(pages, fields, { ...suggestedValues(fields), c: true });
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        expect(await checkTemplateBuffer(buffer, 'document')).toEqual({ unknownTags: [] });

        const doc = new Docxtemplater(new PizZip(bytes), { paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' } });
        doc.render({ firstName: 'Siobhán', dateOfBirth: '07 Mar 1990' });
        const xml = doc.getZip().file('word/document.xml')!.asText();
        expect(xml).toContain('>Siobhán</w:t>');
        expect(xml).toContain('>07 Mar 1990</w:t>');
        expect(xml).not.toContain('{firstName}');
        // The box ticked on the page stays ticked on every form
        expect(xml).toContain('<w14:checked w14:val="1"/>');
    });

    it('leaves the printed date blank out under a filled date, and keeps it when the date is empty', () => {
        const { pages, fields } = form();
        expect(docXml(filledDocx(pages, fields, { d: '{dateOfBirth}' }))).not.toContain('_____/_____/20____');
        expect(docXml(filledDocx(pages, fields, {}))).toContain('_____/_____/20____');
    });

    it('prints braces in the form’s own text as look-alikes, so they are not read as placeholders', () => {
        const { pages, fields } = form();
        const xml = docXml(filledDocx(pages, fields, {}));
        expect(xml).toContain('Price \uFF5Bin euro\uFF5D');
        expect(xml).not.toContain('{in euro}');
    });

    it('sizes a placeholder by its box, not by the length of its name', () => {
        const box = { rect: rect(0, 0, 40, 14), multiline: false };
        expect(valueSize('{courseRegistrationDate}', box)).toBe(10);
        expect(valueSize('{firstName}', { ...box, rect: rect(0, 0, 40, 9) })).toBe(7.5);
        expect(valueSize('A long fixed answer for a small box', box)).toBeLessThan(10);
    });
});

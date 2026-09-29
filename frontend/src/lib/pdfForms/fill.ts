// ─── Printing values onto a flat PDF (pdf-lib) ─────────────────
// Text is drawn in Arimo (metric-compatible with Arial, the forms' font, and
// covering Latin, Irish, Cyrillic…), shrunk or wrapped to fit its box.

import type { PDFDocument as PDFDocumentType, PDFFont, PDFPage } from 'pdf-lib';
import arimoUrl from '../../assets/fonts/Arimo-Regular.ttf?url';
import { DEFAULT_FONT_SIZE, MIN_FONT_SIZE, type FormField, type Rect, type TemplateSettings, type TextField } from './types';
import { loadChunk } from '../deployRecovery';

export type FieldValue = { kind: 'text'; text: string } | { kind: 'choice'; ticked: string[] };
export type RowValues = Record<string, FieldValue>;

const LINE_HEIGHT = 1.18;
/** Arimo's cap height and ascent as a share of the font size */
const CAP_HEIGHT = 0.716;
const ASCENT = 0.905;

// ─── Text fitting (pure, so it can be tested with any measure function) ───

export type Measure = (text: string, size: number) => number;

export interface FittedText {
    lines: string[];
    size: number;
    truncated: boolean;
}

export function oneLine(text: string): string {
    return text
        .split(/\s*[\r\n]+\s*/)
        .filter(Boolean)
        .join(', ')
        .replace(/,\s*,/g, ',')
        .replace(/\s+/g, ' ')
        .trim();
}

export function wrapText(text: string, width: number, size: number, measure: Measure): string[] {
    const lines: string[] = [];
    for (const para of text.split(/\r?\n/)) {
        const words = para.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines.push('');
            continue;
        }
        let line = '';
        for (let word of words) {
            // A word wider than the box is broken across lines
            while (measure(word, size) > width && word.length > 1) {
                let n = word.length - 1;
                while (n > 1 && measure(word.slice(0, n), size) > width) n--;
                if (line) lines.push(line);
                line = '';
                lines.push(word.slice(0, n));
                word = word.slice(n);
            }
            const candidate = line ? `${line} ${word}` : word;
            if (measure(candidate, size) <= width) line = candidate;
            else {
                if (line) lines.push(line);
                line = word;
            }
        }
        if (line) lines.push(line);
    }
    // Blank lines at the ends only waste space
    while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
    while (lines.length > 1 && !lines[0]) lines.shift();
    return lines;
}

function ellipsize(text: string, width: number, size: number, measure: Measure): string {
    let t = text.trimEnd();
    while (t && measure(`${t}…`, size) > width) t = t.slice(0, -1).trimEnd();
    return `${t}…`;
}

export function fitText(text: string, rect: { w: number; h: number }, maxSize: number, multiline: boolean, measure: Measure): FittedText {
    const value = multiline ? text.trim() : oneLine(text);
    if (!value) return { lines: [], size: maxSize, truncated: false };
    const top = Math.max(MIN_FONT_SIZE, Math.min(maxSize, multiline ? maxSize : rect.h * 0.85));

    for (let size = top; size >= MIN_FONT_SIZE - 0.001; size -= 0.5) {
        if (!multiline) {
            if (measure(value, size) <= rect.w) return { lines: [value], size, truncated: false };
            continue;
        }
        const lines = wrapText(value, rect.w, size, measure);
        if (lines.length * size * LINE_HEIGHT <= rect.h + 0.5) return { lines, size, truncated: false };
    }

    const size = MIN_FONT_SIZE;
    if (!multiline) return { lines: [ellipsize(value, rect.w, size, measure)], size, truncated: true };
    const maxLines = Math.max(1, Math.floor((rect.h + 0.5) / (size * LINE_HEIGHT)));
    const lines = wrapText(value, rect.w, size, measure).slice(0, maxLines);
    lines[lines.length - 1] = ellipsize(lines[lines.length - 1], rect.w, size, measure);
    return { lines, size, truncated: true };
}

export interface RuledText extends FittedText {
    /** Text lines written in each ruled line */
    perRow: number;
}

/** Heights of a ruled box's writing lines, top to bottom */
export function ruledRows(h: number, lines: number, rules?: number[]): number[] {
    const cuts = rules && rules.length === lines - 1 ? [0, ...rules, 1] : Array.from({ length: lines + 1 }, (_, i) => i / lines);
    const heights: number[] = [];
    for (let i = cuts.length - 1; i > 0; i--) heights.push((cuts[i] - cuts[i - 1]) * h);
    return heights;
}

/**
 * Fit text between ruled lines: one text line per ruled line if the font stays
 * readable, otherwise two (or three…) smaller lines in each.
 */
export function fitRuled(text: string, width: number, rows: number[], maxSize: number, measure: Measure): RuledText {
    const value = text.trim();
    if (!value) return { lines: [], size: maxSize, truncated: false, perRow: 1 };
    const rowH = Math.min(...rows);
    let last: RuledText | null = null;
    for (let perRow = 1; perRow <= 4; perRow++) {
        const top = Math.min(maxSize, (rowH / perRow) * 0.8);
        const bottom = Math.max(MIN_FONT_SIZE, perRow < 4 ? (rowH / (perRow + 1)) * 0.8 : MIN_FONT_SIZE);
        for (let size = top; size >= bottom - 0.001; size -= 0.5) {
            if (size < MIN_FONT_SIZE) break;
            const lines = wrapText(value, width, size, measure);
            last = { lines, size, truncated: false, perRow };
            if (lines.length <= rows.length * perRow) return last;
        }
    }
    // Still too long at the smallest size: shorten
    const perRow = last?.perRow ?? 1;
    const size = last?.size ?? MIN_FONT_SIZE;
    const lines = wrapText(value, width, size, measure).slice(0, rows.length * perRow);
    lines[lines.length - 1] = ellipsize(lines[lines.length - 1], width, size, measure);
    return { lines, size, truncated: true, perRow };
}

// ─── pdf-lib ────────────────────────────────────────────────────

type PdfLib = typeof import('pdf-lib');

let libsPromise: Promise<{ lib: PdfLib; fontkit: unknown; font: Uint8Array }> | null = null;

function loadLibs() {
    libsPromise ??= Promise.all([
        loadChunk(() => import('pdf-lib')),
        loadChunk(() => import('@pdf-lib/fontkit')),
        fetch(arimoUrl).then(r => {
            if (!r.ok) throw new Error(`Could not load the form font (${r.status})`);
            return r.arrayBuffer();
        }).then(buf => new Uint8Array(buf)),
    ])
        .then(([lib, fk, font]) => ({ lib, fontkit: fk.default ?? fk, font }))
        .catch(err => {
            libsPromise = null;
            throw err;
        });
    return libsPromise;
}

export interface FilledPdf {
    bytes: Uint8Array;
    warnings: string[];
}

function sanitize(text: string, supported: Set<number>): { text: string; replaced: boolean } {
    let replaced = false;
    const out = [...text.replace(/\t/g, ' ')]
        .map(ch => {
            if (ch === '\n' || ch === '\r') return ch;
            const cp = ch.codePointAt(0)!;
            // Control characters print nothing
            if (cp < 0x20 || cp === 0x7f) return '';
            if (supported.has(cp)) return ch;
            replaced = true;
            return '?';
        })
        .join('');
    return { text: out, replaced };
}

function drawTextField(page: PDFPage, font: PDFFont, field: TextField, text: string, lib: PdfLib): boolean {
    const { rect } = field;
    const measure: Measure = (t, size) => font.widthOfTextAtSize(t, size);
    const color = lib.rgb(0.05, 0.05, 0.1);
    if (field.multiline && field.lines && field.lines >= 2) {
        // Each text line centred in its share of a ruled line, so rules never cross the words
        const rows = ruledRows(rect.h, field.lines, field.rules);
        const ruled = fitRuled(text, rect.w, rows, field.fontSize || DEFAULT_FONT_SIZE, measure);
        let rowTop = rect.y + rect.h;
        rows.forEach((rowH, r) => {
            const slot = rowH / ruled.perRow;
            for (let k = 0; k < ruled.perRow; k++) {
                const line = ruled.lines[r * ruled.perRow + k];
                if (!line) continue;
                const slotBottom = rowTop - (k + 1) * slot;
                page.drawText(line, { x: rect.x + 1, y: slotBottom + (slot - ruled.size * CAP_HEIGHT) / 2, size: ruled.size, font, color });
            }
            rowTop -= rowH;
        });
        return ruled.truncated;
    }
    const fitted = fitText(text, rect, field.fontSize || DEFAULT_FONT_SIZE, field.multiline, measure);
    fitted.lines.forEach((line, i) => {
        if (!line) return;
        const width = measure(line, fitted.size);
        const x = field.align === 'center' ? rect.x + (rect.w - width) / 2 : rect.x + 1;
        const y = field.multiline
            ? rect.y + rect.h - fitted.size * ASCENT - i * fitted.size * LINE_HEIGHT
            : rect.y + (rect.h - fitted.size * CAP_HEIGHT) / 2;
        page.drawText(line, { x, y, size: fitted.size, font, color });
    });
    return fitted.truncated;
}

export function drawMark(page: PDFPage, rect: Rect, style: TemplateSettings['mark'], lib: PdfLib): void {
    const s = Math.min(rect.w, rect.h);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const color = lib.rgb(0.05, 0.05, 0.1);
    const thickness = Math.max(1, s * 0.14);
    // drawSvgPath: origin at (x, y), SVG y axis points down
    const path =
        style === 'cross'
            ? `M ${-0.36 * s} ${-0.36 * s} L ${0.36 * s} ${0.36 * s} M ${-0.36 * s} ${0.36 * s} L ${0.36 * s} ${-0.36 * s}`
            : `M ${-0.38 * s} ${0.02 * s} L ${-0.1 * s} ${0.32 * s} L ${0.46 * s} ${-0.46 * s}`;
    page.drawSvgPath(path, { x: cx, y: cy, borderColor: color, borderWidth: thickness, borderLineCap: lib.LineCapStyle.Round });
}

/** Fills copies of one template PDF. Create once per run; fill() per row. */
export class FormFiller {
    private constructor(
        private readonly lib: PdfLib,
        private readonly fontkit: unknown,
        private readonly fontBytes: Uint8Array,
        private readonly template: Uint8Array,
    ) {}

    static async create(template: ArrayBuffer | Uint8Array): Promise<FormFiller> {
        const { lib, fontkit, font } = await loadLibs();
        const bytes = template instanceof Uint8Array ? template : new Uint8Array(template);
        // Fail early (and clearly) on a PDF pdf-lib can't open
        await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
        return new FormFiller(lib, fontkit, font, bytes);
    }

    /** Draw one row's values; `pages[i]` stands for template page i, whose origin is `origins[i]` */
    private drawRow(pages: PDFPage[], origins: { x: number; y: number }[], font: PDFFont, fields: FormField[], values: RowValues, settings: TemplateSettings): string[] {
        const { lib } = this;
        const supported = new Set(font.getCharacterSet());
        const warnings: string[] = [];
        const at = (rect: Rect): Rect => ({ ...rect, x: rect.x + (origins[rect.page]?.x ?? 0), y: rect.y + (origins[rect.page]?.y ?? 0) });

        for (const field of fields) {
            const value = values[field.id];
            if (!value) continue;
            if (field.kind === 'text' && value.kind === 'text') {
                const page = pages[field.rect.page];
                if (!page || !value.text.trim()) continue;
                const clean = sanitize(value.text, supported);
                if (clean.replaced) warnings.push(`"${field.name}": some characters can't be printed and show as "?"`);
                if (drawTextField(page, font, { ...field, rect: at(field.rect) }, clean.text, lib)) warnings.push(`"${field.name}" is too long for its box and was shortened`);
            } else if (field.kind === 'choice' && value.kind === 'choice') {
                for (const id of value.ticked) {
                    const option = field.options.find(o => o.id === id);
                    const page = option && pages[option.rect.page];
                    if (option && page) drawMark(page, at(option.rect), settings.mark, lib);
                }
            }
        }
        return warnings;
    }

    // Subsetting is off: pdf-lib 1.17 drops glyphs when it subsets this font
    private async embedFont(doc: PDFDocumentType): Promise<PDFFont> {
        doc.registerFontkit(this.fontkit as never);
        return doc.embedFont(this.fontBytes, { subset: false });
    }

    /** One filled copy of the template */
    async fill(fields: FormField[], values: RowValues, settings: TemplateSettings): Promise<FilledPdf> {
        const doc: PDFDocumentType = await this.lib.PDFDocument.load(this.template, { ignoreEncryption: true });
        const font = await this.embedFont(doc);
        const pages = doc.getPages();
        const origins = pages.map(p => {
            const box = p.getCropBox();
            return { x: box.x, y: box.y };
        });
        const warnings = this.drawRow(pages, origins, font, fields, values, settings);
        return { bytes: await doc.save({ useObjectStreams: true }), warnings };
    }

    /**
     * Every row in one file, page after page (for printing). The template pages and
     * the font are stored once and reused, so the file stays small.
     */
    async combine(rows: RowValues[], fields: FormField[], settings: TemplateSettings, onRow?: (done: number) => void | Promise<void>): Promise<{ bytes: Uint8Array; warnings: string[][] }> {
        const { lib } = this;
        const out = await lib.PDFDocument.create();
        const src = await lib.PDFDocument.load(this.template, { ignoreEncryption: true });
        const srcPages = src.getPages();
        const boxes = srcPages.map(p => p.getCropBox());
        // A page with no content stream can't be embedded (and needs nothing drawn)
        const withContent = srcPages.map(p => !!p.node.Contents());
        const embeddedList = await out.embedPages(
            srcPages.filter((_, i) => withContent[i]),
            boxes.filter((_, i) => withContent[i]).map(b => ({ left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height })),
        );
        let next = 0;
        const embedded = withContent.map(has => (has ? embeddedList[next++] : null));
        const font = await this.embedFont(out);
        const origins = boxes.map(() => ({ x: 0, y: 0 }));
        const warnings: string[][] = [];
        for (let i = 0; i < rows.length; i++) {
            const pages = embedded.map((e, p) => {
                const page = out.addPage([boxes[p].width, boxes[p].height]);
                if (e) page.drawPage(e, { x: 0, y: 0 });
                return page;
            });
            warnings.push(this.drawRow(pages, origins, font, fields, rows[i], settings));
            await onRow?.(i + 1);
        }
        return { bytes: await out.save({ useObjectStreams: true }), warnings };
    }
}

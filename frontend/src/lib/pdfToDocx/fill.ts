// ─── Filled-in form → Word document ────────────────────────────

import { buildDocx, type DocxOptions, type FieldOut } from './docx';
import type { ConvertedPage } from './convert';
import type { FieldDef, FieldValues } from './fields';

export const DEFAULT_VALUE_SIZE = 10;
const MIN_VALUE_SIZE = 6;
const LINE = 1.15;

/** Arial / Helvetica advance widths (1/1000 em) for printable ASCII; anything else counts as 556 */
const ARIAL =
    '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584'
        .split(',')
        .map(Number);

/** Width of text in Arial at a font size, in points */
export function measureArial(text: string, size: number): number {
    let w = 0;
    for (const ch of text) {
        const c = ch.charCodeAt(0);
        w += c >= 32 && c <= 126 ? ARIAL[c - 32] : 556;
    }
    return (w / 1000) * size;
}

function wrappedLines(text: string, width: number, size: number): number {
    let count = 0;
    for (const para of text.split('\n')) {
        let line = 0;
        let lines = 1;
        for (const word of para.split(/\s+/).filter(Boolean)) {
            const w = measureArial(word, size);
            const add = line === 0 ? w : measureArial(' ', size) + w;
            if (line > 0 && line + add > width) {
                lines += 1 + Math.floor(w / Math.max(1, width));
                line = w % Math.max(1, width);
            } else {
                line += add;
            }
        }
        count += lines;
    }
    return count;
}

/** Largest font size (half-point steps) at which the value fits its box */
export function fitSize(text: string, w: number, h: number, multiline: boolean, max = DEFAULT_VALUE_SIZE): number {
    const value = text.trim();
    if (!value) return max;
    for (let size = max; size > MIN_VALUE_SIZE; size -= 0.5) {
        if (multiline) {
            if (wrappedLines(value, w, size) * size * LINE <= h + size * 0.3) return size;
        } else if (measureArial(value.replace(/\s*\n\s*/g, ', '), size) <= w) {
            return size;
        }
    }
    return MIN_VALUE_SIZE;
}

/** The fields of one page, with their values, as the Word writer takes them */
export function fieldsForPage(fields: FieldDef[], values: FieldValues, page: number): FieldOut[] {
    return fields
        .filter(f => f.page === page)
        .map((f): FieldOut => {
            if (f.kind === 'check') return { kind: 'check', name: f.label || 'Check box', rect: f.rect, checked: values[f.id] === true };
            const raw = typeof values[f.id] === 'string' ? (values[f.id] as string) : '';
            const value = f.multiline ? raw : raw.replace(/\s*\n\s*/g, ', ');
            const fontSize = fitSize(value, f.rect.w, f.rect.h, f.multiline);
            // A box shorter than one line of text would hide it in Word: grow it, keeping its anchored edge
            const need = fontSize * LINE + 1;
            let rect = f.rect;
            if (rect.h < need) {
                const extra = need - rect.h;
                const y = f.valign === 'bottom' ? rect.y : f.valign === 'top' ? rect.y - extra : rect.y - extra / 2;
                rect = { ...rect, y, h: need };
            }
            return { kind: 'text', name: f.label || 'Field', rect, value, fontSize, multiline: f.multiline, align: f.align, valign: f.valign };
        });
}

/** The converted form with these values filled in, as a .docx file */
export function filledDocx(pages: ConvertedPage[], fields: FieldDef[], values: FieldValues, opts: DocxOptions = {}): Uint8Array {
    return buildDocx(
        pages.map(p => ({ ...p.base, fields: fieldsForPage(fields, values, p.index) })),
        opts,
    );
}

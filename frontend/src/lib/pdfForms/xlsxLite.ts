// ─── A small, forgiving .xlsx reader ───────────────────────────
// exceljs reads everything in a workbook (styles, tables, validations, drawings…) and gives up
// on the whole file when any of that is slightly off, even though Excel opens it happily.
// This reader looks only at what a form needs: sheet names, which are hidden, the cell values
// and the hidden rows. It is the second try when exceljs fails.

import PizZip from 'pizzip';
import { formatDate } from './source';

export interface LiteSheet {
    name: string;
    /** Hidden in Excel (a "very hidden" sheet is not even offered by Excel, so it is left out altogether) */
    hidden: boolean;
    table: string[][];
    hiddenRows: number[];
}

const MAX_COLUMNS = 2000;
const MAIN_NS = '*';

/** Built-in number formats that show a date or a time */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function parseXml(text: string): Document {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Damaged XML');
    return doc;
}

/** Elements by name whatever the namespace prefix ("x:row" or "row") */
function all(parent: Document | Element, name: string): Element[] {
    return Array.from(parent.getElementsByTagNameNS(MAIN_NS, name));
}

function children(parent: Element, name: string): Element[] {
    return Array.from(parent.children).filter(c => c.localName === name);
}

/** An attribute whatever its prefix (r:id, x:id …) */
function attr(el: Element, name: string): string | null {
    const direct = el.getAttribute(name);
    if (direct !== null) return direct;
    for (const a of Array.from(el.attributes)) if (a.localName === name) return a.value;
    return null;
}

function readText(zip: PizZip, path: string): string | null {
    const file = zip.file(path) ?? zip.file(path.replace(/^\//, ''));
    return file ? file.asText() : null;
}

/** "AB12" → column 27 (0-based) */
function columnIndex(ref: string): number {
    let n = 0;
    for (const ch of ref) {
        const code = ch.toUpperCase().charCodeAt(0);
        if (code < 65 || code > 90) break;
        n = n * 26 + (code - 64);
    }
    return n - 1;
}

function sharedStrings(zip: PizZip): string[] {
    const xml = readText(zip, 'xl/sharedStrings.xml');
    if (!xml) return [];
    try {
        return all(parseXml(xml), 'si').map(si => {
            // Text runs, without the phonetic guides (rPh) some Asian-language files carry
            let text = '';
            for (const child of Array.from(si.children)) {
                if (child.localName === 't') text += child.textContent ?? '';
                else if (child.localName === 'r') text += children(child, 't').map(t => t.textContent ?? '').join('');
            }
            return text;
        });
    } catch {
        return [];
    }
}

/** For each cell format (style index): does it show a date? */
function dateStyles(zip: PizZip): boolean[] {
    const xml = readText(zip, 'xl/styles.xml');
    if (!xml) return [];
    try {
        const doc = parseXml(xml);
        const custom = new Map<number, string>();
        all(doc, 'numFmt').forEach(n => custom.set(Number(attr(n, 'numFmtId')), attr(n, 'formatCode') ?? ''));
        const cellXfs = all(doc, 'cellXfs')[0];
        if (!cellXfs) return [];
        return children(cellXfs, 'xf').map(xf => {
            const id = Number(attr(xf, 'numFmtId') ?? 0);
            if (BUILTIN_DATE_FORMATS.has(id)) return true;
            const code = custom.get(id);
            if (!code) return false;
            const bare = code.replace(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*./g, '');
            return /[dmyhs]/i.test(bare) && !/general/i.test(bare);
        });
    } catch {
        return [];
    }
}

/** Excel's own display of a number under the General format: no floating point noise */
function plainNumber(raw: string): string {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return String(parseFloat(n.toPrecision(15)));
}

/** A date or time serial number as the forms print it */
function serialToText(raw: string): string {
    const serial = Number(raw);
    if (!Number.isFinite(serial)) return raw;
    const days = Math.floor(serial);
    if (days < 1) {
        // A time of day
        const minutes = Math.round((serial % 1) * 24 * 60);
        return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }
    // Excel counts from 30 Dec 1899 (and wrongly has a 29 Feb 1900, which the offset absorbs after March 1900)
    const d = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
    return formatDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function resolveTarget(target: string): string {
    if (target.startsWith('/')) return target.slice(1);
    const parts = `xl/${target}`.split('/');
    const out: string[] = [];
    for (const p of parts) {
        if (p === '..') out.pop();
        else if (p !== '.') out.push(p);
    }
    return out.join('/');
}

/** Sheets in tab order with the file each one lives in */
function sheetFiles(zip: PizZip): { name: string; hidden: boolean; veryHidden: boolean; path: string }[] {
    const workbookXml = readText(zip, 'xl/workbook.xml');
    const relsXml = readText(zip, 'xl/_rels/workbook.xml.rels');
    if (workbookXml && relsXml) {
        try {
            const targets = new Map<string, string>();
            all(parseXml(relsXml), 'Relationship').forEach(r => {
                const type = attr(r, 'Type') ?? '';
                if (/\/worksheet$/.test(type)) targets.set(attr(r, 'Id') ?? '', resolveTarget(attr(r, 'Target') ?? ''));
            });
            const found = all(parseXml(workbookXml), 'sheet')
                .map((s, i) => ({
                    name: attr(s, 'name') ?? `Sheet${i + 1}`,
                    hidden: (attr(s, 'state') ?? 'visible') !== 'visible',
                    veryHidden: attr(s, 'state') === 'veryHidden',
                    path: targets.get(attr(s, 'id') ?? '') ?? '',
                }))
                .filter(s => s.path && zip.file(s.path));
            if (found.length > 0) return found;
        } catch {
            // fall through to the file names
        }
    }
    return zip
        .file(/^xl\/worksheets\/[^/]+\.xml$/)
        .map(f => f.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((path, i) => ({ name: `Sheet${i + 1}`, hidden: false, veryHidden: false, path }));
}

function readSheet(xml: string, strings: string[], dates: boolean[]): { table: string[][]; hiddenRows: number[] } {
    const doc = parseXml(xml);
    const grid = new Map<number, string[]>();
    const hiddenRows: number[] = [];
    let lastRow = 0;
    let width = 0;

    let nextRow = 0;
    for (const row of all(doc, 'row')) {
        const rowNumber = Number(attr(row, 'r')) || nextRow + 1;
        nextRow = rowNumber;
        const hidden = attr(row, 'hidden');
        if (hidden === '1' || hidden === 'true') hiddenRows.push(rowNumber - 1);
        const cells: string[] = [];
        let nextCol = 0;
        for (const c of children(row, 'c')) {
            const ref = attr(c, 'r');
            const col = ref ? columnIndex(ref) : nextCol;
            nextCol = col + 1;
            if (col < 0 || col >= MAX_COLUMNS) continue;
            const type = attr(c, 't') ?? 'n';
            const v = children(c, 'v')[0]?.textContent ?? '';
            let text = '';
            if (type === 's') text = strings[Number(v)] ?? '';
            else if (type === 'inlineStr') text = children(c, 'is').map(is => all(is, 't').map(t => t.textContent ?? '').join('')).join('');
            else if (type === 'str') text = v;
            else if (type === 'b') text = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : '';
            else if (type === 'e') text = '';
            else if (type === 'd') text = /^\d{4}-\d{2}-\d{2}/.test(v) ? formatDate(new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)))) : v;
            else if (v !== '') text = dates[Number(attr(c, 's') ?? 0)] ? serialToText(v) : plainNumber(v);
            if (text === '') continue;
            cells[col] = text;
            width = Math.max(width, col + 1);
        }
        if (cells.length > 0) {
            grid.set(rowNumber - 1, cells);
            lastRow = Math.max(lastRow, rowNumber);
        }
    }

    const table: string[][] = [];
    for (let r = 0; r < lastRow; r++) {
        const cells = grid.get(r) ?? [];
        table.push(Array.from({ length: width }, (_, c) => cells[c] ?? ''));
    }
    return { table, hiddenRows: hiddenRows.filter(r => r < lastRow) };
}

/** Read every sheet of an .xlsx. Throws when the file isn't a workbook at all. */
export function readXlsxLite(data: ArrayBuffer | Uint8Array): LiteSheet[] {
    const zip = new PizZip(data);
    const files = sheetFiles(zip);
    if (files.length === 0) throw new Error('No sheets found');
    const strings = sharedStrings(zip);
    const dates = dateStyles(zip);
    const sheets: LiteSheet[] = [];
    for (const f of files) {
        if (f.veryHidden) continue;
        const xml = readText(zip, f.path);
        if (!xml) continue;
        const { table, hiddenRows } = readSheet(xml, strings, dates);
        sheets.push({ name: f.name, hidden: f.hidden, table, hiddenRows });
    }
    return sheets;
}

// ─── Keeping exceljs away from what makes it hang ──────────────

/** A merged range above this many cells is formatting, not a title */
const MAX_MERGE_CELLS = 50_000;

function rangeCells(ref: string): number {
    const [a, b = a] = ref.split(':');
    const cell = (r: string) => {
        const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(r.trim());
        return m ? { col: columnIndex(m[1]), row: Number(m[2]) } : null;
    };
    const from = cell(a);
    const to = cell(b);
    if (!from || !to) return 0;
    return (Math.abs(to.col - from.col) + 1) * (Math.abs(to.row - from.row) + 1);
}

/**
 * exceljs writes every cell of every data-validation range into memory. Excel files often have
 * validations for a whole column ("C3:C1048576": a million cells per range), and then exceljs
 * hangs the page or runs out of memory, without any error. Validations and huge merged ranges
 * say nothing about the values, so they are cut out before exceljs sees the file.
 * Returns the same bytes when there is nothing to cut.
 */
export function withoutHeavyParts(data: ArrayBuffer | Uint8Array): ArrayBuffer | Uint8Array {
    let zip: PizZip;
    try {
        zip = new PizZip(data);
    } catch {
        return data; // not a zip: let the reader say so
    }
    let changed = false;
    for (const file of zip.file(/^xl\/worksheets\/[^/]+\.xml$/)) {
        const xml = file.asText();
        const cleaned = xml
            .replace(/<(?:\w+:)?dataValidations\b[\s\S]*?<\/(?:\w+:)?dataValidations>/g, '')
            .replace(/<(?:\w+:)?dataValidations\b[^>]*\/>/g, '')
            .replace(/<mergeCell\s[^>]*?ref="([^"]+)"[^>]*\/>/g, (whole, ref: string) => (rangeCells(ref) > MAX_MERGE_CELLS ? '' : whole));
        if (cleaned !== xml) {
            zip.file(file.name, cleaned);
            changed = true;
        }
    }
    return changed ? zip.generate({ type: 'uint8array', compression: 'STORE' }) : data;
}

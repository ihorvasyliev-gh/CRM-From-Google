// ─── Reading the spreadsheet of answers (.xlsx / .csv) ─────────
// Real spreadsheets are messy: several sheets, a title and blank lines above the
// column names, the column names repeated further down, a "Total" row at the end,
// rows hidden with a filter, Excel error values, CSV files saved in the Windows
// encoding. The reader copes with all of those and keeps every sheet, so the one
// that suits a form can be chosen (automatically when the form's columns are known).
// Some sheets have no column names at all (a staff member's extract of an export, for
// instance): their names are borrowed from the sheet of the same workbook they came from.

import { parseDelimitedText } from '../contactImport';
import { formatDate } from './source';
import { normalizeText, similarity } from './text';
import type { NamesFrom, SheetData } from './types';
import { readXlsxLite, withoutHeavyParts } from './xlsxLite';
import { loadChunk } from '../deployRecovery';

/** How many rows from the top to look at for the column names */
const HEADER_SCAN_ROWS = 30;
/** Columns beyond this are formatting, not data */
const MAX_COLUMNS = 2000;
/** Excel error values: an empty answer as far as a form is concerned */
const EXCEL_ERRORS = new Set(['#N/A', '#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#NULL!', '#NUM!', '#SPILL!', '#CALC!']);

/** File types the pickers offer (.xls / .ods too, to explain how to convert them) */
export const SHEET_ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.txt,.xls,.ods';

export interface RawSheet {
    name: string;
    /** Hidden sheet in Excel: used only when nothing else fits */
    hidden: boolean;
    table: string[][];
    /** Table row indexes hidden in Excel (e.g. by a filter) */
    hiddenRows: number[];
}

export interface Workbook {
    fileName: string;
    sheets: RawSheet[];
}

/** Where the column names of a sheet come from (the person can override what was found) */
export type NameSource =
    | { kind: 'auto' }
    /** In this row of the sheet (Excel's row number, starting at 1) */
    | { kind: 'row'; row: number }
    /** Copied by position from another sheet of the workbook */
    | { kind: 'sheet'; sheet: number }
    /** No names: the columns are called by their Excel letters */
    | { kind: 'none' };

export const AUTO_NAMES: NameSource = { kind: 'auto' };

/** Excel's column letters: 0 → A, 26 → AA */
export function columnLetter(index: number): string {
    let n = index + 1;
    let out = '';
    while (n > 0) {
        const rest = (n - 1) % 26;
        out = String.fromCharCode(65 + rest) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out;
}

const letterName = (index: number) => `Column ${columnLetter(index)}`;

function cleanHeader(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

const filled = (r: string[]) => r.filter(c => c && c.trim()).length;

/** Looks like a column name rather than an answer: text, not a number or a date */
function headerish(cell: string): boolean {
    const v = cell.trim();
    return !!v && v.length <= 250 && !/^[\d\s.,:/+()-]+$/.test(v);
}

/**
 * The row holding the column names. With `hint` (the columns a form needs) the row
 * naming most of them wins; otherwise the first row that is about as full of
 * name-like cells as the fullest one (so a title or an export date above is skipped).
 */
export function findHeaderRow(table: string[][], hint: string[] = []): number {
    const top = table.slice(0, HEADER_SCAN_ROWS);
    if (hint.length) {
        const wanted = hint.map(normalizeText);
        let best = -1;
        let bestScore = 0;
        top.forEach((row, i) => {
            const cells = row.filter(headerish);
            const score = wanted.filter(w => cells.some(c => normalizeText(c) === w || similarity(w, c) >= 0.8)).length;
            if (score > bestScore) {
                best = i;
                bestScore = score;
            }
        });
        if (best >= 0) return best;
    }
    const scores = top.map(r => (filled(r) >= 2 ? r.filter(headerish).length : 0));
    const most = Math.max(0, ...scores);
    if (most === 0) return top.findIndex(r => filled(r) > 0);
    return scores.findIndex(s => s >= Math.max(2, most * 0.6));
}

export interface TableOptions {
    hint?: string[];
    hiddenRows?: number[];
    sheetName?: string;
    /** Use this row (0-based) for the column names */
    headerRow?: number;
    /** There is no row of names: use these, by position (missing ones are called by their letter) */
    names?: string[];
}

/** Turn a grid of cells into column names + rows of answers */
export function tableToSheet(table: string[][], fileName: string, opts: TableOptions = {}): SheetData {
    const supplied = opts.names;
    const headerIndex = supplied ? -1 : opts.headerRow ?? findHeaderRow(table, opts.hint);
    if (!supplied && (headerIndex < 0 || headerIndex >= table.length)) return { headers: [], rows: [], rowNumbers: [], fileName, sheetName: opts.sheetName };
    const width = Math.max(supplied?.length ?? 0, ...table.map(r => r.length));

    const source = supplied ?? table[headerIndex];
    const seen = new Map<string, number>();
    const headers = Array.from({ length: width }, (_, i) => {
        let h = cleanHeader(source[i] ?? '') || letterName(i);
        const n = seen.get(h.toLowerCase()) ?? 0;
        seen.set(h.toLowerCase(), n + 1);
        if (n > 0) h = `${h} (${n + 1})`;
        return h;
    });
    const headerKey = (supplied ?? table[headerIndex]).map(c => normalizeText(c)).join('|');
    const firstData = headerIndex + 1;

    // A row with a single cell in a table that is usually well filled is a note or a total
    const counts = table.slice(firstData).map(filled).filter(n => n > 0).sort((a, b) => a - b);
    const typical = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
    const hidden = new Set(opts.hiddenRows ?? []);

    const rows: string[][] = [];
    const rowNumbers: number[] = [];
    const hiddenOut: number[] = [];
    let skipped = 0;
    table.slice(firstData).forEach((r, i) => {
        const n = filled(r);
        if (n === 0) return;
        // The column names again (two tables pasted one under the other)
        if (headerKey.replace(/\|/g, '') && r.slice(0, source.length).map(c => normalizeText(c)).join('|') === headerKey) return skipped++;
        if (n === 1 && typical >= 4) return skipped++;
        if (hidden.has(firstData + i)) hiddenOut.push(rows.length);
        rows.push(Array.from({ length: width }, (_, c) => (r[c] ?? '').trim()));
        rowNumbers.push(firstData + i + 1);
    });

    // Drop trailing columns with neither a name nor any data
    let keep = headers.length;
    while (keep > 0 && headers[keep - 1] === letterName(keep - 1) && rows.every(r => !r[keep - 1])) keep--;
    return {
        headers: headers.slice(0, keep),
        rows: rows.map(r => r.slice(0, keep)),
        rowNumbers,
        fileName,
        sheetName: opts.sheetName,
        hiddenRows: hiddenOut,
        skippedRows: skipped,
    };
}

// ─── Sheets without column names ───────────────────────────────

interface ColumnValues {
    rows: number;
    /** Per column: how often each (lower-case) value occurs */
    counts: Map<string, number>[];
}

const valuesCache = new WeakMap<RawSheet, ColumnValues>();
const donorCache = new WeakMap<Workbook, Map<number, Donor | null>>();

interface Donor {
    sheet: number;
    names: string[];
    /** The row of names (0-based) in the donor sheet */
    row: number;
}

const cellKey = (c: string) => c.trim().toLowerCase();

function columnValues(raw: RawSheet, from: number): ColumnValues {
    const cached = valuesCache.get(raw);
    if (cached) return cached;
    const counts: Map<string, number>[] = [];
    let rows = 0;
    for (const r of raw.table.slice(from)) {
        if (filled(r) === 0) continue;
        rows++;
        r.forEach((c, i) => {
            const k = cellKey(c);
            if (!k) return;
            const m = (counts[i] ??= new Map());
            m.set(k, (m.get(k) ?? 0) + 1);
        });
    }
    const result = { rows, counts };
    valuesCache.set(raw, result);
    return result;
}

/**
 * Is this row of `raw` a row of answers that also lives in `donor` (same values in the same
 * columns)? Common answers like "Open" or "No" don't count: names, ids and dates do.
 */
function looksLikeRowOf(row: string[], donor: ColumnValues): boolean {
    const common = Math.max(2, donor.rows * 0.2);
    let checked = 0;
    let matched = 0;
    row.forEach((cell, i) => {
        const k = cellKey(cell);
        if (k.length < 3) return;
        const n = donor.counts[i]?.get(k) ?? 0;
        if (n > common) return;
        checked++;
        if (n > 0) matched++;
    });
    return matched >= 2 && matched / checked >= 0.4;
}

/**
 * A sheet whose first row is already an answer, with a sibling sheet of the same workbook that
 * has the same answers in the same columns and does have column names (e.g. staff extracts
 * of an export): those names fit this sheet too.
 */
function findDonor(workbook: Workbook, index: number): Donor | null {
    let cache = donorCache.get(workbook);
    if (!cache) donorCache.set(workbook, (cache = new Map()));
    if (cache.has(index)) return cache.get(index) ?? null;

    const raw = workbook.sheets[index];
    let best: (Donor & { matched: number }) | null = null;
    const first = raw ? raw.table[findHeaderRow(raw.table)] : undefined;
    if (raw && first) {
        workbook.sheets.forEach((other, i) => {
            if (i === index) return;
            const row = findHeaderRow(other.table);
            if (row < 0) return;
            const names = other.table[row];
            if (names.filter(headerish).length < 3) return;
            // Its own names are the same as the donor's: it has column names already
            const same = first.filter((c, k) => c.trim() && cellKey(c) === cellKey(names[k] ?? '')).length;
            if (same >= filled(first) * 0.5) return;
            const values = columnValues(other, row + 1);
            if (values.rows === 0 || !looksLikeRowOf(first, values)) return;
            const matched = first.filter((c, k) => cellKey(c).length >= 3 && values.counts[k]?.has(cellKey(c))).length;
            if (!best || matched > best.matched) best = { sheet: i, names, row, matched };
        });
    }
    const donor: Donor | null = best ? { sheet: (best as Donor).sheet, names: (best as Donor).names, row: (best as Donor).row } : null;
    cache.set(index, donor);
    return donor;
}

/** The names of a sheet's columns, as written in its own row of names */
function namesOfSheet(raw: RawSheet, hint: string[] = []): string[] {
    const row = findHeaderRow(raw.table, hint);
    return row < 0 ? [] : raw.table[row];
}

/** The part of an exceljs cell that is used here */
interface XlCell {
    value: unknown;
    text?: string;
}

function cellText(cell: XlCell): string {
    try {
        const v = cell.value;
        // Dates as the forms print them; exceljs keeps them in UTC
        const text = v instanceof Date ? formatDate(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) : cell.text ?? '';
        return EXCEL_ERRORS.has(text.trim()) ? '' : text;
    } catch {
        return '';
    }
}

/** Only the rows and cells that exist: a sheet "formatted down to row 1,048,576" stays small */
async function readWithExcelJs(data: ArrayBuffer): Promise<RawSheet[]> {
    const ExcelJSModule = await loadChunk(() => import('exceljs'));
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    const light = withoutHeavyParts(data);
    await workbook.xlsx.load((light instanceof Uint8Array ? light.buffer.slice(light.byteOffset, light.byteOffset + light.byteLength) : light) as ArrayBuffer);

    return workbook.worksheets.filter(sheet => sheet.state !== 'veryHidden').map(sheet => {
        const grid = new Map<number, string[]>();
        const hiddenRows: number[] = [];
        let width = 0;
        let last = 0;
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            const cells: string[] = [];
            row.eachCell({ includeEmpty: false }, (cell, col) => {
                if (col > MAX_COLUMNS) return;
                const text = cellText(cell);
                if (!text) return;
                cells[col - 1] = text;
                width = Math.max(width, col);
            });
            if (cells.length === 0) return;
            if (row.hidden) hiddenRows.push(rowNumber - 1);
            grid.set(rowNumber - 1, cells);
            last = Math.max(last, rowNumber);
        });
        const table = Array.from({ length: last }, (_, r) => {
            const cells = grid.get(r) ?? [];
            return Array.from({ length: width }, (_, c) => cells[c] ?? '');
        });
        return { name: sheet.name, hidden: sheet.state !== 'visible', table, hiddenRows };
    });
}

/** exceljs first (formatted values); when it gives up on a file Excel opens, the small reader */
async function readXlsx(data: ArrayBuffer): Promise<RawSheet[]> {
    try {
        return await readWithExcelJs(data);
    } catch (first) {
        try {
            return readXlsxLite(data);
        } catch (second) {
            console.error('Could not read the spreadsheet', first, second);
            const error = new Error('This spreadsheet could not be opened. Open it in Excel, choose File → Save As → “Excel Workbook (.xlsx)”, and choose the new file.');
            Object.assign(error, { cause: second });
            throw error;
        }
    }
}

/** CSV files saved by Excel on Windows are often not UTF-8: "Seán" must not become "Se�n" */
export function decodeText(bytes: Uint8Array): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}

/** An old .xls file, or an .xlsx protected with a password (both are "OLE" containers) */
function isOleFile(bytes: Uint8Array): boolean {
    return bytes.length > 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

export async function readWorkbook(file: File): Promise<Workbook> {
    const name = file.name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let sheets: RawSheet[];
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
        if (isOleFile(bytes)) {
            throw new Error('This spreadsheet has a password. Open it in Excel, remove the password (File → Info → Protect Workbook → Encrypt with Password, then clear it), save it and choose it again.');
        }
        sheets = await readXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    } else if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
        sheets = [{ name: file.name, hidden: false, table: parseDelimitedText(decodeText(bytes)), hiddenRows: [] }];
    } else if (name.endsWith('.xls') || name.endsWith('.ods')) {
        throw new Error('This is an older spreadsheet format. Open it in Excel, choose File → Save As → “Excel Workbook (.xlsx)”, then choose the new file here.');
    } else {
        throw new Error('This isn’t a spreadsheet. Choose an Excel file (.xlsx) or a CSV file.');
    }
    const usable = sheets.filter(s => s.table.some(r => filled(r) > 0));
    if (usable.length === 0) throw new Error('This spreadsheet looks empty.');
    return { fileName: file.name, sheets: usable };
}

/** One plain sentence: where this sheet's column names came from */
export function describeNames(from: NamesFrom | undefined): string {
    if (!from) return '';
    if (from.kind === 'none') return 'This sheet has no column names, so the columns are called by their Excel letters (Column A, Column B…).';
    if (from.kind === 'sheet') return `This sheet has no column names of its own, so they are taken from the sheet “${from.sheet}”: the columns line up.`;
    return from.row === 1 ? 'The column names are in the first row.' : `The column names are in row ${from.row}.`;
}

/**
 * A sheet of the workbook as rows of answers. The column names are found by themselves (with the
 * form's columns as a hint; borrowed from a sibling sheet when this one has none) unless `names`
 * says where they are.
 */
export function sheetFrom(workbook: Workbook, index: number, hint: string[] = [], names: NameSource = AUTO_NAMES): SheetData {
    const at = workbook.sheets[index] ? index : 0;
    const raw = workbook.sheets[at];
    const fileName = workbook.sheets.length > 1 ? `${workbook.fileName} · ${raw.name}` : workbook.fileName;
    const base = { hiddenRows: raw.hiddenRows, sheetName: raw.name };
    const finish = (sheet: SheetData, namesFrom: NamesFrom): SheetData => (sheet.headers.length ? { ...sheet, namesFrom } : sheet);

    if (names.kind === 'none') return finish(tableToSheet(raw.table, fileName, { ...base, names: [] }), { kind: 'none' });
    if (names.kind === 'row') {
        const row = Math.min(Math.max(1, Math.round(names.row) || 1), Math.max(1, raw.table.length)) - 1;
        return finish(tableToSheet(raw.table, fileName, { ...base, headerRow: row }), { kind: 'row', row: row + 1, auto: false });
    }
    if (names.kind === 'sheet' && names.sheet !== at && workbook.sheets[names.sheet]) {
        const donor = workbook.sheets[names.sheet];
        return finish(tableToSheet(raw.table, fileName, { ...base, names: namesOfSheet(donor, hint) }), { kind: 'sheet', sheet: donor.name, auto: false });
    }

    const donor = findDonor(workbook, at);
    if (donor) {
        return finish(tableToSheet(raw.table, fileName, { ...base, names: donor.names }), { kind: 'sheet', sheet: workbook.sheets[donor.sheet].name, auto: true });
    }
    const row = findHeaderRow(raw.table, hint);
    return finish(tableToSheet(raw.table, fileName, { ...base, hint, headerRow: row < 0 ? undefined : row }), { kind: 'row', row: row + 1, auto: true });
}

/**
 * The sheet to use: the one with most of the form's columns (when known), then visible
 * sheets before hidden ones, then the one with most rows of answers.
 */
export function bestSheet(workbook: Workbook, hint: string[] = []): number {
    let best = 0;
    let bestKey: number[] = [];
    workbook.sheets.forEach((raw, i) => {
        const sheet = sheetFrom(workbook, i, hint);
        const found = hint.length ? hint.filter(h => sheet.headers.some(c => normalizeText(c) === normalizeText(h) || similarity(h, c) >= 0.8)).length : 0;
        const key = [found, raw.hidden ? 0 : 1, sheet.rows.length];
        if (i === 0 || isBetter(key, bestKey)) {
            best = i;
            bestKey = key;
        }
    });
    return best;
}

/** Compare [columns found, visible, rows] left to right */
function isBetter(a: number[], b: number[]): boolean {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k];
    return false;
}

/** One sheet, ready to use: for places that don't offer a choice of sheets */
export async function readSheetFile(file: File, hint: string[] = []): Promise<SheetData> {
    const workbook = await readWorkbook(file);
    const sheet = sheetFrom(workbook, bestSheet(workbook, hint), hint);
    if (sheet.headers.length === 0) throw new Error('This spreadsheet looks empty.');
    if (sheet.rows.length === 0) throw new Error('This spreadsheet has column names but no rows of answers under them.');
    return sheet;
}

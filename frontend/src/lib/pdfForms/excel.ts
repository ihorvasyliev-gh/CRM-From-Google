// ─── Reading the spreadsheet of answers (.xlsx / .csv) ─────────
// Real spreadsheets are messy: several sheets, a title and blank lines above the
// column names, the column names repeated further down, a "Total" row at the end,
// rows hidden with a filter, Excel error values, CSV files saved in the Windows
// encoding. The reader copes with all of those and keeps every sheet, so the one
// that suits a form can be chosen (automatically when the form's columns are known).

import { parseDelimitedText } from '../contactImport';
import { formatDate } from './source';
import { normalizeText, similarity } from './text';
import type { SheetData } from './types';

/** How many rows from the top to look at for the column names */
const HEADER_SCAN_ROWS = 30;
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

/** Turn a grid of cells into column names + rows of answers */
export function tableToSheet(table: string[][], fileName: string, opts: { hint?: string[]; hiddenRows?: number[]; sheetName?: string } = {}): SheetData {
    const width = Math.max(0, ...table.map(r => r.length));
    const headerIndex = findHeaderRow(table, opts.hint);
    if (headerIndex < 0) return { headers: [], rows: [], rowNumbers: [], fileName, sheetName: opts.sheetName };

    const seen = new Map<string, number>();
    const headers = Array.from({ length: width }, (_, i) => {
        let h = cleanHeader(table[headerIndex][i] ?? '') || `Column ${i + 1}`;
        const n = seen.get(h.toLowerCase()) ?? 0;
        seen.set(h.toLowerCase(), n + 1);
        if (n > 0) h = `${h} (${n + 1})`;
        return h;
    });
    const headerKey = table[headerIndex].map(c => normalizeText(c)).join('|');

    // A row with a single cell in a table that is usually well filled is a note or a total
    const counts = table.slice(headerIndex + 1).map(filled).filter(n => n > 0).sort((a, b) => a - b);
    const typical = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
    const hidden = new Set(opts.hiddenRows ?? []);

    const rows: string[][] = [];
    const rowNumbers: number[] = [];
    const hiddenOut: number[] = [];
    let skipped = 0;
    table.slice(headerIndex + 1).forEach((r, i) => {
        const n = filled(r);
        if (n === 0) return;
        // The column names again (two tables pasted one under the other)
        if (r.map(c => normalizeText(c)).join('|') === headerKey) return skipped++;
        if (n === 1 && typical >= 4) return skipped++;
        if (hidden.has(headerIndex + 1 + i)) hiddenOut.push(rows.length);
        rows.push(Array.from({ length: width }, (_, c) => (r[c] ?? '').trim()));
        rowNumbers.push(headerIndex + i + 2);
    });

    // Drop trailing columns with neither a name nor any data
    let keep = headers.length;
    while (keep > 0 && headers[keep - 1] === `Column ${keep}` && rows.every(r => !r[keep - 1])) keep--;
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

async function readXlsx(data: ArrayBuffer): Promise<RawSheet[]> {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);

    return workbook.worksheets.map(sheet => {
        const table: string[][] = [];
        const hiddenRows: number[] = [];
        for (let r = 1; r <= sheet.rowCount; r++) {
            const row = sheet.getRow(r);
            if (row.hidden) hiddenRows.push(r - 1);
            const cells: string[] = [];
            for (let c = 1; c <= sheet.columnCount; c++) {
                const cell = row.getCell(c);
                const v = cell.value;
                let text: string;
                // Dates as the forms print them; exceljs keeps them in UTC
                if (v instanceof Date) text = formatDate(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
                else text = cell.text ?? '';
                cells.push(EXCEL_ERRORS.has(text.trim()) ? '' : text);
            }
            table.push(cells);
        }
        return { name: sheet.name, hidden: sheet.state !== 'visible', table, hiddenRows };
    });
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
        try {
            sheets = await readXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        } catch {
            throw new Error('This spreadsheet could not be opened. Open it in Excel, choose File → Save As → “Excel Workbook (.xlsx)”, and choose the new file.');
        }
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

/** A sheet of the workbook as rows of answers (column names found with the form's columns as a hint) */
export function sheetFrom(workbook: Workbook, index: number, hint: string[] = []): SheetData {
    const raw = workbook.sheets[index] ?? workbook.sheets[0];
    const fileName = workbook.sheets.length > 1 ? `${workbook.fileName} · ${raw.name}` : workbook.fileName;
    return tableToSheet(raw.table, fileName, { hint, hiddenRows: raw.hiddenRows, sheetName: raw.name });
}

/**
 * The sheet to use: the one with most of the form's columns (when known), then visible
 * sheets before hidden ones, then the one with most rows of answers.
 */
export function bestSheet(workbook: Workbook, hint: string[] = []): number {
    let best = 0;
    let bestKey: number[] = [];
    workbook.sheets.forEach((raw, i) => {
        const sheet = tableToSheet(raw.table, workbook.fileName, { hint, hiddenRows: raw.hiddenRows });
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

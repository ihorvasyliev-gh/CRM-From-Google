// ─── Reading the spreadsheet of answers (.xlsx / .csv) ─────────

import { parseDelimitedText } from '../contactImport';
import { formatDate } from './source';
import type { SheetData } from './types';

/** How many rows from the top to look at for the header row (exports may start with a title) */
const HEADER_SCAN_ROWS = 10;

function cleanHeader(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

/** Turn a grid of cells into headers + non-empty data rows */
export function tableToSheet(table: string[][], fileName: string): SheetData {
    const width = Math.max(0, ...table.map(r => r.length));
    const filled = (r: string[]) => r.filter(c => c && c.trim()).length;
    const most = Math.max(0, ...table.slice(0, HEADER_SCAN_ROWS).map(filled));
    // The header row is the first one (near the top) that is about as full as the fullest
    const headerIndex = table.slice(0, HEADER_SCAN_ROWS).findIndex(r => filled(r) >= Math.max(1, most * 0.6));
    if (headerIndex < 0) return { headers: [], rows: [], rowNumbers: [], fileName };

    const seen = new Map<string, number>();
    const headers = Array.from({ length: width }, (_, i) => {
        let h = cleanHeader(table[headerIndex][i] ?? '') || `Column ${i + 1}`;
        const n = seen.get(h.toLowerCase()) ?? 0;
        seen.set(h.toLowerCase(), n + 1);
        if (n > 0) h = `${h} (${n + 1})`;
        return h;
    });

    const rows: string[][] = [];
    const rowNumbers: number[] = [];
    table.slice(headerIndex + 1).forEach((r, i) => {
        if (filled(r) === 0) return;
        rows.push(Array.from({ length: width }, (_, c) => (r[c] ?? '').trim()));
        rowNumbers.push(headerIndex + i + 2);
    });

    // Drop trailing columns with neither a header nor any data
    let keep = headers.length;
    while (keep > 0 && headers[keep - 1] === `Column ${keep}` && rows.every(r => !r[keep - 1])) keep--;
    return { headers: headers.slice(0, keep), rows: rows.map(r => r.slice(0, keep)), rowNumbers, fileName };
}

async function readXlsx(data: ArrayBuffer): Promise<string[][]> {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    const sheet = workbook.worksheets.find(ws => ws.actualRowCount > 0);
    if (!sheet) return [];

    const table: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= sheet.columnCount; c++) {
            const cell = row.getCell(c);
            // Dates as the forms print them; exceljs keeps them in UTC
            const v = cell.value;
            if (v instanceof Date) cells.push(formatDate(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())));
            else cells.push(cell.text ?? '');
        }
        table.push(cells);
    }
    return table;
}

export async function readSheetFile(file: File): Promise<SheetData> {
    const name = file.name.toLowerCase();
    let table: string[][];
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) table = await readXlsx(await file.arrayBuffer());
    else if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) table = parseDelimitedText(await file.text());
    else throw new Error('Choose an Excel (.xlsx) or CSV file.');

    const sheet = tableToSheet(table, file.name);
    if (sheet.headers.length === 0) throw new Error('The file looks empty: no header row found.');
    if (sheet.rows.length === 0) throw new Error('The file has a header row but no answers under it.');
    return sheet;
}

import type { Cell, CellObject, Feature, Row } from 'write-excel-file/universal';
import type { ViewerCourseRosterItem } from './types';
import { cleanVariant } from './types';
import { formatDateDMY } from './dateUtils';
import { downloadBlob } from './download';
import { loadChunk } from './deployRecovery';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ─── Writing .xlsx files (write-excel-file) ─────────────────────

export type { Cell, CellObject, Row };

/** write-excel-file/universal writes Blobs */
type XlsxFeature = Feature<Blob>;

export interface XlsxSheet {
    /** Tab name; characters Excel forbids are replaced and it is cut to 31 characters */
    name: string;
    rows: Row[];
    /** Column widths, in characters */
    widths?: number[];
    /** Keep this many top rows in view while scrolling */
    stickyRows?: number;
    /** Filter buttons on this row (0-based) across all its columns */
    filterRow?: number;
}

/** A tab name Excel accepts */
export function sheetName(name: string, fallback = 'Sheet'): string {
    return (name.replace(/[:\\/?*[\]]/g, '_').trim() || fallback).slice(0, 31);
}

function columnLetter(index: number): string {
    let s = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
}

/** Excel's header filter buttons (`<autoFilter>`), which write-excel-file leaves to "features" */
async function filterFeature(sheets: XlsxSheet[]): Promise<XlsxFeature | null> {
    const ranges = sheets.map(sheet => {
        if (sheet.filterRow === undefined) return null;
        const width = sheet.rows[sheet.filterRow]?.length ?? 0;
        if (width === 0) return null;
        const row = sheet.filterRow + 1;
        return { local: `A${row}:${columnLetter(width - 1)}${row}`, absolute: `$A$${row}:$${columnLetter(width - 1)}$${row}` };
    });
    if (ranges.every(r => !r)) return null;

    const xml = await loadChunk(() => import('write-excel-file/utility'));
    const definedNames = ranges
        .map((range, i) => range && `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xml.sanitizeTextContent(`'${sheetName(sheets[i].name).replace(/'/g, "''")}'!${range.absolute}`)}</definedName>`)
        .filter(Boolean)
        .join('');
    return {
        files: {
            transform: {
                'xl/worksheets/sheet{id}.xml': {
                    transform: (content, _options, { sheetIndex }) => {
                        const range = ranges[sheetIndex];
                        if (!range) return content;
                        const order = xml.getOrderOfSiblings('xl/worksheets/sheet{id}.xml', 'worksheet') ?? [];
                        return xml.insertElementMarkupAccordingToOrderOfSiblings(content, xml.getSelfClosingTagMarkup('autoFilter', { ref: range.local }), order, 'worksheet');
                    },
                },
                // Excel names every filtered range; without it some versions drop the buttons on save
                'xl/workbook.xml': {
                    transform: content => {
                        const existing = xml.findElement(content, 'definedNames');
                        if (existing) return xml.appendMarkupInsideElement(content, existing, definedNames);
                        const order = xml.getOrderOfSiblings('xl/workbook.xml', 'workbook') ?? [];
                        return xml.insertElementMarkupAccordingToOrderOfSiblings(content, `<definedNames>${definedNames}</definedNames>`, order, 'workbook');
                    },
                },
            },
        },
    };
}

/** The sheets as an .xlsx file. The writer is loaded on first use. */
export async function xlsxBlob(sheets: XlsxSheet[]): Promise<Blob> {
    const { default: writeXlsxFile } = await loadChunk(() => import('write-excel-file/universal'));
    const filter = await filterFeature(sheets);
    const blob = await writeXlsxFile(
        sheets.map(sheet => ({
            data: sheet.rows,
            sheet: sheetName(sheet.name),
            columns: sheet.widths?.map(width => ({ width })),
            stickyRowsCount: sheet.stickyRows,
        })),
        { fontFamily: 'Calibri', fontSize: 11, features: filter ? [filter] : [] }
    ).toBlob();
    return blob.type === XLSX_TYPE ? blob : new Blob([blob], { type: XLSX_TYPE });
}

export async function downloadXlsx(sheets: XlsxSheet[], fileName: string): Promise<void> {
    downloadBlob(await xlsxBlob(sheets), fileName);
}

/** Header row cells: bold white on dark slate (the analytics reports' style) */
export function darkHeader(headers: string[], height = 24): Row {
    return headers.map(value => ({ value, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#0F172A', alignVertical: 'center', height }));
}

/** Text that Excel would take for a formula if someone edited the cell (CWE-1236) */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Plain values as cells (empty for null / undefined). Names and addresses come from a public
 * form: text that starts like a formula ("=…", "+353…") gets Excel's Text format, so editing the
 * cell never runs it, and it shows as typed (no leading apostrophe).
 */
export function valueCells(values: (string | number | null | undefined)[], style: Partial<CellObject> = {}): Row {
    return values.map(value => {
        if (value === null || value === undefined || value === '') return (Object.keys(style).length ? { ...style } : null) as Cell;
        if (typeof value === 'string' && FORMULA_START.test(value)) return { value, format: '@', ...style } as Cell;
        return { value, ...style } as Cell;
    });
}

const HOUSE_HEADER: Partial<CellObject> = {
    fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#1E293B',
    alignVertical: 'center', align: 'left', indent: 1, height: 28,
    topBorderStyle: 'thin', topBorderColor: '#334155', leftBorderStyle: 'thin', leftBorderColor: '#334155',
    rightBorderStyle: 'thin', rightBorderColor: '#334155', bottomBorderStyle: 'medium', bottomBorderColor: '#0F172A',
};
const HOUSE_CELL: Partial<CellObject> = {
    fontSize: 10, textColor: '#1E293B', alignVertical: 'center', align: 'left', indent: 1, wrap: true, height: 22,
    borderStyle: 'thin', borderColor: '#E2E8F0',
};

/**
 * The house style for exported sheets: dark header row, zebra rows, light borders and
 * columns fitted to their content (14–50 characters). `filter` freezes the header
 * row and turns on the header filter buttons.
 */
export function styledTable(name: string, headers: string[], rows: (string | number | null | undefined)[][], { filter = false }: { filter?: boolean } = {}): XlsxSheet {
    const widths = headers.map((header, c) => {
        const longest = rows.reduce((max, row) => Math.max(max, String(row[c] ?? '').length), header.length);
        return Math.min(Math.max(longest + 4, 14), 50);
    });
    return {
        name,
        rows: [
            headers.map(value => ({ value, ...HOUSE_HEADER }) as Cell),
            // Zebra striping: the first data row (Excel row 2) is white
            ...rows.map((row, i) => valueCells(headers.map((_, c) => row[c]), { ...HOUSE_CELL, backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F8FAFC' })),
        ],
        widths,
        ...(filter && headers.length > 0 ? { stickyRows: 1, filterRow: 0 } : {}),
    };
}

interface ExportViewerRosterOptions {
    items: ViewerCourseRosterItem[];
    courseName: string;
    filterLabel?: string;
}

/**
 * Exports viewer course roster items to a styled Excel (.xlsx) file.
 */
export async function exportViewerRosterToExcel({
    items,
    courseName,
    filterLabel,
}: ExportViewerRosterOptions): Promise<void> {
    if (!items || items.length === 0) return;

    const headers = ['Full Name', 'Phone', 'Email', 'Course', 'Stream / Language', 'Status', 'Course Date'];
    const rows = items.map(item => {
        const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'N/A';
        const stream = cleanVariant(courseName, item.course_variant);
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Requested';

        // Course date hierarchy: confirmed > invited > completed > registration date
        const courseDate = item.confirmed_date || item.invited_date || item.completed_date || item.created_at;

        return [fullName, item.phone || '', item.email || '', courseName, stream, status, formatDateDMY(courseDate)];
    });

    // Construct file name
    const sanitizedCourse = courseName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    const sanitizedFilter = filterLabel ? `_${filterLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
    const today = new Date().toISOString().split('T')[0];
    const fileName = `${sanitizedCourse}${sanitizedFilter}_${today}.xlsx`;

    await downloadXlsx([styledTable(courseName.substring(0, 25) || 'Roster', headers, rows)], fileName);
}

import type { Worksheet } from 'exceljs';
import type { ViewerCourseRosterItem } from './types';
import { cleanVariant } from './types';
import { formatDateDMY } from './dateUtils';
import { downloadBlob } from './download';

interface ExportViewerRosterOptions {
    items: ViewerCourseRosterItem[];
    courseName: string;
    filterLabel?: string;
}

/**
 * Sanitizes cell values to prevent CSV/Excel Formula Injection (CWE-1236).
 * Prepends a single quote to strings starting with '=', '+', '-', '@', '\t', or '\r'.
 */
export function sanitizeExcelValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/^[=+\-@\t\r]/.test(str)) {
        return `'${str}`;
    }
    return str;
}

const thin = (argb: string) => ({ style: 'thin' as const, color: { argb } });

/**
 * The house style for exported sheets: dark header row, zebra rows, light borders and
 * columns fitted to their content (14–50 characters). `filter` freezes the header
 * row and turns on the header filter buttons.
 */
export function styleWorksheet(worksheet: Worksheet, { filter = false }: { filter?: boolean } = {}): void {
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell(cell => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate-800
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        cell.border = { top: thin('FF334155'), left: thin('FF334155'), bottom: { style: 'medium', color: { argb: 'FF0F172A' } }, right: thin('FF334155') };
    });

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 22;
        const fill = rowNumber % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC'; // Zebra striping
        row.eachCell({ includeEmpty: true }, cell => {
            cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
            cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
            cell.border = { top: thin('FFE2E8F0'), left: thin('FFE2E8F0'), bottom: thin('FFE2E8F0'), right: thin('FFE2E8F0') };
        });
    });

    worksheet.columns.forEach(column => {
        let maxLength = column.header ? String(column.header).length : 0;
        column.eachCell?.({ includeEmpty: false }, cell => {
            maxLength = Math.max(maxLength, cell.value ? String(cell.value).length : 0);
        });
        column.width = Math.min(Math.max(maxLength + 4, 14), 50);
    });

    if (filter && worksheet.columnCount > 0) {
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
        worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: worksheet.columnCount } };
    }
}

/**
 * Exports viewer course roster items to a beautifully styled Excel (.xlsx) file.
 */
export async function exportViewerRosterToExcel({
    items,
    courseName,
    filterLabel,
}: ExportViewerRosterOptions): Promise<void> {
    if (!items || items.length === 0) return;

    // Dynamic import to keep initial bundle size minimal
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CCP CRM';
    workbook.created = new Date();

    const sheetName = (courseName.substring(0, 25) || 'Roster').replace(/[:\\/?*[\]]/g, '_');
    const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: true }],
    });

    worksheet.columns = [
        { header: 'Full Name', key: 'fullName' },
        { header: 'Phone', key: 'phone' },
        { header: 'Email', key: 'email' },
        { header: 'Course', key: 'course' },
        { header: 'Stream / Language', key: 'variant' },
        { header: 'Status', key: 'status' },
        { header: 'Course Date', key: 'courseDate' },
    ];

    items.forEach(item => {
        const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'N/A';
        const stream = cleanVariant(courseName, item.course_variant);
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Requested';

        // Course date hierarchy: confirmed > invited > completed > registration date
        const courseDate = item.confirmed_date || item.invited_date || item.completed_date || item.created_at;
        const formattedDate = formatDateDMY(courseDate);

        worksheet.addRow({
            fullName: sanitizeExcelValue(fullName),
            phone: sanitizeExcelValue(item.phone || ''),
            email: sanitizeExcelValue(item.email || ''),
            course: sanitizeExcelValue(courseName),
            variant: sanitizeExcelValue(stream),
            status: sanitizeExcelValue(status),
            courseDate: sanitizeExcelValue(formattedDate),
        });
    });
    styleWorksheet(worksheet);

    // Construct file name
    const sanitizedCourse = courseName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    const sanitizedFilter = filterLabel ? `_${filterLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
    const today = new Date().toISOString().split('T')[0];
    const fileName = `${sanitizedCourse}${sanitizedFilter}_${today}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, fileName);
}

import type { ViewerCourseRosterItem } from './types';
import { cleanVariant } from './types';
import { formatDateDMY } from './dateUtils';

interface ExportViewerRosterOptions {
    items: ViewerCourseRosterItem[];
    courseName: string;
    filterLabel?: string;
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
    const [ExcelJSModule, FileSaverModule] = await Promise.all([
        import('exceljs'),
        import('file-saver'),
    ]);

    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const saveAs = FileSaverModule.saveAs || (FileSaverModule.default && FileSaverModule.default.saveAs);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Course CRM';
    workbook.created = new Date();

    const sheetName = (courseName.substring(0, 25) || 'Roster').replace(/[:\\/?*[\]]/g, '_');
    const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: true }],
    });

    worksheet.columns = [
        { header: 'Full Name', key: 'fullName', width: 26 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Course', key: 'course', width: 32 },
        { header: 'Stream / Language', key: 'variant', width: 20 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Course Date', key: 'courseDate', width: 18 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
        cell.font = {
            name: 'Calibri',
            size: 11,
            bold: true,
            color: { argb: 'FFFFFFFF' },
        };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E293B' }, // Slate-800
        };
        cell.alignment = {
            vertical: 'middle',
            horizontal: 'left',
            indent: 1,
        };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF334155' } },
            left: { style: 'thin', color: { argb: 'FF334155' } },
            bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
            right: { style: 'thin', color: { argb: 'FF334155' } },
        };
    });

    // Populate data rows
    items.forEach((item, index) => {
        const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'N/A';
        const stream = cleanVariant(courseName, item.course_variant);
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Requested';
        
        // Course date hierarchy: confirmed > invited > completed > registration date
        const courseDate = item.confirmed_date || item.invited_date || item.completed_date || item.created_at;
        const formattedDate = formatDateDMY(courseDate);

        const row = worksheet.addRow({
            fullName,
            phone: item.phone || '',
            email: item.email || '',
            course: courseName,
            variant: stream,
            status,
            courseDate: formattedDate,
        });

        row.height = 22;
        const isEven = index % 2 === 0;

        row.eachCell((cell) => {
            cell.font = {
                name: 'Calibri',
                size: 10,
                color: { argb: 'FF1E293B' },
            };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' }, // Zebra striping
            };
            cell.alignment = {
                vertical: 'middle',
                horizontal: 'left',
                indent: 1,
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };
        });
    });

    // Auto-fit column widths based on maximum cell length
    worksheet.columns.forEach((column) => {
        let maxLength = 12;
        if (column.header) {
            maxLength = String(column.header).length;
        }
        column.eachCell?.({ includeEmpty: false }, (cell) => {
            const cellLength = cell.value ? String(cell.value).length : 0;
            if (cellLength > maxLength) {
                maxLength = cellLength;
            }
        });
        column.width = Math.min(Math.max(maxLength + 4, 14), 50);
    });

    // Construct file name
    const sanitizedCourse = courseName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    const sanitizedFilter = filterLabel ? `_${filterLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
    const today = new Date().toISOString().split('T')[0];
    const fileName = `${sanitizedCourse}${sanitizedFilter}_${today}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, fileName);
}

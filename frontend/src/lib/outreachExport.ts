import type { OutreachContact } from '../hooks/useOutreach';
import { formatDateDMY } from './dateUtils';
import { sanitizeExcelValue } from './excelExport';

const STATUS_LABELS: Record<OutreachContact['status'], string> = {
    not_contacted: 'Not contacted',
    pending: 'Pending',
    responded: 'Responded',
};

function formatMonth(value: string | null): string {
    if (!value) return '';
    const date = new Date(`${value}-01`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** One spreadsheet row per contact, ready for reporting (e.g. back to IRIS). */
export function outreachExportRows(contacts: OutreachContact[]) {
    return contacts.map(c => ({
        firstName: sanitizeExcelValue(c.first_name),
        lastName: sanitizeExcelValue(c.last_name),
        email: sanitizeExcelValue(c.email),
        phone: sanitizeExcelValue(c.phone || ''),
        externalRef: sanitizeExcelValue(c.external_ref || ''),
        status: STATUS_LABELS[c.status],
        working: c.status !== 'responded' || c.is_working === null ? '' : c.is_working ? 'Yes' : 'No',
        startedMonth: sanitizeExcelValue(c.is_working ? formatMonth(c.started_month) : ''),
        fieldOfWork: sanitizeExcelValue(c.is_working ? c.field_of_work || '' : ''),
        employmentType: !c.is_working ? '' : c.employment_type === 'full_time' ? 'Full-time' : c.employment_type === 'part_time' ? 'Part-time' : '',
        invited: c.last_invited_at ? formatDateDMY(c.last_invited_at) : '',
        responded: c.last_responded_at ? formatDateDMY(c.last_responded_at) : '',
    }));
}

export async function exportOutreachListToExcel(listName: string, contacts: OutreachContact[]): Promise<void> {
    const [ExcelJSModule, FileSaverModule] = await Promise.all([
        import('exceljs'),
        import('file-saver'),
    ]);
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const saveAs = FileSaverModule.saveAs || (FileSaverModule.default && FileSaverModule.default.saveAs);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CCP CRM';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet((listName.substring(0, 25) || 'List').replace(/[:\\/?*[\]]/g, '_'));
    worksheet.columns = [
        { header: 'First Name', key: 'firstName', width: 18 },
        { header: 'Last Name', key: 'lastName', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'IRIS ID', key: 'externalRef', width: 14 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Working', key: 'working', width: 10 },
        { header: 'Started', key: 'startedMonth', width: 12 },
        { header: 'Where', key: 'fieldOfWork', width: 26 },
        { header: 'Hours', key: 'employmentType', width: 12 },
        { header: 'Invited', key: 'invited', width: 12 },
        { header: 'Responded', key: 'responded', width: 12 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.addRows(outreachExportRows(contacts));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const date = new Date().toISOString().slice(0, 10);
    saveAs(blob, `${listName.replace(/[^\w-]+/g, '_')}_outcomes_${date}.xlsx`);
}

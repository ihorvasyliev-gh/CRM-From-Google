import type { OutreachContact } from '../hooks/useOutreach';
import { formatDateDMY, formatLocalDate } from './dateUtils';
import { downloadXlsx, valueCells } from './excelExport';

const STATUS_LABELS: Record<OutreachContact['status'], string> = {
    not_contacted: 'Not contacted',
    pending: 'Pending',
    responded: 'Responded',
};

function formatMonth(value: string | null): string {
    if (!value) return '';
    const date = new Date(`${value}-01`);
    return Number.isNaN(date.getTime()) ? value : formatLocalDate(date, { month: 'short', year: 'numeric' }, 'en-GB');
}

const COLUMNS = [
    { header: 'First Name', width: 18 },
    { header: 'Last Name', width: 20 },
    { header: 'Email', width: 30 },
    { header: 'Phone', width: 16 },
    { header: 'IRIS ID', width: 14 },
    { header: 'Status', width: 15 },
    { header: 'Working', width: 10 },
    { header: 'Started', width: 12 },
    { header: 'Where', width: 26 },
    { header: 'Hours', width: 12 },
    { header: 'Invited', width: 12 },
    { header: 'Responded', width: 12 },
];

/** One spreadsheet row per contact, ready for reporting (e.g. back to IRIS). */
function outreachExportRow(c: OutreachContact): string[] {
    return [
        c.first_name,
        c.last_name,
        c.email,
        c.phone || '',
        c.external_ref || '',
        STATUS_LABELS[c.status],
        c.status !== 'responded' || c.is_working === null ? '' : c.is_working ? 'Yes' : 'No',
        c.is_working ? formatMonth(c.started_month) : '',
        c.is_working ? c.field_of_work || '' : '',
        !c.is_working ? '' : c.employment_type === 'full_time' ? 'Full-time' : c.employment_type === 'part_time' ? 'Part-time' : '',
        c.last_invited_at ? formatDateDMY(c.last_invited_at) : '',
        c.last_responded_at ? formatDateDMY(c.last_responded_at) : '',
    ];
}

export async function exportOutreachListToExcel(listName: string, contacts: OutreachContact[]): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    await downloadXlsx([{
        name: listName.substring(0, 25) || 'List',
        rows: [
            COLUMNS.map(col => ({ value: col.header, fontWeight: 'bold' as const })),
            ...contacts.map(c => valueCells(outreachExportRow(c))),
        ],
        widths: COLUMNS.map(col => col.width),
        stickyRows: 1,
    }], `${listName.replace(/[^\w-]+/g, '_')}_outcomes_${date}.xlsx`);
}

// ─── Cheque requisitions: PDF, batch ZIP, and Excel exports ────
// Everything stays in the browser: requisitions render directly as crisp vector
// PDFs (pdf.ts), pack with PizZip for batch downloads, or export to a 2-sheet
// Excel register (Requisitions + Suppliers).

import { formatDateDMY, todayISO } from '../dateUtils';
import { loadDocxLibs } from '../documentRender';
import { darkHeader, downloadXlsx, valueCells, type CellObject, type Row, type XlsxSheet } from '../excelExport';
import { chequeReqFileName, chequeReqPdfFileName, renderChequeReqBytes } from './docx';
import { getReqChequeNumber, getReqNotes, getReqStatus, netOfPayment, suppliersSummary } from './draft';
import { parseAmount } from './parse';
import { renderChequeReqPdfBytes } from './pdf';
import type { ChequeReqForm, ChequeReqMeta, ChequeReqStatus, SavedChequeReq, SupplierSummary } from './types';

/** Render a filled SICAP cheque requisition as a crisp vector print-ready PDF */
export async function renderChequeReqPdf(form: ChequeReqForm, meta?: Pick<ChequeReqMeta, 'invoiceNumber'>): Promise<Blob> {
    const bytes = await renderChequeReqPdfBytes(form, meta);
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Deduplicate filenames inside a ZIP archive (case-insensitive): "name (2).docx", "name (3).docx"… */
function uniqueFileName(name: string, used: Set<string>): string {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
        candidate = `${stem} (${suffix})${ext}`;
        suffix++;
    }
    used.add(candidate.toLowerCase());
    return candidate;
}

/** Render multiple requisitions as .docx or .pdf and pack them into one ZIP archive */
export async function renderChequeReqBatchZip(
    items: { form: ChequeReqForm; meta: ChequeReqMeta }[],
    format: 'docx' | 'pdf',
    onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; fileName: string }> {
    const { PizZip } = await loadDocxLibs();
    const zip = new PizZip();
    const usedNames = new Set<string>();
    const total = items.length;

    for (let i = 0; i < total; i++) {
        const { form, meta } = items[i];
        const rawName = format === 'pdf' ? chequeReqPdfFileName(meta, form) : chequeReqFileName(meta, form);
        const fileName = uniqueFileName(rawName, usedNames);
        const bytes = format === 'pdf'
            ? await (await renderChequeReqPdf(form, meta)).arrayBuffer()
            : await renderChequeReqBytes(form);
        // .docx and .pdf are already compressed; store them directly inside the ZIP
        zip.file(fileName, bytes);
        onProgress?.(i + 1, total);
    }

    const blob = new Blob([zip.generate({ type: 'arraybuffer' })], { type: 'application/zip' });
    return { blob, fileName: `SICAP Cheque Requisitions ${todayISO()}.zip` };
}

const STATUS_LABEL: Record<ChequeReqStatus, string> = {
    draft: 'Draft',
    ready: 'Ready',
    paid: 'Paid',
};

const TIER_LABEL: Record<SupplierSummary['tier'], string> = {
    ok: 'Single quote OK',
    approaching: 'Approaching €5,000',
    exceeded: '3 quotes required (€5,000+)',
};

const CELL_BASE: Partial<CellObject> = {
    fontSize: 10,
    textColor: '#1E293B',
    alignVertical: 'center',
    borderStyle: 'thin',
    borderColor: '#E2E8F0',
};

function formatCurrencyCells(row: Row, indices: number[]): Row {
    for (const idx of indices) {
        const cell = row[idx];
        if (cell && typeof cell === 'object' && 'value' in cell && typeof cell.value === 'number') {
            row[idx] = { ...cell, format: '#,##0.00', align: 'right' };
        }
    }
    return row;
}

/** Export requisitions and aggregated supplier €5,000 totals to a 2-sheet Excel workbook */
export async function exportChequeReqsToExcel(rows: SavedChequeReq[], yearLabel: string): Promise<void> {
    const reqHeaders = [
        'Created',
        'Status',
        'Supplier',
        'Invoice #',
        'Invoice Date',
        'PO #',
        'Action #',
        'Net excl. VAT',
        'Gross Payment',
        'Description',
        'Cheque Ref',
        'Notes',
    ];
    const reqDataRows: Row[] = rows.map((r, i) => {
        const gross = r.amount ?? parseAmount(r.form.amount);
        const net = netOfPayment(gross, r.net_amount ?? r.meta?.netAmount ?? null);
        const style: Partial<CellObject> = { ...CELL_BASE, backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F8FAFC' };
        const cells = valueCells([
            formatDateDMY(r.created_at),
            STATUS_LABEL[getReqStatus(r)],
            r.supplier_name || r.form.payeeName || '',
            r.invoice_number || r.meta?.invoiceNumber || '',
            formatDateDMY(r.invoice_date || r.meta?.invoiceDate || ''),
            r.form.poNumber || '',
            r.form.actionNumber || '',
            net,
            gross,
            r.form.description || '',
            getReqChequeNumber(r),
            getReqNotes(r),
        ], style);
        return formatCurrencyCells(cells, [7, 8]);
    });

    const requisitionsSheet: XlsxSheet = {
        name: 'Requisitions',
        rows: [darkHeader(reqHeaders), ...reqDataRows],
        widths: [14, 12, 28, 16, 14, 14, 12, 16, 16, 42, 16, 30],
        stickyRows: 1,
        filterRow: 0,
    };

    const suppliers = suppliersSummary(rows, 'all');
    const supplierHeaders = ['Supplier', 'VAT', 'Requisitions', 'Total Excl. VAT', 'Total Gross', '3-Quotes Status'];
    const supplierDataRows: Row[] = suppliers.map((s, i) => {
        const style: Partial<CellObject> = { ...CELL_BASE, backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F8FAFC' };
        const cells = valueCells([
            s.name,
            s.vat,
            s.count,
            s.totalNet,
            s.totalGross,
            TIER_LABEL[s.tier],
        ], style);
        return formatCurrencyCells(cells, [3, 4]);
    });

    const suppliersSheet: XlsxSheet = {
        name: 'Suppliers',
        rows: [darkHeader(supplierHeaders), ...supplierDataRows],
        widths: [30, 16, 14, 16, 16, 26],
        stickyRows: 1,
        filterRow: 0,
    };

    const cleanLabel = yearLabel.trim().replace(/[\\/:*?"<>|]+/g, '-');
    const fileName = cleanLabel && cleanLabel.toLowerCase() !== 'all'
        ? `SICAP Cheque Requisitions ${cleanLabel} ${todayISO()}.xlsx`
        : `SICAP Cheque Requisitions ${todayISO()}.xlsx`;

    await downloadXlsx([requisitionsSheet, suppliersSheet], fileName);
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PizZip from 'pizzip';
import template from '../../assets/templates/sicap-cheque-requisition.docx?inline';
import * as excelExport from '../excelExport';
import { chequeReqPdfFileName, DESCRIPTION_SECOND_LINE, descriptionFit } from './docx';
import {
    APPROACHING_QUOTES_FROM,
    draftFromInvoice,
    draftFromSupplier,
    EMPTY_DEFAULTS,
    getReqChequeNumber,
    getReqNotes,
    getReqStatus,
    historyChecks,
    invoiceOnlyOverride,
    readDefaults,
    rememberDefaults,
    saveDefaults,
    suggestedChecklist,
    suppliersSummary,
} from './draft';
import { exportChequeReqsToExcel, renderChequeReqBatchZip } from './export';
import { extractInvoice, rawInvoiceText } from './extract';
import { DEFAULT_OCR_MAX_PAGES, readScan, rotateCanvas } from './ocr';
import { isMetaField, META_PICKABLE, PICKABLE, pickedMetaValue, pickedValue } from './pick';
import { invoiceKind, unsupportedFileReason } from './read';
import { simpleVatInvoice, xeroLikeInvoice } from './testInvoices';
import { EMPTY_FORM, EMPTY_META, type SavedChequeReq } from './types';
import type { Phrase } from '../pdfForms/types';

function ph(x: number, y: number, text: string, h = 9, page = 0): Phrase {
    return { page, x, y, w: text.length * h * 0.48, h, text };
}

function templateBytes(): ArrayBuffer {
    const binary = atob(template.slice(template.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

function saved(over: Partial<Omit<SavedChequeReq, 'form' | 'meta'>> & { form?: Partial<SavedChequeReq['form']>; meta?: Partial<SavedChequeReq['meta']> }): SavedChequeReq {
    return {
        id: over.id ?? 'r1',
        supplier_name: over.supplier_name ?? 'Brightway Safety Training Services',
        invoice_number: over.invoice_number ?? 'INV-0090',
        invoice_date: over.invoice_date ?? '2026-09-10',
        amount: over.amount ?? 900,
        net_amount: over.net_amount ?? 900,
        status: over.status,
        cheque_number: over.cheque_number,
        notes: over.notes,
        created_at: over.created_at ?? '2026-09-12T10:00:00Z',
        updated_at: over.updated_at ?? '2026-09-12T10:00:00Z',
        form: { ...EMPTY_FORM, ...over.form },
        meta: { ...EMPTY_META, ...over.meta },
    };
}

describe('read.ts: unsupportedFileReason & HEIC handling', () => {
    it('gives helpful guidance for legacy .doc, HEIC, Pages/ODT/RTF, email files and generic files', () => {
        expect(unsupportedFileReason({ name: 'invoice.doc', type: 'application/msword' })).toMatch(/Legacy Word \.doc/);
        expect(unsupportedFileReason({ name: 'IMG_1023.HEIC', type: 'image/heic' })).toMatch(/HEIC photos/);
        expect(unsupportedFileReason({ name: 'photo.heif', type: '' })).toMatch(/HEIC photos/);
        expect(unsupportedFileReason({ name: 'bill.pages', type: '' })).toMatch(/Pages, ODT, and RTF/);
        expect(unsupportedFileReason({ name: 'bill.odt', type: '' })).toMatch(/Pages, ODT, and RTF/);
        expect(unsupportedFileReason({ name: 'bill.rtf', type: 'application/rtf' })).toMatch(/Pages, ODT, and RTF/);
        expect(unsupportedFileReason({ name: 'fwd.eml', type: 'message/rfc822' })).toMatch(/Email files \(\.eml\/\.msg\)/);
        expect(unsupportedFileReason({ name: 'fwd.msg', type: '' })).toMatch(/Email files \(\.eml\/\.msg\)/);
        expect(unsupportedFileReason({ name: 'data.csv', type: 'text/csv' })).toMatch(/PDF, Word/);
    });

    it('rejects HEIC/HEIF in invoiceKind even when OS sends image/heic MIME type', () => {
        expect(invoiceKind({ name: 'photo.heic', type: 'image/heic' })).toBeNull();
        expect(invoiceKind({ name: 'photo.heif', type: 'image/heif' })).toBeNull();
        expect(invoiceKind({ name: 'photo.jpg', type: 'image/jpeg' })).toBe('image');
    });
});

describe('ocr.ts: rotation and cancellation', () => {
    afterEach(() => vi.restoreAllMocks());

    it('exports DEFAULT_OCR_MAX_PAGES and rotates canvases clockwise', () => {
        expect(DEFAULT_OCR_MAX_PAGES).toBe(4);
        const src = document.createElement('canvas');
        src.width = 200;
        src.height = 100;
        expect(rotateCanvas(src, 0)).toBe(src);

        const mockCtx = {
            fillStyle: '',
            fillRect: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            translate: vi.fn(),
            rotate: vi.fn(),
            drawImage: vi.fn(),
        } as unknown as CanvasRenderingContext2D;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx);

        const r90 = rotateCanvas(src, 90);
        expect(r90.width).toBe(100);
        expect(r90.height).toBe(200);
        expect(mockCtx.rotate).toHaveBeenCalledWith(Math.PI / 2);

        const r180 = rotateCanvas(src, 180);
        expect(r180.width).toBe(200);
        expect(r180.height).toBe(100);

        const r270 = rotateCanvas(src, 270);
        expect(r270.width).toBe(100);
        expect(r270.height).toBe(200);
    });

    it('rejects readScan immediately with AbortError when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(readScan([], undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });
});

describe('extract.ts: print chrome filtering, receipt totals, candidate chips, rawInvoiceText', () => {
    it('strips Gmail/Outlook browser-print chrome so it cannot hijack supplier or invoice date', () => {
        const phrases: Phrase[] = [
            ph(20, 865, '01/12/2026, 09:15'),
            ph(220, 865, 'Gmail - Fwd: Invoice from Greenleaf Catering'),
            ph(40, 850, 'From: Coordinator <coord@corkcitypartnership.ie>'),
            ph(40, 838, 'Sent: Monday, 1 December 2026 09:10'),
            ph(40, 826, 'Subject: Fwd: Invoice GC-2231'),
            ...simpleVatInvoice(),
            ph(20, 20, 'https://mail.google.com/mail/u/0/?ik=abc123&view=pt'),
            ph(550, 20, '1/1'),
            ph(40, 10, 'Printed on 01/12/2026'),
        ];
        const facts = extractInvoice(phrases);
        expect(facts.supplier.name?.value).toBe('Greenleaf Catering Ltd');
        expect(facts.invoiceDate?.value).toBe('2026-11-05');
        expect(facts.candidateDates?.map(d => d.iso)).not.toContain('2026-12-01');
    });

    it('recognizes till docket payment totals and EXCL VAT / EX VAT subtotals', () => {
        const docket: Phrase[] = [
            ph(40, 760, 'Harbour Hardware'),
            ph(40, 746, '14 Main Street, Cork'),
            ph(40, 720, 'Receipt'),
            ph(40, 706, 'Date: 18/10/2026'),
            ph(40, 680, 'Paint rollers and brushes'),
            ph(40, 650, 'EXCL. VAT'),
            ph(200, 650, '€40.00'),
            ph(40, 636, 'VAT 23%'),
            ph(200, 636, '€9.20'),
            ph(40, 616, 'CARD SALE'),
            ph(200, 616, '€49.20'),
        ];
        const facts = extractInvoice(docket);
        expect(facts.subtotal?.value).toBe(40);
        expect(facts.vat?.value).toBe(9.2);
        expect(facts.total).toMatchObject({ value: 49.2, sure: false });

        const exVatDocket: Phrase[] = [
            ph(40, 760, 'Corner Supplies'),
            ph(40, 746, '5 Quay Road, Cork'),
            ph(40, 700, 'TOTAL EXCL. VAT'),
            ph(200, 700, '100.00'),
            ph(40, 680, 'AMOUNT PAID'),
            ph(200, 680, '€123.00'),
        ];
        const facts2 = extractInvoice(exVatDocket);
        expect(facts2.subtotal?.value).toBe(100);
        expect(facts2.total).toMatchObject({ value: 123, sure: false });
    });

    it('populates deduplicated candidateAmounts and candidateDates and formats rawInvoiceText', () => {
        const vatFacts = extractInvoice(simpleVatInvoice());
        expect(vatFacts.candidateAmounts?.map(c => [c.label, c.value])).toEqual([
            ['Total', 397.25],
            ['Subtotal', 350],
            ['VAT', 47.25],
            ['Lunch for course participants', 250],
            ['Room hire', 100],
        ]);

        const xeroFacts = extractInvoice(xeroLikeInvoice());
        // Total, Subtotal and item are all €450.00 -> deduplicated to one chip
        expect(xeroFacts.candidateAmounts).toHaveLength(1);
        expect(xeroFacts.candidateAmounts?.[0]).toMatchObject({ value: 450, label: 'Total' });
        expect(xeroFacts.candidateDates?.map(d => [d.label, d.iso])).toEqual([
            ['Invoice date', '2026-10-21'],
            ['Due date', '2026-11-20'],
            ['Service start', '2026-11-03'],
            ['Service end', '2026-11-05'],
        ]);

        const text = rawInvoiceText([ph(40, 700, 'Line 1', 9, 0), ph(40, 680, 'Line 2', 9, 0), ph(40, 700, 'Page 2 line', 9, 1)]);
        expect(text).toBe('Line 1\nLine 2\n\nPage 2 line');
    });
});

describe('pick.ts: date fields & invoice metadata picking', () => {
    it('supports picking date fields and meta fields', () => {
        expect(PICKABLE.has('requestedDate')).toBe(true);
        expect(PICKABLE.has('approvedDate')).toBe(true);
        expect(PICKABLE.has('quoteDate')).toBe(true);
        expect(pickedValue('quoteDate', ['Quote dated 14 Oct 2026'])).toBe('2026-10-14');
        expect(pickedValue('requestedDate', ['no date here'])).toBe('');

        expect([...META_PICKABLE]).toEqual(['invoiceNumber', 'invoiceDate', 'dueDate', 'netAmount']);
        expect(isMetaField('invoiceNumber')).toBe(true);
        expect(isMetaField('amount')).toBe(false);
        expect(pickedMetaValue('invoiceNumber', ['Invoice No:', 'INV-0101'])).toBe('INV-0101');
        expect(pickedMetaValue('invoiceNumber', ['INV-0101'])).toBe('INV-0101');
        expect(pickedMetaValue('invoiceDate', ['Date: 21/10/2026'])).toBe('2026-10-21');
        expect(pickedMetaValue('dueDate', ['Due 20 Nov 2026'])).toBe('2026-11-20');
        expect(pickedMetaValue('netAmount', ['Subtotal', '€350.00'])).toBe(350);
    });
});

describe('draft.ts: defaults, sources, workflow getters, suppliersSummary, overrides & checklist', () => {
    beforeEach(() => localStorage.clear());

    it('saves and reads approvedBy and descriptionPresets while preserving them in rememberDefaults', () => {
        saveDefaults({
            actionNumber: '9.',
            requestedBy: 'Jane Murphy',
            approvedBy: 'Siobhan Walsh',
            descriptionPattern: '{item} for SICAP clients',
            descriptionPresets: ['{item} course {date} for IP and TP Clients', 'Room hire for SICAP workshop'],
        });
        expect(readDefaults()).toEqual({
            actionNumber: '9.',
            requestedBy: 'Jane Murphy',
            approvedBy: 'Siobhan Walsh',
            descriptionPattern: '{item} for SICAP clients',
            descriptionPresets: ['{item} course {date} for IP and TP Clients', 'Room hire for SICAP workshop'],
        });
        rememberDefaults({ ...EMPTY_FORM, actionNumber: '10.' }, EMPTY_META);
        expect(readDefaults()).toMatchObject({
            actionNumber: '10.',
            approvedBy: 'Siobhan Walsh',
            descriptionPresets: ['{item} course {date} for IP and TP Clients', 'Room hire for SICAP workshop'],
        });
    });

    it('applies defaults.approvedBy, populates sources, and attaches relatedId on duplicate checks', () => {
        const facts = extractInvoice(xeroLikeInvoice());
        const draft = draftFromInvoice({
            facts,
            history: [],
            defaults: { ...EMPTY_DEFAULTS, approvedBy: 'Siobhan Walsh' },
            fileName: 'inv.pdf',
        });
        expect(draft.form.approvedBy).toBe('Siobhan Walsh');
        expect(draft.flags.approvedBy).toBeUndefined();
        expect(draft.sources?.poNumber?.length).toBeGreaterThan(0);
        expect(draft.sources?.invoiceNumber?.length).toBeGreaterThan(0);
        expect(draft.sources?.invoiceDate?.length).toBeGreaterThan(0);
        expect(draft.sources?.dueDate?.length).toBeGreaterThan(0);
        expect(draft.sources?.netAmount?.length).toBeGreaterThan(0);

        const twin = saved({ id: 'dup-42', invoice_number: 'INV-0101', amount: 450, net_amount: 450 });
        const checks = historyChecks(draft.form, draft.meta, [twin], undefined, '2026-10-22');
        expect(checks.find(c => c.relatedId === 'dup-42')).toBeDefined();
    });

    it('reads status, cheque number, and notes from column or meta fallback', () => {
        expect(APPROACHING_QUOTES_FROM).toBe(4000);
        expect(getReqStatus(saved({}))).toBe('ready');
        expect(getReqStatus(saved({ meta: { status: 'draft' } }))).toBe('draft');
        expect(getReqStatus(saved({ status: 'paid', meta: { status: 'draft' } }))).toBe('paid');
        expect(getReqChequeNumber(saved({ meta: { chequeNumber: 'CHQ-12' } }))).toBe('CHQ-12');
        expect(getReqChequeNumber(saved({ cheque_number: 'EFT-99', meta: { chequeNumber: 'CHQ-12' } }))).toBe('EFT-99');
        expect(getReqNotes(saved({ meta: { notes: 'Meta note' } }))).toBe('Meta note');
        expect(getReqNotes(saved({ notes: 'Row note', meta: { notes: 'Meta note' } }))).toBe('Row note');
    });

    it('aggregates suppliersSummary with transitive grouping, non-colliding keys, tiers, and learnedPlaces union', () => {
        const placeA = { rect: { page: 0, x: 10, y: 20, w: 30, h: 10 } };
        const rows: SavedChequeReq[] = [
            // Transitive bridge: a1 shares email with a2, a2 shares phone with a3
            saved({ id: 'a1', supplier_name: 'Alpha Training', amount: 2200, net_amount: 2200, created_at: '2026-10-01T10:00:00Z', meta: { supplierEmail: 'ops@alpha.ie', places: { poNumber: placeA } } }),
            saved({ id: 'a2', supplier_name: 'Alpha Ltd', amount: 2100, net_amount: 2100, created_at: '2026-10-05T10:00:00Z', meta: { supplierEmail: 'ops@alpha.ie', supplierPhone: '021 555 0100' } }),
            saved({ id: 'a3', supplier_name: 'Alpha Safety', amount: 1000, net_amount: 1000, created_at: '2026-10-10T10:00:00Z', meta: { supplierPhone: '021 555 0100', places: { amount: placeA } } }),
            // Same display name, DIFFERENT VAT -> must stay separate with unique keys
            saved({ id: 'b1', supplier_name: 'Apex Services', amount: 4200, net_amount: 4200, created_at: '2026-08-01T10:00:00Z', meta: { supplierVat: 'IE1111111A' } }),
            saved({ id: 'b2', supplier_name: 'Apex Services', amount: 500, net_amount: 500, created_at: '2026-08-02T10:00:00Z', meta: { supplierVat: 'IE2222222B' } }),
            // Different year
            saved({ id: 'old1', supplier_name: 'Old Supplier', invoice_date: '2025-05-01', amount: 6000, net_amount: 6000, created_at: '2025-05-02T10:00:00Z' }),
        ];
        const summary = suppliersSummary(rows, '2026');
        expect(summary).toHaveLength(3);
        expect(summary[0]).toMatchObject({
            key: 'a3',
            name: 'Alpha Safety',
            totalNet: 5300,
            totalGross: 5300,
            count: 3,
            tier: 'exceeded',
            learnedPlaces: ['poNumber', 'amount'],
            requisitionIds: ['a3', 'a2', 'a1'],
        });
        expect(summary[1]).toMatchObject({ key: 'b1', name: 'Apex Services', totalNet: 4200, tier: 'approaching' });
        expect(summary[2]).toMatchObject({ key: 'b2', name: 'Apex Services', totalNet: 500, tier: 'ok' });
        expect(summary[1].key).not.toBe(summary[2].key);
        expect(suppliersSummary(rows, 'all')).toHaveLength(4);
    });

    it('prefills draftFromSupplier, resets with invoiceOnlyOverride, and evaluates suggestedChecklist', () => {
        const place = { rect: { page: 0, x: 1, y: 2, w: 3, h: 4 } };
        const row = saved({
            supplier_name: 'Greenleaf Catering',
            form: {
                payeeName: 'Greenleaf Catering Ltd',
                payeeAddress: '12 Patrick St, Cork',
                actionNumber: '9.',
                nonSicapFunding: 'Grant A',
                quoteBy: { ...EMPTY_FORM.quoteBy, email: true },
                quoteEmail: 'quotes@greenleaf.ie',
            },
            meta: { supplierVat: 'IE9999999T', places: { amount: place } },
        });
        const fromSup = draftFromSupplier(row, { ...EMPTY_DEFAULTS, requestedBy: 'Jane', approvedBy: 'Siobhan' });
        expect(fromSup.form).toMatchObject({
            payeeName: 'Greenleaf Catering Ltd',
            payeeAddress: '12 Patrick St, Cork',
            actionNumber: '9.',
            nonSicapFunding: 'Grant A',
            requestedBy: 'Jane',
            approvedBy: 'Siobhan',
            quoteEmail: 'quotes@greenleaf.ie',
        });
        expect(fromSup.form.quoteBy.email).toBe(true);
        expect(fromSup.meta.supplierVat).toBe('IE9999999T');
        expect(fromSup.meta.places).toEqual({ amount: place });

        const facts = extractInvoice(xeroLikeInvoice());
        const reset = invoiceOnlyOverride(facts, fromSup.form, fromSup.meta);
        expect(reset.form.payeeName).toBe('Brightway Safety Training Services');
        expect(reset.form.quoteBy.email).toBe(false);
        expect(reset.form.quoteEmail).toBe('accounts@brightway.ie');
        expect(reset.meta.places).toEqual({});

        const fullForm = {
            ...EMPTY_FORM,
            poNumber: '9001',
            description: 'Manual Handling QQI Level 5',
            approvedBy: 'Siobhan',
            amountQuoted: '450.00',
            quoteBy: { ...EMPTY_FORM.quoteBy, email: true },
            quoteEmail: 'accounts@brightway.ie',
        };
        const checklist = suggestedChecklist(fullForm, facts);
        expect(checklist.poAndSicap.ready).toBe(true);
        expect(checklist.description.ready).toBe(true);
        expect(checklist.approval.ready).toBe(true);
        expect(checklist.quoteDetails.ready).toBe(true);
        expect(checklist.taxClearance.ready).toBe(false);
    });
});

describe('docx.ts & export.ts: descriptionFit, PDF filename, batch ZIP and Excel export', () => {
    afterEach(() => vi.restoreAllMocks());

    it('measures descriptionFit against both lines and formats PDF filenames', () => {
        expect(DESCRIPTION_SECOND_LINE).toBe(395);
        expect(descriptionFit('Short item')).toMatchObject({ line1: 'Short item', line2: '', overflowsLine2: false });
        const long = descriptionFit('Manual Handling QQI Level 5 course '.repeat(6).trim());
        expect(long.overflowsLine2).toBe(true);
        expect(long.line2Pct).toBeGreaterThan(100);
        expect(chequeReqPdfFileName({ invoiceNumber: 'INV-0064' }, { payeeName: 'Acme' })).toBe('SICAP Invoice INV-0064.pdf');
        expect(chequeReqPdfFileName({ invoiceNumber: '' }, { payeeName: 'Acme/Ltd' })).toBe('SICAP Cheque Requisition Acme-Ltd.pdf');
    });

    it('packs deduplicated .docx files into a dated batch ZIP', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(templateBytes(), { status: 200 }));
        const progress: [number, number][] = [];
        const items = [
            { form: { ...EMPTY_FORM, payeeName: 'Acme' }, meta: { ...EMPTY_META, invoiceNumber: 'INV-1' } },
            { form: { ...EMPTY_FORM, payeeName: 'Acme' }, meta: { ...EMPTY_META, invoiceNumber: 'INV-1' } },
        ];
        const { blob, fileName } = await renderChequeReqBatchZip(items, 'docx', (d, t) => progress.push([d, t]));
        expect(fileName).toMatch(/^SICAP Cheque Requisitions \d{4}-\d{2}-\d{2}\.zip$/);
        expect(progress).toEqual([[1, 2], [2, 2]]);
        const zip = new PizZip(await blob.arrayBuffer());
        expect(Object.keys(zip.files).sort()).toEqual([
            'SICAP Invoice INV-1 (2).docx',
            'SICAP Invoice INV-1.docx',
        ]);
    });

    it('builds the 2-sheet Excel workbook (Requisitions + Suppliers)', async () => {
        const spy = vi.spyOn(excelExport, 'downloadXlsx').mockResolvedValue();
        const rows = [
            saved({
                id: 'r1',
                supplier_name: 'Brightway Safety',
                invoice_number: 'INV-101',
                invoice_date: '2026-10-21',
                amount: 1230,
                net_amount: 1000,
                status: 'paid',
                cheque_number: 'CHQ-77',
                notes: '=cmd|check',
                form: { poNumber: '9001', actionNumber: '9.', description: 'Manual Handling' },
                meta: { supplierVat: 'IE1234567T' },
            }),
        ];
        await exportChequeReqsToExcel(rows, '2026');
        expect(spy).toHaveBeenCalledTimes(1);
        const [sheets, fileName] = spy.mock.calls[0];
        expect(fileName).toMatch(/^SICAP Cheque Requisitions 2026 \d{4}-\d{2}-\d{2}\.xlsx$/);
        expect(sheets.map(s => s.name)).toEqual(['Requisitions', 'Suppliers']);
        // Header counts: 12 on Requisitions, 6 on Suppliers
        expect(sheets[0].rows[0]).toHaveLength(12);
        expect(sheets[1].rows[0]).toHaveLength(6);
        // Formula injection neutralised with text format '@' on Notes cell
        expect(sheets[0].rows[1][11]).toMatchObject({ value: '=cmd|check', format: '@' });
    });
});

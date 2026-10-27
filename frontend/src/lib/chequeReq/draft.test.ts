import { beforeEach, describe, expect, it } from 'vitest';
import { buildDescription, descriptionPattern, draftFromInvoice, EMPTY_DEFAULTS, historyChecks, invoiceChecks, netOfPayment, readDefaults, rememberDefaults, sameSupplier } from './draft';
import { extractInvoice } from './extract';
import { formInvoiceScan, simpleVatInvoice, xeroLikeInvoice } from './testInvoices';
import { EMPTY_FORM, EMPTY_META, type InvoiceFacts, type SavedChequeReq } from './types';

function saved(over: Partial<Omit<SavedChequeReq, 'form' | 'meta'>> & { form?: Partial<SavedChequeReq['form']>; meta?: Partial<SavedChequeReq['meta']> }): SavedChequeReq {
    return {
        id: over.id ?? 'r1',
        supplier_name: over.supplier_name ?? 'Brightway Safety Training Services',
        invoice_number: over.invoice_number ?? 'INV-0090',
        invoice_date: over.invoice_date ?? '2026-09-10',
        amount: over.amount ?? 900,
        net_amount: over.net_amount ?? 900,
        created_at: over.created_at ?? '2026-09-12T10:00:00Z',
        updated_at: over.updated_at ?? '2026-09-12T10:00:00Z',
        form: { ...EMPTY_FORM, ...over.form },
        meta: { ...EMPTY_META, ...over.meta },
    };
}

describe('description wording', () => {
    it('learns the wording around the item and its date', () => {
        expect(descriptionPattern('Static and Retail QQI Level 4 course 01.10.2026 for IP and TP Clients', 'Static and Retail QQI Level 4', '2026-10-01')).toBe('{item} course {date} for IP and TP Clients');
        // Nothing learnt from a description that is just the item, or that keeps another date
        expect(descriptionPattern('Room hire', 'Room hire', '')).toBeNull();
        expect(descriptionPattern('Room hire on 3rd May 2026', 'Room hire', '')).toBeNull();
        expect(descriptionPattern('Something else', 'Room hire', '')).toBeNull();
    });

    it('builds the next description the same way', () => {
        expect(buildDescription('Manual Handling QQI Level 5', '2026-11-03', '{item} course {date} for IP and TP Clients')).toBe('Manual Handling QQI Level 5 course 03.11.2026 for IP and TP Clients');
        expect(buildDescription('Manual Handling', '', '{item} course {date} for IP and TP Clients')).toBe('Manual Handling course for IP and TP Clients');
        expect(buildDescription('Manual Handling', '2026-11-03', null)).toBe('Manual Handling 03.11.2026');
        // A course run on separate days lists them all
        expect(buildDescription('First Aid', '2026-09-01', '{item} course {date} for IP and TP Clients', ['2026-09-01', '2026-09-02'])).toBe('First Aid course 01.09.2026, 02.09.2026 for IP and TP Clients');
    });

    it('does not repeat a date the invoice line already gives', () => {
        expect(buildDescription('Manual Handling course 14.10.2026', '2026-10-14', null)).toBe('Manual Handling course 14.10.2026');
        expect(buildDescription('Manual Handling 14/10/2026', '2026-10-14', '{item} course {date} for IP and TP Clients')).toBe('Manual Handling 14/10/2026 course for IP and TP Clients');
        // Only the days it doesn't name are added
        expect(buildDescription('First Aid 01.09.2026', '2026-09-01', null, ['2026-09-01', '2026-09-02'])).toBe('First Aid 01.09.2026 02.09.2026');
    });
});

describe('suppliers', () => {
    it('recognises a supplier by VAT number, IBAN, email domain or a close name', () => {
        const base = { name: 'Acme Training Ltd', vat: '', iban: '', domain: '' };
        expect(sameSupplier(base, { ...base, name: 'ACME TRAINING LIMITED' })).toBe(true);
        expect(sameSupplier({ ...base, vat: 'IE1234567T' }, { ...base, name: 'Other', vat: '1234567T' })).toBe(true);
        expect(sameSupplier({ ...base, domain: 'acme' }, { name: 'Different', vat: '', iban: '', domain: 'acme' })).toBe(true);
        expect(sameSupplier(base, { ...base, name: 'Greenleaf Catering' })).toBe(false);
    });
});

describe('draftFromInvoice', () => {
    it('fills the form from a first invoice and marks the guesses', () => {
        const facts = extractInvoice(xeroLikeInvoice());
        const { form, flags, meta } = draftFromInvoice({ facts, history: [], defaults: EMPTY_DEFAULTS, fileName: 'inv.pdf' });
        expect(form).toMatchObject({
            poNumber: '9001',
            amount: '450.00',
            amountQuoted: '450.00',
            payeeName: 'Brightway Safety Training Services',
            description: 'Manual Handling QQI Level 5 03.11.2026',
            requestedBy: 'Jane Murphy',
            quotePhone: '021 430 2310',
            quoteEmail: 'accounts@brightway.ie',
        });
        expect(flags.poNumber?.level).toBe('found');
        expect(flags.amount?.level).toBe('found');
        expect(flags.payeeName?.level).toBe('found');
        expect(flags.description?.level).toBe('check');
        expect(flags.actionNumber?.level).toBe('missing');
        expect(flags.requestedBy?.level).toBe('check');
        expect(flags.quoteEmail?.level).toBe('check');
        expect(meta).toMatchObject({ invoiceNumber: 'INV-0101', invoiceDate: '2026-10-21', netAmount: 450, supplierVat: 'IE1234567T', supplierDomain: 'brightway', item: 'Manual Handling QQI Level 5', serviceDate: '2026-11-03' });
    });

    it('puts every PO number of the invoice on the requisition, and every day of the course in the description', () => {
        const facts: InvoiceFacts = {
            ...extractInvoice(simpleVatInvoice()),
            items: [{ description: 'First Aid Courses', details: ['01/09/26', '02/09/26'], quantity: 2, unitPrice: 500, amount: 1000 }],
            poNumber: { value: '7001, 7002', sure: true, from: 'PO # 7001 · PO # 7002' },
            poNumbers: ['7001', '7002'],
            serviceDates: { start: '2026-09-01', days: ['2026-09-01', '2026-09-02'] },
        };
        const { form, flags } = draftFromInvoice({ facts, history: [], defaults: EMPTY_DEFAULTS, fileName: 'inv.docx' });
        expect(form.poNumber).toBe('7001, 7002');
        expect(flags.poNumber).toMatchObject({ level: 'found', note: 'From the invoice: “PO # 7001 · PO # 7002”' });
        expect(form.description).toBe('First Aid Courses 01.09.2026, 02.09.2026');
        expect(invoiceChecks(facts, '2026-10-01')).toContainEqual({ level: 'info', text: '2 PO numbers on this invoice (7001, 7002): all of them are on the requisition.' });
    });

    it('marks everything read off a scan as a value to check', () => {
        const facts = { ...extractInvoice(xeroLikeInvoice()), scanned: true };
        const { form, flags } = draftFromInvoice({ facts, history: [], defaults: EMPTY_DEFAULTS, fileName: 'scan.jpg' });
        expect(form.poNumber).toBe('9001');
        expect(flags.poNumber).toMatchObject({ level: 'check', note: expect.stringMatching(/PO Number: 9001.*read from a scan/) });
        expect(flags.amount?.level).toBe('check');
        expect(flags.payeeName?.level).toBe('check');
        expect(Object.values(flags).some(f => f?.level === 'found')).toBe(false);
        expect(invoiceChecks(facts, '2026-10-22')[0]).toMatchObject({ level: 'info', text: expect.stringMatching(/scan or photo/) });
        expect(invoiceChecks({ ...extractInvoice([]), scanned: true }, '2026-10-22')[0].text).toMatch(/from the picture/);
    });

    it('starts from last time for a known supplier', () => {
        const previous = saved({
            form: {
                payeeName: 'Brightway Safety Training Services Ltd',
                payeeAddress: 'Unit 7, Mill Road, Cork T12 AB34',
                actionNumber: '9.',
                description: 'First Aid course 10.09.2026 for IP and TP Clients',
                quoteEmail: 'mary@brightway.ie',
                quoteBy: { ...EMPTY_FORM.quoteBy, email: true },
            },
            meta: { supplierVat: 'IE1234567T', item: 'First Aid', serviceDate: '2026-09-10' },
        });
        const facts = extractInvoice(xeroLikeInvoice());
        const { form, flags, previous: found } = draftFromInvoice({ facts, history: [previous], defaults: { ...EMPTY_DEFAULTS, requestedBy: 'Jane Murphy' }, fileName: 'inv.pdf' });
        expect(found?.id).toBe('r1');
        expect(form.payeeName).toBe('Brightway Safety Training Services Ltd');
        expect(form.payeeAddress).toBe('Unit 7, Mill Road, Cork T12 AB34');
        expect(form.actionNumber).toBe('9.');
        expect(form.description).toBe('Manual Handling QQI Level 5 course 03.11.2026 for IP and TP Clients');
        expect(form.quoteEmail).toBe('mary@brightway.ie');
        expect(form.quoteBy.email).toBe(true);
        expect(flags.payeeName?.level).toBe('memory');
        expect(flags.description?.level).toBe('memory');
        expect(flags.actionNumber?.level).toBe('memory');
        expect(flags.requestedBy).toBeUndefined();
    });
});

describe('checks', () => {
    const today = '2026-10-22';

    it('reports what the invoice is missing, and what adds up', () => {
        const xero = invoiceChecks(extractInvoice(xeroLikeInvoice()), today);
        expect(xero.map(c => c.level)).not.toContain('warning');
        expect(xero.map(c => c.text).join(' ')).toMatch(/3 people named, matching the quantity/);
        expect(xero.map(c => c.text).join(' ')).toMatch(/Due by 20\/11\/2026/);

        const simple = invoiceChecks(extractInvoice(simpleVatInvoice()), today);
        expect(simple.filter(c => c.level === 'warning').map(c => c.text).join(' ')).toMatch(/SICAP/);
    });

    it('says nothing adds up or doesn\'t when the lines have no amounts', () => {
        const facts = { ...extractInvoice(formInvoiceScan()), scanned: true };
        expect(invoiceChecks(facts, today)).toEqual([expect.objectContaining({ level: 'info', text: expect.stringMatching(/scan or photo/) })]);
        const { form } = draftFromInvoice({ facts, history: [], defaults: EMPTY_DEFAULTS, fileName: 'scan.pdf' });
        expect(form).toMatchObject({ payeeName: 'Oksana Bondar', payeeAddress: 'Rose Cottage, Knockane, Coachford, Co. Cork P12XK47', amount: '2,400.00', poNumber: '8264' });
        expect(form.description).toMatch(/Programme, Cork City Partnership 28\.07\.2026, 30\.07\.2026, 04\.08\.2026, .* 03\.09\.2026$/);
    });

    it('never says the total matches the lines when they don\'t add up', () => {
        const facts: InvoiceFacts = {
            ...extractInvoice(simpleVatInvoice()),
            items: [{ description: 'Lunch', details: [], amount: 100 }],
            subtotal: undefined,
            vat: undefined,
            total: { value: 397.25, sure: true },
        };
        const checks = invoiceChecks(facts, today);
        expect(checks).toContainEqual({ level: 'warning', text: 'The invoice lines add up to €100.00, but its total is €397.25.' });
        expect(checks.map(c => c.level)).not.toContain('ok');
    });

    it('says when nothing could be read', () => {
        expect(invoiceChecks(extractInvoice([]), today)).toEqual([expect.objectContaining({ level: 'warning', text: expect.stringMatching(/No text could be read/) })]);
    });

    it('warns about an invoice already done and the €5,000 a year rule', () => {
        const form = { ...EMPTY_FORM, payeeName: 'Brightway Safety Training Services', amount: '1,200.00' };
        const meta = { ...EMPTY_META, invoiceNumber: 'INV-0101', invoiceDate: '2026-10-21', netAmount: 1200 };
        const history = [
            saved({ id: 'a', invoice_number: 'INV-0101', amount: 1200, net_amount: 1200, created_at: '2026-10-21T09:00:00Z' }),
            saved({ id: 'b', invoice_number: 'INV-0090', amount: 3000, net_amount: 3000 }),
            saved({ id: 'c', invoice_number: 'INV-0050', amount: 900, net_amount: 900, invoice_date: '2025-05-01' }),
            saved({ id: 'd', supplier_name: 'Greenleaf Catering', invoice_number: 'GC-1', amount: 4000, net_amount: 4000 }),
        ];
        const checks = historyChecks(form, meta, history, undefined, today).map(c => c.text).join(' ');
        expect(checks).toMatch(/already made a requisition for INV-0101/);
        // 3,000 earlier in 2026 + 1,200 now: below €5,000 (the duplicate and 2025 don't count)
        expect(checks).toMatch(/€4,200.00 excl. VAT/);

        const more = historyChecks({ ...form, amount: '2,500.00' }, { ...meta, invoiceNumber: 'INV-0102', netAmount: 2500 }, history, undefined, today);
        expect(more.find(c => c.level === 'warning')?.text).toMatch(/come to €6,700.00 excl. VAT/);

        // Editing a kept requisition: it is not its own duplicate
        expect(historyChecks(form, meta, history, 'a', today).some(c => /already made/.test(c.text))).toBe(false);
    });

    it('counts the payment excl. VAT, or the payment itself when it was typed over a misread total', () => {
        // €800 with €66.05 VAT: the net counts
        expect(netOfPayment(800, 733.95)).toBe(733.95);
        // "€4" read off a handwritten scan, €1,096.08 typed in: the payment counts
        expect(netOfPayment(1096.08, 4)).toBe(1096.08);
        // A net above the payment is not its net either
        expect(netOfPayment(500, 1000)).toBe(500);
        expect(netOfPayment(null, 733.95)).toBe(733.95);
        expect(netOfPayment(1096.08, null)).toBe(1096.08);

        const history = [saved({ id: 'a', supplier_name: 'Fabrice Fortune', invoice_number: '1', amount: 1096.08, net_amount: 4 })];
        const form = { ...EMPTY_FORM, payeeName: 'Fabrice Fortune', amount: '1,096.08' };
        const checks = historyChecks(form, { ...EMPTY_META, invoiceNumber: '2', invoiceDate: '2026-10-27', netAmount: 4 }, history, undefined, today);
        expect(checks.map(c => c.text).join(' ')).toMatch(/€2,192.16 excl. VAT with this invoice/);
    });
});

describe('remembered defaults', () => {
    beforeEach(() => localStorage.clear());

    it('keeps the action number, name and description wording for next time', () => {
        expect(readDefaults()).toEqual(EMPTY_DEFAULTS);
        rememberDefaults(
            { ...EMPTY_FORM, actionNumber: '9.', requestedBy: 'Jane Murphy', description: 'First Aid course 10.09.2026 for IP and TP Clients' },
            { ...EMPTY_META, item: 'First Aid', serviceDate: '2026-09-10' },
        );
        expect(readDefaults()).toEqual({ actionNumber: '9.', requestedBy: 'Jane Murphy', descriptionPattern: '{item} course {date} for IP and TP Clients' });
    });
});

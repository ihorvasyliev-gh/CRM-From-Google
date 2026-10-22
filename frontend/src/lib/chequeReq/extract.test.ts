import { describe, expect, it } from 'vitest';
import { extractInvoice, joinAddress, numberedPeople } from './extract';
import { docxPhrases } from './read';
import { simpleVatInvoice, xeroLikeInvoice } from './testInvoices';

describe('extractInvoice: a Xero-style invoice over two pages', () => {
    const facts = extractInvoice(xeroLikeInvoice());

    it('reads the labelled values', () => {
        expect(facts.hasText).toBe(true);
        expect(facts.invoiceNumber).toMatchObject({ value: 'INV-0101', sure: true });
        expect(facts.invoiceDate?.value).toBe('2026-10-21');
        expect(facts.dueDate?.value).toBe('2026-11-20');
        expect(facts.poNumber).toMatchObject({ value: '9001', sure: true });
        expect(facts.mentionsSicap).toBe(true);
        expect(facts.attention).toBe('Jane Murphy');
    });

    it('finds the total, sure when the labels and lines agree', () => {
        expect(facts.total).toMatchObject({ value: 450, sure: true });
        expect(facts.subtotal?.value).toBe(450);
        // "Tax on Sales" in the tax column of an item is not a VAT line
        expect(facts.vat).toBeUndefined();
    });

    it('reads the item across the page break, with its people and dates', () => {
        expect(facts.items).toHaveLength(1);
        expect(facts.items[0]).toMatchObject({ description: 'Manual Handling QQI Level 5', quantity: 3, unitPrice: 150, amount: 450 });
        expect(facts.people).toEqual(['Anna Kowalska', 'Olena Petrenko', 'Ahmed Hassan Ali']);
        expect(facts.serviceDates).toEqual({ start: '2026-11-03', end: '2026-11-05' });
        // The footer printed on both pages is not part of the item
        expect(facts.items[0].details.join(' ')).not.toMatch(/Registered Office/);
    });

    it('takes the supplier from the payment advice, never the customer', () => {
        expect(facts.supplier.name).toMatchObject({ value: 'Brightway Safety Training Services', sure: true });
        expect(facts.supplier.address?.value).toBe('BRIGHTWAY, UNIT 7, MILL ROAD, CORK T12 AB34, IRELAND');
        expect(facts.supplier.vatNumber).toBe('IE1234567T');
        expect(facts.supplier.iban).toBe('IE29AIBK93115212345678');
        expect(facts.supplier.bic).toBe('AIBKIE2D');
        expect(facts.supplier.email).toBe('accounts@brightway.ie');
        expect(facts.supplier.phone).toBe('021 430 2310');
    });

    it('marks where each value was read', () => {
        expect(facts.poNumber?.source?.[0]).toMatchObject({ page: 0 });
        expect(facts.supplier.name?.source?.length).toBeGreaterThan(0);
    });
});

describe('extractInvoice: a simple VAT invoice', () => {
    const facts = extractInvoice(simpleVatInvoice());

    it('reads label: value pairs on one line', () => {
        expect(facts.invoiceNumber?.value).toBe('GC-2231');
        expect(facts.invoiceDate?.value).toBe('2026-11-05');
        expect(facts.poNumber?.value).toBe('7788');
        expect(facts.mentionsSicap).toBe(false);
    });

    it('separates subtotal, VAT and the total due', () => {
        expect(facts.subtotal?.value).toBe(350);
        expect(facts.vat?.value).toBe(47.25);
        expect(facts.total).toMatchObject({ value: 397.25, sure: true });
        expect(facts.items.map(i => [i.description, i.quantity, i.unitPrice, i.amount])).toEqual([
            ['Lunch for course participants', 20, 12.5, 250],
            ['Room hire', 1, 100, 100],
        ]);
    });

    it('takes the supplier from the "From:" block and its phone number', () => {
        expect(facts.supplier.name).toMatchObject({ value: 'Greenleaf Catering', sure: true });
        expect(facts.supplier.address?.value).toBe('12 Patrick Street, Cork T12 XY99');
        expect(facts.supplier.phone).toBe('087 123 4567');
    });
});

describe('extractInvoice: nothing to read', () => {
    it('says so for a scan', () => {
        const facts = extractInvoice([]);
        expect(facts.hasText).toBe(false);
        expect(facts.items).toEqual([]);
    });
});

describe('helpers', () => {
    it('joins wrapped name lines of numbered people', () => {
        expect(numberedPeople(['Dates 1st May 2026', '1. Mary', 'Byrne', '2) Tom Walsh', 'Notes: paid in advance'])).toEqual(['Mary Byrne', 'Tom Walsh']);
        expect(numberedPeople(['1. Only one'])).toEqual([]);
    });

    it('joins address lines, mending a wrapped Eircode', () => {
        expect(joinAddress(['UNIT 7,', 'CORK CITY CORK T12', 'R2KX', 'IRELAND'])).toBe('UNIT 7, CORK CITY CORK T12 R2KX, IRELAND');
    });
});

describe('Word invoices', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    const tabbed = (a: string, b: string) => `<w:p><w:r><w:t>${a}</w:t></w:r><w:r><w:tab/><w:t>${b}</w:t></w:r></w:p>`;
    const cell = (...paras: string[]) => `<w:tc>${paras.map(p).join('')}</w:tc>`;
    const xml = `<w:document ${W}><w:body>
        ${p('INVOICE')}
        ${p('From: Riverside Tutors')}
        ${p('5 Lee Road, Cork')}
        ${tabbed('Invoice No:', 'RT-17')}
        ${tabbed('PO Number:', '4455')}
        <w:tbl>
            <w:tr>${cell('Description')}${cell('Hours')}${cell('Rate')}${cell('Amount')}</w:tr>
            <w:tr>${cell('English tutoring 1st - 5th June 2026')}${cell('10')}${cell('40.00')}${cell('400.00')}</w:tr>
            <w:tr>${cell('')}${cell('')}${cell('Total')}${cell('400.00')}</w:tr>
        </w:tbl>
    </w:body></w:document>`;

    it('lays paragraphs and table cells out so labels find their values', () => {
        const facts = extractInvoice(docxPhrases(xml));
        expect(facts.invoiceNumber?.value).toBe('RT-17');
        expect(facts.poNumber?.value).toBe('4455');
        expect(facts.total?.value).toBe(400);
        expect(facts.items[0]).toMatchObject({ description: 'English tutoring 1st - 5th June 2026', quantity: 10, unitPrice: 40, amount: 400 });
        expect(facts.serviceDates).toEqual({ start: '2026-06-01', end: '2026-06-05' });
        expect(facts.supplier.name?.value).toBe('Riverside Tutors');
    });
});

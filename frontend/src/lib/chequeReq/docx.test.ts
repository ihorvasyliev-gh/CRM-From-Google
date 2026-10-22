import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import template from '../../assets/templates/sicap-cheque-requisition.docx?inline';
import { chequeReqFileName, renderChequeReqDocx, splitFirstLine, syncCheckboxes, templateData } from './docx';
import { EMPTY_FORM, type ChequeReqForm } from './types';

function templateBytes(): ArrayBuffer {
    const binary = atob(template.slice(template.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

function text(xml: string): string {
    return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
}

const FORM: ChequeReqForm = {
    ...EMPTY_FORM,
    actionNumber: '9.',
    poNumber: '9001',
    payeeName: 'Brightway Safety Training Services',
    payeeAddress: 'BRIGHTWAY, UNIT 7\nMILL ROAD, CORK T12 AB34',
    amount: '1450',
    description: 'Manual Handling QQI Level 5 course 03.11.2026 for International Protection and Temporary Protection Clients',
    requestedBy: 'Jane Murphy',
    requestedDate: '2026-10-22',
    amountQuoted: '1,450.00',
    quoteEmail: 'mary@brightway.ie',
    quoteBy: { ...EMPTY_FORM.quoteBy, email: true },
    checklist: { ...EMPTY_FORM.checklist, poAndSicap: true },
};

describe('the requisition template', () => {
    it('splits a long description over its two ruled lines', () => {
        expect(splitFirstLine('short')).toEqual(['short', '']);
        const [a, b] = splitFirstLine(FORM.description);
        expect(a.length).toBeLessThanOrEqual(64);
        expect(`${a} ${b}`).toBe(FORM.description);
    });

    it('keeps blank lines to fill in by hand', () => {
        const data = templateData(EMPTY_FORM);
        expect(data.requestedDate).toMatch(/^_+$/);
        expect(data.approvedDate).toMatch(/^ _+$/);
        expect(data.shopName).toMatch(/^_+$/);
        expect(data.cTax).toBe('☐');
        const filled = templateData(FORM);
        expect(filled.requestedDate).toBe('22/10/2026');
        expect(filled.amount).toBe('1,450.00');
        expect(filled.payeeAddress).toBe('BRIGHTWAY, UNIT 7, MILL ROAD, CORK T12 AB34');
        expect(filled.qEmail).toBe('☒');
    });

    it('ticks Word check boxes that show ☒', () => {
        const box = (sym: string) => `<w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="0"/></w14:checkbox></w:sdtPr><w:sdtContent><w:r><w:t>${sym}</w:t></w:r></w:sdtContent></w:sdt>`;
        const out = syncCheckboxes(box('☒') + box('☐'));
        expect(out.match(/w14:val="1"/g)).toHaveLength(1);
        expect(out.indexOf('w14:val="1"')).toBeLessThan(out.indexOf('☐'));
    });

    it('fills every placeholder of the template', async () => {
        const blob = await renderChequeReqDocx(templateBytes(), FORM);
        const zip = new PizZip(await blob.arrayBuffer());
        const xml = zip.file('word/document.xml')!.asText();
        expect(xml).not.toMatch(/\{[a-zA-Z0-9]+\}/);
        const body = text(xml);
        for (const value of ['SICAP ACTION NUMBER:', '9.', '9001', 'Brightway Safety Training Services', 'MILL ROAD, CORK T12 AB34', '1,450.00', 'Jane Murphy', '22/10/2026', 'mary@brightway.ie', 'Temporary Protection Clients']) {
            expect(body).toContain(value);
        }
        // Two boxes ticked: PO number + SICAP on the invoice, quote by e-mail
        expect(xml.match(/<w14:checked w14:val="1"\/>/g)).toHaveLength(2);
        expect(xml.match(/☒/g)).toHaveLength(2);
    });

    it('names the file as the team does', () => {
        expect(chequeReqFileName({ invoiceNumber: 'INV-0064' }, { payeeName: 'X' })).toBe('SICAP Invoice INV-0064.docx');
        expect(chequeReqFileName({ invoiceNumber: '' }, { payeeName: 'Acme/Ltd' })).toBe('SICAP Cheque Requisition Acme-Ltd.docx');
    });
});

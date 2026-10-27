import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import template from '../../assets/templates/sicap-cheque-requisition.docx?inline';
import { chequeReqFileName, descriptionLines, renderChequeReqDocx, splitFirstLine, syncCheckboxes, templateData, textWidth } from './docx';
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
    it('measures text in the font of the form', () => {
        expect(textWidth('Description of goods/services:')).toBeCloseTo(134.8, 1);
        // Capitals take more room than small letters; accents measure as their letter
        expect(textWidth('MANUAL HANDLING')).toBeGreaterThan(textWidth('Manual Handling'));
        expect(textWidth('Café')).toBeCloseTo(textWidth('Cafe'), 5);
    });

    it('splits a long description over its two ruled lines', () => {
        expect(splitFirstLine('short')).toEqual(['short', '']);
        const [a, b] = splitFirstLine(FORM.description);
        // The first line stops short of the Checklist box, which can sit beside it
        expect(a).toBe('Manual Handling QQI Level 5 course');
        expect(textWidth(a)).toBeLessThanOrEqual(212);
        expect(`${a} ${b}`).toBe(FORM.description);
        // Capitals fill the line sooner
        const words = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
        expect(splitFirstLine(words.toUpperCase())[0].length).toBeLessThan(splitFirstLine(words)[0].length);
        // A word longer than the line is cut
        const [long, rest] = splitFirstLine('x'.repeat(80));
        expect(long.length + rest.length).toBe(80);
        expect(textWidth(long)).toBeLessThanOrEqual(212);
    });

    it('starts the second line where the editor did, when the first fits', () => {
        // Not "…Centre, 24 classes" with "classes" pushed under the label by the Checklist box
        expect(descriptionLines('Esol classes for the Cork Migrant Centre\n24 classes x45.67')).toEqual(['Esol classes for the Cork Migrant Centre', '24 classes x45.67']);
        expect(templateData({ ...FORM, description: 'Esol classes for the Cork Migrant Centre\n24 classes x45.67' })).toMatchObject({
            description1: 'Esol classes for the Cork Migrant Centre',
            description2: '24 classes x45.67',
        });
        // A first line too long for its room goes on before the rest
        expect(descriptionLines(`${FORM.description}\n3 people`)).toEqual(['Manual Handling QQI Level 5 course', '03.11.2026 for International Protection and Temporary Protection Clients, 3 people']);
        expect(descriptionLines('  One line  ')).toEqual(['One line', '']);
        expect(descriptionLines('')).toEqual(['', '']);
    });

    it('keeps blank lines to fill in by hand', () => {
        const data = templateData(EMPTY_FORM);
        expect(data.requestedDate).toMatch(/^_+$/);
        expect(data.approvedDate).toMatch(/^ _+$/);
        expect(data.shopName).toMatch(/^_+$/);
        expect(data.payeeName).toMatch(/^_+$/);
        expect(data.payeeAddress).toMatch(/^_+$/);
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

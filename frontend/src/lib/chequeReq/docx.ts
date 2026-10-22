// ─── Cheque requisitions: the filled-in .docx ──────────────────
// The template is the team's own SICAP cheque requisition with {placeholders} where the
// values go; its ruled lines are drawn shapes, so values sit on them as before.

import templateUrl from '../../assets/templates/sicap-cheque-requisition.docx?url';
import { loadDocxLibs } from '../documentRender';
import { formatAmount, parseAmount, slashDate } from './parse';
import type { ChequeReqForm, ChequeReqMeta } from './types';

const CHECKED = '☒';
const UNCHECKED = '☐';
/** Characters of the description that fit on its first ruled line, after the label */
const DESCRIPTION_FIRST_LINE = 64;

/** Text up to `max` characters on the first line (broken at a space), the rest on the second */
export function splitFirstLine(text: string, max = DESCRIPTION_FIRST_LINE): [string, string] {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length <= max) return [t, ''];
    const cut = t.lastIndexOf(' ', max);
    const at = cut > max * 0.5 ? cut : max;
    return [t.slice(0, at).trim(), t.slice(at).trim()];
}

function money(value: string): string {
    const n = parseAmount(value);
    return n === null ? value.trim() : formatAmount(n);
}

function oneLine(value: string): string {
    return value.split(/\s*\n\s*/).filter(Boolean).join(', ');
}

/** Placeholder values; blanks keep the form's ruled underscores so they can be filled by hand */
export function templateData(form: ChequeReqForm): Record<string, string> {
    const box = (on: boolean) => (on ? CHECKED : UNCHECKED);
    const [description1, description2] = splitFirstLine(oneLine(form.description));
    return {
        actionNumber: form.actionNumber.trim(),
        nonSicapFunding: form.nonSicapFunding.trim(),
        poNumber: form.poNumber.trim(),
        payeeName: oneLine(form.payeeName),
        payeeAddress: oneLine(form.payeeAddress),
        amount: money(form.amount),
        description1,
        description2,
        requestedBy: form.requestedBy.trim(),
        requestedDate: form.requestedDate ? slashDate(form.requestedDate) : '_______________________',
        approvedBy: form.approvedBy.trim(),
        approvedDate: form.approvedDate ? ` ${slashDate(form.approvedDate)}` : ' _______________________',
        quoteDate: form.quoteDate ? slashDate(form.quoteDate) : '',
        amountQuoted: money(form.amountQuoted),
        shopName: form.shopName.trim() || '________________________________',
        quotePhone: form.quotePhone.trim(),
        quoteEmail: form.quoteEmail.trim(),
        quoteContact: form.quoteContact.trim(),
        quoteWebsite: form.quoteWebsite.trim(),
        cTax: box(form.checklist.taxClearance),
        cPoSicap: box(form.checklist.poAndSicap),
        cDescription: box(form.checklist.description),
        cApproval: box(form.checklist.approval),
        cQuote: box(form.checklist.quoteDetails),
        cApprovalEmail: box(form.approvalEmailAttached),
        qShop: box(form.quoteBy.shop),
        qPhone: box(form.quoteBy.telephone),
        qEmail: box(form.quoteBy.email),
        qMeeting: box(form.quoteBy.meeting),
        qOnline: box(form.quoteBy.online),
    };
}

/** Word check boxes keep their state apart from the symbol shown: tick the ones showing ☒ */
export function syncCheckboxes(xml: string): string {
    return xml.replace(/<w:sdt>(?:(?!<\/w:sdt>).)*?<\/w:sdt>/gs, sdt =>
        sdt.includes(`>${CHECKED}<`) ? sdt.replace(/<w14:checked w14:val="0"\/>/, '<w14:checked w14:val="1"/>') : sdt,
    );
}

/** Fill the template (its bytes) with the form */
export async function renderChequeReqDocx(template: ArrayBuffer, form: ChequeReqForm): Promise<Blob> {
    const { PizZip, Docxtemplater } = await loadDocxLibs();
    const doc = new Docxtemplater(new PizZip(template), {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{', end: '}' },
        errorLogging: false,
        nullGetter: () => '',
    });
    doc.render(templateData(form));
    const zip = doc.getZip();
    zip.file('word/document.xml', syncCheckboxes(zip.file('word/document.xml')!.asText()));
    return zip.generate({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

let templatePromise: Promise<ArrayBuffer> | null = null;

function loadTemplate(): Promise<ArrayBuffer> {
    templatePromise ??= fetch(templateUrl)
        .then(r => {
            if (!r.ok) throw new Error(`Could not load the requisition template (${r.status})`);
            return r.arrayBuffer();
        })
        .catch(err => {
            templatePromise = null;
            throw err;
        });
    return templatePromise;
}

export async function renderChequeReq(form: ChequeReqForm): Promise<Blob> {
    return renderChequeReqDocx(await loadTemplate(), form);
}

/** "SICAP Invoice INV-0064.docx", as the team names them */
export function chequeReqFileName(meta: Pick<ChequeReqMeta, 'invoiceNumber'>, form: Pick<ChequeReqForm, 'payeeName'>): string {
    const invoice = meta.invoiceNumber.trim();
    const name = invoice ? `SICAP Invoice ${invoice}` : `SICAP Cheque Requisition ${form.payeeName.trim()}`.trim();
    return `${name.replace(/[\\/:*?"<>|]+/g, '-')}.docx`;
}

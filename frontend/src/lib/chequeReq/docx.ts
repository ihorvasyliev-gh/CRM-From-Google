// ─── Cheque requisitions: the filled-in .docx ──────────────────
// The template is the team's own SICAP cheque requisition with {placeholders} where the
// values go. Most ruled lines are drawn shapes of a fixed length, so the description is split
// to fit its two; the payee's name and address are underlined text that wraps under itself.

import templateUrl from '../../assets/templates/sicap-cheque-requisition.docx?url';
import { loadDocxLibs } from '../documentRender';
import { formatAmount, parseAmount, slashDate } from './parse';
import type { ChequeReqForm, ChequeReqMeta } from './types';

const CHECKED = '☒';
const UNCHECKED = '☐';
/** Width (pt) of the description's first ruled line after its label: 145.5pt to 394.5pt, less the space before the text */
const DESCRIPTION_FIRST_LINE = 244;
/** A blank payee name or address line, to fill in by hand: about as wide as the room beside the checklist */
const BLANK_LINE = '_'.repeat(44);

/** Advance widths of Calibri (Carlito has the same metrics) for ' ' to '~', in 1/2048 em */
const CALIBRI = [
    463, 667, 821, 1020, 1038, 1464, 1397, 452, 621, 621, 1020, 1020, 511, 627, 517, 791, 1038, 1038, 1038, 1038, 1038, 1038, 1038, 1038,
    1038, 1038, 548, 548, 1020, 1020, 1020, 949, 1831, 1185, 1114, 1092, 1260, 1000, 941, 1292, 1276, 516, 653, 1064, 861, 1751, 1322,
    1356, 1058, 1378, 1112, 941, 998, 1314, 1162, 1822, 1063, 998, 959, 628, 791, 628, 1020, 1020, 596, 981, 1076, 866, 1076, 1019,
    625, 964, 1076, 470, 490, 931, 470, 1636, 1076, 1080, 1076, 1076, 714, 801, 686, 1076, 925, 1464, 887, 927, 809, 644, 943, 644, 1020,
];

/** Width in points of `text` in 11pt Calibri, the form's font; accented letters measure as their base letter */
export function textWidth(text: string, size = 11): number {
    let units = 0;
    for (const ch of text.normalize('NFD')) {
        const code = ch.charCodeAt(0);
        if (code >= 0x300 && code <= 0x36f) continue;
        units += code >= 32 && code <= 126 ? CALIBRI[code - 32] : 1020;
    }
    return (units / 2048) * size;
}

/** As many words as fit `maxWidth` points on the first line, the rest on the second */
export function splitFirstLine(text: string, maxWidth = DESCRIPTION_FIRST_LINE): [string, string] {
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    let first = '';
    for (const [i, word] of words.entries()) {
        const next = first ? `${first} ${word}` : word;
        if (textWidth(next) > maxWidth) {
            // A single word longer than the line is cut where it stops fitting
            if (!first) {
                let cut = 1;
                while (cut < word.length && textWidth(word.slice(0, cut + 1)) <= maxWidth) cut++;
                return [word.slice(0, cut), [word.slice(cut), ...words.slice(i + 1)].join(' ')];
            }
            return [first, words.slice(i).join(' ')];
        }
        first = next;
    }
    return [first, ''];
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
        payeeName: oneLine(form.payeeName) || BLANK_LINE,
        payeeAddress: oneLine(form.payeeAddress) || BLANK_LINE,
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

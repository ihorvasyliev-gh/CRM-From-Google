// ─── Cheque requisitions: native vector PDF ────────────────────
// Draws the Cork City Partnership SICAP cheque requisition directly with pdf-lib
// vectors and text (matching sicap-cheque-requisition.docx 1:1) instead of
// rasterizing docx-preview HTML. Produces sharp, selectable, ~20 KB PDFs with
// every ruled line, the top-right Checklist box, and exact alignments intact.

import type { PDFFont, PDFPage } from 'pdf-lib';
import arimoUrl from '../../assets/fonts/Arimo-Regular.ttf?url';
import { loadChunk } from '../deployRecovery';
import { chequeReqPdfFileName, descriptionLines } from './docx';
import { formatAmount, parseAmount, slashDate } from './parse';
import type { ChequeReqForm, ChequeReqMeta } from './types';

// Exact US Letter page geometry from sicap-cheque-requisition.docx (points)
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_L = 56.7;
const MARGIN_R = 56.7;
const MARGIN_T = 45.35;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R; // 498.6pt

// Right-aligned Checklist box geometry (matching <w:tblGrid w="2553"> = 127.65pt + inner padding)
const CHECKLIST_W = 136;
const CHECKLIST_X = PAGE_W - MARGIN_R - CHECKLIST_W; // 419.3pt
const CHECKLIST_GAP = 14;
const LEFT_COL_RIGHT = CHECKLIST_X - CHECKLIST_GAP; // 405.3pt
const LEFT_COL_W = LEFT_COL_RIGHT - MARGIN_L; // 348.6pt

// Characters supported natively by PDF StandardFonts (WinAnsiEncoding)
const WIN_ANSI_EXTRA = new Set([
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
    0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
    0x0153, 0x017e, 0x0178,
]);

function isWinAnsi(text: string): boolean {
    for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp <= 0x7f) continue;
        if (cp >= 0xa0 && cp <= 0xff) continue;
        if (WIN_ANSI_EXTRA.has(cp)) continue;
        return false;
    }
    return true;
}

function cleanLine(value: string): string {
    return value.split(/\s*\n\s*/).filter(Boolean).join(', ');
}

function money(value: string): string {
    const n = parseAmount(value);
    return n === null ? value.trim() : formatAmount(n);
}

interface FontSet {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
    unicode?: PDFFont;
}

let arimoBytesPromise: Promise<Uint8Array> | null = null;

async function loadArimoBytes(): Promise<Uint8Array> {
    arimoBytesPromise ??= fetch(arimoUrl)
        .then(r => {
            if (!r.ok) throw new Error(`Could not load PDF font (${r.status})`);
            return r.arrayBuffer();
        })
        .then(buf => new Uint8Array(buf))
        .catch(err => {
            arimoBytesPromise = null;
            throw err;
        });
    return arimoBytesPromise;
}

function pickFont(text: string, preferred: PDFFont, fonts: FontSet): PDFFont {
    if (!text || isWinAnsi(text)) return preferred;
    return fonts.unicode ?? preferred;
}

function safeText(text: string, font: PDFFont, fonts: FontSet): string {
    if (!text || font === fonts.unicode || isWinAnsi(text)) return text;
    // Fallback if Unicode font failed to load: transliterate accents cleanly so pdf-lib never throws
    return text.normalize('NFKD').replace(/[^\x20-\x7e\xa0-\xff€–—“”‘’]/g, '');
}

/** Word-wrap `text` into lines fitting `maxWidth` in `font` at `size` pt */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, fonts: FontSet): string[] {
    const trimmed = safeText(text, font, fonts).replace(/\s+/g, ' ').trim();
    if (!trimmed) return [];
    const words = trimmed.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            current = candidate;
            continue;
        }
        if (current) {
            lines.push(current);
            current = '';
        }
        if (font.widthOfTextAtSize(word, size) <= maxWidth) {
            current = word;
        } else {
            // Hard-break a single token wider than maxWidth (e.g. long URL)
            let rest = word;
            while (rest.length > 0) {
                let cut = rest.length;
                while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
                lines.push(rest.slice(0, cut));
                rest = rest.slice(cut);
            }
        }
    }
    if (current) lines.push(current);
    return lines;
}

/** Fit single-line text into `maxWidth`, shrinking slightly (down to `minSize`) before clipping */
function fitSingleLine(
    raw: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
    fonts: FontSet,
    minSize = 8.5,
): { text: string; size: number } {
    const text = safeText(raw, font, fonts);
    let s = size;
    while (s > minSize && font.widthOfTextAtSize(text, s) > maxWidth) {
        s = Math.round((s - 0.5) * 10) / 10;
    }
    let out = text;
    while (out.length > 1 && font.widthOfTextAtSize(out, s) > maxWidth) {
        out = `${out.slice(0, -2)}…`;
    }
    return { text: out, size: s };
}

/** Convert top-down y (from top margin) into PDF bottom-up y */
function pdfY(topOffset: number): number {
    return PAGE_H - MARGIN_T - topOffset;
}

/** Render the filled SICAP Cheque Requisition as crisp vector PDF bytes */
export async function renderChequeReqPdfBytes(
    form: ChequeReqForm,
    meta?: Pick<ChequeReqMeta, 'invoiceNumber'>,
): Promise<Uint8Array> {
    const lib = await loadChunk(() => import('pdf-lib'));
    const { PDFDocument, StandardFonts, rgb } = lib;

    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);

    const fonts: FontSet = { regular, bold, italic, boldItalic };

    // Only embed the Unicode TTF if user-entered fields contain non-WinAnsi characters
    const userStrings = [
        form.actionNumber,
        form.nonSicapFunding,
        form.poNumber,
        form.payeeName,
        form.payeeAddress,
        form.amount,
        form.description,
        form.requestedBy,
        form.approvedBy,
        form.amountQuoted,
        form.shopName,
        form.quotePhone,
        form.quoteEmail,
        form.quoteContact,
        form.quoteWebsite,
    ];
    if (userStrings.some(s => s && !isWinAnsi(s))) {
        try {
            const [fkMod, arimoBytes] = await Promise.all([
                loadChunk(() => import('@pdf-lib/fontkit')),
                loadArimoBytes(),
            ]);
            pdf.registerFontkit((fkMod.default ?? fkMod) as never);
            fonts.unicode = await pdf.embedFont(arimoBytes, { subset: true });
        } catch {
            // Fall back cleanly to WinAnsi transliteration if font load fails offline
        }
    }

    const page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
    const black = rgb(0, 0, 0);

    const drawText = (
        raw: string,
        x: number,
        topY: number,
        size: number,
        preferred: PDFFont,
        underline = false,
    ): number => {
        if (!raw) return 0;
        const font = pickFont(raw, preferred, fonts);
        const text = safeText(raw, font, fonts);
        const y = pdfY(topY);
        page.drawText(text, { x, y, size, font, color: black });
        const width = font.widthOfTextAtSize(text, size);
        if (underline && width > 0) {
            page.drawLine({
                start: { x, y: y - Math.max(1.4, size * 0.13) },
                end: { x: x + width, y: y - Math.max(1.4, size * 0.13) },
                thickness: Math.max(0.55, size * 0.055),
                color: black,
            });
        }
        return width;
    };

    const drawRule = (x1: number, x2: number, topY: number, thickness = 0.6) => {
        const y = pdfY(topY);
        page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: black });
    };

    const drawCheckbox = (x: number, baselineTopY: number, checked: boolean, boxSize = 8.5) => {
        const y = pdfY(baselineTopY) - 0.8;
        page.drawRectangle({
            x,
            y,
            width: boxSize,
            height: boxSize,
            borderWidth: 0.75,
            borderColor: black,
        });
        if (checked) {
            const pad = 1.6;
            page.drawLine({
                start: { x: x + pad, y: y + pad },
                end: { x: x + boxSize - pad, y: y + boxSize - pad },
                thickness: 1.05,
                color: black,
            });
            page.drawLine({
                start: { x: x + pad, y: y + boxSize - pad },
                end: { x: x + boxSize - pad, y: y + pad },
                thickness: 1.05,
                color: black,
            });
        }
    };

    // ── 1. Top-right Checklist Box (floating right margin) ──────
    const boxTop = 4;
    const boxPadX = 9;
    const boxTextX = CHECKLIST_X + boxPadX;
    const boxInnerW = CHECKLIST_W - boxPadX * 2;
    let cy = boxTop + 18;

    // Centered "Checklist:" heading
    const clHeading = 'Checklist:';
    const clHeadW = bold.widthOfTextAtSize(clHeading, 10.5);
    drawText(clHeading, CHECKLIST_X + (CHECKLIST_W - clHeadW) / 2, cy, 10.5, bold, true);
    cy += 18;

    const checklistRows: { checked: boolean; label: string; underline: boolean }[] = [
        { checked: form.checklist.taxClearance, label: 'Tax Declaration Form or TCAN*', underline: true },
        { checked: form.checklist.poAndSicap, label: 'PO Number and “SICAP” on Invoice', underline: true },
        { checked: form.checklist.description, label: 'Description', underline: false },
        { checked: form.checklist.approval, label: 'Approval', underline: false },
        { checked: form.checklist.quoteDetails, label: 'Quote Details', underline: false },
    ];

    const cbGap = 12;
    for (const item of checklistRows) {
        drawCheckbox(boxTextX, cy, item.checked, 8);
        const lines = wrapText(item.label, regular, 9.5, boxInnerW - cbGap, fonts);
        for (const [li, line] of lines.entries()) {
            drawText(line, boxTextX + cbGap, cy + li * 12, 9.5, regular, item.underline);
        }
        cy += Math.max(1, lines.length) * 12 + 5;
    }

    // Footnote: *Tax Clearance Access Number (with T, C, A, N underlined)
    cy += 2;
    const footnoteParts: [string, boolean][] = [
        ['*', false], ['T', true], ['ax ', false], ['C', true], ['learance', false],
    ];
    let fx = boxTextX;
    for (const [part, u] of footnoteParts) {
        fx += drawText(part, fx, cy, 8.8, regular, u);
    }
    cy += 11.5;
    const footnoteParts2: [string, boolean][] = [
        ['A', true], ['ccess ', false], ['N', true], ['umber', false],
    ];
    fx = boxTextX;
    for (const [part, u] of footnoteParts2) {
        fx += drawText(part, fx, cy, 8.8, regular, u);
    }
    const boxBottom = cy + 10;

    page.drawRectangle({
        x: CHECKLIST_X,
        y: pdfY(boxBottom),
        width: CHECKLIST_W,
        height: boxBottom - boxTop,
        borderWidth: 0.75,
        borderColor: black,
    });

    // ── 2. Centered Header: SICAP ───────────────────────────────
    const titleW = bold.widthOfTextAtSize('SICAP', 18);
    drawText('SICAP', MARGIN_L + (LEFT_COL_W - titleW) / 2 + 24, 24, 18, bold, true);

    // ── 3. Funding Block (left of Checklist box) ────────────────
    let y = 52;
    const actionLabelW = drawText('SICAP ACTION NUMBER:  ', MARGIN_L, y, 10, bold);
    const actionVal = form.actionNumber.trim();
    if (actionVal) {
        const fit = fitSingleLine(actionVal, pickFont(actionVal, bold, fonts), 10, LEFT_COL_W - actionLabelW, fonts);
        drawText(fit.text, MARGIN_L + actionLabelW, y, fit.size, bold);
    }

    y += 18;
    const nonSicapLabelW = drawText('NON-SICAP FUNDING:  ', MARGIN_L, y, 10, bold);
    const nonSicapVal = form.nonSicapFunding.trim();
    if (nonSicapVal) {
        const fit = fitSingleLine(nonSicapVal, pickFont(nonSicapVal, bold, fonts), 10, LEFT_COL_W - nonSicapLabelW, fonts);
        drawText(fit.text, MARGIN_L + nonSicapLabelW, y, fit.size, bold);
    }

    // Thick 2.25pt divider stopping left of Checklist box
    y += 7;
    drawRule(MARGIN_L, LEFT_COL_RIGHT, y, 2.25);

    // ── 4. Payment Block ────────────────────────────────────────
    y += 22;
    drawText('PO Number:', MARGIN_L, y, 11, bold);
    const poX = MARGIN_L + 122;
    const poLineEnd = Math.min(MARGIN_L + 302, LEFT_COL_RIGHT);
    const poVal = form.poNumber.trim();
    if (poVal) {
        const fit = fitSingleLine(poVal, pickFont(poVal, bold, fonts), 11, poLineEnd - poX - 4, fonts);
        drawText(fit.text, poX + 2, y, fit.size, bold);
    }
    drawRule(poX, poLineEnd, y + 2.5, 0.6);

    // Payee Name & Address (hanging indent cleanly past label width, strictly inside LEFT_COL_RIGHT)
    y += 23;
    const payeeLabelW = drawText('Payee Name & Address:', MARGIN_L, y, 10.5, regular);
    const payeeX = Math.max(MARGIN_L + 122, MARGIN_L + payeeLabelW + 8);
    const payeeMaxW = LEFT_COL_RIGHT - payeeX;

    const payeeName = cleanLine(form.payeeName);
    if (payeeName) {
        const nameFont = pickFont(payeeName, regular, fonts);
        const nameLines = wrapText(payeeName, nameFont, 10.5, payeeMaxW, fonts);
        for (const [li, line] of nameLines.entries()) {
            drawText(line, payeeX, y + li * 14.5, 10.5, regular, true);
        }
        y += Math.max(1, nameLines.length) * 14.5 + 4;
    } else {
        drawRule(payeeX, LEFT_COL_RIGHT, y + 2.5, 0.6);
        y += 18.5;
    }

    const payeeAddress = cleanLine(form.payeeAddress);
    if (payeeAddress) {
        const addrFont = pickFont(payeeAddress, regular, fonts);
        const addrLines = wrapText(payeeAddress, addrFont, 10.5, payeeMaxW, fonts);
        for (const [li, line] of addrLines.entries()) {
            drawText(line, payeeX, y + li * 14.5, 10.5, regular, true);
        }
        y += Math.max(1, addrLines.length) * 14.5 + 10;
    } else {
        drawRule(payeeX, LEFT_COL_RIGHT, y + 2.5, 0.6);
        y += 24;
    }

    // Payment Amount
    const amountLineX = MARGIN_L + 122;
    const amountLineEnd = Math.min(MARGIN_L + 302, LEFT_COL_RIGHT);
    drawText('Payment Amount:', MARGIN_L, y, 11, regular);
    const euroW = drawText('€  ', amountLineX + 2, y, 11, regular);
    const amountVal = money(form.amount);
    if (amountVal) {
        const fit = fitSingleLine(amountVal, pickFont(amountVal, regular, fonts), 11, amountLineEnd - (amountLineX + 2 + euroW), fonts);
        drawText(fit.text, amountLineX + 2 + euroW, y, fit.size, regular);
    }
    drawRule(amountLineX, amountLineEnd, y + 2.5, 0.6);

    // Description of goods/services (Line 1 beside/below Checklist box, Line 2 full width)
    y += 28;
    const [desc1, desc2] = descriptionLines(form.description);
    const descLabelW = drawText('Description of goods/services:', MARGIN_L, y, 10.5, regular);
    const desc1X = Math.max(MARGIN_L + 152, MARGIN_L + descLabelW + 8);
    // Stay cleanly clear of the Checklist box if Description line 1 still overlaps its height
    const desc1End = y - 10 < boxBottom ? LEFT_COL_RIGHT : MARGIN_L + 394.5;
    if (desc1) {
        const fit = fitSingleLine(desc1, pickFont(desc1, regular, fonts), 10.5, desc1End - desc1X - 2, fonts, 8);
        drawText(fit.text, desc1X + 2, y, fit.size, regular);
    }
    drawRule(desc1X, desc1End, y + 2.5, 0.6);

    // Ensure Line 2 always sits below the Checklist box if needed
    y = Math.max(y + 21, boxBottom + 16);
    const desc2End = MARGIN_L + 394.5;
    if (desc2) {
        const d2Font = pickFont(desc2, regular, fonts);
        const d2Lines = wrapText(desc2, d2Font, 10.5, desc2End - MARGIN_L - 2, fonts);
        drawText(d2Lines[0] ?? '', MARGIN_L + 1, y, 10.5, regular);
        drawRule(MARGIN_L, desc2End, y + 2.5, 0.6);
        if (d2Lines.length > 1) {
            // Extra overflow line cleanly drawn beneath rather than clipping off the page
            const overflowRest = d2Lines.slice(1).join(' ');
            const fit = fitSingleLine(overflowRest, d2Font, 9.5, CONTENT_W - 2, fonts, 7.5);
            y += 16;
            drawText(fit.text, MARGIN_L + 1, y, fit.size, regular);
            drawRule(MARGIN_L, desc2End, y + 2.5, 0.6);
        }
    } else {
        drawRule(MARGIN_L, desc2End, y + 2.5, 0.6);
    }

    // ── 5. Requested & Approved Block ───────────────────────────
    y += 28;
    const reqLabelW = drawText('Requested by:', MARGIN_L, y, 11, regular);
    const reqLineX = MARGIN_L + reqLabelW + 6;
    const sigLineEnd = MARGIN_L + 238;
    const reqBy = form.requestedBy.trim();
    if (reqBy) {
        const fit = fitSingleLine(reqBy, pickFont(reqBy, regular, fonts), 11, sigLineEnd - reqLineX - 4, fonts);
        drawText(fit.text, reqLineX + 3, y, fit.size, regular);
    }
    drawRule(reqLineX, sigLineEnd, y + 2.5, 0.6);

    y += 22;
    const appLabelW = drawText('Approved by:', MARGIN_L, y, 11, regular);
    const appLineX = MARGIN_L + appLabelW + 6;
    const appBy = form.approvedBy.trim();
    if (appBy) {
        const fit = fitSingleLine(appBy, pickFont(appBy, regular, fonts), 11, sigLineEnd - appLineX - 4, fonts);
        drawText(fit.text, appLineX + 3, y, fit.size, regular);
    }
    drawRule(appLineX, sigLineEnd, y + 2.5, 0.6);

    y += 22;
    const dateLabelW = drawText('Date: ', MARGIN_L, y, 11, regular);
    const reqDate = form.requestedDate ? slashDate(form.requestedDate) : '';
    if (reqDate) {
        drawText(reqDate, MARGIN_L + dateLabelW + 2, y, 11, regular);
    } else {
        drawRule(MARGIN_L + dateLabelW, MARGIN_L + dateLabelW + 118, y + 2.5, 0.6);
    }

    y += 21;
    drawText('Date: ', MARGIN_L, y, 11, regular);
    const appDate = form.approvedDate ? slashDate(form.approvedDate) : '';
    if (appDate) {
        drawText(appDate, MARGIN_L + dateLabelW + 2, y, 11, regular);
    } else {
        drawRule(MARGIN_L + dateLabelW, MARGIN_L + dateLabelW + 118, y + 2.5, 0.6);
    }

    // Thick divider #2
    y += 8;
    drawRule(MARGIN_L, PAGE_W - MARGIN_R, y, 2.25);

    // OR Approval Email attached
    y += 18;
    const orW = drawText('OR', MARGIN_L, y, 11, boldItalic, true);
    const attachW = drawText(' Approval Email attached  ', MARGIN_L + orW, y, 11, regular);
    drawCheckbox(MARGIN_L + orW + attachW, y, form.approvalEmailAttached, 9);

    // Thick divider #3
    y += 8;
    drawRule(MARGIN_L, PAGE_W - MARGIN_R, y, 2.25);

    // ── 6. Single Quotation Block ───────────────────────────────
    y += 20;
    drawText('SINGLE QUOTATION', MARGIN_L, y, 11, bold, true);

    y += 20;
    const qdLabelW = drawText('Date of Quote:', MARGIN_L, y, 11, bold, true);
    const quoteDate = form.quoteDate ? slashDate(form.quoteDate) : '';
    if (quoteDate) {
        drawText(`  ${quoteDate}`, MARGIN_L + qdLabelW, y, 11, regular);
    }

    y += 19;
    const aqLabelW = drawText('Amount Quoted:', MARGIN_L, y, 11, bold, true);
    const aqEuroW = drawText('  € ', MARGIN_L + aqLabelW, y, 11, bold);
    const amountQuoted = money(form.amountQuoted);
    if (amountQuoted) {
        drawText(amountQuoted, MARGIN_L + aqLabelW + aqEuroW, y, 11, regular);
    }

    y += 20;
    let qox = MARGIN_L;
    qox += drawText('Quote obtained by:', qox, y, 11, boldItalic, true);
    qox += drawText(' (x ', qox, y, 11, boldItalic, false);
    qox += drawText('accordingly and complete details', qox, y, 11, boldItalic, true);
    drawText(')', qox, y, 11, boldItalic, false);

    // 5 Quote Method rows (indented 36pt, right lines ending flush at MARGIN_L + 448pt)
    const methodX = MARGIN_L + 36;
    const detailLabelX = MARGIN_L + 206;
    const quoteLineEnd = MARGIN_L + 448;

    const quoteRows: { checked: boolean; method: string; label: string; value: string }[] = [
        { checked: form.quoteBy.shop, method: 'In shop Purchase', label: 'Shop Name:', value: form.shopName.trim() },
        { checked: form.quoteBy.telephone, method: 'Telephone', label: 'Phone No:', value: form.quotePhone.trim() },
        { checked: form.quoteBy.email, method: 'E-mail', label: 'Email Address:', value: form.quoteEmail.trim() },
        { checked: form.quoteBy.meeting, method: 'Meeting', label: 'Contact Name:', value: form.quoteContact.trim() },
        { checked: form.quoteBy.online, method: 'Correspondence/Online', label: 'Website:', value: form.quoteWebsite.trim() },
    ];

    y += 23;
    for (const row of quoteRows) {
        drawCheckbox(methodX, y, row.checked, 8.5);
        drawText(row.method, methodX + 13, y, 10.5, regular);

        const lblW = drawText(row.label, detailLabelX, y, 10.5, regular);
        const valX = detailLabelX + lblW + 6;
        if (row.value) {
            const fit = fitSingleLine(row.value, pickFont(row.value, regular, fonts), 10.5, quoteLineEnd - valX - 2, fonts, 8);
            drawText(fit.text, valX + 2, y, fit.size, regular);
        }
        drawRule(valX, quoteLineEnd, y + 2.5, 0.85);
        y += 24;
    }

    // ── 7. Footer Procurement Rule Notes ────────────────────────
    y = Math.min(y + 10, PAGE_H - MARGIN_T - 72);
    const note1 = 'SINGLE QUOTATION – payments less than €5,000 (excl. VAT) to the same supplier in the year.';
    for (const line of wrapText(note1, boldItalic, 10, CONTENT_W, fonts)) {
        drawText(line, MARGIN_L, y, 10, boldItalic, true);
        y += 14;
    }

    y += 4;
    const note2a = 'THREE QUOTATIONS - payments expected to be equal to or greater than €5,000 (excl. VAT) to same supplier in the year.';
    for (const line of wrapText(note2a, boldItalic, 10, CONTENT_W, fonts)) {
        drawText(line, MARGIN_L, y, 10, boldItalic, true);
        y += 14;
    }
    let nx = MARGIN_L;
    nx += drawText('(', nx, y, 10, regular, false);
    nx += drawText('OBTAIN 3 QUOTES AND COMPLETE THE 3 QUOTES FORM', nx, y, 10, italic, true);
    drawText(')', nx, y, 10, regular, false);

    const title = chequeReqPdfFileName({ invoiceNumber: meta?.invoiceNumber ?? '' }, form).replace(/\.pdf$/i, '');
    pdf.setTitle(title);
    pdf.setCreator('Cork City Partnership · SICAP CRM');
    return pdf.save();
}

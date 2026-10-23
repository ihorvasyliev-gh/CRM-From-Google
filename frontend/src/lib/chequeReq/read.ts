// ─── Cheque requisitions: opening the invoice file ─────────────
// PDF (text keeps its positions), Word (paragraphs, table cells and text boxes laid out on a
// grid) or a photo / scan (read with OCR, ocr.ts).
// The file never leaves the browser.

import type { Phrase } from '../pdfForms/types';
import { loadDocxLibs } from '../documentRender';

export const INVOICE_ACCEPT = '.pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,image/*';
export const MAX_INVOICE_BYTES = 25 * 1024 * 1024;

export type InvoiceKind = 'pdf' | 'docx' | 'image';

export function invoiceKind(file: Pick<File, 'name' | 'type'>): InvoiceKind | null {
    const name = file.name.toLowerCase();
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.docx')) return 'docx';
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)) return 'image';
    return null;
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
/** EMUs in a point */
const EMU = 12700;
const LINE = 14;
const COLUMN = 150;
/** Right-aligned and centred paragraphs each get a column of their own, so a right-aligned address stays one block */
const ALIGNED_X: Record<string, number> = { right: 330, end: 330, center: 180 };

/** The parts of a Word file read besides document.xml */
export interface DocxParts {
    styles?: string;
    headers?: string[];
    footers?: string[];
}

function child(el: Element | null | undefined, ns: string, name: string): Element | null {
    return el ? Array.from(el.children).find(c => c.namespaceURI === ns && c.localName === name) ?? null : null;
}

/** A w:sz in points (Word stores half-points) */
function points(rPr: Element | null): number | null {
    const sz = Number(child(rPr, W, 'sz')?.getAttributeNS(W, 'val'));
    return sz > 0 ? sz / 2 : null;
}

/** The text size of the Normal style */
function defaultSize(stylesXml: string | undefined): number {
    if (!stylesXml) return 11;
    const doc = new DOMParser().parseFromString(stylesXml, 'application/xml');
    const docDefault = points(child(doc.getElementsByTagNameNS(W, 'rPrDefault')[0], W, 'rPr'));
    const normal = Array.from(doc.getElementsByTagNameNS(W, 'style')).find(s => s.getAttributeNS(W, 'type') === 'paragraph' && s.getAttributeNS(W, 'default') === '1');
    return points(child(normal, W, 'rPr')) ?? docDefault ?? 11;
}

/**
 * A date field written month first (DATE \@ "M/d/yyyy", common on US-set computers): its date
 * day first, as the rest of the reader expects. 10/1/2026 → 1/10/2026.
 */
function dayFirst(instr: string, result: string): string {
    const format = /^\s*(?:DATE|TIME|CREATEDATE|SAVEDATE|PRINTDATE)\b[^"]*\\@\s*"([^"]+)"/i.exec(instr)?.[1];
    if (!format || !/^[^d]*M{1,2}[^Md]+d{1,2}/.test(format)) return result;
    return result.replace(/^(\s*)(\d{1,2})([/.-])(\d{1,2})\3/, '$1$4$3$2$3');
}

/** The text of a paragraph, with tabs and line breaks kept, and the size of its largest letters */
function paragraphText(p: Element, baseSize: number): { text: string; size: number } {
    let text = '';
    let size = 0;
    let field: { instr: string; start: number | null } | null = null;
    const walk = (el: Element, runSize: number) => {
        for (const c of Array.from(el.children)) {
            if (c.namespaceURI !== W) continue;
            switch (c.localName) {
                case 't':
                    text += c.textContent ?? '';
                    if (c.textContent?.trim()) size = Math.max(size, runSize);
                    break;
                case 'tab':
                    text += '\t';
                    break;
                case 'br':
                case 'cr':
                    text += '\n';
                    break;
                case 'noBreakHyphen':
                    text += '-';
                    break;
                case 'r':
                    walk(c, points(child(c, W, 'rPr')) ?? runSize);
                    break;
                // Fields: a date written month first is turned day first
                case 'fldChar': {
                    const type = c.getAttributeNS(W, 'fldCharType');
                    if (type === 'begin') field = { instr: '', start: null };
                    else if (type === 'separate' && field) field.start = text.length;
                    else if (type === 'end' && field) {
                        if (field.start !== null) text = text.slice(0, field.start) + dayFirst(field.instr, text.slice(field.start));
                        field = null;
                    }
                    break;
                }
                case 'instrText':
                    if (field) field.instr += c.textContent ?? '';
                    break;
                case 'fldSimple': {
                    const start = text.length;
                    walk(c, runSize);
                    text = text.slice(0, start) + dayFirst(c.getAttributeNS(W, 'instr') ?? '', text.slice(start));
                    break;
                }
                // Text boxes are laid out on their own (textBoxes)
                case 'p':
                case 'txbxContent':
                case 'rPr':
                case 'pPr':
                    break;
                default:
                    walk(c, runSize);
            }
        }
    };
    walk(p, baseSize);
    return { text, size: size || baseSize };
}

/** Text boxes anchored in a paragraph (once each: Word also keeps an old-style copy as a fallback) */
function textBoxes(p: Element): Element[] {
    return Array.from(p.getElementsByTagNameNS(W, 'txbxContent')).filter(box => {
        for (let el = box.parentElement; el && el !== p; el = el.parentElement) {
            if (el.namespaceURI === MC && el.localName === 'Fallback') return false;
            if (el.namespaceURI === W && el.localName === 'txbxContent') return false;
        }
        return true;
    });
}

/** Where a text box sits across the page, in points from the left margin */
function boxX(box: Element, width: number): number {
    let anchor: Element | null = null;
    let style = '';
    for (let el = box.parentElement; el; el = el.parentElement) {
        if (el.namespaceURI === WP && (el.localName === 'anchor' || el.localName === 'inline')) {
            anchor = el;
            break;
        }
        style ||= el.getAttribute('style') ?? '';
    }
    let x = 0;
    if (anchor) {
        const across = child(anchor, WP, 'positionH');
        const boxWidth = Number(child(anchor, WP, 'extent')?.getAttribute('cx') ?? 0) / EMU;
        const align = child(across, WP, 'align')?.textContent;
        const offset = child(across, WP, 'posOffset')?.textContent;
        if (align) x = align === 'right' || align === 'outside' ? width - boxWidth : align === 'center' ? (width - boxWidth) / 2 : 0;
        else if (offset) x = Number(offset) / EMU;
    } else {
        // Old-style (VML) box: style="position:absolute;margin-left:268.25pt;…"
        x = Number(/margin-left:\s*(-?[\d.]+)pt/.exec(style)?.[1] ?? 0);
    }
    return Math.max(0, Math.min(width - 40, Number.isFinite(x) ? x : 0));
}

/**
 * A Word invoice as positioned phrases: each paragraph is a line (parts split by tabs or wide
 * gaps of spaces side by side), each table row a band of lines with one column per cell, a
 * text box beside the others anchored with it, under the paragraph it hangs from. Headers come
 * first and footers last. Enough for "value to the right of / under its label" to work as on
 * a PDF.
 */
export function docxPhrases(documentXml: string, parts: DocxParts = {}): Phrase[] {
    const baseSize = defaultSize(parts.styles);
    const phrases: Phrase[] = [];
    let y = 800;
    let width = 451;
    const add = (text: string, x: number, at: number, size: number) => {
        const t = text.replace(/\s+/g, ' ').trim();
        if (t) phrases.push({ page: 0, x, y: at, w: t.length * size * 0.5, h: size, text: t });
    };
    /** Lays a paragraph's own text out from `top`; returns where the next line goes, or null when it has none */
    const addParagraph = (p: Element, x: number, top: number): number | null => {
        const { text, size } = paragraphText(p, baseSize);
        const step = Math.max(LINE, Math.round(size * 1.3));
        let at = top;
        for (const line of text.split('\n')) {
            const lineParts = line.split(/\t+| {3,}/);
            if (lineParts.every(part => !part.trim())) continue;
            lineParts.forEach((part, i) => add(part, x + i * COLUMN, at, size));
            at -= step;
        }
        return at === top ? null : at;
    };
    /** The paragraphs and tables in `el`, from `y` down, starting `x` from the left */
    const visit = (el: Element, x: number, aligned: boolean) => {
        for (const c of Array.from(el.children)) {
            if (c.namespaceURI !== W) continue;
            if (c.localName === 'p') {
                const jc = child(child(c, W, 'pPr'), W, 'jc')?.getAttributeNS(W, 'val') ?? '';
                const after = addParagraph(c, aligned && ALIGNED_X[jc] !== undefined ? ALIGNED_X[jc] : x, y);
                const boxes = textBoxes(c);
                // An empty paragraph is a gap; its text boxes go side by side under it, and the
                // text after them under the deepest
                let bottom = after ?? y - (boxes.length ? 0 : LINE);
                const top = after ?? y;
                for (const box of boxes) {
                    y = top;
                    visit(box, x + boxX(box, width), false);
                    bottom = Math.min(bottom, y);
                }
                y = bottom;
            } else if (c.localName === 'tbl') {
                for (const row of Array.from(c.children).filter(r => r.namespaceURI === W && r.localName === 'tr')) {
                    const top = y;
                    let bottom = y;
                    Array.from(row.children)
                        .filter(cell => cell.namespaceURI === W && cell.localName === 'tc')
                        .forEach((cell, ci) => {
                            y = top;
                            visit(cell, x + ci * COLUMN, false);
                            bottom = Math.min(bottom, y);
                        });
                    y = Math.min(bottom, top - LINE) - 4;
                }
            } else if (c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'customXml' || c.localName === 'smartTag') {
                visit(c, x, aligned);
            }
        }
    };
    const root = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml').documentElement;
    const doc = root(documentXml);
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    // The width between the margins, for text boxes placed from the right
    const sections = doc.getElementsByTagNameNS(W, 'sectPr');
    const section = sections[sections.length - 1];
    const page = Number(child(section, W, 'pgSz')?.getAttributeNS(W, 'w')) / 20;
    const margins = child(section, W, 'pgMar');
    const sides = (Number(margins?.getAttributeNS(W, 'left')) + Number(margins?.getAttributeNS(W, 'right'))) / 20;
    if (page > 0 && sides >= 0 && page - sides > 100) width = page - sides;

    const seen = new Set<string>();
    const once = (xml: string) => {
        const el = root(xml);
        const key = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if (!key || seen.has(key)) return;
        seen.add(key);
        visit(el, 0, true);
    };
    for (const header of parts.headers ?? []) once(header);
    if (seen.size) y -= LINE;
    if (body) visit(body, 0, true);
    for (const footer of parts.footers ?? []) once(footer);
    return phrases;
}

export async function readDocxInvoice(bytes: ArrayBuffer): Promise<Phrase[]> {
    const { PizZip } = await loadDocxLibs();
    const zip = new PizZip(bytes);
    const xml = zip.file('word/document.xml')?.asText();
    if (!xml) throw new Error('This Word file has no document inside');
    const numbered = (re: RegExp) =>
        zip.file(re)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            .map(f => f.asText());
    return docxPhrases(xml, {
        styles: zip.file('word/styles.xml')?.asText(),
        headers: numbered(/^word\/header\d*\.xml$/),
        footers: numbered(/^word\/footer\d*\.xml$/),
    });
}

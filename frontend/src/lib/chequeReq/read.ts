// ─── Cheque requisitions: opening the invoice file ─────────────
// PDF (text keeps its positions), Word (paragraphs and table cells laid out on a grid) or a
// photo / scan (nothing to read: the person types the values while looking at it).
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
const LINE = 14;
const COLUMN = 150;

/** The text of a paragraph, with tabs and line breaks kept */
function paragraphText(p: Element): string {
    let text = '';
    const walk = (el: Element) => {
        for (const child of Array.from(el.children)) {
            if (child.namespaceURI !== W) continue;
            if (child.localName === 't') text += child.textContent ?? '';
            else if (child.localName === 'tab') text += '\t';
            else if (child.localName === 'br' || child.localName === 'cr') text += '\n';
            else if (child.localName !== 'p' && child.localName !== 'txbxContent') walk(child);
        }
    };
    walk(p);
    return text;
}

/**
 * A Word invoice as positioned phrases: each paragraph is a line (tab-separated parts side
 * by side), each table row a band of lines with one column per cell. Enough for "value to
 * the right of / under its label" to work as on a PDF.
 */
export function docxPhrases(documentXml: string): Phrase[] {
    const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const phrases: Phrase[] = [];
    let y = 800;
    const add = (text: string, x: number, at: number) => {
        const t = text.replace(/\s+/g, ' ').trim();
        if (t) phrases.push({ page: 0, x, y: at, w: t.length * 5, h: 10, text: t });
    };
    const addParagraph = (p: Element, x: number, at: number): number => {
        let lines = 0;
        for (const line of paragraphText(p).split('\n')) {
            const parts = line.split(/\t+/);
            if (parts.every(part => !part.trim())) continue;
            parts.forEach((part, i) => add(part, x + i * COLUMN, at - lines * LINE));
            lines += 1;
        }
        return lines;
    };
    const visit = (el: Element) => {
        for (const child of Array.from(el.children)) {
            if (child.namespaceURI !== W) continue;
            if (child.localName === 'p') {
                y -= addParagraph(child, 0, y) * LINE;
            } else if (child.localName === 'tbl') {
                for (const row of Array.from(child.getElementsByTagNameNS(W, 'tr'))) {
                    let tallest = 0;
                    Array.from(row.children)
                        .filter(c => c.namespaceURI === W && c.localName === 'tc')
                        .forEach((cell, ci) => {
                            let lines = 0;
                            for (const p of Array.from(cell.getElementsByTagNameNS(W, 'p'))) lines += addParagraph(p, ci * COLUMN, y - lines * LINE);
                            tallest = Math.max(tallest, lines);
                        });
                    y -= Math.max(1, tallest) * LINE + 4;
                }
            } else if (child.localName === 'sdt' || child.localName === 'sdtContent') {
                visit(child);
            }
        }
    };
    if (body) visit(body);
    return phrases;
}

export async function readDocxInvoice(bytes: ArrayBuffer): Promise<Phrase[]> {
    const { PizZip } = await loadDocxLibs();
    const xml = new PizZip(bytes).file('word/document.xml')?.asText();
    if (!xml) throw new Error('This Word file has no document inside');
    return docxPhrases(xml);
}

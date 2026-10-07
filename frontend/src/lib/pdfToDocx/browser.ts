// ─── PDF → Word in the browser ─────────────────────────────────
// Opens the PDF with pdf.js, copies every page, finds the fields, and writes
// filled-in Word documents. Nothing is uploaded: the file never leaves the page.

import PizZip from 'pizzip';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractLayout, loadPdfJs, openPdf } from '../pdfForms/pdfjs';
import { guessTitle } from '../pdfForms/layout';
import { safeFileName } from '../pdfForms/plan';
import type { PdfLayout } from '../pdfForms/types';
import { convertPdf, type ConvertedPage } from './convert';
import { detectFields, type FieldDef, type FieldValues } from './fields';
import { filledDocx } from './fill';
import { imageToPng } from './images';
import type { DocxOptions } from './docx';

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface ConvertedForm {
    fileName: string;
    /** The form's printed title, else the file name */
    title: string;
    doc: PDFDocumentProxy;
    layout: PdfLayout;
    pages: ConvertedPage[];
    fields: FieldDef[];
}

/** Read a PDF and get it ready to fill in. `onProgress` gets pages done / total. */
export async function convertForm(bytes: Uint8Array, fileName: string, onProgress?: (done: number, total: number) => void): Promise<ConvertedForm> {
    const pdfjs = await loadPdfJs();
    const doc = await openPdf(bytes);
    try {
        const layout = await extractLayout(doc);
        const pages = await convertPdf(doc, pdfjs, imageToPng, onProgress);
        const fields = detectFields({
            layout,
            boxes: pages.flatMap(p => p.boxes),
            shapes: pages.map(p => p.base.shapes),
            images: pages.map(p => p.base.pictures.map(pic => pic.placement)),
        });
        const title = guessTitle(layout) || fileName.replace(/\.pdf$/i, '');
        return { fileName, title, doc, layout, pages, fields };
    } catch (err) {
        void doc.loadingTask.destroy();
        throw err;
    }
}

/** The form with these values, as a Word file */
export function formDocx(form: Pick<ConvertedForm, 'pages' | 'title'>, fields: FieldDef[], values: FieldValues, opts: DocxOptions = {}): Blob {
    const bytes = filledDocx(form.pages, fields, values, { title: form.title, ...opts });
    return new Blob([bytes as BlobPart], { type: DOCX_TYPE });
}

/** "Siobhán O'Brien - SICAP Individual Registration Form.docx" */
export function docxFileName(title: string, person?: string): string {
    const base = safeFileName([person, title].filter(Boolean).join(' - ')) || 'Form';
    return `${base}.docx`;
}

/** One Word file per person, zipped. Yields between files so the page stays responsive. */
export async function formsZip(
    form: Pick<ConvertedForm, 'pages' | 'title'>,
    fields: FieldDef[],
    people: { name: string; values: FieldValues }[],
    opts: DocxOptions & { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<Blob> {
    const zip = new PizZip();
    const used = new Map<string, number>();
    for (let i = 0; i < people.length; i++) {
        if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const { name, values } = people[i];
        let file = docxFileName(form.title, name);
        const key = file.toLowerCase();
        const n = (used.get(key) ?? 0) + 1;
        used.set(key, n);
        if (n > 1) file = file.replace(/\.docx$/, ` (${n}).docx`);
        zip.file(file, filledDocx(form.pages, fields, values, { title: form.title, mark: opts.mark }));
        opts.onProgress?.(i + 1, people.length);
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    return zip.generate({ type: 'blob', compression: 'STORE' });
}

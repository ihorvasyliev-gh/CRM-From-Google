// ─── Certificates: the files to download ───
// Word: the template filled in, one file per person or everyone in one. PDF: each person's
// certificate drawn as page pictures (pages.ts), one PDF each or all pages in one.

import { fillTemplate, fillTemplateForAll, loadDocxLibs, safeFileName } from '../documentRender';
import { loadChunk } from '../deployRecovery';
import { drawDocxPages } from './pages';

/** One person's certificate: its values and the file name it goes by (no extension) */
export interface Certificate {
    data: Record<string, string>;
    fileBase: string;
}

export interface MadeFile {
    blob: Blob;
    fileName: string;
}

export type Progress = (done: number, total: number) => void;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Dots to the inch of the pages in a PDF: sharp in print, not too heavy for email */
export const PDF_DPI = 200;

/** "Manual Handling cert" from "Manual Handling cert.docx" */
export function templateBase(fileName: string): string {
    return fileName.replace(/\.docx$/i, '').trim() || 'Certificates';
}

async function zipFiles(files: { name: string; bytes: ArrayBuffer | Uint8Array }[]): Promise<Blob> {
    const { PizZip } = await loadDocxLibs();
    const zip = new PizZip();
    // The files are compressed already: the archive only stores them
    for (const f of files) zip.file(f.name, f.bytes);
    return new Blob([zip.generate({ type: 'arraybuffer' })], { type: 'application/zip' });
}

/** One file as it is, or several in a ZIP named after the template */
async function oneOrZip(files: { name: string; bytes: ArrayBuffer | Uint8Array }[], type: string, zipName: string): Promise<MadeFile> {
    if (files.length === 1) return { blob: new Blob([files[0].bytes as BlobPart], { type }), fileName: files[0].name };
    return { blob: await zipFiles(files), fileName: `${zipName}.zip` };
}

/** The Word certificates: everyone in one file, or a file each */
export async function makeWord(template: ArrayBuffer, templateName: string, people: Certificate[], allInOne: boolean, onProgress?: Progress): Promise<MadeFile> {
    const base = safeFileName(templateBase(templateName), 'Certificates').replace(/_/g, ' ');
    if (allInOne && people.length > 1) {
        const bytes = await fillTemplateForAll(template, people.map(p => p.data));
        onProgress?.(people.length, people.length);
        return { blob: new Blob([bytes], { type: DOCX }), fileName: `${base} - all.docx` };
    }
    const files = [];
    for (const [i, person] of people.entries()) {
        files.push({ name: `${person.fileBase}.docx`, bytes: await fillTemplate(template, person.data) });
        onProgress?.(i + 1, people.length);
    }
    return oneOrZip(files, DOCX, base);
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) reject(new Error('The page could not be drawn'));
            else blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), reject);
        }, 'image/jpeg', 0.92);
    });
}

/** The PDF certificates: all pages in one file, or a file each */
export async function makePdf(template: ArrayBuffer, templateName: string, people: Certificate[], allInOne: boolean, onProgress?: Progress): Promise<MadeFile> {
    const lib = await loadChunk(() => import('pdf-lib'));
    const base = safeFileName(templateBase(templateName), 'Certificates').replace(/_/g, ' ');
    const together = allInOne && people.length > 1 ? await lib.PDFDocument.create() : null;
    const files: { name: string; bytes: Uint8Array }[] = [];
    for (const [i, person] of people.entries()) {
        const pdf = together ?? (await lib.PDFDocument.create());
        const pages = await drawDocxPages(await fillTemplate(template, person.data), PDF_DPI);
        for (const page of pages) {
            const image = await pdf.embedJpg(await canvasJpeg(page.canvas));
            pdf.addPage([page.width, page.height]).drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
            // Let go of the picture: a big group would hold every page in memory
            page.canvas.width = page.canvas.height = 0;
        }
        if (!together) {
            pdf.setTitle(person.fileBase.replace(/_/g, ' '));
            files.push({ name: `${person.fileBase}.pdf`, bytes: await pdf.save() });
        }
        onProgress?.(i + 1, people.length);
    }
    if (together) {
        together.setTitle(base);
        return { blob: new Blob([(await together.save()) as BlobPart], { type: 'application/pdf' }), fileName: `${base} - all.pdf` };
    }
    return oneOrZip(files, 'application/pdf', base);
}

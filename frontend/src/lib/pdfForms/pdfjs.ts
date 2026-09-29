// ─── pdf.js: page rendering and layout extraction ──────────────
// Loaded on demand so the viewer stays out of the main bundle. The "legacy" build is
// used on purpose: the modern one relies on very new JS (e.g. Math.sumPrecise) that
// staff browsers a version or two behind don't have yet.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { buildLayout, type RawRect, type RawTextItem } from './layout';
import type { PdfLayout } from './types';
import { loadChunk } from '../deployRecovery';

type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
    pdfjsPromise ??= loadChunk(() => Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJs>, import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]))
        .then(([lib, worker]) => {
            lib.GlobalWorkerOptions.workerSrc = worker.default;
            return lib;
        })
        .catch(err => {
            pdfjsPromise = null; // let the next attempt retry a failed chunk download
            throw err;
        });
    return pdfjsPromise;
}

export async function openPdf(bytes: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
    const pdfjs = await loadPdfJs();
    // pdf.js takes ownership of (detaches) the buffer it is given, so pass a copy
    const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
    return pdfjs.getDocument({ data }).promise;
}

type Matrix = [number, number, number, number, number, number];

function multiply(m: Matrix, n: Matrix): Matrix {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
    ];
}

function applyToBox(m: Matrix, minX: number, minY: number, maxX: number, maxY: number) {
    const pts = [
        [minX, minY],
        [maxX, minY],
        [minX, maxY],
        [maxX, maxY],
    ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Bounding boxes of painted (filled or stroked) paths: table borders and shaded cells */
async function pageRects(pdfjs: PdfJs, page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>, pageIndex: number): Promise<RawRect[]> {
    const { OPS } = pdfjs;
    const ops = await page.getOperatorList();
    const rects: RawRect[] = [];
    const stack: Matrix[] = [];
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i] as unknown[];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
        else if (fn === OPS.transform) ctm = multiply(ctm, args as Matrix);
        else if (fn === OPS.constructPath) {
            const [paintOp, , minMax] = args as [number, unknown, ArrayLike<number> | null];
            if (paintOp === OPS.endPath || !minMax || minMax.length < 4) continue; // clip paths paint nothing
            const box = applyToBox(ctm, minMax[0], minMax[1], minMax[2], minMax[3]);
            const stroke = paintOp === OPS.stroke || paintOp === OPS.closeStroke;
            if ([box.x, box.y, box.w, box.h].every(Number.isFinite)) rects.push({ page: pageIndex, ...box, stroke });
        }
    }
    return rects;
}

export async function extractLayout(doc: PDFDocumentProxy): Promise<PdfLayout> {
    return layoutFromDoc(await loadPdfJs(), doc);
}

export async function layoutFromDoc(pdfjs: PdfJs, doc: PDFDocumentProxy): Promise<PdfLayout> {
    const pages: { w: number; h: number }[] = [];
    const items: RawTextItem[] = [];
    const rects: RawRect[] = [];
    for (let p = 0; p < doc.numPages; p++) {
        const page = await doc.getPage(p + 1);
        const [x0, y0, x1, y1] = page.view;
        pages.push({ w: x1 - x0, h: y1 - y0 });
        const content = await page.getTextContent();
        for (const item of content.items) {
            if (!('str' in item) || !item.str) continue;
            const t = item.transform as number[];
            items.push({ page: p, str: item.str, x: t[4] - x0, y: t[5] - y0, w: item.width, h: Math.hypot(t[2], t[3]) || item.height });
        }
        for (const r of await pageRects(pdfjs, page, p)) rects.push({ ...r, x: r.x - x0, y: r.y - y0 });
        page.cleanup();
    }
    return buildLayout(pages, items, rects);
}

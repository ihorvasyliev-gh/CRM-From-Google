// ─── Cheque requisitions: reading scans and photos (OCR) ───────
// Tesseract (WebAssembly) reads the picture in a worker in the browser, so nothing is
// uploaded. Its words become text items with positions, as pdf.js gives them for a PDF with
// text, and the invoice is then read the same way.

import { buildLayout, type RawTextItem } from '../pdfForms/layout';
import type { Phrase, Rect } from '../pdfForms/types';
import { loadChunk } from '../deployRecovery';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/** The parts of Tesseract's result that are used (its "blocks" output) */
export interface OcrBlock {
    paragraphs: {
        lines: {
            baseline: Box;
            rowAttributes: { rowHeight: number };
            words: { text: string; confidence: number; bbox: Box }[];
        }[];
    }[];
}

/** One picture to read: a page of a scanned PDF or a photo, `scale` pixels to one unit of the page */
export interface OcrPage {
    canvas: HTMLCanvasElement;
    scale: number;
}

const ASCENDER = /[A-Z0-9bdfhklt!?#%&/()[\]{}|]/;
const DESCENDER = /[gjpqy,;()[\]{}|]/;
/** Marks the reader makes of table rules, stamps and specks */
const NOISE = /^[\s|_—–\-=~.,:;'"`^*•°]+$/;

function median(values: number[]): number {
    if (!values.length) return 0;
    const s = [...values].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

/** Font size (px) a word's box suggests: capitals and ascenders reach ~0.72 em, descenders go ~0.21 em below */
function wordSize(text: string, height: number): number {
    const reach = (ASCENDER.test(text) ? 0.72 : 0.5) + (DESCENDER.test(text) ? 0.21 : 0);
    return height / reach;
}

/** How far (radians, clockwise) the text of a picture is off level: the usual slope of its lines */
export function pageAngle(blocks: OcrBlock[]): number {
    const lines = blocks.flatMap(b => b.paragraphs.flatMap(p => p.lines));
    return median(lines.filter(l => l.baseline.x1 - l.baseline.x0 > 100).map(l => Math.atan2(l.baseline.y1 - l.baseline.y0, l.baseline.x1 - l.baseline.x0)));
}

/**
 * Words of a page read by Tesseract → text items in page units, with y going up from the
 * bottom as pdf.js gives them. A photo taken at a slight angle is turned level first (by
 * the slope of its text lines, about the middle of the page), so each line of the invoice
 * stays one line; `unlevelRect` turns a place back onto the picture.
 */
export function ocrItems(blocks: OcrBlock[], page: number, scale: number, size: { w: number; h: number }): RawTextItem[] {
    const lines = blocks.flatMap(b => b.paragraphs.flatMap(p => p.lines));
    const angle = pageAngle(blocks);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Rotate by -angle about the middle: text lines become level
    const cx = (size.w * scale) / 2;
    const cy = (size.h * scale) / 2;
    const level = (x: number, y: number) => ({ x: cx + (x - cx) * cos + (y - cy) * sin, y: cy - (x - cx) * sin + (y - cy) * cos });

    const items: RawTextItem[] = [];
    for (const line of lines) {
        const words = line.words.filter(w => w.text.trim() && !(NOISE.test(w.text) && w.confidence < 60) && w.confidence >= 15);
        if (!words.length) continue;
        const { baseline } = line;
        const slope = baseline.x1 !== baseline.x0 ? (baseline.y1 - baseline.y0) / (baseline.x1 - baseline.x0) : 0;
        // Words of the line's usual size take its median size; headings keep their own
        const sizes = words.map(w => wordSize(w.text, w.bbox.y1 - w.bbox.y0));
        const usual = median(sizes) || line.rowAttributes.rowHeight;
        for (const [i, w] of words.entries()) {
            const fontSize = Math.abs(sizes[i] - usual) <= usual * 0.3 ? usual : sizes[i];
            // A word much bigger than the line (a heading beside small print) sits on its own bottom
            const onLine = baseline.y0 + slope * (w.bbox.x0 - baseline.x0);
            const own = w.bbox.y1 - (DESCENDER.test(w.text) ? 0.21 * fontSize : 0);
            const start = level(w.bbox.x0, fontSize > usual * 1.3 ? own : onLine);
            items.push({
                page,
                str: w.text,
                x: start.x / scale,
                y: size.h - start.y / scale,
                w: (w.bbox.x1 - w.bbox.x0) / cos / scale,
                h: fontSize / scale,
            });
        }
    }
    return items;
}

/** A place on a levelled page (see `ocrItems`) → where it shows on the picture, which is `angle` off level */
export function unlevelRect(r: Rect, angle: number, size: { w: number; h: number }): Rect {
    if (!angle) return r;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = size.w / 2;
    const cy = size.h / 2;
    // Corners with y going down the picture, turned back by the angle
    const corners = [
        [r.x, size.h - r.y - r.h],
        [r.x + r.w, size.h - r.y - r.h],
        [r.x, size.h - r.y],
        [r.x + r.w, size.h - r.y],
    ].map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]);
    const xs = corners.map(c => c[0]);
    const ys = corners.map(c => c[1]);
    return { page: r.page, x: Math.min(...xs), y: size.h - Math.max(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** The words of OCR'd pages as phrases, as for a PDF with text */
export function ocrPhrases(pages: { w: number; h: number }[], items: RawTextItem[]): Phrase[] {
    return buildLayout(pages, items, []).phrases;
}

// ─── Running Tesseract in the browser ──────────────────────────

/** A WebAssembly module using a SIMD instruction: validates only where SIMD is supported */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

function hasSimd(): boolean {
    try {
        return WebAssembly.validate(SIMD_PROBE);
    } catch {
        return false;
    }
}

/**
 * Read pictures of an invoice; `onProgress` gets 0…1 over all of them. Everything Tesseract
 * needs ships with the app (its worker, the WebAssembly core and the English model), so it
 * works under the site's content security policy, which allows no other hosts (it does allow
 * WebAssembly: 'wasm-unsafe-eval').
 */
export async function readScan(pages: OcrPage[], onProgress?: (done: number) => void): Promise<ScanText> {
    // A reader that fails inside its worker may never answer: give up rather than wait forever
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tooLong = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('reading took too long')), READ_TIMEOUT + pages.length * PAGE_TIMEOUT);
    });
    try {
        return await Promise.race([read(pages, onProgress), tooLong]);
    } finally {
        clearTimeout(timer);
    }
}

/** What was read off the pictures: text items, each page's size and how far it is off level */
export interface ScanText {
    items: RawTextItem[];
    pageSizes: { w: number; h: number }[];
    angles: number[];
}

/** Time allowed to load the reader, and to read each page */
const READ_TIMEOUT = 60_000;
const PAGE_TIMEOUT = 60_000;

async function read(pages: OcrPage[], onProgress?: (done: number) => void): Promise<ScanText> {
    const [{ default: tesseract }, workerUrl, simdCoreUrl, coreUrl, englishUrl] = await loadChunk(() =>
        Promise.all([
            import('tesseract.js'),
            import('tesseract.js/dist/worker.min.js?url'),
            import('tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'),
            import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
            import('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url'),
        ]),
    );
    // Tesseract fetches its model by name from a folder: the build keeps this one's name (vite.config.ts)
    const englishDir = englishUrl.default.slice(0, englishUrl.default.lastIndexOf('/'));

    let current = 0;
    const worker = await tesseract.createWorker('eng', tesseract.OEM.LSTM_ONLY, {
        workerPath: workerUrl.default,
        corePath: hasSimd() ? simdCoreUrl.default : coreUrl.default,
        langPath: englishDir,
        workerBlobURL: false,
        // The browser's HTTP cache keeps the model; Tesseract's own cache would never notice a new one
        cacheMethod: 'none',
        logger: m => {
            if (m.status === 'recognizing text') onProgress?.((current + m.progress) / pages.length);
        },
        errorHandler: err => console.error('Text reader:', err),
    });
    try {
        // Find the page's own blocks (columns, address boxes) and keep the gaps between them;
        // the pictures have even lighting by now, so one threshold suits the whole page
        await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.AUTO, preserve_interword_spaces: '1', thresholding_method: '0' } as Record<string, string>);
        const result: ScanText = { items: [], pageSizes: [], angles: [] };
        for (const [i, { canvas, scale }] of pages.entries()) {
            current = i;
            const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
            const blocks = (data.blocks ?? []) as unknown as OcrBlock[];
            const size = { w: canvas.width / scale, h: canvas.height / scale };
            result.pageSizes.push(size);
            result.angles.push(pageAngle(blocks));
            result.items.push(...ocrItems(blocks, i, scale, size));
            onProgress?.((i + 1) / pages.length);
        }
        return result;
    } finally {
        void worker.terminate();
    }
}

/** Longest side, in pixels, a page is read at: about 260 dpi for an A4 page */
const READ_SIDE = 3000;
/** Small pictures are enlarged up to this much, so their letters are tall enough to read */
const MAX_ENLARGE = 2;
/** Side, in pixels, of the squares the paper's brightness is measured over */
const LIGHT_CELL = 24;

/**
 * Grey levels with the lighting evened out: each pixel is divided by the brightness of the
 * paper around it (a shadow across a photo, a yellowed scan), then the contrast is stretched
 * so the ink is black. Returns the new grey levels.
 */
export function evenLighting(grey: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    // Paper brightness on a coarse grid: the mean of each cell, then the brightest of each 3×3
    // (so text doesn't darken it) and a light blur
    const cw = Math.max(1, Math.ceil(width / LIGHT_CELL));
    const ch = Math.max(1, Math.ceil(height / LIGHT_CELL));
    const mean = new Float32Array(cw * ch);
    const count = new Float32Array(cw * ch);
    for (let y = 0; y < height; y++) {
        const row = Math.floor(y / LIGHT_CELL) * cw;
        for (let x = 0; x < width; x++) {
            const c = row + Math.floor(x / LIGHT_CELL);
            mean[c] += grey[y * width + x];
            count[c]++;
        }
    }
    for (let c = 0; c < mean.length; c++) mean[c] /= count[c] || 1;
    const around = (src: Float32Array, pick: (values: number[]) => number) => {
        const out = new Float32Array(src.length);
        for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
                const values: number[] = [];
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const yy = y + dy;
                    const xx = x + dx;
                    if (yy >= 0 && yy < ch && xx >= 0 && xx < cw) values.push(src[yy * cw + xx]);
                }
                out[y * cw + x] = pick(values);
            }
        }
        return out;
    };
    const paper = around(around(mean, v => Math.max(...v)), v => v.reduce((a, b) => a + b, 0) / v.length);

    // Divide by the paper (interpolated between cell centres), and count the result's levels
    const flat = new Uint8ClampedArray(grey.length);
    const histogram = new Uint32Array(256);
    for (let y = 0; y < height; y++) {
        const gy = Math.min(Math.max((y + 0.5) / LIGHT_CELL - 0.5, 0), ch - 1);
        const y0 = Math.floor(gy);
        const y1 = Math.min(y0 + 1, ch - 1);
        const fy = gy - y0;
        for (let x = 0; x < width; x++) {
            const gx = Math.min(Math.max((x + 0.5) / LIGHT_CELL - 0.5, 0), cw - 1);
            const x0 = Math.floor(gx);
            const x1 = Math.min(x0 + 1, cw - 1);
            const fx = gx - x0;
            const top = paper[y0 * cw + x0] * (1 - fx) + paper[y0 * cw + x1] * fx;
            const bottom = paper[y1 * cw + x0] * (1 - fx) + paper[y1 * cw + x1] * fx;
            const v = (grey[y * width + x] / Math.max(1, top * (1 - fy) + bottom * fy)) * 255;
            flat[y * width + x] = v;
            histogram[flat[y * width + x]]++;
        }
    }
    // Stretch: the darkest 1% becomes black, near-white paper becomes white
    let dark = 0;
    for (let seen = 0; dark < 255 && seen + histogram[dark] < grey.length * 0.01; dark++) seen += histogram[dark];
    const span = Math.max(1, 235 - dark);
    for (let i = 0; i < flat.length; i++) flat[i] = ((flat[i] - dark) / span) * 255;
    return flat;
}

/** Turn a drawn page grey, with even lighting, ready for reading */
function prepare(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This browser cannot draw the picture');
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = image.data;
    const grey = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < grey.length; i++) grey[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    const even = evenLighting(grey, canvas.width, canvas.height);
    for (let i = 0; i < even.length; i++) {
        px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = even[i];
        px[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
}

function blankCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This browser cannot draw the picture');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    return { canvas, ctx };
}

/** A photo of an invoice, drawn for reading; its page units are the photo's own pixels */
export async function photoPage(file: Blob): Promise<OcrPage & { width: number; height: number }> {
    // Phone photos come the right way up (browsers apply their EXIF orientation, as <img> does)
    const bitmap = await createImageBitmap(file);
    try {
        const scale = Math.min(READ_SIDE / Math.max(bitmap.width, bitmap.height), MAX_ENLARGE);
        const { canvas, ctx } = blankCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        prepare(canvas);
        return { canvas, scale, width: bitmap.width, height: bitmap.height };
    } finally {
        bitmap.close();
    }
}

/** Pages of a scanned PDF drawn for reading; page units stay PDF points */
export async function scannedPdfPages(doc: PDFDocumentProxy, maxPages = 4): Promise<OcrPage[]> {
    const pages: OcrPage[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const scale = READ_SIDE / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });
        const { canvas, ctx } = blankCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        page.cleanup();
        prepare(canvas);
        pages.push({ canvas, scale });
    }
    return pages;
}

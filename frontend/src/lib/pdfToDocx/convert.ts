// ─── A PDF, page by page, ready to be written as Word ──────────
// Reads every page (text, shapes, images), turns characters into lines and the
// PDF's checkbox characters into drawn squares, and keeps where each checkbox is
// so it can become a check box control.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { boxRect, isBox } from '../pdfForms/layout';
import type { DocxPageIn, PictureOut } from './docx';
import { extractPageGraphics } from './extract';
import { pageImage, type DecodedImage } from './images';
import { buildLines, type Divider } from './lines';
import type { Box, Glyph, PageGraphics, Segment, VectorShape } from './types';

export interface PrintedBox {
    page: number;
    rect: Box;
}

export interface ConvertedPage {
    index: number;
    w: number;
    h: number;
    /** Everything copied from the PDF (fields are added when writing) */
    base: Omit<DocxPageIn, 'fields'>;
    /** Checkbox characters found on the page, now drawn as squares */
    boxes: PrintedBox[];
}

export type PngEncoder = (img: DecodedImage) => Promise<Uint8Array | null>;

/** Rules and cell edges: text on either side of one is not the same line */
export function dividersOf(shapes: VectorShape[]): Divider[] {
    const out: Divider[] = [];
    for (const s of shapes) {
        const { x, y, w, h } = s.box;
        if (h < 4) continue;
        if (w <= 2) out.push({ x: x + w / 2, y0: y, y1: y + h });
        else if (s.isRect && w < 400) out.push({ x, y0: y, y1: y + h }, { x: x + w, y0: y, y1: y + h });
    }
    return out;
}

/**
 * The square a checkbox character draws, as a thin filled frame in the text's colour
 * (a frame, not an outline, so it is drawn as finely as the original character)
 */
function boxShape(g: Glyph, page: number): { shape: VectorShape; rect: Box } {
    const r = boxRect(g.ch, page, g.x, g.y, g.size);
    const t = Math.max(0.25, g.size * 0.018);
    const ring = (x: number, y: number, w: number, h: number, clockwise: boolean): Segment[] => {
        const pts = [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
        ];
        if (clockwise) pts.reverse();
        return [{ op: 'M', x: pts[0][0], y: pts[0][1] }, ...pts.slice(1).map(([px, py]): Segment => ({ op: 'L', x: px, y: py })), { op: 'Z' }];
    };
    return {
        rect: { x: r.x, y: r.y, w: r.w, h: r.h },
        shape: {
            z: g.z,
            segments: [...ring(r.x, r.y, r.w, r.h, false), ...ring(r.x + t, r.y + t, r.w - 2 * t, r.h - 2 * t, true)],
            box: { x: r.x, y: r.y, w: r.w, h: r.h },
            fill: { color: g.color, alpha: g.alpha },
            stroke: null,
            isRect: false,
        },
    };
}

/** Lines, shapes and checkbox squares for one page's graphics (no images) */
export function layoutPage(g: PageGraphics): { lines: DocxPageIn['lines']; shapes: VectorShape[]; boxes: PrintedBox[] } {
    const boxGlyphs = g.glyphs.filter(gl => isBox(gl.ch) && gl.angle === 0);
    const drawn = boxGlyphs.map(gl => boxShape(gl, g.index));
    const lines = buildLines(g.glyphs, g.index, dividersOf(g.shapes), gl => isBox(gl.ch) && gl.angle === 0);
    return {
        lines,
        shapes: [...g.shapes, ...drawn.map(d => d.shape)].sort((a, b) => a.z - b.z),
        boxes: drawn.map(d => ({ page: g.index, rect: d.rect })),
    };
}

/** Read every page of an open PDF. `encodePng` turns pdf.js's decoded images into PNG files. */
export async function convertPdf(doc: PDFDocumentProxy, pdfjs: { OPS: object }, encodePng: PngEncoder, onProgress?: (done: number, total: number) => void): Promise<ConvertedPage[]> {
    const pages: ConvertedPage[] = [];
    const pngCache = new Map<string, Uint8Array | null>();
    for (let p = 0; p < doc.numPages; p++) {
        const page = await doc.getPage(p + 1);
        const graphics = await extractPageGraphics(pdfjs, page, p);
        const pictures: PictureOut[] = [];
        for (const placement of graphics.images) {
            let png: Uint8Array | null;
            if ('objId' in placement.source) {
                const id = placement.source.objId;
                if (!pngCache.has(id)) {
                    const objs = id.startsWith('g_') ? page.commonObjs : page.objs;
                    const img = await pageImage(objs as never, id);
                    pngCache.set(id, img ? await encodePng(img) : null);
                }
                png = pngCache.get(id) ?? null;
            } else {
                png = await encodePng(placement.source.inline as DecodedImage);
            }
            if (png) pictures.push({ placement, png });
        }
        const { lines, shapes, boxes } = layoutPage(graphics);
        pages.push({ index: p, w: graphics.w, h: graphics.h, base: { w: graphics.w, h: graphics.h, lines, shapes, pictures }, boxes });
        page.cleanup();
        onProgress?.(p + 1, doc.numPages);
    }
    return pages;
}

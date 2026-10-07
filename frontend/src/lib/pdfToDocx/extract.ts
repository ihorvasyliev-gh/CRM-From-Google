// ─── Reading everything a PDF page paints ──────────────────────
// Walks pdf.js's operator list the way its canvas renderer does, but instead of
// drawing it records each character (position, font, colour), each filled or
// stroked path and each image, in paint order. Pure: pdf.js is passed in.

import { parseFontName } from './fonts';
import type { Box, FontFace, ImagePlacement, Paint, PageGraphics, Segment, VectorShape } from './types';

export type Matrix = [number, number, number, number, number, number];

/** The pieces of pdf.js's OPS table this reader needs */
export type OpCodes = Record<string, number>;

export interface OperatorList {
    fnArray: ArrayLike<number>;
    argsArray: ArrayLike<unknown>;
}

/** What pdf.js knows about a loaded font (page.commonObjs.get(name)) */
export interface FontObject {
    name?: string;
    bold?: boolean;
    italic?: boolean;
    black?: boolean;
    ascent?: number;
    descent?: number;
    fontMatrix?: number[];
    vertical?: boolean;
    isType3Font?: boolean;
}

interface PdfGlyph {
    unicode: string;
    width: number;
    isSpace?: boolean;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const FONT_MATRIX = [0.001, 0, 0, 0.001, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
    ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function boxOfPoints(xs: number[], ys: number[]): Box {
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function intersect(a: Box, b: Box): Box | null {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const r = Math.min(a.x + a.w, b.x + b.w);
    const t = Math.min(a.y + a.h, b.y + b.h);
    return r > x && t > y ? { x, y, w: r - x, h: t - y } : null;
}

function hex(value: unknown, fallback: string): string {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1).toUpperCase() : fallback;
}

interface State {
    ctm: Matrix;
    fill: string | null;
    stroke: string | null;
    fillAlpha: number;
    strokeAlpha: number;
    lineWidth: number;
    clip: Box | null;
    font: FontFace | null;
    fontObj: FontObject | null;
    fontSize: number;
    fontDirection: number;
    charSpacing: number;
    wordSpacing: number;
    hScale: number;
    leading: number;
    rise: number;
    renderMode: number;
}

/** Turn pdf.js's flat path data (DrawOPS: 0 move, 1 line, 2 curve, 3 quadratic, 4 close) into page segments */
function pathSegments(data: ArrayLike<number> | null | undefined, ctm: Matrix): Segment[] {
    const out: Segment[] = [];
    if (!data) return out;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < data.length; ) {
        const op = data[i++];
        if (op === 0 || op === 1) {
            cx = data[i++];
            cy = data[i++];
            const [x, y] = apply(ctm, cx, cy);
            out.push({ op: op === 0 ? 'M' : 'L', x, y });
        } else if (op === 2) {
            const [x1, y1] = apply(ctm, data[i++], data[i++]);
            const [x2, y2] = apply(ctm, data[i++], data[i++]);
            cx = data[i++];
            cy = data[i++];
            const [x, y] = apply(ctm, cx, cy);
            out.push({ op: 'C', x1, y1, x2, y2, x, y });
        } else if (op === 3) {
            // Quadratic → cubic
            const qx = data[i++];
            const qy = data[i++];
            const ex = data[i++];
            const ey = data[i++];
            const [x1, y1] = apply(ctm, cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy));
            const [x2, y2] = apply(ctm, ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey));
            cx = ex;
            cy = ey;
            const [x, y] = apply(ctm, ex, ey);
            out.push({ op: 'C', x1, y1, x2, y2, x, y });
        } else if (op === 4) {
            out.push({ op: 'Z' });
        } else {
            break; // unknown data: stop rather than misread the rest
        }
    }
    return out;
}

function segmentsBox(segments: Segment[]): Box | null {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of segments) {
        if (s.op === 'Z') continue;
        xs.push(s.x);
        ys.push(s.y);
        if (s.op === 'C') {
            xs.push(s.x1, s.x2);
            ys.push(s.y1, s.y2);
        }
    }
    if (xs.length === 0) return null;
    const b = boxOfPoints(xs, ys);
    return [b.x, b.y, b.w, b.h].every(Number.isFinite) ? b : null;
}

/** One closed axis-aligned rectangle (4 corners, maybe a repeated first corner) */
function isAxisRect(segments: Segment[], box: Box): boolean {
    const pts = segments.filter((s): s is Extract<Segment, { op: 'M' | 'L' }> => s.op === 'M' || s.op === 'L');
    if (pts.length !== segments.filter(s => s.op !== 'Z').length) return false; // has curves
    if (pts.length < 4 || pts.length > 5 || pts.slice(1).some(p => p.op === 'M')) return false;
    const tol = 0.05;
    const onEdgeX = (x: number) => Math.abs(x - box.x) < tol || Math.abs(x - (box.x + box.w)) < tol;
    const onEdgeY = (y: number) => Math.abs(y - box.y) < tol || Math.abs(y - (box.y + box.h)) < tol;
    if (!pts.every(p => onEdgeX(p.x) && onEdgeY(p.y))) return false;
    // Consecutive corners share an x or a y (no diagonals)
    for (let i = 1; i < pts.length; i++) {
        if (Math.abs(pts[i].x - pts[i - 1].x) > tol && Math.abs(pts[i].y - pts[i - 1].y) > tol) return false;
    }
    return true;
}

const PAINT_OPS = ['fill', 'eoFill', 'stroke', 'closeStroke', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke'];

/**
 * Read one page's operator list.
 * `fontFor` returns pdf.js's font object for a font reference (page.commonObjs.get).
 * `view` is the page's [x0, y0, x1, y1]; coordinates come back relative to its corner.
 */
export function readOperators(
    ops: OperatorList,
    OPS: OpCodes,
    fontFor: (ref: string) => FontObject | null,
    pageIndex: number,
    view: [number, number, number, number],
): PageGraphics {
    const [vx0, vy0, vx1, vy1] = view;
    const page: PageGraphics = { index: pageIndex, w: vx1 - vx0, h: vy1 - vy0, glyphs: [], shapes: [], images: [] };
    const base: Matrix = [1, 0, 0, 1, -vx0, -vy0];
    const fontCache = new Map<string, FontFace>();
    const paintNames = new Map(PAINT_OPS.map(p => [OPS[p], p]));

    let st: State = {
        ctm: base,
        fill: '000000',
        stroke: '000000',
        fillAlpha: 1,
        strokeAlpha: 1,
        lineWidth: 1,
        clip: null,
        font: null,
        fontObj: null,
        fontSize: 0,
        fontDirection: 1,
        charSpacing: 0,
        wordSpacing: 0,
        hScale: 1,
        leading: 0,
        rise: 0,
        renderMode: 0,
    };
    const stack: State[] = [];
    let textMatrix: Matrix = IDENTITY;
    let lineMatrix: Matrix = IDENTITY;
    let pendingClip = false;
    let z = 0;

    const setFont = (ref: string, size: number) => {
        const obj = fontFor(ref);
        st.fontObj = obj;
        st.fontDirection = size < 0 ? -1 : 1;
        st.fontSize = Math.abs(size);
        if (!obj) {
            st.font = null;
            return;
        }
        let face = fontCache.get(ref);
        if (!face) {
            const parsed = parseFontName(obj.name ?? '', { bold: obj.bold || obj.black, italic: obj.italic });
            face = { ...parsed, ascent: obj.ascent ?? 0.9, descent: obj.descent ?? -0.2 };
            fontCache.set(ref, face);
        }
        st.font = face;
    };

    const moveText = (x: number, y: number) => {
        lineMatrix = multiply(lineMatrix, [1, 0, 0, 1, x, y]);
        textMatrix = lineMatrix;
    };

    const showText = (glyphs: unknown) => {
        if (!Array.isArray(glyphs) || !st.font || st.fontSize === 0) return;
        const fontObj = st.fontObj;
        const fm = fontObj?.fontMatrix ?? FONT_MATRIX;
        const size = st.fontSize;
        const vertical = !!fontObj?.vertical;
        const invisible = (st.renderMode & 3) === 3;
        // Text space → page: the CTM after the text matrix
        const m = multiply(st.ctm, textMatrix);
        const sx = Math.hypot(m[0], m[1]);
        const sy = Math.hypot(m[2], m[3]);
        const angle = Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI);
        let x = 0;
        for (const g of glyphs as (PdfGlyph | number | null)[]) {
            if (typeof g === 'number') {
                x += (-g * size) / 1000;
                continue;
            }
            if (!g) continue;
            const spacing = (g.isSpace ? st.wordSpacing : 0) + st.charSpacing;
            const natural = g.width * size * fm[0];
            const advance = vertical ? natural : natural + spacing * st.fontDirection;
            if (!invisible && g.unicode && !vertical) {
                const [px, py] = apply(m, x * st.hScale, st.rise);
                page.glyphs.push({
                    ch: g.unicode,
                    x: px,
                    y: py,
                    adv: advance * st.hScale * sx,
                    em: g.width * fm[0],
                    size: size * sy,
                    font: st.font,
                    color: st.fill ?? '000000',
                    alpha: st.fillAlpha,
                    z,
                    angle,
                });
            }
            x += advance;
        }
        z++;
        textMatrix = multiply(textMatrix, [1, 0, 0, 1, x * st.hScale, 0]);
    };

    const paintPath = (paintOp: string | undefined, data: ArrayLike<number> | null | undefined) => {
        const segments = pathSegments(data, st.ctm);
        const box = segmentsBox(segments);
        if (pendingClip) {
            pendingClip = false;
            if (box) st.clip = st.clip ? intersect(st.clip, box) ?? { ...box, w: 0, h: 0 } : box;
        }
        if (!paintOp || !box) return;
        const fills = paintOp !== 'stroke' && paintOp !== 'closeStroke';
        const strokes = paintOp.toLowerCase().includes('stroke');
        const scale = Math.sqrt(Math.abs(st.ctm[0] * st.ctm[3] - st.ctm[1] * st.ctm[2])) || 1;
        const fill: Paint | null = fills && st.fill ? { color: st.fill, alpha: st.fillAlpha } : null;
        const stroke = strokes && st.stroke ? { color: st.stroke, alpha: st.strokeAlpha, width: Math.max(0.1, st.lineWidth * scale) } : null;
        if (!fill && !stroke) return;
        // Outside the clip: nothing shows
        if (st.clip && !intersect(st.clip, { x: box.x - 0.5, y: box.y - 0.5, w: box.w + 1, h: box.h + 1 })) return;
        const shape: VectorShape = { z: z++, segments, box, fill, stroke, isRect: isAxisRect(segments, box) };
        // A rectangle partly outside the clip is cut to it
        if (shape.isRect && st.clip && fill && !stroke) {
            const cut = intersect(st.clip, box);
            if (cut && (cut.w < box.w - 0.1 || cut.h < box.h - 0.1)) {
                shape.box = cut;
                shape.segments = [
                    { op: 'M', x: cut.x, y: cut.y },
                    { op: 'L', x: cut.x + cut.w, y: cut.y },
                    { op: 'L', x: cut.x + cut.w, y: cut.y + cut.h },
                    { op: 'L', x: cut.x, y: cut.y + cut.h },
                    { op: 'Z' },
                ];
            }
        }
        page.shapes.push(shape);
    };

    const placeImage = (source: ImagePlacement['source']) => {
        const m = st.ctm;
        const corners = [apply(m, 0, 0), apply(m, 1, 0), apply(m, 0, 1), apply(m, 1, 1)];
        const box = boxOfPoints(corners.map(c => c[0]), corners.map(c => c[1]));
        if (box.w < 0.5 || box.h < 0.5) return;
        const clip = st.clip ? intersect(st.clip, box) : null;
        if (st.clip && !clip) return;
        page.images.push({
            z: z++,
            source,
            box,
            // Images are drawn top-down into the unit square: a positive d means upright
            flipH: m[0] < 0,
            flipV: m[3] < 0,
            clip: clip && (clip.w < box.w - 0.5 || clip.h < box.h - 0.5) ? clip : null,
        });
    };

    for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = (ops.argsArray[i] ?? []) as unknown[];
        switch (fn) {
            case OPS.save:
                stack.push({ ...st });
                break;
            case OPS.restore:
                st = stack.pop() ?? st;
                break;
            case OPS.transform:
                st.ctm = multiply(st.ctm, args as Matrix);
                break;
            case OPS.paintFormXObjectBegin: {
                stack.push({ ...st });
                const [matrix, bbox] = args as [Matrix | null, number[] | null];
                if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) st.ctm = multiply(st.ctm, Array.from(matrix as ArrayLike<number>) as Matrix);
                if (bbox && bbox.length === 4) {
                    const pts = [apply(st.ctm, bbox[0], bbox[1]), apply(st.ctm, bbox[2], bbox[3]), apply(st.ctm, bbox[0], bbox[3]), apply(st.ctm, bbox[2], bbox[1])];
                    const b = boxOfPoints(pts.map(p => p[0]), pts.map(p => p[1]));
                    st.clip = st.clip ? intersect(st.clip, b) ?? { ...b, w: 0, h: 0 } : b;
                }
                break;
            }
            case OPS.paintFormXObjectEnd:
                st = stack.pop() ?? st;
                break;
            // A transparency group: its matrix only sizes pdf.js's scratch canvas, the form's own matrix places it
            case OPS.beginGroup:
                stack.push({ ...st });
                break;
            case OPS.endGroup:
                st = stack.pop() ?? st;
                break;
            case OPS.setLineWidth:
                st.lineWidth = Number(args[0]) || 0;
                break;
            case OPS.setGState:
                for (const [key, value] of (args[0] ?? []) as [string, unknown][]) {
                    if (key === 'ca') st.fillAlpha = Number(value);
                    else if (key === 'CA') st.strokeAlpha = Number(value);
                    else if (key === 'LW') st.lineWidth = Number(value);
                    else if (key === 'Font' && Array.isArray(value)) setFont(String(value[0]), Number(value[1]));
                }
                break;
            case OPS.setFillRGBColor:
                st.fill = hex(args[0], '000000');
                break;
            case OPS.setStrokeRGBColor:
                st.stroke = hex(args[0], '000000');
                break;
            case OPS.setFillColorN:
                // A pattern or shading: no flat colour to copy
                st.fill = typeof args[0] === 'string' && args[0].startsWith('#') ? hex(args[0], '000000') : null;
                break;
            case OPS.setStrokeColorN:
                st.stroke = typeof args[0] === 'string' && args[0].startsWith('#') ? hex(args[0], '000000') : null;
                break;
            case OPS.setFillTransparent:
                st.fill = null;
                break;
            case OPS.setStrokeTransparent:
                st.stroke = null;
                break;
            case OPS.clip:
            case OPS.eoClip:
                pendingClip = true;
                break;
            case OPS.constructPath: {
                const [op, data] = args as [number, ArrayLike<number>[] | null];
                paintPath(paintNames.get(op), Array.isArray(data) ? data[0] : null);
                break;
            }
            case OPS.endPath:
                pendingClip = false;
                break;
            case OPS.beginText:
                textMatrix = IDENTITY;
                lineMatrix = IDENTITY;
                break;
            case OPS.setFont:
                setFont(String(args[0]), Number(args[1]));
                break;
            case OPS.setCharSpacing:
                st.charSpacing = Number(args[0]) || 0;
                break;
            case OPS.setWordSpacing:
                st.wordSpacing = Number(args[0]) || 0;
                break;
            case OPS.setHScale:
                st.hScale = (Number(args[0]) || 100) / 100;
                break;
            case OPS.setLeading:
                st.leading = -(Number(args[0]) || 0);
                break;
            case OPS.setTextRise:
                st.rise = Number(args[0]) || 0;
                break;
            case OPS.setTextRenderingMode:
                st.renderMode = Number(args[0]) || 0;
                break;
            case OPS.setTextMatrix: {
                const m = args[0] as ArrayLike<number> | number;
                const arr = typeof m === 'number' ? (args as number[]) : Array.from(m);
                textMatrix = lineMatrix = arr.slice(0, 6) as Matrix;
                break;
            }
            case OPS.moveText:
                moveText(Number(args[0]), Number(args[1]));
                break;
            case OPS.setLeadingMoveText:
                st.leading = Number(args[1]);
                moveText(Number(args[0]), Number(args[1]));
                break;
            case OPS.nextLine:
                moveText(0, st.leading);
                break;
            case OPS.showText:
            case OPS.showSpacedText:
                showText(args[0]);
                break;
            case OPS.nextLineShowText:
                moveText(0, st.leading);
                showText(args[0]);
                break;
            case OPS.nextLineSetSpacingShowText:
                st.wordSpacing = Number(args[0]) || 0;
                st.charSpacing = Number(args[1]) || 0;
                moveText(0, st.leading);
                showText(args[2]);
                break;
            case OPS.paintImageXObject:
                placeImage({ objId: String(args[0]) });
                break;
            case OPS.paintInlineImageXObject:
                placeImage({ inline: args[0] });
                break;
            case OPS.paintImageXObjectRepeat: {
                const [objId, scaleX, scaleY, positions] = args as [string, number, number, number[]];
                const saved = st.ctm;
                for (let p = 0; p + 1 < (positions?.length ?? 0); p += 2) {
                    st.ctm = multiply(saved, [scaleX, 0, 0, scaleY, positions[p], positions[p + 1]]);
                    placeImage({ objId: String(objId) });
                }
                st.ctm = saved;
                break;
            }
            case OPS.paintSolidColorImageMask: {
                // A unit square in the fill colour
                const corners = [apply(st.ctm, 0, 0), apply(st.ctm, 1, 1)];
                const box = boxOfPoints(corners.map(c => c[0]), corners.map(c => c[1]));
                if (st.fill && box.w > 0 && box.h > 0) {
                    page.shapes.push({
                        z: z++,
                        segments: [
                            { op: 'M', x: box.x, y: box.y },
                            { op: 'L', x: box.x + box.w, y: box.y },
                            { op: 'L', x: box.x + box.w, y: box.y + box.h },
                            { op: 'L', x: box.x, y: box.y + box.h },
                            { op: 'Z' },
                        ],
                        box,
                        fill: { color: st.fill, alpha: st.fillAlpha },
                        stroke: null,
                        isRect: true,
                    });
                }
                break;
            }
            default:
                break;
        }
    }
    return page;
}

// ─── With pdf.js ───────────────────────────────────────────────

type PdfPage = Awaited<ReturnType<import('pdfjs-dist').PDFDocumentProxy['getPage']>>;

/** Everything painted on one page (images are referenced; see images.ts to get their pixels) */
export async function extractPageGraphics(pdfjs: { OPS: object }, page: PdfPage, pageIndex: number): Promise<PageGraphics> {
    const ops = await page.getOperatorList();
    const fontFor = (ref: string): FontObject | null => {
        try {
            return page.commonObjs.has(ref) ? (page.commonObjs.get(ref) as FontObject) : null;
        } catch {
            return null;
        }
    };
    return readOperators(ops, pdfjs.OPS as OpCodes, fontFor, pageIndex, page.view as [number, number, number, number]);
}

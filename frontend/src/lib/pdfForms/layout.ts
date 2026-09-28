// ─── Reading a flat PDF's layout ───────────────────────────────
// Word exports have no form fields, but their text keeps positions: checkboxes
// are symbol-font glyphs (Wingdings) followed by their label, and table borders
// are thin filled rectangles. From those we find every checkbox with its label
// and the table cell under any point, so fields can snap into place.

import type { Checkbox, Edge, Phrase, PdfLayout, Rect } from './types';

export interface RawTextItem {
    page: number;
    str: string;
    /** Left edge and baseline */
    x: number;
    y: number;
    /** Advance width of the whole string */
    w: number;
    /** Font size */
    h: number;
}

export interface RawRect {
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
    /** Outlined rather than filled: a small outlined square is a checkbox */
    stroke?: boolean;
}

/** Wingdings / Word symbol boxes, then Unicode ballot boxes */
const SYMBOL_BOXES = new Set(['', '', '', '', '']);
const UNICODE_BOXES = new Set(['☐', '□', '❏', '❑']);
const BULLETS = /^[\s•●▪◦-]*$/;

function isBox(ch: string): boolean {
    return SYMBOL_BOXES.has(ch) || UNICODE_BOXES.has(ch);
}

/** The drawn square of a box glyph, measured on Word exports (Wingdings 0xFF: 0.5 × 0.62 em) */
function boxRect(ch: string, page: number, x: number, y: number, size: number): Rect {
    if (SYMBOL_BOXES.has(ch)) return { page, x: x + 0.047 * size, y, w: 0.5 * size, h: 0.62 * size };
    return { page, x: x + 0.05 * size, y: y - 0.05 * size, w: 0.68 * size, h: 0.68 * size };
}

function right(p: { x: number; w: number }) {
    return p.x + p.w;
}

/** Merge text items on the same line into phrases; a gap wider than ~a word space splits them. */
function buildPhrases(items: RawTextItem[]): Phrase[] {
    const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
    // Bucket into lines first (baselines within a third of the font size)
    const lines: RawTextItem[][] = [];
    for (const it of sorted) {
        const line = lines[lines.length - 1];
        if (line && line[0].page === it.page && Math.abs(line[0].y - it.y) <= Math.max(1.5, it.h * 0.3)) line.push(it);
        else lines.push([it]);
    }

    const phrases: Phrase[] = [];
    for (const line of lines) {
        line.sort((a, b) => a.x - b.x);
        let cur: Phrase | null = null;
        for (const it of line) {
            const gap = cur ? it.x - right(cur) : Infinity;
            if (cur && gap <= Math.max(4, Math.min(cur.h, it.h) * 0.8)) {
                const joiner = gap > Math.min(cur.h, it.h) * 0.12 && !cur.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '';
                cur.text += joiner + it.str;
                cur.w = Math.max(right(cur), right(it)) - cur.x;
                cur.h = Math.max(cur.h, it.h);
            } else {
                if (cur) phrases.push(cur);
                cur = { page: it.page, x: it.x, y: it.y, w: it.w, h: it.h, text: it.str };
            }
        }
        if (cur) phrases.push(cur);
    }
    return phrases
        .map(p => ({ ...p, text: p.text.replace(/\s+/g, ' ').replace(/\s+-\s+/g, '-').trim() }))
        .filter(p => p.text && !BULLETS.test(p.text));
}

/** Split items into box glyphs and plain text (a box and its label can share one item) */
function splitBoxes(items: RawTextItem[]): { boxes: { ch: string; page: number; x: number; y: number; size: number }[]; text: RawTextItem[] } {
    const boxes: { ch: string; page: number; x: number; y: number; size: number }[] = [];
    const text: RawTextItem[] = [];
    for (const it of items) {
        const chars = [...it.str];
        if (!chars.some(isBox)) {
            if (it.str.trim()) text.push(it);
            continue;
        }
        const charW = chars.length > 0 ? it.w / chars.length : it.w;
        let run = '';
        let runStart = 0;
        const flush = (end: number) => {
            const lead = run.length - run.trimStart().length;
            if (run.trim()) text.push({ ...it, str: run.trim(), x: it.x + (runStart + lead) * charW, w: (end - runStart - lead) * charW });
            run = '';
        };
        chars.forEach((ch, i) => {
            if (isBox(ch)) {
                flush(i);
                boxes.push({ ch, page: it.page, x: it.x + i * charW, y: it.y, size: it.h });
                runStart = i + 1;
            } else {
                if (!run) runStart = i;
                run += ch;
            }
        });
        flush(chars.length);
    }
    return { boxes, text };
}

/** The label printed right of a checkbox, following wrapped lines that stay in its column. */
function labelFor(box: Rect, baseline: number, phrases: Phrase[], boxes: Rect[]): string {
    const onPage = phrases.filter(p => p.page === box.page);
    const boxRight = box.x + box.w;
    const first = onPage
        .filter(p => Math.abs(p.y - baseline) <= Math.max(3, p.h * 0.5) && p.x >= box.x + box.w * 0.6 && p.x - boxRight <= 30)
        .sort((a, b) => a.x - b.x)[0];
    if (!first) return '';

    // Where the next checkbox on this row starts: labels never run past it
    const nextBoxX = Math.min(
        Infinity,
        ...boxes.filter(b => b.page === box.page && Math.abs(b.y - box.y) <= box.h && b.x > boxRight).map(b => b.x),
    );
    const parts = [first.text];
    let prev = first;
    for (let i = 0; i < 4; i++) {
        const next = onPage
            .filter(p =>
                Math.abs(p.x - first.x) <= 4 &&
                prev.y - p.y > 0 &&
                prev.y - p.y <= prev.h * 1.75 &&
                p.x < nextBoxX,
            )
            .sort((a, b) => b.y - a.y)[0];
        if (!next) break;
        // Stop at the next checkbox's label in the same column
        const startsAnotherBox = boxes.some(b => b.page === box.page && Math.abs(b.y - next.y) <= next.h * 0.5 && next.x >= b.x + b.w - 1 && next.x - (b.x + b.w) <= 30);
        if (startsAnotherBox) break;
        parts.push(next.text);
        prev = next;
    }
    return parts.join(' ').replace(/-\s+/g, '-').replace(/\s+/g, ' ').trim();
}

/** A checkbox drawn as an outlined square instead of a symbol glyph */
function isVectorBox(r: RawRect): boolean {
    return !!r.stroke && r.w >= 5 && r.w <= 16 && r.h >= 5 && r.h <= 16 && r.w / r.h >= 0.6 && r.w / r.h <= 1.6;
}

function buildEdges(rects: RawRect[], pages: { w: number; h: number }[]): Edge[] {
    const edges: Edge[] = [];
    for (const r of rects) {
        const size = pages[r.page];
        // Skip page-sized paths (backgrounds, clips)
        if (size && r.w >= size.w * 0.95 && r.h >= size.h * 0.95) continue;
        const thin = 2;
        if (r.h <= thin && r.w >= 4) {
            edges.push({ page: r.page, dir: 'h', at: r.y + r.h / 2, a: r.x, b: r.x + r.w });
        } else if (r.w <= thin && r.h >= 4) {
            edges.push({ page: r.page, dir: 'v', at: r.x + r.w / 2, a: r.y, b: r.y + r.h });
        } else if (r.w >= 4 && r.h >= 4) {
            // A shaded cell: its outline counts as borders too
            edges.push(
                { page: r.page, dir: 'h', at: r.y, a: r.x, b: r.x + r.w },
                { page: r.page, dir: 'h', at: r.y + r.h, a: r.x, b: r.x + r.w },
                { page: r.page, dir: 'v', at: r.x, a: r.y, b: r.y + r.h },
                { page: r.page, dir: 'v', at: r.x + r.w, a: r.y, b: r.y + r.h },
            );
        }
    }
    return edges;
}

export function buildLayout(pages: { w: number; h: number }[], items: RawTextItem[], rects: RawRect[]): PdfLayout {
    const { boxes, text } = splitBoxes(items);
    const phrases = buildPhrases(text);
    const found: { rect: Rect; baseline: number }[] = [
        ...boxes.map(b => ({ rect: boxRect(b.ch, b.page, b.x, b.y, b.size), baseline: b.y })),
        ...rects.filter(isVectorBox).map(r => ({ rect: { page: r.page, x: r.x, y: r.y, w: r.w, h: r.h }, baseline: r.y + 1 })),
    ];
    const boxRects = found.map(f => f.rect);
    const counters = new Map<number, number>();
    const checkboxes: Checkbox[] = found
        .sort((p, q) => p.rect.page - q.rect.page || q.rect.y - p.rect.y || p.rect.x - q.rect.x)
        .map(({ rect, baseline }) => {
            const n = counters.get(rect.page) ?? 0;
            counters.set(rect.page, n + 1);
            return { id: `p${rect.page}-${n}`, rect, label: labelFor(rect, baseline, phrases, boxRects) };
        });
    return { pages, phrases, checkboxes, edges: buildEdges(rects.filter(r => !isVectorBox(r)), pages) };
}

/** The table cell around a point, from the nearest borders on each side. */
export function cellAt(layout: PdfLayout, page: number, x: number, y: number): Rect | null {
    const tol = 0.5;
    let left = -Infinity;
    let rightX = Infinity;
    let bottom = -Infinity;
    let top = Infinity;
    for (const e of layout.edges) {
        if (e.page !== page) continue;
        if (e.dir === 'v' && e.a - tol <= y && y <= e.b + tol) {
            if (e.at < x && e.at > left) left = e.at;
            if (e.at > x && e.at < rightX) rightX = e.at;
        } else if (e.dir === 'h' && e.a - tol <= x && x <= e.b + tol) {
            if (e.at < y && e.at > bottom) bottom = e.at;
            if (e.at > y && e.at < top) top = e.at;
        }
    }
    if (![left, rightX, bottom, top].every(Number.isFinite)) return null;
    const w = rightX - left;
    const h = top - bottom;
    if (w < 8 || h < 6) return null;
    return { page, x: left, y: bottom, w, h };
}

/** Pad a cell so text doesn't touch its borders */
export function insetCell(cell: Rect, pad = 3): Rect {
    return { ...cell, x: cell.x + pad, y: cell.y + Math.min(pad, cell.h / 4), w: Math.max(4, cell.w - 2 * pad), h: Math.max(4, cell.h - 2 * Math.min(pad, cell.h / 4)) };
}

/**
 * Where the answer to a printed label goes: the next cell to the right of the
 * label's cell, or (no table) the rest of the line after the label.
 */
export function answerRectForLabel(layout: PdfLayout, label: Phrase): Rect {
    const midY = label.y + label.h * 0.3;
    const own = cellAt(layout, label.page, label.x + 1, midY);
    if (own) {
        const next = cellAt(layout, label.page, own.x + own.w + 2, midY);
        if (next && next.x >= own.x + own.w - 1) return insetCell(next);
    }
    const page = layout.pages[label.page];
    const x = right(label) + 6;
    const rowRight = Math.min(
        page ? page.w - 20 : x + 200,
        ...layout.phrases.filter(p => p.page === label.page && Math.abs(p.y - label.y) < label.h * 0.5 && p.x > x).map(p => p.x - 6),
    );
    return { page: label.page, x, y: label.y - label.h * 0.3, w: Math.max(40, rowRight - x), h: label.h * 1.5 };
}

export function rectCenter(r: Rect): { x: number; y: number } {
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function pointInRect(r: Rect, page: number, x: number, y: number, pad = 0): boolean {
    return r.page === page && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

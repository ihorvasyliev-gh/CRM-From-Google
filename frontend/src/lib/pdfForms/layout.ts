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
            // A fill-in blank ("____/____") and the note after it are separate phrases
            const blankToText = cur && /[_—–]\s*$/.test(cur.text) && /^\s*[(\p{L}]/u.test(it.str);
            if (cur && !blankToText && gap <= Math.max(4, Math.min(cur.h, it.h) * 0.8)) {
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
        if (next && next.x >= own.x + own.w - 1) {
            // A tall label next to a ruled area ("Describe…" beside 8 lines): answer across all of it
            if (own.h > next.h * 1.5) return insetCell({ ...next, y: own.y, h: own.h });
            return insetCell(next);
        }
    }
    const page = layout.pages[label.page];
    const x = right(label) + 6;
    const rowRight = Math.min(
        page ? page.w - 20 : x + 200,
        ...layout.phrases.filter(p => p.page === label.page && Math.abs(p.y - label.y) < label.h * 0.5 && p.x > x).map(p => p.x - 6),
    );
    return { page: label.page, x, y: label.y - label.h * 0.3, w: Math.max(40, rowRight - x), h: label.h * 1.5 };
}

// ─── Printed date blanks: "____/_____/20__", "——/——/——" ───────

export interface DateBlank {
    page: number;
    /** The printed question on its left ("Date of Registration", "Date your LCG was established?") */
    label: string;
    day: Rect;
    month: Rect;
    year: Rect;
    /** "/20__" prints the century, so only two digits go in the year blank */
    yearDigits: 2 | 4;
}

const BLANK = '[_\\u2014\\u2013\\-\\s]';
const DATE_BLANK_RE = new RegExp(`^(${BLANK}{2,})/(${BLANK}{2,})/((?:19|20)?)(${BLANK}*)`);

/** Rough Arial advance widths (em) for the characters blanks are made of */
function charWidth(ch: string): number {
    if (ch === '—') return 1;
    if (ch === '_' || ch === '–' || /\d/.test(ch)) return 0.556;
    if (ch === '/' || ch === ' ') return 0.278;
    if (ch === '-') return 0.333;
    return 0.5;
}

export function findDateBlanks(layout: PdfLayout): DateBlank[] {
    const out: DateBlank[] = [];
    for (const p of layout.phrases) {
        const m = p.text.match(DATE_BLANK_RE);
        if (!m) continue;
        // Character offsets → x positions, scaled so the whole phrase fits its measured width
        const widths = [...p.text].map(charWidth);
        const scale = p.w / Math.max(1, widths.reduce((a, b) => a + b, 0));
        const xAt = (i: number) => p.x + widths.slice(0, i).reduce((a, b) => a + b, 0) * scale;
        const dashes = /[—–]/.test(m[0]);
        // Write just above the line: underscores sit under the baseline, dashes at mid-height
        const y = p.y + (dashes ? p.h * 0.35 : 0);
        const h = p.h * 1.1;
        const seg = (start: number, end: number): Rect => ({ page: p.page, x: xAt(start), y, w: Math.max(8, xAt(end) - xAt(start)), h });

        const dayEnd = m[1].length;
        const monthStart = dayEnd + 1;
        const monthEnd = monthStart + m[2].length;
        const centuryStart = monthEnd + 1;
        const yearStart = centuryStart + m[3].length;
        const yearEnd = yearStart + m[4].length;
        const yearDigits = m[3] ? 2 : 4;
        // "/20" with no blank after it: room for two digits right after the century
        const year = yearEnd > yearStart + 1 ? seg(yearStart, yearEnd) : { page: p.page, x: xAt(yearStart) + 1, y, w: p.h * 1.3, h };

        const label = layout.phrases
            .filter(q => q.page === p.page && q !== p && q.x + q.w <= p.x + 2 && Math.abs(q.y - p.y) <= 14)
            .sort((a, b) => b.y - a.y || a.x - b.x)
            .map(q => q.text)
            .join(' ');
        out.push({ page: p.page, label, day: seg(0, dayEnd), month: seg(monthStart, monthEnd), year, yearDigits });
    }
    return out;
}

/**
 * Rules drawn across a box (e.g. the 7 rules making 8 writing lines beside "Describe …"),
 * as fractions of the box height from its bottom. Fewer than two rules: none.
 */
export function ruledLines(layout: PdfLayout, r: Rect): number[] {
    // Word draws a rule as one piece per table column: join the pieces on each line
    const pieces = new Map<number, [number, number][]>();
    for (const e of layout.edges) {
        if (e.page !== r.page || e.dir !== 'h' || e.at <= r.y + 3 || e.at >= r.y + r.h - 3) continue;
        const key = Math.round(e.at);
        pieces.set(key, [...(pieces.get(key) ?? []), [e.a, e.b]]);
    }
    const rules = new Set<number>();
    pieces.forEach((segs, y) => {
        segs.sort((a, b) => a[0] - b[0]);
        let reach = r.x + 6;
        for (const [a, b] of segs) if (a <= reach + 2) reach = Math.max(reach, b);
        if (reach >= r.x + r.w - 6) rules.add(y);
    });
    // Shaded cells add two edges per border: count each rule once
    const ys = [...rules].sort((a, b) => a - b).filter((y, i, all) => i === 0 || y - all[i - 1] > 3);
    return ys.length >= 2 ? ys.map(y => (y - r.y) / r.h) : [];
}

/** The form's title: the biggest text near the top of the first page ("Community Organisation Registration Form") */
export function guessTitle(layout: PdfLayout): string {
    const first = layout.phrases.filter(p => p.page === 0 && /\p{L}{3}/u.test(p.text));
    if (first.length === 0) return '';
    const biggest = Math.max(...first.map(p => p.h));
    if (biggest < 13) return '';
    return first
        .filter(p => p.h >= biggest * 0.8)
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .slice(0, 3)
        .map(p => p.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function rectCenter(r: Rect): { x: number; y: number } {
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function pointInRect(r: Rect, page: number, x: number, y: number, pad = 0): boolean {
    return r.page === page && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

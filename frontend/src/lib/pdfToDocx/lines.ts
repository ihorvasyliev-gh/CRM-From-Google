// ─── Characters → lines of text for Word ───────────────────────
// Characters on one baseline that run on without a column gap become one line;
// a line becomes one text box in Word. Word lays the characters out with the
// font's own widths, so wherever the PDF moved a word (justified text, kerning,
// font sizes Word rounds to half points), the character before it gets extra
// character spacing that puts the next word back where the PDF has it.

import { wordLineMetrics } from './fonts';
import type { Glyph } from './types';

export interface TextRun {
    text: string;
    family: string;
    bold: boolean;
    italic: boolean;
    /** Word font size in half points */
    halfPoints: number;
    /** RRGGBB */
    color: string;
    alpha: number;
    /** Extra space after each character, in twentieths of a point */
    spacing: number;
}

export interface TextLine {
    page: number;
    /** Left edge of the first character and its baseline (PDF points, origin bottom-left) */
    x: number;
    baseline: number;
    /** Width of the text as the PDF prints it */
    width: number;
    /** How far Word's line reaches above and below the baseline, in points */
    ascent: number;
    descent: number;
    runs: TextRun[];
    angle: number;
    z: number;
}

/** A vertical rule or cell border: text on either side of it belongs to different boxes */
export interface Divider {
    x: number;
    y0: number;
    y1: number;
}

const SPACE = /^\s+$/;
/** Symbol-font characters in the private use area keep their font; ordinary ones (•) don't need it */
const PRIVATE_USE = /^[\uE000-\uF8FF]$/;
/** Twips of character spacing are whole numbers: below this a correction is not worth a run */
const MIN_CORRECTION = 0.75;

function familyFor(g: Glyph): string {
    if (/^(symbol|wingdings|webdings|zapf dingbats)/i.test(g.font.family) && !PRIVATE_USE.test(g.ch)) return 'Arial';
    return g.font.family;
}

function halfPoints(size: number): number {
    return Math.max(2, Math.round(size * 2));
}

/** Group a page's characters into lines (rotated text: one line per painted string) */
export function buildLines(glyphs: Glyph[], page: number, dividers: Divider[] = [], skip: (g: Glyph) => boolean = () => false): TextLine[] {
    const lines: TextLine[] = [];
    const usable = glyphs.filter(g => !skip(g) && g.ch && Number.isFinite(g.x) && Number.isFinite(g.y) && g.size > 0.5);

    // Rotated text: each painted string on its own
    const rotated = usable.filter(g => g.angle !== 0);
    const byString = new Map<number, Glyph[]>();
    for (const g of rotated) byString.set(g.z, [...(byString.get(g.z) ?? []), g]);
    for (const group of byString.values()) {
        const line = toLine(group, page);
        if (line) lines.push(line);
    }

    // Upright text: cluster baselines, then split each row at column gaps and rules
    const upright = usable.filter(g => g.angle === 0).sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: Glyph[][] = [];
    for (const g of upright) {
        const row = rows[rows.length - 1];
        const tol = Math.max(0.8, Math.min(g.size, row?.[0].size ?? g.size) * 0.2);
        if (row && Math.abs(row[0].y - g.y) <= tol) row.push(g);
        else rows.push([g]);
    }
    for (const unsorted of rows) {
        // Spaces from other strings that land on top of visible characters (empty table cells
        // often hold one) would split words apart: only spaces in the clear count
        const ink = unsorted.filter(g => !SPACE.test(g.ch));
        const row = unsorted
            .filter(g => !SPACE.test(g.ch) || !ink.some(v => g.x < v.x + v.adv - g.adv * 0.3 && g.x + g.adv * 0.7 > v.x))
            .sort((a, b) => a.x - b.x);
        let seg: Glyph[] = [];
        for (const g of row) {
            const prev = seg[seg.length - 1];
            if (prev) {
                // The same character printed twice on top of itself (fake bold, shadows)
                if (prev.ch === g.ch && Math.abs(prev.x - g.x) < g.size * 0.15 && !SPACE.test(g.ch)) continue;
                const end = prev.x + prev.adv;
                const gap = g.x - end;
                const em = Math.max(prev.size, g.size);
                const ruled = gap > em * 0.1 && dividers.some(d => d.x > end - 0.5 && d.x < g.x + 0.5 && d.y0 <= g.y + 1 && d.y1 >= g.y - 1);
                // Text padded apart with several spaces ("__/__/____    (dd/mm/yyyy)") is two pieces
                const padded = !SPACE.test(g.ch) && seg.length >= 2 && SPACE.test(prev.ch) && SPACE.test(seg[seg.length - 2].ch);
                if (gap > em * 0.9 || ruled || padded) {
                    const line = toLine(seg, page);
                    if (line) lines.push(line);
                    seg = [];
                }
            }
            seg.push(g);
        }
        const line = toLine(seg, page);
        if (line) lines.push(line);
    }
    return lines;
}

function toLine(all: Glyph[], page: number): TextLine | null {
    let start = 0;
    let end = all.length;
    while (start < end && SPACE.test(all[start].ch)) start++;
    while (end > start && SPACE.test(all[end - 1].ch)) end--;
    const glyphs = all.slice(start, end);
    if (glyphs.length === 0) return null;

    // Where Word will put each character, and the spacing that keeps it on the PDF's position
    const first = glyphs[0];
    const pos = (g: Glyph) => (g.angle === 0 ? g.x : first.x + distance(first, g));
    const natural = (g: Glyph) => g.em * (halfPoints(g.size) / 2);
    // Text set tighter or looser all along (Publisher's condensed spacing): one spacing for the whole line
    const steps: number[] = [];
    for (let i = 0; i + 1 < glyphs.length; i++) {
        if (!SPACE.test(glyphs[i].ch) && !SPACE.test(glyphs[i + 1].ch)) steps.push(pos(glyphs[i + 1]) - pos(glyphs[i]) - natural(glyphs[i]));
    }
    const base = steps.length >= 4 ? Math.round(median(steps) * 20) : 0;
    let wordX = first.x;
    const spacings: number[] = [];
    for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        const next = glyphs[i + 1];
        let spacing = base;
        if (next) {
            const correction = pos(next) - (wordX + natural(g));
            const styleChanges = familyFor(next) !== familyFor(g) || halfPoints(next.size) !== halfPoints(g.size) || next.font.bold !== g.font.bold || next.font.italic !== g.font.italic;
            if (SPACE.test(g.ch) || styleChanges || Math.abs(correction - base / 20) >= MIN_CORRECTION) {
                spacing = Math.max(-1584, Math.min(1584, Math.round(correction * 20)));
            }
        }
        spacings.push(spacing);
        wordX += natural(g) + spacing / 20;
    }

    const runs: TextRun[] = [];
    let ascent = 0;
    let descent = 0;
    glyphs.forEach((g, i) => {
        const family = familyFor(g);
        const hp = halfPoints(g.size);
        const metrics = wordLineMetrics({ ...g.font, family });
        ascent = Math.max(ascent, metrics.ascent * (hp / 2));
        descent = Math.max(descent, metrics.descent * (hp / 2));
        const last = runs[runs.length - 1];
        if (
            last &&
            last.family === family &&
            last.bold === g.font.bold &&
            last.italic === g.font.italic &&
            last.halfPoints === hp &&
            last.color === g.color &&
            last.alpha === g.alpha &&
            last.spacing === spacings[i]
        ) {
            last.text += g.ch;
        } else {
            runs.push({ text: g.ch, family, bold: g.font.bold, italic: g.font.italic, halfPoints: hp, color: g.color, alpha: g.alpha, spacing: spacings[i] });
        }
    });

    const lastGlyph = glyphs[glyphs.length - 1];
    const width = first.angle === 0 ? lastGlyph.x + lastGlyph.adv - first.x : distance(first, lastGlyph) + lastGlyph.adv;
    return {
        page,
        x: first.x,
        baseline: first.y,
        width: Math.max(1, width),
        ascent,
        descent,
        runs,
        angle: first.angle,
        z: Math.min(...glyphs.map(g => g.z)),
    };
}

function distance(a: Glyph, b: Glyph): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

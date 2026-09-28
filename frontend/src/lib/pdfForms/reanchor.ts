// ─── Moving fields onto a new revision of the PDF ──────────────
// A new revision usually shifts things (a line added, a question reworded) rather
// than redesigning the form. Text that reads the same in both revisions anchors
// the move: each field follows the unchanged text nearest to it, then snaps to
// the checkbox or table cell found there. Anything uncertain is flagged.

import { cellAt, insetCell } from './layout';
import { normalizeText, similarity } from './text';
import type { Checkbox, ChoiceOption, FormField, Phrase, PdfLayout, Rect } from './types';

export type AnchorStatus = 'same' | 'moved' | 'check' | 'missing';

export interface ReanchorItem {
    fieldId: string;
    optionId?: string;
    name: string;
    status: AnchorStatus;
    note?: string;
}

export interface ReanchorResult {
    fields: FormField[];
    items: ReanchorItem[];
    /** Checkboxes in the new PDF with a label the old one didn't have */
    newCheckboxes: Checkbox[];
}

interface Pair {
    o: Phrase;
    n: Phrase;
}

/** Phrases whose text appears exactly once in each revision */
function anchorPairs(oldLayout: PdfLayout, newLayout: PdfLayout): Pair[] {
    const index = (phrases: Phrase[]) => {
        const map = new Map<string, Phrase | null>();
        for (const p of phrases) {
            const key = normalizeText(p.text);
            if (key.length < 3) continue;
            map.set(key, map.has(key) ? null : p);
        }
        return map;
    };
    const a = index(oldLayout.phrases);
    const b = index(newLayout.phrases);
    const pairs: Pair[] = [];
    a.forEach((o, key) => {
        const n = b.get(key);
        if (o && n) pairs.push({ o, n });
    });
    return pairs;
}

function median(values: number[]): number {
    const s = [...values].sort((x, y) => x - y);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface Prediction {
    rect: Rect;
    sure: boolean;
}

function predict(rect: Rect, pairs: Pair[], pageCount: number): Prediction | null {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const near = pairs
        .filter(p => p.o.page === rect.page)
        .map(p => ({ p, d: Math.hypot(p.o.x + p.o.w / 2 - cx, p.o.y - cy) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5);
    if (near.length === 0) return rect.page < pageCount ? { rect, sure: false } : null;

    const pageVotes = new Map<number, number>();
    near.forEach(({ p }) => pageVotes.set(p.n.page, (pageVotes.get(p.n.page) ?? 0) + 1));
    const page = [...pageVotes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const same = near.filter(({ p }) => p.n.page === page);
    const dx = median(same.map(({ p }) => p.n.x - p.o.x));
    const dy = median(same.map(({ p }) => p.n.y - p.o.y));
    const spread = Math.max(...same.slice(0, 3).map(({ p }) => Math.abs(p.n.y - p.o.y - dy) + Math.abs(p.n.x - p.o.x - dx)));
    const sure = near[0].d < 250 && spread < 6 && same.length >= Math.min(2, near.length);
    return { rect: { ...rect, page, x: rect.x + dx, y: rect.y + dy }, sure };
}

function closeRects(a: Rect, b: Rect, tol: number): boolean {
    return a.page === b.page && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;
}

function moved(a: Rect, b: Rect): boolean {
    return !closeRects(a, b, 0.5);
}

function reanchorOption(option: ChoiceOption, pred: Prediction | null, newLayout: PdfLayout, used: Set<string>): { option: ChoiceOption; status: AnchorStatus; note?: string } {
    if (!pred) return { option, status: 'missing', note: 'Its page is not in the new PDF' };
    const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const pc = center(pred.rect);
    const dist = (c: Checkbox) => (c.rect.page === pred.rect.page ? Math.hypot(center(c.rect).x - pc.x, center(c.rect).y - pc.y) : Infinity);
    const free = newLayout.checkboxes.filter(c => !used.has(c.id));
    const nearest = [...free].sort((a, b) => dist(a) - dist(b))[0];

    const take = (c: Checkbox, status: AnchorStatus, note?: string) => {
        used.add(c.id);
        const relabelled = normalizeText(c.label) !== normalizeText(option.label) && c.label;
        const aliases = relabelled && !option.aliases.includes(option.label) ? [...option.aliases, option.label] : option.aliases;
        return { option: { ...option, rect: c.rect, label: c.label || option.label, aliases }, status, note };
    };

    if (nearest && dist(nearest) <= 15 && similarity(nearest.label, option.label) >= 0.8) {
        return take(nearest, !moved(option.rect, nearest.rect) ? 'same' : pred.sure ? 'moved' : 'check');
    }
    // The box moved further than its surroundings: look for its label nearby
    const byLabel = free
        .filter(c => similarity(c.label, option.label) >= 0.9 && dist(c) <= 90)
        .sort((a, b) => dist(a) - dist(b))[0];
    if (byLabel) return take(byLabel, 'check', 'Found by its label; check the position');
    if (nearest && dist(nearest) <= 15) {
        return take(nearest, 'check', `Label changed: "${option.label}" → "${nearest.label}"`);
    }
    return { option: { ...option, rect: pred.rect }, status: 'missing', note: 'No checkbox here in the new PDF' };
}

export function reanchorFields(fields: FormField[], oldLayout: PdfLayout, newLayout: PdfLayout): ReanchorResult {
    const pairs = anchorPairs(oldLayout, newLayout);
    const pageCount = newLayout.pages.length;
    const used = new Set<string>();
    const items: ReanchorItem[] = [];

    const out = fields.map((field): FormField => {
        if (field.kind === 'choice') {
            const options = field.options.map(option => {
                const r = reanchorOption(option, predict(option.rect, pairs, pageCount), newLayout, used);
                items.push({ fieldId: field.id, optionId: option.id, name: `${field.name} → ${option.label}`, status: r.status, note: r.note });
                return r.option;
            });
            return { ...field, options };
        }

        const pred = predict(field.rect, pairs, pageCount);
        if (!pred) {
            items.push({ fieldId: field.id, name: field.name, status: 'missing', note: 'Its page is not in the new PDF' });
            return field;
        }
        let rect = pred.rect;
        // A field that filled a table cell keeps filling the cell it lands in
        const c = { x: field.rect.x + field.rect.w / 2, y: field.rect.y + field.rect.h / 2 };
        const oldCell = cellAt(oldLayout, field.rect.page, c.x, c.y);
        if (oldCell && closeRects(insetCell(oldCell), field.rect, 2.5)) {
            const newCell = cellAt(newLayout, rect.page, rect.x + rect.w / 2, rect.y + rect.h / 2);
            if (newCell) rect = insetCell(newCell);
        }
        const status: AnchorStatus = !moved(field.rect, rect) ? 'same' : pred.sure ? 'moved' : 'check';
        items.push({ fieldId: field.id, name: field.name, status, note: status === 'check' ? 'Little unchanged text nearby; check the position' : undefined });
        return { ...field, rect };
    });

    const oldLabels = new Set(oldLayout.checkboxes.map(c => normalizeText(c.label)));
    const newCheckboxes = newLayout.checkboxes.filter(c => !used.has(c.id) && !oldLabels.has(normalizeText(c.label)));
    return { fields: out, items, newCheckboxes };
}

// ─── Cheque requisitions: values picked on the invoice by hand ───
// Clicking text on the invoice (or drawing a box round it) fills the field being picked. Where
// a value that changes from invoice to invoice was picked (the amount, the PO number, the item)
// is kept with the requisition, and the supplier's next invoice is read there: beside the same
// label, or in the same place on the page.

import type { Phrase, Rect } from '../pdfForms/types';
import { joinAddress, rectOf, toLines } from './extract';
import { collapseSpaces, EMAIL_RE, findAmounts, findDates, formatAmount, parseAmount, PHONE_RE, squash, WEBSITE_RE } from './parse';
import type { ChequeReqMeta, FieldKey, InvoicePlace, PlaceField } from './types';

/** Fields that can be picked on the invoice */
export const PICKABLE: ReadonlySet<FieldKey> = new Set<FieldKey>([
    'poNumber', 'amount', 'payeeName', 'payeeAddress', 'description',
    'amountQuoted', 'shopName', 'quotePhone', 'quoteEmail', 'quoteContact', 'quoteWebsite',
]);

/** Fields made of several pieces of text (the lines of an address): each click adds one, until done */
export const MULTI_PICK: ReadonlySet<FieldKey> = new Set<FieldKey>(['payeeAddress', 'description']);

/** Fields whose place is remembered for the supplier's next invoice */
const PLACE_FIELDS: ReadonlySet<FieldKey> = new Set<PlaceField>(['poNumber', 'amount', 'description']);

export function isPlaceField(key: FieldKey): key is PlaceField {
    return PLACE_FIELDS.has(key);
}

/** What was picked: its text, and the phrases it is on the invoice (fewer, for some Word text) */
export interface Picked {
    texts: string[];
    phrases: Phrase[];
}

export const NOTHING_PICKED: Picked = { texts: [], phrases: [] };

/** Line by line, left to right */
export function readingOrder(phrases: Phrase[]): Phrase[] {
    return toLines(phrases).flatMap(l => l.phrases);
}

export function pickedOf(phrases: Phrase[]): Picked {
    const ordered = readingOrder(phrases);
    return { texts: ordered.map(p => p.text), phrases: ordered };
}

// ─── The value of a field ──────────────────────────────────────

/** "PO Number: 9300", "Booked by Ann PO 6794" → the number */
function poValue(text: string): string {
    const m = /\b(?:p\.?\s?o\b\.?|purchase\s+order|order)(?:\s*(?:no\b\.?|number|num\b|#|ref(?:erence)?))?\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/-]*)/i.exec(text);
    if (m && /\d/.test(m[1])) return m[1];
    const colon = text.lastIndexOf(':');
    return (colon >= 0 ? text.slice(colon + 1) : text).trim();
}

/** A label picked with its value: "Payable to: Acme Ltd", "Tel: 021 400 0000" */
const LEADING_LABEL = /^(?:payable\s+to|pay(?:ee)?|from|supplier|name|contact|shop|web(?:site)?|e-?mail|tel(?:ephone)?|phone|mob(?:ile)?)\s*[:.-]\s*/i;

/** What goes in the field from the text picked on the invoice */
export function pickedValue(key: FieldKey, texts: string[]): string {
    // Word as laid out on screen keeps zero-width spaces in its text
    const parts = texts.map(t => collapseSpaces(t.replace(/[\u200B-\u200D\u2060\uFEFF]/g, ''))).filter(Boolean);
    const all = parts.join(' ');
    switch (key) {
        case 'amount':
        case 'amountQuoted': {
            const amounts = findAmounts(all);
            const value = amounts.length ? amounts[amounts.length - 1].value : parseAmount(all);
            return value === null ? all : formatAmount(value);
        }
        case 'poNumber':
            return poValue(all);
        case 'quoteEmail':
            return all.match(EMAIL_RE)?.[0] ?? all.replace(LEADING_LABEL, '');
        case 'quotePhone':
            return all.match(PHONE_RE)?.[0] ?? all.replace(LEADING_LABEL, '');
        case 'quoteWebsite':
            return all.match(WEBSITE_RE)?.[0] ?? all.replace(LEADING_LABEL, '');
        case 'payeeAddress':
            return joinAddress(parts);
        case 'description':
            return all;
        default:
            return all.replace(LEADING_LABEL, '').replace(/[,;]$/, '');
    }
}

// ─── Where it is ───────────────────────────────────────────────

/** Whether `area` takes in `r`: half its height, and half its width or half the area's */
export function covers(area: Rect, r: Rect): boolean {
    const across = Math.min(r.x + r.w, area.x + area.w) - Math.max(r.x, area.x);
    const down = Math.min(r.y + r.h, area.y + area.h) - Math.max(r.y, area.y);
    return across >= Math.min(r.w, area.w) * 0.5 && down >= Math.min(r.h, area.h) * 0.5;
}

function phrasesIn(area: Rect, phrases: Phrase[]): Phrase[] {
    return phrases.filter(p => p.page === area.page && covers(area, rectOf(p)));
}

function around(rects: Rect[]): Rect {
    const x = Math.min(...rects.map(r => r.x));
    const y = Math.min(...rects.map(r => r.y));
    return { page: rects[0].page, x, y, w: Math.max(...rects.map(r => r.x + r.w)) - x, h: Math.max(...rects.map(r => r.y + r.h)) - y };
}

/** Words that label something, not a value: no amount, date or long text */
function isLabel(text: string): boolean {
    const t = collapseSpaces(text);
    return /\p{L}{2}/u.test(t) && t.length <= 40 && findAmounts(t).length === 0 && findDates(t).length === 0;
}

type Anchor = NonNullable<InvoicePlace['anchors']>[number];

function anchorOf(p: Phrase, inside = false): Anchor {
    return { text: collapseSpaces(p.text), page: p.page, x: p.x, y: p.y, h: p.h, ...(inside ? { inside } : {}) };
}

/**
 * Where a picked value is, to read it there on the supplier's next invoice: the labels that
 * find it (its own, "PO: 9300"; the one left of it, "Gross Amount"; the column header above
 * it), and its place on the page for when none is found.
 */
export function placeOf(key: PlaceField, picked: Phrase[], all: Phrase[], pageSize?: { w: number; h: number }): InvoicePlace | null {
    const ordered = readingOrder(picked);
    const first = ordered[0];
    if (!first) return null;
    const rect = around(ordered.filter(p => p.page === first.page).map(rectOf));
    const others = all.filter(p => p.page === first.page && !picked.includes(p) && isLabel(p.text));
    const anchors: Anchor[] = [];
    // The label starts the picked text: "PO: 9300", "Gross Amount €165.00"
    const own = key !== 'description' && /^([^\d€£$]*\p{L}[^\d€£$]*?)\s*[:#]?\s*(?=[€£$]?\s*\d)/u.exec(first.text);
    if (own && isLabel(own[1])) anchors.push({ ...anchorOf(first, true), text: collapseSpaces(own[1]) });
    const sameLine = (q: Phrase) => Math.abs(q.y - first.y) <= Math.max(2, Math.min(q.h, first.h) * 0.4);
    const left = others.filter(q => sameLine(q) && q.x + q.w <= rect.x + 2).sort((a, b) => b.x + b.w - (a.x + a.w))[0];
    if (left) anchors.push(anchorOf(left));
    const above = others
        .filter(q => q.y > first.y + first.h * 0.5 && q.y - first.y <= first.h * 4 && q.x < rect.x + rect.w && q.x + q.w > rect.x)
        .sort((a, b) => a.y - b.y)[0];
    if (above) anchors.push(anchorOf(above));
    return { rect, ...(pageSize ? { pageSize } : {}), ...(anchors.length ? { anchors } : {}) };
}

/** The phrase with the label's text nearest where it was: on the same page first */
function findLabel(anchor: Anchor, phrases: Phrase[], pageSizes?: { w: number; h: number }[]): Phrase | undefined {
    const key = squash(anchor.text);
    const size = pageSizes?.[anchor.page] ?? { w: 600, h: 800 };
    const cost = (p: Phrase) => (p.page === anchor.page ? 0 : 1) + Math.hypot((p.x - anchor.x) / size.w, (p.y - anchor.y) / size.h);
    return phrases
        .filter(p => (anchor.inside ? squash(p.text).startsWith(key) && squash(p.text).length > key.length : squash(p.text) === key))
        .sort((a, b) => cost(a) - cost(b))[0];
}

/**
 * The text at a remembered place on another invoice: beside the first of its labels found.
 * With labels, none found means the invoice is laid out otherwise, and nothing is read; the
 * place on the page itself counts only for a value that had no label near it.
 */
export function readPlace(place: InvoicePlace, phrases: Phrase[], pageSizes?: { w: number; h: number }[]): Phrase[] {
    for (const anchor of place.anchors ?? []) {
        const label = findLabel(anchor, phrases, pageSizes);
        if (!label) continue;
        if (anchor.inside) return [label];
        const scale = label.h / anchor.h;
        const area: Rect = {
            page: label.page,
            x: label.x + (place.rect.x - anchor.x) * scale,
            y: label.y + (place.rect.y - anchor.y) * scale,
            w: place.rect.w * scale,
            h: place.rect.h * scale,
        };
        const found = phrasesIn(area, phrases).filter(p => p !== label);
        if (found.length) return readingOrder(found);
    }
    if (place.anchors?.length) return [];
    const was = place.pageSize;
    const now = pageSizes?.[place.rect.page];
    const sx = was && now ? now.w / was.w : 1;
    const sy = was && now ? now.h / was.h : 1;
    const r = place.rect;
    return readingOrder(phrasesIn({ page: r.page, x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy }, phrases));
}

/** Text picked on a Word invoice as laid out on screen → the phrases it was read as */
export function phrasesOfTexts(texts: string[], phrases: Phrase[]): Phrase[] {
    const used: Phrase[] = [];
    for (const t of texts) {
        const key = squash(t);
        if (key.length < 2) continue;
        const free = phrases.filter(p => !used.includes(p));
        const match = free.find(p => squash(p.text) === key) ?? (key.length >= 3 ? free.find(p => squash(p.text).length >= 3 && (squash(p.text).includes(key) || key.includes(squash(p.text)))) : undefined);
        if (match) used.push(match);
    }
    return used;
}

/** The values at the places remembered for a supplier, where they look like what they are */
export function readPlaces(places: ChequeReqMeta['places'], phrases: Phrase[], pageSizes?: { w: number; h: number }[]): Partial<Record<PlaceField, { value: string; source: Rect[] }>> {
    const values: Partial<Record<PlaceField, { value: string; source: Rect[] }>> = {};
    for (const [key, place] of Object.entries(places ?? {}) as [PlaceField, InvoicePlace | undefined][]) {
        if (!isPlaceField(key) || typeof place?.rect?.x !== 'number') continue;
        const found = readPlace(place, phrases, pageSizes);
        if (!found.length) continue;
        const value = pickedValue(key, found.map(p => p.text));
        const fits = key === 'amount' ? parseAmount(value) !== null : key === 'poNumber' ? /\d/.test(value) : /\p{L}{2}/u.test(value);
        if (fits) values[key] = { value, source: found.map(rectOf) };
    }
    return values;
}

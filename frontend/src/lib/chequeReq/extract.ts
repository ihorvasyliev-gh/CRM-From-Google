// ─── Cheque requisitions: reading a supplier invoice ───────────
// Invoices come from many systems (Xero, QuickBooks, Sage, Word…), so nothing here relies
// on one layout. The text keeps its positions (PDF points), and every value is looked
// for next to its label: on the same line, or just under it. Whatever can't be read with
// a clear label is returned as a guess (`sure: false`) for the person to check.

import type { Phrase, Rect } from '../pdfForms/types';
import { collapseSpaces, domainWord, EMAIL_RE, findAmounts, findDateRange, findDates, IBAN_RE, parseDate, PHONE_RE, referenceToken, squash, WEBSITE_RE } from './parse';
import type { Found, InvoiceFacts, InvoiceItem, SupplierFacts } from './types';

/** The customer side of an invoice: this partnership. Blocks mentioning it are never the supplier. */
export const OUR_ORGANISATION = /cork\s*city\s*partnership|heron\s*house|\bsicap\b|\bccp\b/i;

export interface TextLine {
    page: number;
    /** Baseline */
    y: number;
    /** Font size */
    h: number;
    phrases: Phrase[];
    text: string;
}

/** Phrases sharing a baseline, top to bottom, page by page */
export function toLines(phrases: Phrase[]): TextLine[] {
    const sorted = [...phrases].filter(p => p.text.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
    const lines: TextLine[] = [];
    for (const p of sorted) {
        const line = lines[lines.length - 1];
        if (line && line.page === p.page && Math.abs(line.y - p.y) <= Math.max(2, Math.min(line.h, p.h) * 0.4)) line.phrases.push(p);
        else lines.push({ page: p.page, y: p.y, h: p.h, phrases: [p], text: '' });
    }
    for (const line of lines) {
        line.phrases.sort((a, b) => a.x - b.x);
        line.text = line.phrases.map(p => p.text).join(' ');
        line.h = Math.max(...line.phrases.map(p => p.h));
    }
    return lines;
}

export function rectOf(p: Phrase): Rect {
    return { page: p.page, x: p.x - 1, y: p.y - p.h * 0.25, w: p.w + 2, h: p.h * 1.2 };
}

// ─── Values next to labels ─────────────────────────────────────

interface Candidate<T> {
    value: T;
    score: number;
    rects: Rect[];
    from: string;
}

/** The phrase under `p` (same column, within a couple of lines) */
function phraseBelow(lines: TextLine[], lineIndex: number, p: Phrase): Phrase | null {
    const left = p.x - Math.max(3, p.h * 0.6);
    const right = p.x + Math.max(p.w, 40);
    for (let i = lineIndex + 1; i < lines.length && i <= lineIndex + 3; i++) {
        const line = lines[i];
        if (line.page !== p.page || p.y - line.y > Math.max(p.h, line.h) * 2.6) break;
        const under = line.phrases.find(q => q.x >= left && q.x <= right);
        if (under) return under;
    }
    return null;
}

/**
 * Values labelled by `label`: the rest of the label's own phrase ("PO Number: 9001"), the next
 * phrase on its line ("Invoice No.   INV-12"), or the phrase under it (Xero's header boxes).
 */
function labelled<T>(lines: TextLine[], label: RegExp, accept: (text: string) => T | null, skip?: (line: TextLine) => boolean): Candidate<T>[] {
    const found: Candidate<T>[] = [];
    lines.forEach((line, li) => {
        if (skip?.(line)) return;
        line.phrases.forEach((p, pi) => {
            const m = label.exec(p.text);
            if (!m) return;
            const after = p.text.slice(m.index + m[0].length).replace(/^[\s:#.–-]+/, '');
            if (after) {
                const v = accept(after);
                if (v !== null) {
                    found.push({ value: v, score: 3, rects: [rectOf(p)], from: p.text });
                    return;
                }
                // The label ends a sentence ("please quote the invoice number on…"): not a label
                if (after.split(/\s+/).length > 3) return;
            }
            for (const r of line.phrases.slice(pi + 1, pi + 3)) {
                if (r.x - (p.x + p.w) > 160) break;
                const v = accept(r.text);
                if (v !== null) {
                    found.push({ value: v, score: 2.5, rects: [rectOf(p), rectOf(r)], from: `${p.text} ${r.text}` });
                    return;
                }
            }
            const below = phraseBelow(lines, li, p);
            if (below) {
                const v = accept(below.text);
                if (v !== null) found.push({ value: v, score: 2, rects: [rectOf(p), rectOf(below)], from: `${p.text} ${below.text}` });
            }
        });
    });
    return found;
}

/** The value most labels agree on; sure when it came with a label */
function best<T>(candidates: Candidate<T>[], key: (v: T) => string = v => String(v)): Found<T> | undefined {
    if (candidates.length === 0) return undefined;
    const groups = new Map<string, Candidate<T>[]>();
    for (const c of candidates) {
        const k = key(c.value);
        groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    const ranked = [...groups.values()].sort((a, b) => b.reduce((s, c) => s + c.score, 0) - a.reduce((s, c) => s + c.score, 0));
    const top = ranked[0];
    return { value: top[0].value, sure: top[0].score >= 2, source: top[0].rects, from: top[0].from };
}

// ─── Labels ────────────────────────────────────────────────────

const INVOICE_NO = /\b(?:tax\s+)?(?:invoice|inv|bill)\.?\s*(?:number|no\.?|num|#|ref(?:erence)?\s*(?:no\.?)?)(?![a-z])/i;
const INVOICE_DATE = /\b(?:invoice|tax\s*point|issue|issued|document|bill(?:ing)?)\s*date\b|^\s*date\b(?!\s*(?:of|due))/i;
const DUE_DATE = /\bdue\s*date\b|\bpayment\s*due\b|\bdue\s*(?:by|on)\b|\bpay\s*by\b/i;
const PO_NUMBER = /\b(?:p\.?\s?o\.?(?!\s*box)\s*(?:number|no\.?|num|#|ref(?:erence)?)?|purchase\s*order\s*(?:number|no\.?|num|#|ref)?|order\s*(?:number|no\.?|num|#))(?![a-z])/i;

const TOTAL_STRONG = /\b(?:amount|balance|total)\s*(?:due|payable|owing|outstanding)\b|\bgrand\s*total\b|\binvoice\s*total\b|^\s*total\s*(?:eur|€|amount|incl\.?(?:uding)?\s*vat|\(eur\)|\(€\))/i;
const TOTAL_WEAK = /^\s*total\b(?!\s*(?:vat|tax|net|ex|excl|before|hours|qty|quantity|units|discount))/i;
const SUBTOTAL = /^\s*(?:sub[\s-]?total|net(?:\s*(?:total|amount|value))?|total\s*(?:net|excl\.?|exclusive|ex\.?|before)|amount\s*(?:excl|ex)\.?|goods(?:\s*total)?)\b/i;
const VAT = /^\s*(?:total\s+)?(?:vat|tax)\b(?!\s*(?:no|number|reg|registration|id|on\s+sales|rate\s*$))/i;
const ANY_TOTAL = new RegExp(`${SUBTOTAL.source}|${TOTAL_STRONG.source}|${TOTAL_WEAK.source}`, 'i');

const HEADER_DESC = /^(?:description|item|items|details|particulars|services?|product|activity|course)\b/i;
const HEADER_NUM = /^(?:qty|quantity|hours|hrs|units?|days|no\.?|unit\s*price|price|rate|cost|amount|total|line\s*total|net|vat|tax|vat\s*%|tax\s*rate)\b/i;
const QTY_HEADER = /^(?:qty|quantity|hours|hrs|units?|days|no\.?)\b/i;
const PRICE_HEADER = /^(?:unit\s*price|price|rate|cost)\b/i;

const VAT_NUMBER = /\b(?:vat|revenue|tax)\s*(?:reg(?:istration)?\.?\s*)?(?:no\.?|number|#|id)(?![a-z])/i;
const PHONE_LABEL = /\b(?:tel|telephone|phone|ph|mob|mobile|call|contact)\b/i;
const IDENTIFIER_LINE = /\b(?:vat|revenue|tax|company|reg(?:istration)?|cro|charity)\b.*\b(?:no\.?|number|reg|#|id)\b|^\s*(?:tel|telephone|phone|ph|mob|mobile|fax|email|e-mail|web|website)\b|@|www\.|https?:|^\s*(?:iban|bic|swift|sort\s*code|account)\b/i;
const ADDRESS_HINT = /\b[AC-FHKNPRTV-Y]\d{2}\s?[AC-FHKNPRTV-Y0-9]{4}\b|\b(?:co\.?\s+[a-z]+|county|dublin|cork|galway|limerick|waterford|kerry|kilkenny|ireland|united kingdom)\b|\b(?:unit|road|rd\.?|street|st\.|avenue|ave|lane|park|house|estate|business|industrial|centre|center|quay|place|square|terrace|drive|court|way|floor|suite|building|mall|hall)\b/i;
/** Where an address block ends: the next label ("Invoice No:", "Date", "Description") */
const ADDRESS_STOP = /:\s*$|^\s*(?:invoice|date|due|p\.?\s?o\.?\b|purchase|order|description|item|reference|ref\b|account|customer|total|sub\s*total|qty|quantity|attention|attn)\b/i;
const HEADING = /^(?:tax\s+)?(?:invoice|statement|credit\s+note|receipt|quote|quotation|description|payment\s+advice|remittance)\b/i;
const CUSTOMER_LABEL = /^(?:(?:bill(?:ed)?|invoice|sold|ship|deliver(?:y)?)\s*(?:to|address)|to|customer|client|attention|attn|fao)\b\s*:?$/i;
const SUPPLIER_LABEL = /^(?:from|supplier|vendor|payee|pay(?:able)?\s*to|remit\s*to|make\s+cheques\s+payable\s+to)\b\s*:?$/i;
/** "Cheque payable to. Thomas O Riordan", "Please make cheques payable to: Acme Ltd", "Payable to Acme" */
const PAYABLE_TO = /(?:\bcheques?\b.*?|^\s*)payable\s+to\b\s*[.:,–-]?\s*(\S.*)$/i;
/** The customer: this partnership by name, or a line saying only "SICAP" */
const CUSTOMER_LINE = /cork\s*city\s*partnership|heron\s*house|^\W*(?:sicap|ccp)\W*$/i;
/** A line saying only what the next ones are: "Description", "Invoice To" */
const LONE_HEADING = /^(?:descr?iption|discription|details|items?|particulars|services?)\s*:?$/i;
/** "4 x €60", "3 courses @ €1000 each", "Room rental 7 x €60" */
const QTY_PRICE = /\b(\d{1,4})\s*(?:[a-z]+\s+){0,2}(?:(?:x|×)\s*(?:€|eur\s?)|@\s*(?:€|eur\s?)?)\s?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*each)?/i;

// ─── Items ─────────────────────────────────────────────────────

interface ItemTable {
    header: TextLine;
    descX: number;
    descRight: number;
    columns: { x: number; right: number; kind: 'qty' | 'price' | 'other' }[];
}

function findItemTable(lines: TextLine[], from: number): { table: ItemTable; index: number } | null {
    for (let i = from; i < lines.length; i++) {
        const line = lines[i];
        const desc = line.phrases.find(p => HEADER_DESC.test(p.text));
        const nums = line.phrases.filter(p => p !== desc && HEADER_NUM.test(p.text));
        if (!desc || nums.length === 0 || nums.some(n => n.x < desc.x)) continue;
        const columns = nums.map(n => ({ x: n.x, right: n.x + n.w, kind: PRICE_HEADER.test(n.text) ? 'price' as const : QTY_HEADER.test(n.text) ? 'qty' as const : 'other' as const }));
        return { table: { header: line, descX: desc.x, descRight: Math.min(...nums.map(n => n.x)) - 2, columns }, index: i };
    }
    return null;
}

/** The column a number sits in: the header it overlaps most (numbers are often right-aligned) */
function columnOf(table: ItemTable, p: Phrase) {
    let bestCol: ItemTable['columns'][number] | null = null;
    let bestDist = Infinity;
    for (const c of table.columns) {
        const overlap = Math.min(c.right, p.x + p.w) - Math.max(c.x, p.x);
        const dist = overlap > 0 ? -overlap : Math.min(Math.abs(p.x - c.x), Math.abs(p.x + p.w - c.right));
        if (dist < bestDist) {
            bestDist = dist;
            bestCol = c;
        }
    }
    return bestCol;
}

function plainNumber(text: string): number | null {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*$/.exec(text.replace(/,(?=\d{3}\b)/g, ''));
    return m ? Number(m[1].replace(',', '.')) : null;
}

/** Lines printed on every page (letterhead, footer): never part of the items */
function repeatedLines(lines: TextLine[]): Set<string> {
    const pagesByText = new Map<string, Set<number>>();
    for (const l of lines) {
        const key = squash(l.text);
        if (key.length < 6) continue;
        pagesByText.set(key, (pagesByText.get(key) ?? new Set()).add(l.page));
    }
    return new Set([...pagesByText].filter(([, pages]) => pages.size > 1).map(([k]) => k));
}

function readItems(lines: TextLine[]): { items: InvoiceItem[]; itemLines: Set<TextLine> } {
    const items: InvoiceItem[] = [];
    const itemLines = new Set<TextLine>();
    const first = findItemTable(lines, 0);
    if (!first) return { items, itemLines };
    const repeated = repeatedLines(lines);
    let table = first.table;
    let current: InvoiceItem | null = null;
    for (let i = first.index + 1; i < lines.length; i++) {
        const line = lines[i];
        if (repeated.has(squash(line.text))) continue;
        // The table goes on over the page under a repeated header
        if (line.page !== table.header.page) {
            const next = findItemTable(lines, i);
            if (next && next.table.header.page === line.page && next.index <= i + 2) {
                table = next.table;
                i = next.index;
                continue;
            }
        }
        const desc = line.phrases.filter(p => p.x < table.descRight && p.x >= table.descX - 12);
        const rest = line.phrases.filter(p => p.x >= table.descRight);
        // Totals start: a total label in the description column, or one alone on its line
        // (a tax column's "VAT 23%" on an item row is not one)
        const isTotal = (p: Phrase) => ANY_TOTAL.test(p.text) || VAT.test(p.text);
        if (desc.some(isTotal) || (desc.length === 0 && rest.some(isTotal))) break;
        const amounts = rest.flatMap(p => findAmounts(p.text).map(a => ({ ...a, p })));
        const text = collapseSpaces(desc.map(p => p.text).join(' '));
        if (amounts.length > 0) {
            const item: InvoiceItem = { description: text, details: [], amount: amounts[amounts.length - 1].value, source: line.phrases.map(rectOf) };
            for (const p of rest) {
                const n = plainNumber(p.text);
                if (n === null) continue;
                const col = columnOf(table, p);
                if (col?.kind === 'qty' && item.quantity === undefined) item.quantity = n;
                else if (col?.kind === 'price' && item.unitPrice === undefined) item.unitPrice = n;
            }
            items.push(item);
            current = item;
            itemLines.add(line);
        } else if (text) {
            if (!current) {
                current = { description: text, details: [], source: desc.map(rectOf) };
                items.push(current);
            } else if (!current.description) {
                current.description = text;
            } else {
                current.details.push(text);
            }
            itemLines.add(line);
        }
    }
    return { items, itemLines };
}

/** The text of a line without its PO numbers: "26/08/26. PO # 8208" → "26/08/26" */
function withoutPo(text: string): string {
    return collapseSpaces(text.replace(new RegExp(`${PO_NUMBER.source}[\\s:#.–-]*[A-Z0-9][A-Z0-9\\-/._]*`, 'gi'), ' ')).replace(/^[\s.,;:–-]+|[\s.,;:–-]+$/g, '');
}

/**
 * An invoice with no table of items, written as lines ("Sewing Course 08/05, 15/05", "4 x €60"):
 * the lines between the customer (or a "Description" heading) and the total. The first is the
 * item; the lines under it are its details, and "N x €P" its quantity and price.
 */
function looseItems(lines: TextLine[]): { items: InvoiceItem[]; itemLines: Set<TextLine> } {
    const items: InvoiceItem[] = [];
    const itemLines = new Set<TextLine>();
    const end = lines.findIndex(l => l.phrases.some(p => TOTAL_STRONG.test(p.text) || TOTAL_WEAK.test(p.text) || SUBTOTAL.test(p.text)));
    let start = -1;
    let described = false;
    for (let i = 0; i < (end < 0 ? 0 : end); i++) {
        const l = lines[i];
        const heading = l.phrases.some(p => LONE_HEADING.test(p.text.trim()) || CUSTOMER_LABEL.test(p.text.trim()) || HEADING.test(p.text));
        // Under a "Description" heading the partnership is named in a sentence, not as the customer
        const customer = !described && CUSTOMER_LINE.test(l.text);
        if (heading || customer || l.phrases.some(p => INVOICE_NO.test(p.text) || INVOICE_DATE.test(p.text) || DUE_DATE.test(p.text))) start = i;
        if (l.phrases.some(p => LONE_HEADING.test(p.text.trim()) || /^descr?iption\b/i.test(p.text.trim()))) described = true;
    }
    if (start < 0) return { items, itemLines };
    const right = Math.max(...lines.slice(start + 1, end).map(l => l.phrases[l.phrases.length - 1]).map(p => p.x + p.w));
    let current: InvoiceItem | null = null;
    let previous: TextLine | null = null;
    for (let i = start + 1; i < end; i++) {
        const line = lines[i];
        const text = withoutPo(line.text);
        const qp = QTY_PRICE.exec(text);
        // Bank and contact details ("@" of an email, not of "3 courses @ €1000")
        if (!text || (!qp && IDENTIFIER_LINE.test(text))) continue;
        let rest = qp ? collapseSpaces(text.replace(qp[0], ' ')).replace(/^[\s.,;:–-]+|[\s,;:–-]+$/g, '') : text;
        const amounts = qp ? [] : findAmounts(rest);
        if (amounts.length) rest = collapseSpaces(rest.slice(0, amounts[amounts.length - 1].index).replace(/[€£]\s*$|\b(?:eur|gbp)\s*$/i, '')).replace(/[\s,;:–-]+$/, '');
        const priced = !!qp || amounts.length > 0;
        if (!current || (rest && priced && current.amount !== undefined)) {
            current = { description: rest, details: [], source: line.phrases.map(rectOf) };
            items.push(current);
        } else if (rest) {
            if (!current.description) current.description = rest;
            else if (!current.details.length && !priced && previous && wrapsOnto(previous, line, right)) current.description += ` ${rest}`;
            else current.details.push(rest);
        }
        if (qp && current.quantity === undefined) {
            const unitPrice = Number(qp[2].replace(/,/g, ''));
            current.quantity = Number(qp[1]);
            current.unitPrice = unitPrice;
            current.amount = Math.round(current.quantity * unitPrice * 100) / 100;
        } else if (amounts.length && current.amount === undefined) {
            current.amount = amounts[amounts.length - 1].value;
        }
        itemLines.add(line);
        previous = line;
    }
    // A sentence going on into the details: "… Programme on the" + "following dates 28,30 of July…"
    for (const item of items) if (/^\p{Ll}/u.test(item.details[0] ?? '')) item.description = item.description.replace(DANGLING, '');
    return { items, itemLines };
}

/** Words that can't end a description: what was cut off after them is in the next line */
const DANGLING = /(?:\s+(?:on|for|of|in|at|to|and|the|a|an))+$/i;

/**
 * Whether `line` goes on with the sentence of `previous`, wrapped at the right edge: the
 * previous line is a long one reaching across to the right, ends mid-sentence, and the next
 * starts under it with words, not with a number, a date or a list mark.
 */
function wrapsOnto(previous: TextLine, line: TextLine, right: number): boolean {
    const last = previous.phrases[previous.phrases.length - 1];
    const left = previous.phrases[0].x;
    return (
        previous.text.split(/\s+/).length >= 8 &&
        !/[.:;!?)]\s*$/.test(previous.text) &&
        last.x + last.w - left >= (right - left) * 0.75 &&
        Math.abs(line.phrases[0].x - left) <= Math.max(4, line.h * 0.6) &&
        /^\p{L}/u.test(line.text) &&
        findDates(line.text).length === 0
    );
}

/** "1. Anna" + "Smith" (wrapped) → "Anna Smith": the numbered names under an item */
export function numberedPeople(details: string[]): string[] {
    const people: string[] = [];
    let current: string | null = null;
    for (const raw of details) {
        const line = raw.trim();
        const m = /^(\d{1,3})\s*[.)]\s*(\S.*)$/.exec(line);
        if (m && !/\d/.test(m[2])) {
            if (current) people.push(current);
            current = m[2];
        } else if (current && /^[\p{L}'’ -]{2,40}$/u.test(line) && line.split(/\s+/).length <= 3) {
            current += ` ${line}`;
        } else if (current) {
            people.push(current);
            current = null;
        }
    }
    if (current) people.push(current);
    return people.length >= 2 ? people.map(collapseSpaces) : [];
}

// ─── Supplier ──────────────────────────────────────────────────

interface Block {
    x: number;
    lines: Phrase[];
}

const INLINE_LABEL = /^((?:to|from|supplier|vendor|payee|pay(?:able)?\s*to|remit\s*to|bill\s*to|invoice\s*to)\s*:)\s*(\S.*)$/i;

/**
 * "To: Acme Ltd" → "To:" and "Acme Ltd" when the address under it lines up with the name
 * (Xero's payment advice); left whole when the address starts under the label (Word).
 */
function splitLabel(p: Phrase, lines: TextLine[]): Phrase[] {
    const m = INLINE_LABEL.exec(p.text);
    if (!m) return [p];
    const charW = p.w / Math.max(1, p.text.length);
    const x = p.x + (p.text.length - m[2].length) * charW;
    const alignedBelow = lines.some(l => l.page === p.page && l.y < p.y && p.y - l.y <= p.h * 2.2 && l.phrases.some(q => Math.abs(q.x - x) <= Math.max(4, p.h * 0.5)));
    if (!alignedBelow) return [p];
    return [
        { ...p, text: m[1], w: m[1].length * charW },
        { ...p, text: m[2], x, w: m[2].length * charW },
    ];
}

/** Left-aligned stacks of lines: address blocks, label/value boxes, paragraphs */
function buildBlocks(lines: TextLine[]): Block[] {
    const blocks: Block[] = [];
    for (const line of lines) {
        for (const p of line.phrases) {
            const block = blocks.find(b => {
                const last = b.lines[b.lines.length - 1];
                const gap = last.y - p.y;
                // A title in a bigger font starts its own block
                const sameSize = Math.abs(last.h - p.h) <= Math.max(1.5, Math.min(last.h, p.h) * 0.25);
                return last.page === p.page && sameSize && Math.abs(b.x - p.x) <= Math.max(3, p.h * 0.4) && gap > 0 && gap <= Math.max(last.h, p.h) * 1.9;
            });
            if (block) block.lines.push(p);
            else blocks.push({ x: p.x, lines: [p] });
        }
    }
    return blocks;
}

function isAllCaps(s: string): boolean {
    return /[A-Z]/.test(s) && s === s.toUpperCase();
}

/** Where the name of a supplier block ends and its address begins */
function splitNameAndAddress(texts: string[]): { name: string; nameLines: number; address: string[] } {
    const name = [texts[0]];
    let i = 1;
    const next = texts[1];
    if (
        next &&
        !/\d/.test(next) &&
        !ADDRESS_HINT.test(next) &&
        !IDENTIFIER_LINE.test(next) &&
        !(isAllCaps(next) && !isAllCaps(texts[0])) &&
        next.split(/\s+/).length <= 5 &&
        (/(?:&|\band|,|-|\bof)\s*$/i.test(texts[0]) || /^[a-z&]/.test(next) || (texts.length >= 5 && /^[A-Z]/.test(next)))
    ) {
        name.push(next);
        i = 2;
    }
    const address: string[] = [];
    for (; i < texts.length && address.length < 7; i++) {
        const t = texts[i];
        if (IDENTIFIER_LINE.test(t) || ADDRESS_STOP.test(t) || findAmounts(t).length > 0 || parseDate(t) || /^\+?[\d\s()-]{7,}$/.test(t)) break;
        address.push(t);
    }
    return { name: collapseSpaces(name.join(' ')).replace(/[,:]$/, ''), nameLines: name.length, address };
}

/** Address lines → one line: "Unit 7, Mill Road, Cork T12 R2KX, Ireland" */
export function joinAddress(lines: string[]): string {
    const parts: string[] = [];
    for (const raw of lines) {
        const line = raw.trim().replace(/[,.]+$/, '');
        if (!line) continue;
        // An Eircode wrapped after its routing key: "CORK CITY CORK T12" + "R2KX"
        if (parts.length && /\b[AC-FHKNPRTV-Y]\d{2}$/i.test(parts[parts.length - 1]) && /^[AC-FHKNPRTV-Y0-9]{4}$/i.test(line)) {
            parts[parts.length - 1] += ` ${line}`;
        } else {
            parts.push(line);
        }
    }
    return parts.join(', ').replace(/\s*,\s*,/g, ',').replace(/\s+,/g, ',');
}

/** Whom the invoice asks cheques to be made out to: the payee, whatever the letterhead says */
function payableTo(lines: TextLine[]): Found | undefined {
    for (const line of lines) {
        const m = PAYABLE_TO.exec(line.text);
        if (!m) continue;
        const name = collapseSpaces(m[1].split(/[.!;]\s+(?=[A-Z])/)[0]).replace(/[.,;:!]+$/, '');
        if (/\d/.test(name) || name.split(/\s+/).length > 8 || OUR_ORGANISATION.test(name) || name.replace(/[^\p{L}]/gu, '').length < 3) continue;
        return { value: name, sure: true, source: line.phrases.map(rectOf), from: line.text };
    }
    return undefined;
}

// ─── Supplier filled in as a form ──────────────────────────────

/** "Name:" / "Address:" — whose depends on the section ("From:" or "To:") they are in */
const NAME_FIELD = /^\s*(?:full\s+)?name\s*(?::|$)/i;
const ADDRESS_FIELD = /^\s*(?:postal\s+)?address\s*(?::|$)/i;
/** "Supplier Name:", "Business Address:" — the supplier's wherever they are */
const SUPPLIER_NAME_FIELD = /^\s*(?:supplier|vendor|payee|business|company|trading)\s*name\s*(?::|$)/i;
const SUPPLIER_ADDRESS_FIELD = /^\s*(?:supplier|vendor|payee|business|company)\s*address\s*(?::|$)/i;
/** Any "Label: value" at the start of a line: "Tel No: …", "PPS Number: …" */
const FIELD_LABEL = /^[\p{L}][\p{L} .'/&-]{1,30}:/u;

type Party = 'supplier' | 'customer';

/** The party a section label names: "From:" the supplier, "To:" / "Bill to:" the customer */
function partyLabel(text: string): Party | null {
    const t = INLINE_LABEL.exec(text)?.[1] ?? text.trim();
    if (SUPPLIER_LABEL.test(t)) return 'supplier';
    if (CUSTOMER_LABEL.test(t)) return 'customer';
    return null;
}

/** Which party each line is about: from a "From:" or "To:" label to the next heading or label */
function partyOfLines(lines: TextLine[]): Map<TextLine, Party> {
    const party = new Map<TextLine, Party>();
    let current: Party | null = null;
    let page = -1;
    for (const line of lines) {
        if (line.page !== page) current = null;
        page = line.page;
        const labels = new Set(line.phrases.map(p => partyLabel(p.text)).filter(Boolean));
        // "To:" and "From:" side by side say nothing about the lines under them
        if (labels.size) current = labels.size === 1 ? [...labels][0] : null;
        else if (line.phrases.some(p => HEADING.test(p.text) || LONE_HEADING.test(p.text.trim()) || ANY_TOTAL.test(p.text))) current = null;
        if (current) party.set(line, current);
    }
    return party;
}

/**
 * The value of a "Label: value" field and the lines under it lined up with it:
 * "Address:  Unit 4, Main Street" + "           Cork".
 */
function fieldValue(lines: TextLine[], li: number, pi: number, label: RegExpExecArray, maxLines: number): Phrase[] {
    const line = lines[li];
    const p = line.phrases[pi];
    const own = p.text.slice(label.index + label[0].length).replace(/^[\s:.–-]+/, '');
    const values: Phrase[] = [];
    let x = p.x;
    if (own) {
        values.push({ ...p, text: own });
        x = p.x + (p.text.length - own.length) * (p.w / Math.max(1, p.text.length));
    } else {
        const next = line.phrases[pi + 1];
        if (next && next.x - (p.x + p.w) <= 200) {
            values.push(next);
            x = next.x;
        }
    }
    let last = line;
    for (let i = li + 1; i < lines.length && values.length < maxLines; i++) {
        const l = lines[i];
        const first = l.phrases[0];
        if (l.page !== last.page || last.y - l.y > Math.max(last.h, l.h) * 2.2 || Math.abs(first.x - x) > Math.max(4, first.h * 0.6)) break;
        const t = first.text;
        if (FIELD_LABEL.test(t) || IDENTIFIER_LINE.test(t) || ADDRESS_STOP.test(t) || OUR_ORGANISATION.test(t) || findAmounts(t).length > 0 || parseDate(t) || /^\+?[\d\s()-]{7,}$/.test(t)) break;
        values.push(first);
        last = l;
    }
    return values;
}

/**
 * The supplier written as a form ("FROM:" / "Name: Anna Byrne" / "Address: Rose Cottage…"),
 * as sole traders fill in an invoice template: "Name:" and "Address:" under "From:", or
 * labelled as the supplier's anywhere but under "To:".
 */
function supplierForm(lines: TextLine[]): { name?: Found; address?: Found } {
    const party = partyOfLines(lines);
    const form: { name?: Found; address?: Found } = {};
    lines.forEach((line, li) => {
        const side = party.get(line);
        if (side === 'customer') return;
        line.phrases.forEach((p, pi) => {
            const isName = (side === 'supplier' && NAME_FIELD.exec(p.text)) || SUPPLIER_NAME_FIELD.exec(p.text);
            const isAddress = (side === 'supplier' && ADDRESS_FIELD.exec(p.text)) || SUPPLIER_ADDRESS_FIELD.exec(p.text);
            const label = isName || isAddress;
            if (!label || (isName ? form.name : form.address)) return;
            const values = fieldValue(lines, li, pi, label, isName ? 1 : 5);
            const texts = values.map(v => collapseSpaces(v.text));
            const text = texts.join(' ');
            if (!values.length || OUR_ORGANISATION.test(text) || IDENTIFIER_LINE.test(text) || text.replace(/[^\p{L}]/gu, '').length < 3) return;
            const source = [rectOf(p), ...values.filter(v => v.x !== p.x || v.y !== p.y).map(rectOf)];
            const from = [values[0].x === p.x ? p.text : `${p.text} ${values[0].text}`, ...texts.slice(1)].join(' / ');
            if (isName) {
                if (text.split(/\s+/).length <= 8) form.name = { value: text.replace(/[,:]$/, ''), sure: true, source, from };
            } else {
                form.address = { value: joinAddress(texts), sure: true, source, from };
            }
        });
    });
    return form;
}

/** "Posh Burger" in a bigger font right above "Bloom Food & Co, 611 Harbour Point…": the name over its address */
function titleAbove(lines: TextLine[], top: Phrase): Phrase | undefined {
    const above = lines[lines.findIndex(l => l.phrases.includes(top)) - 1];
    const title = above?.phrases.length === 1 ? above.phrases[0] : undefined;
    if (!title || title.page !== top.page || HEADING.test(title.text) || OUR_ORGANISATION.test(title.text) || /\d|:\s*$/.test(title.text)) return undefined;
    const gap = title.y - top.y;
    return Math.abs(title.x - top.x) <= Math.max(3, top.h * 0.4) && title.h >= top.h * 1.25 && gap > 0 && gap <= title.h * 1.9 ? title : undefined;
}

function readSupplier(textLines: TextLine[], allText: string): SupplierFacts {
    const supplier: SupplierFacts = {};
    const lines = textLines.map(l => ({ ...l, phrases: l.phrases.flatMap(p => splitLabel(p, textLines)) }));
    const payable = payableTo(lines);

    const emails = [...allText.matchAll(EMAIL_RE)].map(m => m[0]).filter(e => !OUR_ORGANISATION.test(e) && !/partnership/i.test(e));
    supplier.email = emails[0];
    const sites = [...allText.matchAll(WEBSITE_RE)].map(m => m[0]).filter(s => !OUR_ORGANISATION.test(s) && !/partnership/i.test(s));
    supplier.website = sites[0];
    const domains = [...emails, ...sites].map(domainWord).filter((d): d is string => !!d);

    const phones = lines.filter(l => PHONE_LABEL.test(l.text) && !OUR_ORGANISATION.test(l.text)).flatMap(l => l.text.match(PHONE_RE) ?? []);
    supplier.phone = phones[0];

    const iban = allText.match(IBAN_RE)?.[0];
    if (iban) supplier.iban = iban.replace(/\s/g, '');
    supplier.bic = best(labelled(lines, /\b(?:bic|swift)(?:\s*code)?\b/i, t => {
        const token = t.trim().split(/\s+/)[0]?.replace(/[.,;:]$/, '') ?? '';
        return /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(token) ? token : null;
    }))?.value;
    supplier.vatNumber = best(labelled(lines, VAT_NUMBER, t => {
        const token = t.trim().split(/\s+/)[0]?.replace(/[.,;:]$/, '') ?? '';
        return /^(?:IE)?[A-Z0-9]{6,14}$/i.test(token) && /\d/.test(token) ? token.toUpperCase() : null;
    }, l => OUR_ORGANISATION.test(l.text)))?.value;

    // Score every block that could be the supplier's name and address
    let bestBlock: { score: number; lines: Phrase[]; labelSure: boolean } | null = null;
    const pageTop = new Map<number, number>();
    for (const l of lines) pageTop.set(l.page, Math.max(pageTop.get(l.page) ?? -Infinity, l.y));
    for (const block of buildBlocks(lines)) {
        let blockLines = block.lines;
        if (blockLines.some(p => OUR_ORGANISATION.test(p.text))) continue;
        while (blockLines.length > 1 && HEADING.test(blockLines[0].text)) blockLines = blockLines.slice(1);
        if (CUSTOMER_LABEL.test(blockLines[0].text)) continue;
        let labelSure = false;
        // "From: Acme Ltd" with the address under the label
        const inline = INLINE_LABEL.exec(blockLines[0].text);
        if (inline) {
            if (!SUPPLIER_LABEL.test(inline[1])) continue;
            blockLines = [{ ...blockLines[0], text: inline[2] }, ...blockLines.slice(1)];
            labelSure = true;
        }
        // "From:" / "Payable to:" on a line of its own above the name
        if (SUPPLIER_LABEL.test(blockLines[0].text) && blockLines.length > 1) {
            blockLines = blockLines.slice(1);
            labelSure = true;
        }
        const first = blockLines[0].text;
        // Not a name: a heading or label ("Terms and Conditions:"), the company's registration
        // in the footer ("Registered in Ireland No. 772805, VAT …"), a numbered line
        if (HEADING.test(first) || /:\s*$/.test(first) || /^(?:registered\b|dates?\b)/i.test(first) || IDENTIFIER_LINE.test(first) || /^\d+[.)]\s/.test(first)) continue;
        if (findAmounts(first).length > 0 || parseDate(first)) continue;
        if (first.replace(/[^\p{L}]/gu, '').length < 3) continue;
        // A letterhead: the name printed bigger right above its address
        const title = titleAbove(lines, blockLines[0]);
        if (title) blockLines = [title, ...blockLines];
        const texts = blockLines.map(p => p.text);

        // A label left of the first line: "To:" in a payment advice is the supplier, elsewhere the customer
        const firstLine = lines.find(l => l.phrases.includes(blockLines[0]));
        const label = firstLine?.phrases.filter(p => p.x < block.x).map(p => p.text).join(' ').trim() ?? '';
        const top = blockLines[0];
        const inPaymentAdvice = lines.some(l => l.page === top.page && l.y > top.y && l.y - top.y < top.h * 8 && /payment\s+advice|remittance/i.test(l.text));
        const adviceTo = inPaymentAdvice && /^to\b/i.test(label);
        if (CUSTOMER_LABEL.test(label) && !adviceTo) continue;

        let score = 0;
        if (texts.length >= 2) score += 1;
        if (texts.slice(1).some(t => ADDRESS_HINT.test(t))) score += 2;
        if (texts.some(t => VAT_NUMBER.test(t))) score += 2;
        if (domains.some(d => texts.slice(0, 2).some(t => squash(t).includes(d)))) score += 3;
        if (SUPPLIER_LABEL.test(label) || adviceTo || (payable && squash(first) === squash(payable.value))) labelSure = true;
        if (labelSure) score += 3;
        if (top.page === 0 && (pageTop.get(0) ?? 0) - top.y < 140) score += 1;
        if (texts.length === 1) score -= 1;
        if (!bestBlock || score > bestBlock.score) bestBlock = { score, lines: blockLines, labelSure };
    }

    if (bestBlock && bestBlock.score >= 3) {
        const texts = bestBlock.lines.map(p => p.text);
        const { name, nameLines, address } = splitNameAndAddress(texts);
        const domainMatch = domains.some(d => squash(name).includes(d));
        const sure = bestBlock.labelSure || (domainMatch && bestBlock.score >= 6);
        supplier.name = { value: name, sure, source: bestBlock.lines.slice(0, nameLines).map(rectOf), from: texts.slice(0, nameLines).join(' / ') };
        if (address.length > 0) {
            const addressLines = bestBlock.lines.slice(nameLines, nameLines + address.length);
            supplier.address = { value: joinAddress(address), sure, source: addressLines.map(rectOf), from: address.join(' / ') };
        }
        // A phone number on a line of its own under the name
        supplier.phone ??= texts.join('\n').match(PHONE_RE)?.[0];
    }
    // "From:" / "Name: …" / "Address: …" says it in so many words
    const form = supplierForm(lines);
    if (form.name && !bestBlock?.labelSure) {
        supplier.name = form.name;
        supplier.address = form.address ?? supplier.address;
    } else if (form.address && !supplier.address) {
        supplier.address = form.address;
    }
    if (payable) supplier.name = payable;

    // A registered office in the footer: "Registered Office: ACME LTD, Unit 3, Cork, T12 X345.",
    // or only its address: "Registered Address 611 Harbour Point Business Park, Cork, T45YK68"
    if (!supplier.address) {
        const office = lines.find(l => /registered\s+(?:office\s*:|address\b)/i.test(l.text) && !OUR_ORGANISATION.test(l.text));
        const m = office && /registered\s+(office|address)\s*:?\s*(.*)$/i.exec(office.text);
        if (office && m) {
            const parts = m[2].split(/\s*,\s*/).filter(Boolean);
            const named = /office/i.test(m[1]);
            if (parts.length >= 2) {
                if (named && !supplier.name) supplier.name = { value: collapseSpaces(parts[0]), sure: false, source: office.phrases.map(rectOf), from: office.text };
                supplier.address = { value: joinAddress(named ? parts.slice(1) : parts), sure: false, source: office.phrases.map(rectOf), from: office.text };
            }
        }
    }
    return supplier;
}

// ─── Totals ────────────────────────────────────────────────────

function amountBeside(lines: TextLine[], label: RegExp, skip: Set<TextLine>): Candidate<number>[] {
    const found: Candidate<number>[] = [];
    lines.forEach((line, li) => {
        if (skip.has(line)) return;
        line.phrases.forEach((p, pi) => {
            const m = label.exec(p.text);
            if (!m) return;
            let hit: Candidate<number> | null = null;
            const own = findAmounts(p.text.slice(m.index + m[0].length));
            if (own.length) hit = { value: own[own.length - 1].value, score: 3, rects: [rectOf(p)], from: p.text };
            for (const r of line.phrases.slice(pi + 1)) {
                // What follows the next label is that one's: "VAT | Total Net 733.95"
                if (ANY_TOTAL.test(r.text) || VAT.test(r.text)) break;
                const a = findAmounts(r.text);
                if (a.length) hit = { value: a[a.length - 1].value, score: 3, rects: [rectOf(p), rectOf(r)], from: `${p.text} ${r.text}` };
            }
            if (!hit) {
                const below = phraseBelow(lines, li, p);
                const a = below ? findAmounts(below.text) : [];
                if (below && a.length) hit = { value: a[0].value, score: 2, rects: [rectOf(p), rectOf(below)], from: `${p.text} ${below.text}` };
            }
            if (hit) found.push(hit);
        });
    });
    return found;
}

// ─── All together ──────────────────────────────────────────────

/** A date standing alone near the top ("INVOICE" / "1/10/2026"): most likely the invoice date */
function loneDate(lines: TextLine[], dueDate: string | undefined): Found | undefined {
    const stop = lines.findIndex(l => l.phrases.some(p => ANY_TOTAL.test(p.text)) || l.phrases.some(p => HEADER_DESC.test(p.text) && l.phrases.length > 1));
    for (const line of lines.slice(0, stop < 0 ? lines.length : stop)) {
        for (const p of line.phrases) {
            const [date] = findDates(p.text);
            if (!date || date.iso === dueDate || p.text.slice(0, date.index).trim() || p.text.slice(date.end).replace(/[.,]/g, '').trim()) continue;
            return { value: date.iso, sure: false, source: [rectOf(p)], from: p.text };
        }
    }
    return undefined;
}

export function extractInvoice(phrases: Phrase[]): InvoiceFacts {
    const lines = toLines(phrases);
    const allText = lines.map(l => l.text).join('\n');
    const facts: InvoiceFacts = { hasText: allText.replace(/\s/g, '').length > 20, supplier: {}, items: [], people: [], mentionsSicap: /\bsicap\b/i.test(allText) };
    if (!facts.hasText) return facts;

    const invoiceNumber = best(labelled(lines, INVOICE_NO, referenceToken));
    if (invoiceNumber) facts.invoiceNumber = invoiceNumber;
    else {
        const m = /\b(INV[-\s]?\d+[A-Z0-9-]*)\b/i.exec(allText);
        if (m) facts.invoiceNumber = { value: m[1], sure: false, from: m[0] };
    }

    facts.dueDate = best(labelled(lines, DUE_DATE, parseDate));
    facts.invoiceDate = best(labelled(lines, INVOICE_DATE, parseDate)) ?? loneDate(lines, facts.dueDate?.value);

    const poCandidates = labelled(lines, PO_NUMBER, t => {
        const token = referenceToken(t);
        return token && token !== facts.invoiceNumber?.value ? token : null;
    });
    const po = best(poCandidates);
    if (po) facts.poNumber = po;
    // Several purchase orders on one invoice ("PO # 8208", "PO # 8209"…): all of them, in order
    const orders = [...new Map(poCandidates.filter(c => c.score >= 2.5 && /\bp\.?\s?o\b|purchase/i.test(c.from)).map(c => [c.value, c])).values()];
    if (orders.length > 1) {
        facts.poNumbers = orders.map(c => c.value);
        facts.poNumber = { value: facts.poNumbers.join(', '), sure: true, source: orders.flatMap(c => c.rects), from: orders.map(c => c.from).join(' · ') };
    }

    const table = readItems(lines);
    const { items, itemLines } = table.items.length ? table : looseItems(lines);
    facts.items = items.filter(i => i.description || i.amount !== undefined);

    const strong = best(amountBeside(lines, TOTAL_STRONG, itemLines));
    const weak = best(amountBeside(lines, TOTAL_WEAK, itemLines));
    const subtotal = best(amountBeside(lines, SUBTOTAL, itemLines));
    const vat = best(amountBeside(lines, VAT, itemLines));
    if (subtotal) facts.subtotal = subtotal;
    if (vat) facts.vat = vat;
    const total = strong && strong.value > 0 ? strong : weak ?? strong;
    if (total) {
        // Sure when two things agree: two total labels, subtotal + VAT, or the lines
        // ("TOTAL Amount: EUR 2400" is one label, though both kinds read it)
        const itemSum = facts.items.reduce((s, i) => s + (i.amount ?? 0), 0);
        const samePlace = (a: Found<number>, b: Found<number>) => JSON.stringify(a.source?.[0]) === JSON.stringify(b.source?.[0]);
        const agree =
            (strong && weak && !samePlace(strong, weak) && Math.abs(strong.value - weak.value) < 0.005) ||
            (subtotal && Math.abs(subtotal.value + (vat?.value ?? 0) - total.value) < 0.005) ||
            (facts.items.length > 0 && facts.items.every(i => i.amount !== undefined) && Math.abs(itemSum + (vat?.value ?? 0) - total.value) < 0.005);
        facts.total = { ...total, sure: !!agree };
    } else if (facts.items.length > 0 && facts.items.every(i => i.amount !== undefined)) {
        const sum = Math.round(facts.items.reduce((s, i) => s + (i.amount ?? 0), 0) * 100) / 100;
        facts.total = { value: sum, sure: false, from: 'the sum of the lines' };
    }

    facts.supplier = readSupplier(lines, allText);

    facts.people = numberedPeople(facts.items.flatMap(i => i.details));
    for (const item of facts.items) {
        const texts = [item.description, ...item.details];
        const range = texts.map(t => findDateRange(t)).find(Boolean);
        if (range) {
            // Separate days ("26/08/26", "27/08/26", "28/08/26"), each its own course
            const days = [...new Set(texts.flatMap(t => findDates(t).map(d => d.iso)))].sort();
            facts.serviceDates = !range.end && days.length > 1 ? { start: days[0], days } : range;
            break;
        }
    }

    const attention = phrases.map(p => /\b(?:attention|attn|fao|for the attention of)\b\.?\s*:?\s*(.+)$/i.exec(p.text)?.[1]).find(Boolean);
    if (attention) facts.attention = collapseSpaces(attention).replace(/[,.]$/, '');
    return facts;
}

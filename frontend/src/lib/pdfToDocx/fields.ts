// ─── Where a converted form can be filled in ───────────────────
// Every printed checkbox, every "__/__/20__" date blank, every other line of
// underscores and every empty table cell becomes a field. Each field keeps the
// printed label next to it, which also says what CRM data belongs in it.

import { cellAt, findDateBlanks, insetCell } from '../pdfForms/layout';
import type { PdfLayout, Phrase, Rect } from '../pdfForms/types';
import type { PrintedBox } from './convert';
import type { ImagePlacement, VectorShape } from './types';

/** CRM data a field can take */
export type CrmKey =
    | 'firstName'
    | 'lastName'
    | 'fullName'
    | 'email'
    | 'phone'
    | 'address'
    | 'eircode'
    | 'dob'
    | 'courseName'
    | 'courseDate'
    | 'staff'
    | 'today';

export type DatePart = 'dd' | 'mm' | 'yyyy' | 'yy';

export interface TextFieldDef {
    id: string;
    kind: 'text';
    page: number;
    rect: Rect;
    /** The printed question this answers */
    label: string;
    multiline: boolean;
    align: 'left' | 'center';
    valign: 'top' | 'middle' | 'bottom';
    /** Part of a printed date: which part */
    part?: DatePart;
    crm?: CrmKey;
}

export interface CheckFieldDef {
    id: string;
    kind: 'check';
    page: number;
    rect: Rect;
    /** The checkbox's own printed label */
    label: string;
}

export type FieldDef = TextFieldDef | CheckFieldDef;

export const CRM_LABELS: Record<CrmKey, string> = {
    firstName: 'First name',
    lastName: 'Last name',
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    eircode: 'Eircode',
    dob: 'Date of birth',
    courseName: 'Course name',
    courseDate: 'Course date',
    staff: 'Your name',
    today: "Today's date",
};

// ─── What a label asks for ─────────────────────────────────────

const TEXT_KEYS: [CrmKey, RegExp][] = [
    ['firstName', /\bfirst\s*name\b|\bforename\b|\bgiven\s*name\b/i],
    ['lastName', /\b(last|family)\s*name\b|\bsurname\b/i],
    ['fullName', /^(full\s*)?name\b|\b(participant|learner|student|client|applicant|contact|person)('?s)?\s+name\b/i],
    ['email', /\be-?mail\b/i],
    ['phone', /\bmobile\b|\bphone\b|\btel(ephone)?\b|\bcontact\s+number\b/i],
    ['eircode', /\beir\s*code\b|\bpost\s*code\b/i],
    ['address', /\baddress\b/i],
    ['courseName', /\bcourse\s*(name|title)\b|\bprogramme\s*name\b/i],
    ['staff', /\bstaff\s*(member|name)\b|\bsupport\s*worker\b/i],
];

const DATE_KEYS: [CrmKey, RegExp][] = [
    ['dob', /\bbirth\b|\bd\.?o\.?b\b/i],
    ['courseDate', /\bstart\s*date\b|\bcourse\s*date\b|\bdate\s*of\s*(the\s*)?course\b/i],
    ['today', /\bregistration\b|\bdate\s*of\s*(signing|completion)\b|^\s*date\s*:?\s*$|\bsigned\b|\btoday\b/i],
];

/** The CRM value a text field's label asks for, if any */
export function crmKeyForLabel(label: string, isDate: boolean): CrmKey | undefined {
    const text = label.replace(/\s+/g, ' ').trim();
    if (isDate) return DATE_KEYS.find(([, re]) => re.test(text))?.[0];
    // "Email address", "No Official Address" are not the postal address
    if (/\be-?mail\b/i.test(text)) return 'email';
    if (/\bofficial address\b|\bweb(site)?\s*address\b/i.test(text)) return undefined;
    // An organisation's address, name or contact details are not a student's
    if (/\b(co|organisation|organization|group|network|business|company|employer|venue)\b/i.test(text)) return undefined;
    return TEXT_KEYS.find(([, re]) => re.test(text))?.[0];
}

// ─── Finding the fields ────────────────────────────────────────

export interface FieldSources {
    layout: PdfLayout;
    /** Checkbox squares drawn on each page (from the conversion) */
    boxes: PrintedBox[];
    shapes: VectorShape[][];
    images: ImagePlacement[][];
}

const UNDERSCORES = /_{4,}|[—–]{3,}/g;

/** Rough Arial advance widths (em) for placing a run of underscores inside its phrase */
function charWidth(ch: string): number {
    if (ch === '—') return 1;
    if (ch === '_' || ch === '–' || /\d/.test(ch)) return 0.556;
    if (ch === ' ' || ch === '/' || ch === 'i' || ch === 'l' || ch === '.' || ch === ',' || ch === ':' || ch === '(' || ch === ')') return 0.278;
    if (/[A-Z]/.test(ch)) return 0.68;
    return 0.53;
}

function overlaps(a: Rect, b: Rect, pad = 0): boolean {
    return a.page === b.page && a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;
}

function phraseBox(p: Phrase): Rect {
    return { page: p.page, x: p.x, y: p.y - p.h * 0.2, w: p.w, h: p.h * 1.1 };
}

function inset(r: Rect, pad: number): Rect {
    const px = Math.min(pad, r.w / 4);
    const py = Math.min(pad * 0.6, r.h / 4);
    return { ...r, x: r.x + px, y: r.y + py, w: r.w - 2 * px, h: r.h - 2 * py };
}

/** Every table cell on a page: from its borders and from shaded cell backgrounds */
export function tableCells(layout: PdfLayout, page: number, shapes: VectorShape[]): Rect[] {
    const edges = layout.edges.filter(e => e.page === page);
    const uniq = (vals: number[]) => [...new Set(vals.map(v => Math.round(v * 2) / 2))].sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > 1);
    const xs = uniq(edges.filter(e => e.dir === 'v').map(e => e.at)).slice(0, 120);
    const ys = uniq(edges.filter(e => e.dir === 'h').map(e => e.at)).slice(0, 160);
    const cells: Rect[] = [];
    const seen = new Set<string>();
    const add = (c: Rect | null) => {
        if (!c) return;
        const key = `${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.w)},${Math.round(c.h)}`;
        if (seen.has(key)) return;
        seen.add(key);
        cells.push(c);
    };
    for (let i = 0; i + 1 < xs.length; i++) {
        for (let j = 0; j + 1 < ys.length; j++) {
            add(cellAt(layout, page, (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2));
        }
    }
    const size = layout.pages[page];
    for (const s of shapes) {
        if (!s.isRect || !s.fill || s.box.w < 20 || s.box.h < 10) continue;
        if (size && s.box.w * s.box.h > size.w * size.h * 0.5) continue;
        add({ page, ...s.box });
    }
    return cells;
}

function luminance(hex: string): number {
    const n = parseInt(hex, 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/** Text of the printed label for an answer area: the cell to its left, else the one above, else the nearest text on its left */
function labelFor(layout: PdfLayout, r: Rect): string {
    const midY = r.y + r.h / 2;
    const texts = (area: Rect) =>
        layout.phrases
            .filter(p => p.page === area.page && p.x >= area.x - 2 && p.x + p.w <= area.x + area.w + 2 && p.y >= area.y - 2 && p.y <= area.y + area.h)
            .sort((a, b) => b.y - a.y || a.x - b.x)
            .map(p => p.text)
            .filter(t => !/^[_\s/—–-]+$/.test(t))
            .join(' ');
    const left = cellAt(layout, r.page, r.x - 3, midY);
    if (left && left.x + left.w <= r.x + 4) {
        const t = texts(left);
        if (t) return t;
    }
    const above = cellAt(layout, r.page, r.x + Math.min(10, r.w / 2), r.y + r.h + 3);
    if (above && above.y >= r.y + r.h - 4) {
        const t = texts(above);
        if (t) return t;
    }
    const near = layout.phrases
        .filter(p => p.page === r.page && p.x + p.w <= r.x + 2 && r.x - (p.x + p.w) < 220 && Math.abs(p.y - midY) < Math.max(12, r.h / 2) && !/^[_\s/—–-]+$/.test(p.text))
        .sort((a, b) => b.x + b.w - (a.x + a.w))[0];
    return near?.text ?? '';
}

function shortLabel(label: string, max = 70): string {
    const clean = label.replace(/\s+/g, ' ').replace(/[\s:;,.-]+$/, '').trim();
    return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

/** Every field of a converted form, top of the first page first */
export function detectFields(src: FieldSources): FieldDef[] {
    const { layout } = src;
    const fields: FieldDef[] = [];
    let n = 0;
    const id = (prefix: string) => `${prefix}${++n}`;
    const taken: Rect[] = [];

    // 1. Checkboxes, with the label printed beside each
    for (const b of src.boxes) {
        const printed = layout.checkboxes.find(c => c.rect.page === b.page && Math.abs(c.rect.x - b.rect.x) < 1.5 && Math.abs(c.rect.y - b.rect.y) < 1.5);
        fields.push({ id: id('c'), kind: 'check', page: b.page, rect: { page: b.page, ...b.rect }, label: printed?.label ?? '' });
        taken.push({ page: b.page, ...b.rect });
    }

    // 2. Printed dates: day, month and year
    const datePhrases = new Set<Phrase>();
    for (const blank of findDateBlanks(layout)) {
        // The question in the cell to the left ("End Date"), not everything printed left of it on the line
        const label = shortLabel(labelFor(layout, { ...blank.day, x: blank.day.x - 2 }) || blank.label || 'Date');
        const crm = crmKeyForLabel(label, true);
        const parts: [DatePart, Rect][] = [
            ['dd', blank.day],
            ['mm', blank.month],
            [blank.yearDigits === 2 ? 'yy' : 'yyyy', blank.year],
        ];
        for (const [part, rect] of parts) {
            fields.push({ id: id('d'), kind: 'text', page: blank.page, rect, label, multiline: false, align: 'center', valign: 'bottom', part, crm });
            taken.push(rect);
        }
        layout.phrases.filter(p => p.page === blank.page && Math.abs(p.y - blank.day.y) < p.h && p.x <= blank.day.x + 1 && p.x + p.w >= blank.year.x).forEach(p => datePhrases.add(p));
    }

    // 3. Other lines of underscores: "Other, please specify: ________", "Female ________"
    for (const p of layout.phrases) {
        if (datePhrases.has(p)) continue;
        const chars = [...p.text];
        const widths = chars.map(charWidth);
        const scale = p.w / Math.max(1, widths.reduce((a, b) => a + b, 0));
        const xAt = (i: number) => p.x + widths.slice(0, i).reduce((a, b) => a + b, 0) * scale;
        for (const m of p.text.matchAll(UNDERSCORES)) {
            const start = [...p.text.slice(0, m.index)].length;
            const end = start + [...m[0]].length;
            const dashes = /[—–]/.test(m[0]);
            const rect: Rect = { page: p.page, x: xAt(start), y: p.y + (dashes ? p.h * 0.3 : 0.5), w: xAt(end) - xAt(start), h: p.h * 1.15 };
            if (rect.w < 15 || taken.some(t => overlaps(t, rect, 1))) continue;
            const before = p.text.slice(0, m.index).replace(/[_\s:]+$/, '').trim();
            const label = shortLabel(before || labelFor(layout, rect) || 'Answer');
            fields.push({ id: id('u'), kind: 'text', page: p.page, rect, label, multiline: false, align: 'left', valign: 'bottom', crm: crmKeyForLabel(label, false) });
            taken.push(rect);
        }
    }

    // 4. Empty table cells
    layout.pages.forEach((size, page) => {
        const shapes = src.shapes[page] ?? [];
        const images = (src.images[page] ?? []).map(i => ({ page, ...i.box }));
        const cells = tableCells(layout, page, shapes)
            .filter(c => c.w >= 25 && c.h >= 12 && c.w * c.h < size.w * size.h * 0.5)
            .sort((a, b) => a.w * a.h - b.w * b.h);
        const used: Rect[] = [];
        for (const cell of cells) {
            const inner = inset(cell, 1.5);
            if (layout.phrases.some(p => p.page === page && overlaps(phraseBox(p), inner))) continue;
            if (taken.some(t => overlaps(t, inner)) || images.some(i => overlaps(i, inner)) || used.some(u => overlaps(u, inner, 1))) continue;
            // Dark cells are headings or bars, not places to write
            const fill = shapes.filter(s => s.isRect && s.fill && s.box.x <= cell.x + cell.w / 2 && s.box.x + s.box.w >= cell.x + cell.w / 2 && s.box.y <= cell.y + cell.h / 2 && s.box.y + s.box.h >= cell.y + cell.h / 2).sort((a, b) => b.z - a.z)[0];
            if (fill?.fill && luminance(fill.fill.color) < 0.55) continue;
            used.push(cell);
            const rect = inset(cell, 3);
            const label = shortLabel(labelFor(layout, cell) || 'Answer');
            // Room for two lines: the answer may wrap; a big box is written from its top
            const multiline = rect.h >= 26;
            fields.push({ id: id('t'), kind: 'text', page, rect, label, multiline, align: 'left', valign: rect.h > 60 ? 'top' : 'middle', crm: crmKeyForLabel(label, false) });
        }
    });

    // One phone number: it goes in "Mobile" when the form also asks for another phone
    const phones = fields.filter((f): f is TextFieldDef => f.kind === 'text' && f.crm === 'phone');
    const mobile = phones.find(f => /mobile/i.test(f.label)) ?? phones[0];
    phones.filter(f => f !== mobile).forEach(f => delete f.crm);

    return fields.sort((a, b) => a.page - b.page || Math.round(b.rect.y + b.rect.h) - Math.round(a.rect.y + a.rect.h) || a.rect.x - b.rect.x);
}

/** A text field added by hand where someone clicked: the table cell there, else a line-sized box */
export function fieldAt(layout: PdfLayout, page: number, x: number, y: number, id: string): TextFieldDef {
    const size = layout.pages[page];
    const cell = cellAt(layout, page, x, y);
    const pageW = size?.w ?? x + 170;
    const w = Math.min(160, Math.max(40, pageW - 20));
    const rect: Rect =
        cell && size && cell.w * cell.h < size.w * size.h * 0.5
            ? insetCell(cell)
            : { page, x: Math.max(10, Math.min(x, pageW - 10 - w)), y: y - 7, w, h: 14 };
    const label = shortLabel(labelFor(layout, cell ?? rect) || 'Added field');
    const multiline = rect.h >= 26;
    return { id, kind: 'text', page, rect, label, multiline, align: 'left', valign: rect.h > 60 ? 'top' : 'middle', crm: crmKeyForLabel(label, false) };
}

// ─── Values ────────────────────────────────────────────────────

export type FieldValues = Record<string, string | boolean>;

export interface CrmRecord {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    eircode?: string;
    /** YYYY-MM-DD */
    dob?: string | null;
    courseName?: string;
    /** YYYY-MM-DD */
    courseDate?: string | null;
    staff?: string;
    /** YYYY-MM-DD */
    today?: string;
}

function datePart(iso: string | null | undefined, part: DatePart | undefined): string {
    const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    switch (part) {
        case 'dd':
            return m[3];
        case 'mm':
            return m[2];
        case 'yy':
            return m[1].slice(2);
        case 'yyyy':
            return m[1];
        default:
            return `${m[3]}/${m[2]}/${m[1]}`;
    }
}

/** The text a field takes from a CRM record ('' when the record has nothing for it) */
export function crmValue(f: TextFieldDef, r: CrmRecord): string {
    switch (f.crm) {
        case 'firstName':
            return r.firstName ?? '';
        case 'lastName':
            return r.lastName ?? '';
        case 'fullName':
            return [r.firstName, r.lastName].filter(Boolean).join(' ');
        case 'email':
            return r.email ?? '';
        case 'phone':
            return r.phone ?? '';
        case 'address':
            return (r.address ?? '').trim();
        case 'eircode':
            return r.eircode ?? '';
        case 'courseName':
            return r.courseName ?? '';
        case 'staff':
            return r.staff ?? '';
        case 'dob':
        case 'courseDate':
        case 'today':
            return datePart(r[f.crm], f.part);
        default:
            return '';
    }
}

/** Fill every CRM field from a record; other fields keep their values */
export function applyCrm(fields: FieldDef[], values: FieldValues, r: CrmRecord, opts: { overwrite?: boolean } = {}): FieldValues {
    const next: FieldValues = { ...values };
    const hasEircodeBox = fields.some(f => f.kind === 'text' && f.crm === 'eircode');
    for (const f of fields) {
        if (f.kind !== 'text' || !f.crm) continue;
        let v = crmValue(f, r);
        if (f.crm === 'address' && !hasEircodeBox && r.eircode && !v.toUpperCase().replace(/\s/g, '').includes(r.eircode.toUpperCase().replace(/\s/g, ''))) {
            v = [v, r.eircode].filter(Boolean).join(', ');
        }
        if (opts.overwrite === false && typeof next[f.id] === 'string' && (next[f.id] as string).trim()) continue;
        next[f.id] = v;
    }
    return next;
}

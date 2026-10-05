// ─── First draft of a template from a sample spreadsheet ───────
// Columns whose answers read like checkbox labels become choice fields; columns
// whose header reads like a printed label become text fields in the cell next
// to it. Everything is a suggestion: the editor shows it for review.

import { bestOption, withSiblings } from './choice';
import { answerRectForLabel, findDateBlanks, ruledLines, type DateBlank } from './layout';
import { parseLooseDate, placeholderFor } from './source';
import { bigramSimilarity, containment, normalizeText, similarity, splitAnswers, tokens } from './text';
import { DEFAULT_FONT_SIZE, type Checkbox, type ChoiceField, type ChoiceOption, type FormField, type Phrase, type PdfLayout, type Rect, type SheetData, type TextField } from './types';

/** Columns a form export adds that belong on no form (response id, timestamps) */
const SKIP_HEADERS = /^(id|start time|completion time|last modified time|timestamp|submitted|response id)$/i;

/** A person's name, not a group's ("Contact Name", "Full name", "Name") */
const PERSON_NAME = /^(name|full name|your name)$|\b(contact|person|participant|client|applicant)\b.*\bname\b|\bfull name\b/i;

/** Printed notes that make a question take a single answer */
const SINGLE_NOTE = /select one|tick one box|one option only|tick one only|choose one/i;
const MULTI_NOTE = /one or more|all that apply/i;

/** Office fields filled in for every form */
const REGISTRATION_DATE = /\bregistration\b/i;
const STAFF_LABEL = /\bstaff (member|name)\b|\bsupport worker\b/i;
const EIRCODE_HEADER = /\beir ?code\b|\bpost ?code\b/i;
/** Words too common to say two date questions are about the same thing */
const DATE_NOISE = new Set(['date', 'org', 'name', 'when', 'what', 'how', 'long', 'was', 'been', 'has', 'have']);

/** Labels too common to say which question a column answers */
const GENERIC_LABELS = new Set(['yes', 'no', 'other', 'not applicable', 'prefer not to say', 'none', 'dont know']);

let counter = 0;
export function newId(prefix: string): string {
    counter = (counter + 1) % 1e6;
    return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function optionFromCheckbox(c: Checkbox): ChoiceOption {
    return { id: newId('o'), label: c.label, rect: { ...c.rect }, aliases: [] };
}

function columnValues(sheet: SheetData, col: number): string[] {
    return sheet.rows.map(r => r[col] ?? '').filter(v => v.trim());
}

function choiceFor(header: string, values: string[], layout: PdfLayout, taken: Set<string>): ChoiceField | null {
    const free = layout.checkboxes.filter(c => !taken.has(c.id));
    const asOptions = free.map(c => ({ id: c.id, label: c.label, rect: c.rect, aliases: [] as string[] }));
    const answers = values.flatMap(splitAnswers);
    if (answers.length === 0) return null;

    const hits = new Map<string, number>();
    let matched = 0;
    for (const answer of answers) {
        const option = bestOption(answer, asOptions);
        if (!option) continue;
        matched++;
        hits.set(option.id, (hits.get(option.id) ?? 0) + 1);
    }
    if (matched < answers.length * 0.5) return null;
    const chosen = free.filter(c => hits.has(c.id));
    if (chosen.every(c => GENERIC_LABELS.has(normalizeText(c.label)))) return null;

    const boxes = withSiblings(chosen, { ...layout, checkboxes: free });
    const single = saysSelectOne(boxes, layout);
    return {
        id: newId('f'),
        kind: 'choice',
        name: shortName(header),
        source: placeholderFor(header),
        single,
        options: boxes.map(optionFromCheckbox),
    };
}

/** Does the question these boxes belong to say "select one option" / "tick one box only"? */
export function saysSelectOne(boxes: Checkbox[], layout: PdfLayout): boolean {
    if (boxes.length === 0) return false;
    const page = boxes[0].rect.page;
    const left = Math.min(...boxes.map(b => b.rect.x));
    const top = Math.max(...boxes.map(b => b.rect.y + b.rect.h)) + 30;
    const bottom = Math.min(...boxes.map(b => b.rect.y)) - 30;
    const notes = layout.phrases.filter(p => p.page === page && p.x < left && p.y <= top && p.y >= bottom);
    return notes.some(p => SINGLE_NOTE.test(p.text) && !MULTI_NOTE.test(p.text));
}

function shortName(header: string, max = 48): string {
    const clean = header.replace(/\s+/g, ' ').trim();
    const first = clean.split(/(?<=[?:.])\s/)[0];
    const name = (first.length >= 3 ? first : clean).replace(/[\s:;,.-]+$/, '');
    return name.length > max ? `${name.slice(0, max - 1).trim()}…` : name;
}

function textField(name: string, source: string, rect: TextField['rect'], align: TextField['align'] = 'left'): TextField {
    return {
        id: newId('f'),
        kind: 'text',
        name,
        source,
        rect,
        fontSize: DEFAULT_FONT_SIZE,
        multiline: rect.h >= DEFAULT_FONT_SIZE * 2.4,
        align,
    };
}

/** Day / month / year fields for a printed "__/__/__" blank */
function dateFields(blank: DateBlank, column: string | null): TextField[] {
    const name = shortName(blank.label || 'Date', 36);
    const src = (f: string) => (column ? placeholderFor(column, [f]) : `{today|${f}}`);
    const year = blank.yearDigits === 2 ? 'yy' : 'yyyy';
    return [
        textField(`${name} (day)`, src('dd'), blank.day, 'center'),
        textField(`${name} (month)`, src('mm'), blank.month, 'center'),
        textField(`${name} (year)`, src(year), blank.year, 'center'),
    ];
}

function looksLikeDates(values: string[]): boolean {
    const sample = values.slice(0, 200);
    return sample.length > 0 && sample.filter(v => parseLooseDate(v)).length >= sample.length * 0.6;
}

function sharesTopic(label: string, header: string): boolean {
    const a = new Set(tokens(label).filter(t => !DATE_NOISE.has(t) && t.length > 2));
    return tokens(header).some(t => a.has(t));
}

/** Label phrases printed inside a rect (a question spread over several lines) */
function phrasesIn(layout: PdfLayout, r: Rect): Phrase[] {
    return layout.phrases.filter(p => p.page === r.page && p.x >= r.x - 2 && p.x + p.w <= r.x + r.w + 2 && p.y >= r.y - 2 && p.y <= r.y + r.h + 2);
}

function isLabelCandidate(p: Phrase, layout: PdfLayout): boolean {
    // Checkbox labels and long sentences are not field labels
    if (layout.checkboxes.some(c => c.rect.page === p.page && Math.abs(c.rect.y - p.y) < p.h && p.x > c.rect.x && p.x - (c.rect.x + c.rect.w) < 30)) return false;
    // Headings (large type) and long sentences are not field labels
    return p.h <= 13 && tokens(p.text).length <= 8;
}

export function autoMapTemplate(layout: PdfLayout, sheet: SheetData): FormField[] {
    const fields: FormField[] = [];
    const takenBoxes = new Set<string>();
    const takenLabels = new Set<Phrase>();
    const labels = layout.phrases.filter(p => isLabelCandidate(p, layout));

    // The printed label must be (nearly) all in the header: "Email" for "Email Address"
    const findLabel = (text: string) =>
        labels
            .filter(p => !takenLabels.has(p))
            .map(p => ({ p, score: similarity(text, p.text), inside: containment(p.text, text), close: bigramSimilarity(text, p.text) }))
            .filter(s => s.score >= 0.85 || (s.score >= 0.5 && s.inside >= 0.75))
            .sort((a, b) => b.score - a.score || b.close - a.close)[0]?.p;

    const usedColumns = new Set<number>();
    const blankPhrases = new Set(layout.phrases.filter(p => /^[_\u2014\u2013\-\s/0-9]+/.test(p.text) && /[_\u2014\u2013]{3}/.test(p.text)));

    // 1. Printed date blanks: today for the registration date, else the matching date column
    for (const blank of findDateBlanks(layout)) {
        const labelPhrases = layout.phrases.filter(p => p.page === blank.page && blank.label.includes(p.text) && !blankPhrases.has(p));
        let column: string | null = null;
        if (!REGISTRATION_DATE.test(blank.label)) {
            const candidates = sheet.headers
                .map((header, col) => ({ header, col, values: columnValues(sheet, col) }))
                .filter(c => !usedColumns.has(c.col) && !SKIP_HEADERS.test(c.header.trim()) && looksLikeDates(c.values))
                .map(c => ({ ...c, score: similarity(blank.label, c.header) }))
                .filter(c => c.score >= 0.6 || sharesTopic(blank.label, c.header))
                .sort((a, b) => b.score - a.score);
            if (!candidates[0]) continue;
            column = candidates[0].header;
            usedColumns.add(candidates[0].col);
        }
        labelPhrases.forEach(p => takenLabels.add(p));
        fields.push(...dateFields(blank, column));
    }

    // 2. Who is filling the forms in
    const staff = labels.find(p => STAFF_LABEL.test(p.text));
    if (staff) {
        takenLabels.add(staff);
        fields.push(textField(staff.text, '{user}', answerRectForLabel(layout, staff)));
    }

    sheet.headers.forEach((header, col) => {
        const values = columnValues(sheet, col);
        if (values.length === 0 || usedColumns.has(col) || SKIP_HEADERS.test(header.trim())) return;

        const choice = choiceFor(header, values, layout, takenBoxes);
        if (choice) {
            // Option ids are fresh; mark their source boxes as taken by position
            layout.checkboxes.forEach(c => {
                if (choice.options.some(o => Math.abs(o.rect.x - c.rect.x) < 0.5 && Math.abs(o.rect.y - c.rect.y) < 0.5 && o.rect.page === c.rect.page)) takenBoxes.add(c.id);
            });
            fields.push(choice);
            return;
        }

        // A person's full name feeds separate First / Last name boxes when the form has them
        if (PERSON_NAME.test(header.trim())) {
            const first = findLabel('First Name');
            const last = findLabel('Last Name');
            if (first && last) {
                takenLabels.add(first);
                takenLabels.add(last);
                fields.push(textField(first.text, placeholderFor(header, ['first']), answerRectForLabel(layout, first)));
                fields.push(textField(last.text, placeholderFor(header, ['last']), answerRectForLabel(layout, last)));
                usedColumns.add(col);
                return;
            }
        }

        const isPhone = /phone|mobile|tel/i.test(header);
        const label = findLabel(header);
        if (label) {
            takenLabels.add(label);
            usedColumns.add(col);
            fields.push(textField(label.text, placeholderFor(header, isPhone ? ['phone'] : []), answerRectForLabel(layout, label)));
        }
    });

    // 3. No Eircode box on the form: add it to the address (unless the address already has it)
    const address = fields.find((f): f is TextField => f.kind === 'text' && /\baddress\b/i.test(f.name));
    sheet.headers.forEach((header, col) => {
        if (!address || usedColumns.has(col) || !EIRCODE_HEADER.test(header) || columnValues(sheet, col).length === 0) return;
        address.source = `${address.source}, ${placeholderFor(header, ['new'])}`;
        usedColumns.add(col);
    });

    // 4. A long free-text answer goes in the form's "Describe …" box ("description" columns first)
    const describe = labels.find(p => !takenLabels.has(p) && /^describe\b/i.test(phrasesInCellOf(layout, p).map(q => q.text).join(' ')) && /^describe\b/i.test(p.text));
    const freeText = sheet.headers
        .map((header, col) => ({ header, col, values: columnValues(sheet, col) }))
        .filter(c => !usedColumns.has(c.col) && /\bdescri/i.test(c.header) && c.values.length > 0)
        .filter(c => c.values.reduce((n, v) => n + v.length, 0) / c.values.length >= 60)
        .sort((a, b) => Number(/\bdescription\b/i.test(b.header)) - Number(/\bdescription\b/i.test(a.header)));
    if (describe && freeText[0]) {
        takenLabels.add(describe);
        usedColumns.add(freeText[0].col);
        const name = phrasesInCellOf(layout, describe).map(p => p.text).join(' ');
        const rect = answerRectForLabel(layout, describe);
        const rules = ruledLines(layout, rect);
        fields.push({ ...textField(shortName(name, 60), placeholderFor(freeText[0].header), rect), multiline: true, ...(rules.length ? { lines: rules.length + 1, rules } : {}) });
    }

    // Top of the first page first, as people read the form
    return fields.sort((a, b) => topOf(a).page - topOf(b).page || topOf(b).y - topOf(a).y);
}

/** The phrases sharing a label's table cell, top to bottom */
function phrasesInCellOf(layout: PdfLayout, label: Phrase): Phrase[] {
    const r = answerRectForLabel(layout, label);
    const cell = { page: label.page, x: label.x - 4, y: r.y - 4, w: Math.max(label.w, r.x - label.x), h: r.h + 8 };
    const inside = phrasesIn(layout, cell).sort((a, b) => b.y - a.y || a.x - b.x);
    return inside.length ? inside : [label];
}

function topOf(f: FormField): { page: number; y: number } {
    if (f.kind === 'text') return { page: f.rect.page, y: f.rect.y + f.rect.h };
    const r = f.options[0]?.rect;
    return r ? { page: r.page, y: Math.max(...f.options.filter(o => o.rect.page === r.page).map(o => o.rect.y + o.rect.h)) } : { page: 0, y: 0 };
}

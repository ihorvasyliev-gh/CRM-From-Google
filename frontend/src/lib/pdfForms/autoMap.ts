// ─── First draft of a template from a sample spreadsheet ───────
// Columns whose answers read like checkbox labels become choice fields; columns
// whose header reads like a printed label become text fields in the cell next
// to it. Everything is a suggestion: the editor shows it for review.

import { bestOption, withSiblings } from './choice';
import { answerRectForLabel } from './layout';
import { placeholderFor } from './source';
import { bigramSimilarity, containment, normalizeText, similarity, splitAnswers, tokens } from './text';
import { DEFAULT_FONT_SIZE, type Checkbox, type ChoiceField, type ChoiceOption, type FormField, type Phrase, type PdfLayout, type SheetData, type TextField } from './types';

/** Columns a form export adds that belong on no form (response id, timestamps) */
const SKIP_HEADERS = /^(id|start time|completion time|last modified time|timestamp|submitted|response id)$/i;

/** A person's name, not a group's ("Contact Name", "Full name", "Name") */
const PERSON_NAME = /^(name|full name|your name)$|\b(contact|person|participant|client|applicant)\b.*\bname\b|\bfull name\b/i;

/** Printed notes that make a question take a single answer */
const SINGLE_NOTE = /select one|tick one box|one option only|tick one only|choose one/i;
const MULTI_NOTE = /one or more|all that apply/i;

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

export function shortName(header: string, max = 48): string {
    const clean = header.replace(/\s+/g, ' ').trim();
    const first = clean.split(/(?<=[?:.])\s/)[0];
    const name = (first.length >= 3 ? first : clean).replace(/[\s:;,.-]+$/, '');
    return name.length > max ? `${name.slice(0, max - 1).trim()}…` : name;
}

function textField(name: string, source: string, rect: TextField['rect']): TextField {
    return {
        id: newId('f'),
        kind: 'text',
        name,
        source,
        rect,
        fontSize: DEFAULT_FONT_SIZE,
        multiline: rect.h >= DEFAULT_FONT_SIZE * 2.4,
        align: 'left',
    };
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

    sheet.headers.forEach((header, col) => {
        const values = columnValues(sheet, col);
        if (values.length === 0 || SKIP_HEADERS.test(header.trim())) return;

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
                return;
            }
        }

        const isPhone = /phone|mobile|tel/i.test(header);
        const label = findLabel(header);
        if (label) {
            takenLabels.add(label);
            fields.push(textField(label.text, placeholderFor(header, isPhone ? ['phone'] : []), answerRectForLabel(layout, label)));
        }
    });
    // Top of the first page first, as people read the form
    return fields.sort((a, b) => topOf(a).page - topOf(b).page || topOf(b).y - topOf(a).y);
}

function topOf(f: FormField): { page: number; y: number } {
    if (f.kind === 'text') return { page: f.rect.page, y: f.rect.y + f.rect.h };
    const r = f.options[0]?.rect;
    return r ? { page: r.page, y: Math.max(...f.options.filter(o => o.rect.page === r.page).map(o => o.rect.y + o.rect.h)) } : { page: 0, y: 0 };
}

// ─── Ticking checkboxes from spreadsheet answers ──────────────

import { ANSWER_THRESHOLD, answerMatchScore, normalizeText, splitAnswers } from './text';
import { cellAt } from './layout';
import type { Checkbox, ChoiceField, ChoiceOption, PdfLayout, Rect } from './types';

/** Short answers that mean the same as a common label */
const SYNONYMS: Record<string, string> = {
    na: 'not applicable',
    'n a': 'not applicable',
    y: 'yes',
    n: 'no',
    'prefer not to answer': 'prefer not to say',
};

export interface ChoiceResult {
    /** Options to tick, in answer order */
    ticked: string[];
    /** Answers that matched no checkbox */
    unmatched: string[];
    /** Matched answers left out because the question takes one option */
    dropped: string[];
}

function optionScore(answer: string, option: ChoiceOption): number {
    const a = normalizeText(answer);
    if (option.aliases.some(alias => normalizeText(alias) === a)) return 1.01;
    const synonym = SYNONYMS[a];
    const target = synonym ?? answer;
    return Math.max(answerMatchScore(target, option.label), ...option.aliases.map(alias => answerMatchScore(target, alias) * 0.98));
}

/** The option an answer ticks, or null */
export function bestOption(answer: string, options: ChoiceOption[]): ChoiceOption | null {
    let best: ChoiceOption | null = null;
    let bestScore = ANSWER_THRESHOLD;
    for (const option of options) {
        const score = optionScore(answer, option);
        if (score > bestScore) {
            best = option;
            bestScore = score;
        }
    }
    return best;
}

export function matchChoice(field: ChoiceField, value: string): ChoiceResult {
    const result: ChoiceResult = { ticked: [], unmatched: [], dropped: [] };
    const parts = splitAnswers(value);
    // A label can hold a ";" of its own: an exact match of the whole cell wins over splitting it
    const whole = parts.length > 1 ? bestOption(value.trim(), field.options) : null;
    const answers = whole && optionScore(value.trim(), whole) >= 1 ? [value.trim()] : parts;

    for (const answer of answers) {
        const option = bestOption(answer, field.options);
        if (!option) {
            result.unmatched.push(answer);
        } else if (!result.ticked.includes(option.id)) {
            if (field.single && result.ticked.length > 0) result.dropped.push(answer);
            else result.ticked.push(option.id);
        }
    }
    return result;
}

/**
 * Checkboxes for a new choice field from a column's answers: each distinct answer
 * picks its best-matching checkbox, then the rest of that question's checkboxes
 * are added (same table cell, or same row), so every option is there.
 */
export function suggestOptions(answers: string[], layout: PdfLayout): Checkbox[] {
    const { checkboxes } = layout;
    const distinct = [...new Set(answers.flatMap(splitAnswers).map(a => a.trim()).filter(Boolean))];
    const all = checkboxes.map((c): ChoiceOption => ({ id: c.id, label: c.label, rect: c.rect, aliases: [] }));

    const votes = new Map<string, number>();
    for (const answer of distinct) {
        const scored = all
            .map(o => ({ o, score: optionScore(answer, o) }))
            .filter(s => s.score > ANSWER_THRESHOLD)
            .sort((a, b) => b.score - a.score);
        if (scored.length === 0) continue;
        // Several boxes share a label ("Yes", "No"): prefer the one nearest boxes already chosen
        const top = scored.filter(s => s.score >= scored[0].score - 0.001);
        const pick = top.length === 1 ? top[0].o : nearestToChosen(top.map(s => s.o), votes, checkboxes) ?? top[0].o;
        votes.set(pick.id, (votes.get(pick.id) ?? 0) + 1);
    }
    return withSiblings(checkboxes.filter(c => votes.has(c.id)), layout);
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
    return !!a && !!b && a.page === b.page && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;
}

/** Add the checkboxes that belong to the same question as the given ones */
export function withSiblings(chosen: Checkbox[], layout: PdfLayout): Checkbox[] {
    if (chosen.length === 0) return [];
    const cellOf = (c: Checkbox) => cellAt(layout, c.rect.page, c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h / 2);
    const cells = chosen.map(cellOf);
    const page = mostCommon(chosen.map(c => c.rect.page));
    const onPage = chosen.filter(c => c.rect.page === page);
    const band = Math.max(4, onPage[0].rect.h * 0.6);
    const top = Math.max(...onPage.map(c => c.rect.y + c.rect.h));
    const bottom = Math.min(...onPage.map(c => c.rect.y));
    // The table row the chosen boxes sit in bounds the "same row" search
    const rowCells = cells.filter((c): c is Rect => !!c && c.page === page);
    const rowTop = rowCells.length ? Math.max(...rowCells.map(c => c.y + c.h)) : top + band;
    const rowBottom = rowCells.length ? Math.min(...rowCells.map(c => c.y)) : bottom - band;

    const picked = layout.checkboxes.filter(c => {
        if (chosen.includes(c)) return true;
        const cell = cellOf(c);
        if (cells.some(k => sameRect(k, cell))) return true;
        if (c.rect.page !== page) return false;
        const mid = c.rect.y + c.rect.h / 2;
        return mid <= Math.min(top + band, rowTop) && mid >= Math.max(bottom - band, rowBottom);
    });
    return picked.length <= Math.max(chosen.length * 5, 24) ? picked : chosen;
}

function nearestToChosen(candidates: ChoiceOption[], votes: Map<string, number>, all: Checkbox[]): ChoiceOption | null {
    const chosen = all.filter(c => votes.has(c.id));
    if (chosen.length === 0) return null;
    const dist = (o: ChoiceOption) => Math.min(...chosen.map(c => (c.rect.page === o.rect.page ? Math.hypot(c.rect.x - o.rect.x, c.rect.y - o.rect.y) : 1e6)));
    return [...candidates].sort((a, b) => dist(a) - dist(b))[0];
}

function mostCommon(values: number[]): number {
    const counts = new Map<number, number>();
    values.forEach(v => counts.set(v, (counts.get(v) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

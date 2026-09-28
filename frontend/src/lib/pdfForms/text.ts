// ─── Fuzzy text matching for headers, labels and answers ───────

const STOP_WORDS = new Set([
    'a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'for', 'or', 'your', 'you', 'is', 'are', 'please', 'if', 'any', 'this', 'these', 'which', 'what', 'do', 'does', 'with', 'by', 'at', 'as', 'be', 'from', 'that', 'it',
]);

/** Lowercase, strip accents and punctuation, collapse spaces: "Email Address\n" → "email address" */
export function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[’'`]/g, '')
        .replace(/[^\p{L}\p{N}+]+/gu, ' ')
        .trim();
}

/** Words that mean the same thing on these forms */
const CANONICAL: Record<string, string> = {
    co: 'org',
    group: 'org',
    organisation: 'org',
    organization: 'org',
    e: 'email',
    mail: 'email',
    tel: 'phone',
    telephone: 'phone',
    dob: 'birth',
};

/** Crude singular form, so "disabilities" meets "disability" */
function stem(word: string): string {
    if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    return word;
}

/** Normalised, singular, canonical words */
export function tokens(value: string): string[] {
    const t = normalizeText(value);
    return t ? t.split(' ').map(w => CANONICAL[w] ?? stem(w)) : [];
}

/** Share of `part`'s meaningful words that also appear in `whole`, 0..1 */
export function containment(part: string, whole: string): number {
    const P = [...new Set(contentTokens(part))];
    const W = new Set(contentTokens(whole));
    if (P.length === 0) return 0;
    return P.filter(t => W.has(t)).length / P.length;
}

function contentTokens(value: string): string[] {
    const all = tokens(value);
    const content = all.filter(t => !STOP_WORDS.has(t));
    return content.length > 0 ? content : all;
}

function bigrams(value: string): Map<string, number> {
    const s = normalizeText(value).replace(/ /g, '');
    const grams = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
        const g = s.slice(i, i + 2);
        grams.set(g, (grams.get(g) ?? 0) + 1);
    }
    return grams;
}

/** Sørensen–Dice on character bigrams, 0..1 */
export function bigramSimilarity(a: string, b: string): number {
    const A = bigrams(a);
    const B = bigrams(b);
    let total = 0;
    A.forEach(n => (total += n));
    B.forEach(n => (total += n));
    if (total === 0) return normalizeText(a) === normalizeText(b) ? 1 : 0;
    let common = 0;
    A.forEach((n, g) => (common += Math.min(n, B.get(g) ?? 0)));
    return (2 * common) / total;
}

/** Dice on word sets (stop words ignored), 0..1 */
export function tokenSimilarity(a: string, b: string): number {
    const A = new Set(contentTokens(a));
    const B = new Set(contentTokens(b));
    if (A.size === 0 || B.size === 0) return 0;
    let common = 0;
    A.forEach(t => B.has(t) && common++);
    return (2 * common) / (A.size + B.size);
}

/** How alike two headers / labels are, 0..1 */
export function similarity(a: string, b: string): number {
    const na = normalizeText(a);
    const nb = normalizeText(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    return Math.max(tokenSimilarity(a, b), bigramSimilarity(a, b) * 0.95);
}

/**
 * How well a spreadsheet answer fits a checkbox label, 0..1.
 * Handles answers that start with the label ("Yes. The group has…" → Yes)
 * and answers that add detail around it ("Youth (Aged <18 Years)" → Youth).
 */
export function answerMatchScore(answer: string, label: string): number {
    const a = tokens(answer);
    const l = tokens(label);
    if (a.length === 0 || l.length === 0) return 0;
    if (a.join(' ') === l.join(' ')) return 1;

    // Answer begins with the whole label: "Yes, since 2019"
    if (l.length <= a.length && l.every((t, i) => a[i] === t)) return 0.95;
    // Label begins with the whole answer: "Yes" for "Yes (Women only)" is too loose, so only for 2+ words
    if (a.length >= 2 && a.length < l.length && a.every((t, i) => l[i] === t)) return 0.85;

    // Every word of the label appears in a short answer: "Older people (aged 65+) in isolation"
    const answerSet = new Set(a);
    const labelContent = contentTokens(label);
    const allIn = labelContent.every(t => answerSet.has(t));
    let score = 0;
    if (allIn && (labelContent.length >= 2 || a.length <= 4)) {
        score = 0.7 + 0.25 * (labelContent.length / new Set(contentTokens(answer)).size);
    }
    return Math.max(score, similarity(answer, label) * 0.9);
}

export const ANSWER_THRESHOLD = 0.62;
export const HEADER_THRESHOLD = 0.6;

/** Split a multi-choice answer ("A;B;" or one per line) into its parts */
export function splitAnswers(value: string): string[] {
    return value
        .split(/[;\n\r]+/)
        .map(s => s.trim())
        .filter(Boolean);
}

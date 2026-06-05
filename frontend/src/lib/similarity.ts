/**
 * Normalizes a name string by converting to lowercase, removing diacritics/accents,
 * and stripping out all non-alphanumeric characters (supporting Cyrillic, Latin, etc.).
 */
export function normalizeName(name: string): string {
    if (!name) return '';
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, '') // Keep only letters and numbers across all languages/scripts
        .trim();
}

/**
 * Calculates the Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
    const tmp = [];
    const alen = a.length;
    const blen = b.length;
    
    if (alen === 0) return blen;
    if (blen === 0) return alen;
    
    for (let i = 0; i <= alen; i++) tmp[i] = [i];
    for (let j = 0; j <= blen; j++) tmp[0][j] = j;
    
    for (let i = 1; i <= alen; i++) {
        for (let j = 1; j <= blen; j++) {
            tmp[i][j] = Math.min(
                tmp[i - 1][j] + 1,
                tmp[i][j - 1] + 1,
                tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    
    return tmp[alen][blen];
}

/**
 * Normalizes a phone number by keeping only digits and taking the last 9 digits
 * to allow reliable comparison regardless of country code prefix variations.
 */
export function normalizePhone(phone: string | null | undefined): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 9 ? digits.slice(-9) : digits;
}

/**
 * Checks if two student names are similar, allowing Levenshtein distance of up to 2
 * for both first and last names (including swapped first/last name matches).
 */
export function areNamesSimilar(
    first1: string | null | undefined,
    last1: string | null | undefined,
    first2: string | null | undefined,
    last2: string | null | undefined
): boolean {
    const f1 = normalizeName(first1 || '');
    const l1 = normalizeName(last1 || '');
    const f2 = normalizeName(first2 || '');
    const l2 = normalizeName(last2 || '');

    if (!f1 || !l1 || !f2 || !l2) return false;

    // 1. Direct comparison
    const distFirstDirect = levenshteinDistance(f1, f2);
    const distLastDirect = levenshteinDistance(l1, l2);
    if (distFirstDirect <= 2 && distLastDirect <= 2) {
        return true;
    }

    // 2. Swapped comparison (first and last names swapped)
    const distFirstSwap = levenshteinDistance(f1, l2);
    const distLastSwap = levenshteinDistance(l1, f2);
    if (distFirstSwap <= 2 && distLastSwap <= 2) {
        return true;
    }

    return false;
}

/**
 * Checks if a search query matches a phone number.
 * Only activates when the query looks like a phone number (mostly digits).
 * Handles normalized numbers by optionally ignoring a leading zero in the query.
 * For example, searching "087" will match "+353872890084".
 */
export function isPhoneMatch(phone: string | null | undefined, query: string): boolean {
    if (!phone) return false;

    // Strip non-digits from the query
    const qDigits = query.replace(/\D/g, '');

    // Guard: only treat as phone search if ≥3 digits and mostly digits
    // This prevents "b1ack" (1 digit out of 5 chars) from matching phones
    if (qDigits.length < 3 || qDigits.length < query.trim().length * 0.5) return false;

    // Exact substring match on raw value (case insensitive)
    if (phone.toLowerCase().includes(query.toLowerCase())) return true;

    // Strip non-digits from phone
    const pDigits = phone.replace(/\D/g, '');
    if (!pDigits) return false;

    // Check if digits match
    if (pDigits.includes(qDigits)) return true;

    // If the query starts with '0', try matching without it
    // (useful for finding '+353 87...' when searching '087')
    if (qDigits.startsWith('0') && qDigits.length > 1) {
        if (pDigits.includes(qDigits.substring(1))) return true;
    }

    return false;
}

/**
 * Unified search helper. Checks whether a query matches any of the provided fields.
 *
 * Multi-word queries: ALL words must match at least one field each.
 * Single-word queries: the word must match at least one field via substring.
 *
 * Searchable fields: firstName, lastName, full name, email, phone, notes.
 */
export function matchesSearch(
    fields: {
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        phone?: string | null;
        notes?: string | null;
        eircode?: string | null;
        address?: string | null;
    },
    query: string
): boolean {
    const trimmed = query.trim();
    if (!trimmed) return true;

    const words = trimmed.toLowerCase().split(/\s+/);

    const firstName = (fields.firstName || '').toLowerCase();
    const lastName = (fields.lastName || '').toLowerCase();
    const fullName = `${firstName} ${lastName}`;
    const email = (fields.email || '').toLowerCase();
    const notes = (fields.notes || '').toLowerCase();
    const address = (fields.address || '').toLowerCase();
    const eircodeClean = (fields.eircode || '').toUpperCase().replace(/\s+/g, '');

    // Every word in the query must match at least one field
    return words.every(word => {
        if (firstName.includes(word)) return true;
        if (lastName.includes(word)) return true;
        if (fullName.includes(word)) return true;
        if (email.includes(word)) return true;
        if (notes.includes(word)) return true;
        if (address.includes(word)) return true;
        if (isPhoneMatch(fields.phone, word)) return true;
        
        const wordClean = word.toUpperCase().replace(/\s+/g, '');
        if (wordClean && eircodeClean.includes(wordClean)) return true;
        
        return false;
    });
}

/**
 * Removes characters that have a special meaning inside a PostgREST `or=(...)`
 * filter (commas, parentheses, quotes, backslashes) and LIKE wildcards, so user
 * input like "O'Brien, John" or "(087)" can never break or widen the query.
 */
export function sanitizeFilterTerm(term: string): string {
    return term
        .replace(/[,()"\\]/g, ' ')
        .replace(/[%*]/g, '')
        .trim();
}

/**
 * Builds one PostgREST `or` filter string per search word for the `students` table.
 * Every word must match at least one of: first/last name, email, phone, eircode.
 * Phone-like words also match without their leading zero ("087…" → "+35387…").
 */
export function buildStudentSearchFilters(query: string): string[] {
    const words = sanitizeFilterTerm(query).split(/\s+/).filter(Boolean);
    return words.map(word => {
        const eircode = word.replace(/\s+/g, '').toUpperCase();
        const conditions = [
            `first_name.ilike.%${word}%`,
            `last_name.ilike.%${word}%`,
            `email.ilike.%${word}%`,
            `phone.ilike.%${word}%`,
            `normalized_eircode.ilike.%${eircode}%`,
        ];
        if (/^0\d{3,}$/.test(word)) {
            conditions.push(`phone.ilike.%${word.substring(1)}%`);
        }
        return conditions.join(',');
    });
}

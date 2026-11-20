// Range selection (Shift+click) and unified search for Outcomes tables (CRM Graduates and External Lists).
import { isPhoneMatch } from './searchUtils';

/**
 * Toggles one row, or selects/deselects the contiguous range between `lastClickedId`
 * and `id` in the currently displayed order when Shift is held.
 */
export function toggleOutcomeSelection(
    prev: ReadonlySet<string>,
    id: string,
    orderedIds: readonly string[],
    lastClickedId: string | null,
    shiftKey: boolean,
): Set<string> {
    const next = new Set(prev);
    if (shiftKey && lastClickedId) {
        const from = orderedIds.indexOf(lastClickedId);
        const to = orderedIds.indexOf(id);
        if (from !== -1 && to !== -1) {
            const start = Math.min(from, to);
            const end = Math.max(from, to);
            // Match the anchor's state if it is selected, otherwise select the range
            const shouldSelect = !prev.has(id);
            for (let i = start; i <= end; i++) {
                if (shouldSelect) next.add(orderedIds[i]);
                else next.delete(orderedIds[i]);
            }
            return next;
        }
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

/**
 * Word-by-word search across name, email, phone, field of work, and extra values
 * (courses for CRM graduates, IRIS ID for external lists).
 */
export function matchesOutcomeSearch(
    fields: {
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        phone?: string | null;
        fieldOfWork?: string | null;
        extra?: readonly (string | null | undefined)[];
    },
    query: string,
): boolean {
    const trimmed = query.trim();
    if (!trimmed) return true;

    const words = trimmed.toLowerCase().split(/\s+/);
    const haystack = [
        fields.firstName || '',
        fields.lastName || '',
        fields.email || '',
        fields.fieldOfWork || '',
        ...(fields.extra ?? []).map(v => v || ''),
    ].join(' ').toLowerCase();

    return words.every(word => haystack.includes(word) || isPhoneMatch(fields.phone, word));
}

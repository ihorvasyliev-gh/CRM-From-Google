import type { EnrollmentRow } from '../../hooks/useEnrollments';

export type SortOrder = 'date-asc' | 'date-desc' | 'name';

/** What a date sort means in each column, for the sort control's hint */
export const SORT_HINT = 'Starred people come first. By date: Requested by when they asked, Invited and Confirmed by course date, Completed by completion date (latest first).';

/**
 * The date a column is ordered by: the queue by when the person asked, Invited and Confirmed by the
 * course date (what the coordinator plans around), Completed by when the course was finished.
 * Dates are ISO strings, so string order is time order.
 */
function columnDate(e: EnrollmentRow, status: string): string | null {
    if (status === 'invited') return e.invited_dates?.length ? [...e.invited_dates].sort()[0] : e.invited_date ?? null;
    if (status === 'confirmed') return e.confirmed_date ?? null;
    if (status === 'completed') return e.completed_date ?? null;
    return e.created_at;
}

const day = (d: string) => d.slice(0, 10);
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Sorts one column's cards in place. Starred people always come first.
 * "Oldest first" puts the longest wait or the nearest course date on top; "Newest first" reverses it.
 * Completed always shows the latest completions on top: the old ones are history.
 * A card without the column's date goes last; equal dates keep the order people asked in.
 */
export function sortColumn(rows: EnrollmentRow[], status: string, sortOrder: SortOrder): EnrollmentRow[] {
    const direction = status === 'completed' || sortOrder === 'date-desc' ? -1 : 1;
    return rows.sort((a, b) => {
        if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
        if (sortOrder === 'name') {
            const aName = `${a.students?.last_name || ''} ${a.students?.first_name || ''}`.toLowerCase();
            const bName = `${b.students?.last_name || ''} ${b.students?.first_name || ''}`.toLowerCase();
            return aName.localeCompare(bName);
        }
        const aDate = columnDate(a, status);
        const bDate = columnDate(b, status);
        if (!aDate || !bDate) {
            if (aDate || bDate) return aDate ? -1 : 1;
            return byText(a.created_at, b.created_at);
        }
        const cmp = status === 'requested' || status === 'withdrawn' || status === 'rejected'
            ? byText(aDate, bDate)
            : byText(day(aDate), day(bDate));
        return cmp !== 0 ? direction * cmp : byText(a.created_at, b.created_at);
    });
}

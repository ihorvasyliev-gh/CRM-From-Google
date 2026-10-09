// Keeps the cached ['enrollments'] list (board, dashboard, analytics) up to date after realtime
// changes by re-reading only the changed rows, instead of every enrollment with its student and
// course (megabytes once there are a few thousand) on every change anyone makes.
import type { QueryClient } from '@tanstack/react-query';
import type { EnrollmentWithRelations } from './documentRender';
import { fetchEnrollmentsByIds } from './queries';

export const ENROLLMENTS_KEY = ['enrollments'] as const;

/** More changed rows than this in one burst (an import, a bulk action): reload the whole list. */
export const MAX_PATCHED_ENROLLMENTS = 150;

/** The order fetchAllEnrollments reads in: newest first, then id. */
function compareRows(a: EnrollmentWithRelations, b: EnrollmentWithRelations): number {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * `current` with the rows in `changedIds` replaced by their `fresh` copies: rows missing from
 * `fresh` were deleted (or are no longer visible), fresh rows not in `current` are new. Unchanged
 * rows keep their object identity, so memoised cards and columns don't re-render.
 */
export function mergeEnrollmentRows(
    current: EnrollmentWithRelations[],
    changedIds: ReadonlySet<string>,
    fresh: EnrollmentWithRelations[],
): EnrollmentWithRelations[] {
    const freshById = new Map(fresh.map(row => [row.id, row]));
    const result: EnrollmentWithRelations[] = [];
    for (const row of current) {
        if (!changedIds.has(row.id)) {
            result.push(row);
            continue;
        }
        const updated = freshById.get(row.id);
        if (updated) {
            result.push(updated);
            freshById.delete(row.id);
        }
    }
    if (freshById.size === 0) return result;
    result.push(...freshById.values());
    return result.sort(compareRows);
}

/**
 * The full load of the list running now, if any. Only the list itself: the per-student lists kept
 * under the same key prefix (['enrollments', 'by_student', id]) don't count.
 */
function runningFullLoad(queryClient: QueryClient): Promise<unknown> | undefined {
    const query = queryClient.getQueryCache().find({ queryKey: ENROLLMENTS_KEY, exact: true });
    return query?.state.fetchStatus === 'fetching' ? query.promise : undefined;
}

/**
 * Applies the realtime changes to these enrollment ids to the cached list. Returns false when the
 * list has to be reloaded instead: nothing cached yet, too many changes, or the rows could not be
 * read.
 */
export async function patchCachedEnrollments(queryClient: QueryClient, ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    if (ids.length > MAX_PATCHED_ENROLLMENTS) return false;
    if (!queryClient.getQueryData(ENROLLMENTS_KEY)) return false;
    // A full load already running may have read these rows before they changed. It isn't restarted
    // (that threw away the pages it had read and downloaded every enrollment again, after nearly
    // every save in this tab, which starts such a load): it finishes, then the changed rows are
    // re-read on top of it.
    const running = runningFullLoad(queryClient);
    if (running) await running.catch(() => { /* failed or cancelled: the cached rows stay */ });

    let fresh: EnrollmentWithRelations[];
    try {
        fresh = await fetchEnrollmentsByIds(ids);
    } catch (e) {
        console.warn('[enrollmentCache] Could not read changed enrollments, reloading the list', e);
        return false;
    }
    // A full load started meanwhile reads the same (or newer) rows; let it win
    if (runningFullLoad(queryClient)) return true;

    const changed = new Set(ids);
    queryClient.setQueryData<EnrollmentWithRelations[]>(ENROLLMENTS_KEY, old => old && mergeEnrollmentRows(old, changed, fresh));
    return true;
}

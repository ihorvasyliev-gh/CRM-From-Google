// Keeps the cached ['enrollments'] list (board, dashboard, analytics) up to date after realtime
// changes by re-reading only the changed rows, instead of every enrollment with its student and
// course (megabytes once there are a few thousand) on every change anyone makes.
import { replaceEqualDeep, type QueryClient } from '@tanstack/react-query';
import type { EnrollmentWithRelations } from './documentRender';
import {
    ENROLLMENT_COURSE_FIELDS, ENROLLMENT_STUDENT_FIELDS, fetchChangesSince, fetchEnrollmentsByIds,
    fetchEnrollmentsByStudentIds, type ChangesSince,
} from './queries';

export const ENROLLMENTS_KEY = ['enrollments'] as const;

/** More changed rows than this in one burst (an import, a bulk action): reload the whole list. */
export const MAX_PATCHED_ENROLLMENTS = 150;

/**
 * Structural sharing for the enrollment lists by id rather than by position: an unchanged row keeps
 * its object even when rows before it were added or removed, so its memoised card doesn't
 * re-render. (By position, one new enrollment at the top made a copy of every row after it.)
 */
export function shareRowsById(prev: unknown, next: unknown): unknown {
    if (!Array.isArray(prev) || !Array.isArray(next)) return replaceEqualDeep(prev, next);
    const prevById = new Map(prev.map(row => [row?.id, row]));
    let same = prev.length === next.length;
    const result = next.map((row, i) => {
        const old = prevById.get(row?.id);
        const shared = old === undefined ? row : replaceEqualDeep(old, row);
        if (shared !== prev[i]) same = false;
        return shared;
    });
    return same ? prev : result;
}

/** Sets up the client for the enrollment lists (all keys under ['enrollments']); called once. */
export function configureEnrollmentCache(queryClient: QueryClient): void {
    queryClient.setQueryDefaults(ENROLLMENTS_KEY, { structuralSharing: shareRowsById });
}

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

/**
 * After this tab changed these enrollments: re-reads them into the cached list, and the open
 * student cards' own lists. The whole list is reloaded only when they can't be patched in.
 */
export async function refreshCachedEnrollments(queryClient: QueryClient, ids: string[]): Promise<void> {
    queryClient.invalidateQueries({ queryKey: [...ENROLLMENTS_KEY, 'by_student'] });
    if (!(await patchCachedEnrollments(queryClient, ids))) {
        queryClient.invalidateQueries({ queryKey: ENROLLMENTS_KEY, exact: true });
    }
}

/**
 * After a change to students (an edit, a merge, a deletion): re-reads their enrollments, which
 * carry the student's name and contact details, into the cached list.
 */
export async function refreshStudentEnrollments(queryClient: QueryClient, studentIds: string[]): Promise<void> {
    queryClient.invalidateQueries({ queryKey: [...ENROLLMENTS_KEY, 'by_student'] });
    const cached = queryClient.getQueryData<EnrollmentWithRelations[]>(ENROLLMENTS_KEY);
    if (!cached) return;
    const students = new Set(studentIds);
    const before = cached.filter(e => students.has(e.student_id)).map(e => e.id);
    if (before.length > MAX_PATCHED_ENROLLMENTS) {
        queryClient.invalidateQueries({ queryKey: ENROLLMENTS_KEY, exact: true });
        return;
    }
    let fresh: EnrollmentWithRelations[];
    try {
        fresh = await fetchEnrollmentsByStudentIds(studentIds);
    } catch (e) {
        console.warn('[enrollmentCache] Could not read the students\' enrollments, reloading the list', e);
        queryClient.invalidateQueries({ queryKey: ENROLLMENTS_KEY, exact: true });
        return;
    }
    if (runningFullLoad(queryClient)) return;
    const changed = new Set([...before, ...fresh.map(e => e.id)]);
    queryClient.setQueryData<EnrollmentWithRelations[]>(ENROLLMENTS_KEY, old => old && mergeEnrollmentRows(old, changed, fresh));
}

/** Student or course rows (from the database or a realtime event); only `id` is required. */
export type RelationRow = { id: string } & Record<string, unknown>;

/** The fields of `row` the cached enrollments carry for it (`keys`), keyed by its id. */
function byIdPicking(rows: RelationRow[] | undefined, keys: readonly string[]): Map<string, Record<string, unknown>> {
    const result = new Map<string, Record<string, unknown>>();
    for (const row of rows ?? []) {
        if (typeof row?.id !== 'string') continue;
        const picked: Record<string, unknown> = {};
        for (const key of keys) if (key in row) picked[key] = row[key];
        result.set(row.id, picked);
    }
    return result;
}

/** `current` with `changes` applied; the same object when nothing differs. */
function withChanges<T extends object>(current: T | null, changes: Record<string, unknown> | undefined): T | null {
    if (!current || !changes) return current;
    const fields = current as Record<string, unknown>;
    return Object.keys(changes).some(key => changes[key] !== fields[key]) ? { ...current, ...changes } : current;
}

function applyRelations(
    rows: EnrollmentWithRelations[],
    students: Map<string, Record<string, unknown>>,
    courses: Map<string, Record<string, unknown>>,
): EnrollmentWithRelations[] {
    if (students.size === 0 && courses.size === 0) return rows;
    let changed = false;
    const result = rows.map(e => {
        const student = withChanges(e.students, students.get(e.student_id));
        const course = withChanges(e.courses, courses.get(e.course_id));
        if (student === e.students && course === e.courses) return e;
        changed = true;
        return { ...e, students: student, courses: course };
    });
    return changed ? result : rows;
}

/**
 * After students or courses were edited (here, or by someone else): their new names and details
 * on their cached enrollments, without a reload. Only the rows that change are replaced.
 */
export function updateCachedRelations(queryClient: QueryClient, changes: { students?: RelationRow[]; courses?: RelationRow[] }): void {
    const students = byIdPicking(changes.students, ENROLLMENT_STUDENT_FIELDS);
    const courses = byIdPicking(changes.courses, ENROLLMENT_COURSE_FIELDS);
    if (students.size === 0 && courses.size === 0) return;
    queryClient.setQueryData<EnrollmentWithRelations[]>(ENROLLMENTS_KEY, old => old && applyRelations(old, students, courses));
}

/** After a course or a student was deleted: their enrollments (deleted with them) leave the cached list. */
export function removeCachedEnrollments(queryClient: QueryClient, match: (e: EnrollmentWithRelations) => boolean): void {
    queryClient.setQueryData<EnrollmentWithRelations[]>(ENROLLMENTS_KEY, old => {
        if (!old) return old;
        const kept = old.filter(e => !match(e));
        return kept.length === old.length ? old : kept;
    });
    queryClient.invalidateQueries({ queryKey: [...ENROLLMENTS_KEY, 'by_student'] });
}

// ─── Catching up after a gap ──────────────────────────────────────

/**
 * A change saved in a transaction that began earlier carries that earlier time, so rows changed
 * this long before the last sync point are read again.
 */
const SYNC_OVERLAP_MS = 5 * 60_000;
/** More changed rows than this since the last sync: reload the list instead. */
export const MAX_SYNCED_ENROLLMENTS = 1000;

/**
 * The newest updated_at (database time, ms) the cached list is known to be complete up to: set by
 * a full load and moved on by each catch-up. Rows patched in one by one don't move it: other rows
 * may have changed meanwhile without this tab hearing of it.
 */
let syncedUpTo: number | null = null;

function newestChange(rows: { updated_at?: string | null; created_at?: string }[]): number | null {
    let newest = -Infinity;
    for (const r of rows) {
        const t = Date.parse(r.updated_at || r.created_at || '');
        if (t > newest) newest = t;
    }
    return Number.isFinite(newest) ? newest : null;
}

/** Called with every full load of the list: the point the next catch-up reads from. */
export function noteFullLoad(rows: EnrollmentWithRelations[]): void {
    syncedUpTo = newestChange(rows);
}

/** For tests: forget the sync point. */
export function resetSyncPoint(): void {
    syncedUpTo = null;
}

/**
 * Catches the cached list up after changes may have been missed (the realtime channel dropped,
 * the tab slept): reads only the enrollments, students and courses changed since the last full
 * load or catch-up, and compares the number of enrollments with the database's, which reveals
 * deletions. Returns false when the list has to be reloaded instead: nothing cached, too many
 * changes, enrollments deleted meanwhile, or the changes could not be read (also before
 * migration 84).
 */
export async function syncCachedEnrollments(queryClient: QueryClient): Promise<boolean> {
    if (!queryClient.getQueryData(ENROLLMENTS_KEY) || syncedUpTo === null) return false;
    // A full load running now reads every row anyway
    if (runningFullLoad(queryClient)) return true;

    let changes: ChangesSince;
    try {
        changes = await fetchChangesSince(new Date(syncedUpTo - SYNC_OVERLAP_MS).toISOString(), MAX_SYNCED_ENROLLMENTS);
    } catch (e) {
        console.warn('[enrollmentCache] Could not read what changed, reloading the list', e);
        return false;
    }
    const { enrollments: fresh, total } = changes;
    if ([fresh, changes.students, changes.courses].some(rows => rows.length > MAX_SYNCED_ENROLLMENTS)) return false;
    if (runningFullLoad(queryClient)) return true;

    const students = byIdPicking(changes.students as unknown as RelationRow[], ENROLLMENT_STUDENT_FIELDS);
    const courses = byIdPicking(changes.courses as unknown as RelationRow[], ENROLLMENT_COURSE_FIELDS);
    let complete = false;
    queryClient.setQueryData<EnrollmentWithRelations[]>(ENROLLMENTS_KEY, cached => {
        if (!cached) return cached;
        // Rows read again but not changed keep their objects, so their cards don't re-render
        const cachedById = new Map(cached.map(e => [e.id, e]));
        const changedRows = fresh.filter(e => cachedById.get(e.id)?.updated_at !== e.updated_at);
        const merged = applyRelations(
            changedRows.length ? mergeEnrollmentRows(cached, new Set(changedRows.map(e => e.id)), changedRows) : cached,
            students,
            courses,
        );
        // A different number of rows than the database's: some were deleted meanwhile, which
        // only a reload shows
        complete = merged.length === total;
        return complete ? merged : cached;
    });
    if (!complete) return false;

    const newest = newestChange([...fresh, ...changes.students, ...changes.courses]);
    if (newest !== null && newest > syncedUpTo) syncedUpTo = newest;
    return true;
}

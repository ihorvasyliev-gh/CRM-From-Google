// ─── Enrollment status changes ───────────────────────────────
// The one set of rules for moving enrollments between statuses, shared by the board (drag,
// card menu), the bulk bar and the student drawer, plus the undo that reverses a change.
// With migration 77 the database applies a change (and an undo) in one transaction; without it
// the same writes are made from here, one request at a time.
import { supabase } from './supabase';
import { todayISO } from './dateUtils';
import type { Enrollment, EnrollmentStatus } from './types';

/** The columns a status change writes, and an undo puts back. */
export interface StatusFields {
    status: EnrollmentStatus;
    confirmed_date: string | null;
    confirmed_at: string | null;
    invited_date: string | null;
    invited_dates: string[] | null;
    invited_at: string | null;
    completed_date: string | null;
    completed_at: string | null;
}

/** A row's status fields, captured before a change so it can be undone exactly. */
export interface EnrollmentSnapshot extends StatusFields {
    id: string;
}

type SnapshotSource = Pick<Enrollment, 'id' | 'status' | 'confirmed_date' | 'confirmed_at' | 'invited_date' | 'invited_dates' | 'invited_at'>
    & Partial<Pick<Enrollment, 'completed_date' | 'completed_at'>>;

export function takeEnrollmentSnapshot(e: SnapshotSource): EnrollmentSnapshot {
    return {
        id: e.id,
        status: e.status,
        confirmed_date: e.confirmed_date ?? null,
        confirmed_at: e.confirmed_at ?? null,
        invited_date: e.invited_date ?? null,
        invited_dates: e.invited_dates ?? null,
        invited_at: e.invited_at ?? null,
        completed_date: e.completed_date ?? null,
        completed_at: e.completed_at ?? null,
    };
}

/**
 * The columns to write when a row moves to `status`:
 * - confirmed: stamps confirmed_at (and the chosen course date);
 * - completed: stamps completed_at, takes the course date (or today) as completed_date and keeps
 *   confirmed_at, setting it if the row was never confirmed;
 * - any other status clears the completion, and anything but confirmed/completed clears confirmed_at;
 * - requested and rejected also clear the invitation and the course date.
 * The completion fields depend on the row; every other status writes the same fields for all rows.
 */
export function statusUpdate(
    row: { confirmed_date?: string | null; confirmed_at?: string | null } | undefined,
    status: EnrollmentStatus,
    { confirmedDate, invitedDate }: { confirmedDate?: string; invitedDate?: string } = {},
    now: Date = new Date(),
): Partial<StatusFields> & { status: EnrollmentStatus } {
    const at = now.toISOString();
    const fields: Partial<StatusFields> & { status: EnrollmentStatus } = { status };
    if (status === 'confirmed') {
        if (confirmedDate) fields.confirmed_date = confirmedDate;
        fields.confirmed_at = at;
    }
    if (status === 'invited' && invitedDate) fields.invited_date = invitedDate;
    if (status === 'completed') {
        fields.completed_date = row?.confirmed_date || todayISO();
        fields.completed_at = at;
        fields.confirmed_at = row?.confirmed_at || at;
    } else {
        fields.completed_date = null;
        fields.completed_at = null;
        if (status !== 'confirmed') fields.confirmed_at = null;
    }
    if (status === 'requested' || status === 'rejected') {
        fields.confirmed_date = null;
        fields.invited_date = null;
        fields.invited_dates = null;
        fields.invited_at = null;
    }
    return fields;
}

type LinkRow = Pick<Enrollment, 'id' | 'student_id' | 'course_id' | 'status'>;

/**
 * Rows a status change touches besides the chosen ones (the same student on the same course):
 * withdrawing withdraws them all; completing deletes the ones still "requested".
 */
export function linkedRows<T extends LinkRow>(all: readonly T[], chosen: readonly T[], status: EnrollmentStatus): { alsoUpdate: T[]; remove: T[] } {
    if (status !== 'withdrawn' && status !== 'completed') return { alsoUpdate: [], remove: [] };
    const chosenIds = new Set(chosen.map(e => e.id));
    const pairs = new Set(chosen.map(e => `${e.student_id}|${e.course_id}`));
    const siblings = all.filter(e => !chosenIds.has(e.id) && pairs.has(`${e.student_id}|${e.course_id}`));
    return status === 'withdrawn'
        ? { alsoUpdate: siblings, remove: [] }
        : { alsoUpdate: [], remove: siblings.filter(e => e.status === 'requested') };
}

/** PostgREST's answer for a function the database does not have (its migration not run yet). */
function isMissingFunction(error: { code?: string } | null): boolean {
    return error?.code === 'PGRST202';
}

/** The table columns of a row (drops the joined student / course of a loaded one). */
function columnsOf(row: object): object {
    const { students: _students, courses: _courses, ...columns } = row as { students?: unknown; courses?: unknown };
    return columns;
}

type ChangeRow = SnapshotSource & LinkRow;

/** What a status change did: enough to show it, and to undo it. */
export interface StatusChangeResult<T> {
    /** Every row written, with its status fields as saved */
    updated: EnrollmentSnapshot[];
    /** The loaded rows a completion deleted */
    removed: T[];
    /** The status was saved, but the duplicates could not be deleted (only without migration 77) */
    removeFailed: boolean;
    /** restoreEnrollments(undo.snapshots, undo.removed) puts every row back as it was */
    undo: { snapshots: EnrollmentSnapshot[]; removed: object[] };
}

interface ChangeResponse {
    previous: EnrollmentSnapshot[];
    updated: EnrollmentSnapshot[];
    removed: Enrollment[];
}

/**
 * Moves `chosen` to `status` by the rules above (statusUpdate, linkedRows), touching the student's
 * other rows on the course as well. `all` is every loaded row, used to find those when the database
 * cannot (no migration 77). Throws if the status could not be saved.
 */
export async function changeEnrollmentStatus<T extends ChangeRow>(
    all: readonly T[],
    chosen: readonly T[],
    status: EnrollmentStatus,
    dates: { confirmedDate?: string; invitedDate?: string } = {},
): Promise<StatusChangeResult<T>> {
    const { data, error } = await supabase.rpc('change_enrollment_status', {
        p_ids: chosen.map(e => e.id),
        p_status: status,
        p_confirmed_date: dates.confirmedDate ?? null,
        p_invited_date: dates.invitedDate ?? null,
        p_today: todayISO(),
    });
    if (!error) {
        const { previous, updated, removed } = data as ChangeResponse;
        const removedIds = new Set(removed.map(e => e.id));
        return {
            updated,
            removed: all.filter(e => removedIds.has(e.id)),
            removeFailed: false,
            undo: { snapshots: previous, removed },
        };
    }
    if (!isMissingFunction(error)) throw error;
    return changeFromClient(all, chosen, status, dates);
}

/** The same change as change_enrollment_status(), as separate requests (before migration 77). */
async function changeFromClient<T extends ChangeRow>(
    all: readonly T[],
    chosen: readonly T[],
    status: EnrollmentStatus,
    dates: { confirmedDate?: string; invitedDate?: string },
): Promise<StatusChangeResult<T>> {
    const { alsoUpdate, remove } = linkedRows(all, chosen, status);
    const rows = [...chosen, ...alsoUpdate];
    const now = new Date();
    // A completion's dates depend on each row; every other status writes the same fields to all
    const fieldsById = new Map(rows.map(e => [e.id, statusUpdate(e, status, dates, now)]));
    const results = status === 'completed'
        ? await Promise.all(rows.map(e => supabase.from('enrollments').update(fieldsById.get(e.id)!).eq('id', e.id)))
        : [await supabase.from('enrollments').update(statusUpdate(undefined, status, dates, now)).in('id', rows.map(e => e.id))];
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;

    // The status is saved by now; report a failed clean-up instead of claiming the rows are gone
    let removeFailed = false;
    if (remove.length > 0) {
        const { error } = await supabase.from('enrollments').delete().in('id', remove.map(e => e.id));
        if (error) console.error('Failed to remove requested duplicates:', error);
        removeFailed = !!error;
    }
    const removed = removeFailed ? [] : remove;
    const snapshots = rows.map(takeEnrollmentSnapshot);
    return {
        updated: snapshots.map(snap => ({ ...snap, ...fieldsById.get(snap.id)! })),
        removed,
        removeFailed,
        undo: { snapshots, removed },
    };
}

/**
 * Puts rows back as they were before a status change: the snapshots' status fields, and the rows
 * the change deleted (as stored, or as loaded). Throws if anything could not be put back; with
 * migration 77 nothing is changed then.
 */
export async function restoreEnrollments(snapshots: readonly EnrollmentSnapshot[], removed: readonly object[] = []): Promise<void> {
    const rows = removed.map(columnsOf);
    const { error } = await supabase.rpc('restore_enrollments', { p_rows: snapshots, p_removed: rows });
    if (!error) return;
    if (!isMissingFunction(error)) throw error;

    // Statuses first: the database only accepts a re-created row while the student has no other
    // active enrollment on that course (migration 71)
    const results = await Promise.all(snapshots.map(({ id, ...fields }) =>
        supabase.from('enrollments').update(fields).eq('id', id)
    ));
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;

    if (rows.length === 0) return;
    const { data, error: insertError } = await supabase.from('enrollments').insert(rows).select('id');
    if (insertError) throw insertError;
    if ((data?.length ?? 0) < rows.length) {
        throw new Error(`${rows.length - (data?.length ?? 0)} removed enrollment(s) could not be re-created`);
    }
}

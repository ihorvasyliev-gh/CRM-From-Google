// ─── Enrollment status changes ───────────────────────────────
// The one set of rules for moving enrollments between statuses, shared by the board (drag,
// card menu), the bulk bar and the student drawer, plus the undo that reverses a change.
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

type SnapshotSource = Pick<Enrollment, 'id' | 'status' | 'confirmed_date' | 'confirmed_at' | 'invited_date' | 'invited_dates' | 'invited_at' | 'completed_date' | 'completed_at'>;

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

/** The table columns of a loaded row (drops the joined student / course). */
function columnsOf(row: Enrollment & { students?: unknown; courses?: unknown }): Enrollment {
    const { students: _students, courses: _courses, ...columns } = row;
    return columns;
}

/**
 * Puts rows back as they were before a status change: the snapshots' status fields, and the rows
 * the change deleted. Throws on the first failure, or if the database refused to re-create a row.
 */
export async function restoreEnrollments(snapshots: readonly EnrollmentSnapshot[], removed: readonly Enrollment[] = []): Promise<void> {
    // Statuses first: the database only accepts a re-created row while the student has no other
    // active enrollment on that course (migration 71)
    const results = await Promise.all(snapshots.map(({ id, ...fields }) =>
        supabase.from('enrollments').update(fields).eq('id', id)
    ));
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;

    if (removed.length === 0) return;
    const { data, error } = await supabase.from('enrollments').insert(removed.map(columnsOf)).select('id');
    if (error) throw error;
    if ((data?.length ?? 0) < removed.length) {
        throw new Error(`${removed.length - (data?.length ?? 0)} removed enrollment(s) could not be re-created`);
    }
}

import { supabase } from './supabase';
import type { Student } from './types';

/** PostgREST answers PGRST202 (Postgres 42883) when a function hasn't been created yet. */
export function isMissingFunction(err: { code?: string; message?: string }): boolean {
    return err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message ?? '');
}

/**
 * Merge a duplicate into the student being kept, first saving the details picked from the duplicate.
 * Uses merge_students_with_changes (migration 94), which does it all in one transaction:
 * either everything is merged, or nothing changes.
 */
export async function mergeStudents(
    primaryId: string,
    duplicateId: string,
    duplicateEmail: string | null,
    changes: Partial<Student>,
): Promise<void> {
    const { error } = await supabase.rpc('merge_students_with_changes', {
        p_primary_id: primaryId,
        p_duplicate_id: duplicateId,
        p_changes: changes,
    });
    if (!error) return;
    if (!isMissingFunction(error)) throw new Error(error.message);
    // Migration 94 not applied yet: the older step-by-step merge
    await legacyMerge(primaryId, duplicateId, duplicateEmail, changes);
}

/** The pre-migration-94 merge: three separate calls, best-effort rollback of the email. */
async function legacyMerge(primaryId: string, duplicateId: string, duplicateEmail: string | null, changes: Partial<Student>) {
    let emailCleared = false;
    try {
        if (Object.keys(changes).length > 0) {
            const { error: clearEmailError } = await supabase.from('students').update({ email: null }).eq('id', duplicateId);
            if (clearEmailError) throw clearEmailError;
            emailCleared = true;
            const { error: updateError } = await supabase.from('students').update(changes).eq('id', primaryId);
            if (updateError) throw updateError;
        }
        const { error } = await supabase.rpc('merge_students', { p_primary_id: primaryId, p_duplicate_id: duplicateId });
        if (error) throw new Error(error.message);
    } catch (err) {
        if (emailCleared && duplicateEmail) {
            await supabase.from('students').update({ email: duplicateEmail }).eq('id', duplicateId);
        }
        throw err;
    }
}

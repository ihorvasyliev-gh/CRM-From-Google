import { supabase } from './supabase';
import type { GraduateRow } from '../hooks/useOutcomes';

/** Before migration 90 the column doesn't exist: say what to do instead of a raw database error. */
export function callMarkErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
    const msg = error?.message ?? '';
    if (error?.code === '42703' || error?.code === 'PGRST204' || msg.includes('called_no_answer_at')) {
        return 'Run migration 90 in the Supabase SQL editor first, then try again.';
    }
    return 'Could not save the call mark. Try again.';
}

/**
 * Marks (or clears) "called, no answer" for a graduate. The tracking status stays as it is:
 * a graduate with no survey row yet gets one with status 'not_contacted', which still reads as Not Contacted.
 */
export async function setGraduateCallMark(grad: GraduateRow, calledAt: string | null) {
    if (grad.tracking_status === 'not_contacted' && calledAt) {
        // Adds the row only if it's missing, so a survey sent meanwhile is never undone
        const { error } = await supabase
            .from('employment_status')
            .upsert(
                { student_id: grad.student_id, email: grad.email, status: 'not_contacted' },
                { onConflict: 'student_id', ignoreDuplicates: true },
            );
        if (error) throw error;
    }
    const { error } = await supabase
        .from('employment_status')
        .update({ called_no_answer_at: calledAt })
        .eq('student_id', grad.student_id);
    if (error) throw error;
}

/** Marks (or clears) "called, no answer" for a contact in an external list; the status stays as it is. */
export async function setContactCallMark(contactId: string, calledAt: string | null) {
    const { error } = await supabase
        .from('outreach_contacts')
        .update({ called_no_answer_at: calledAt })
        .eq('id', contactId);
    if (error) throw error;
}

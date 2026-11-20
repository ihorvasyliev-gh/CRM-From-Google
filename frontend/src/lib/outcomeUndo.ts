// Undo snapshots for bulk "Send Email & Move to Pending" / "Mark Pending" on Outcomes and External Lists.
import { supabase } from './supabase';
import type { GraduateRow } from '../hooks/useOutcomes';
import type { OutreachContact } from '../hooks/useOutreach';
import type { OutcomeTrackingStatus } from './employmentTypes';

/** How long the Undo toast stays visible after moving people to Pending. */
export const OUTCOME_UNDO_MS = 8000;

export interface GraduatePendingSnapshot {
    student_id: string;
    /** Whether a row already existed in employment_status before moving to pending */
    had_row: boolean;
    tracking_status: OutcomeTrackingStatus;
    last_sent_at: string | null;
}

export function snapshotGraduatesForPending(rows: readonly GraduateRow[]): GraduatePendingSnapshot[] {
    return rows.map(g => ({
        student_id: g.student_id,
        // A graduate has a stored row if they were previously contacted, answered, or marked called_no_answer
        had_row: g.tracking_status !== 'not_contacted' || g.is_working !== null || !!g.last_sent_at || !!g.called_no_answer_at,
        tracking_status: g.tracking_status,
        last_sent_at: g.last_sent_at,
    }));
}

/** Restores graduates moved to Pending back to their previous tracking state. */
export async function restoreGraduatesFromPending(snapshots: readonly GraduatePendingSnapshot[]): Promise<void> {
    const toDelete = snapshots.filter(s => !s.had_row).map(s => s.student_id);
    const toUpdate = snapshots.filter(s => s.had_row);

    if (toDelete.length > 0) {
        const { error } = await supabase
            .from('employment_status')
            .delete()
            .in('student_id', toDelete);
        if (error) throw error;
    }

    for (const snap of toUpdate) {
        const { error } = await supabase
            .from('employment_status')
            .update({
                status: snap.tracking_status,
                last_invited_at: snap.last_sent_at,
            })
            .eq('student_id', snap.student_id);
        if (error) throw error;
    }
}

export interface OutreachPendingSnapshot {
    id: string;
    status: OutreachContact['status'];
    last_invited_at: string | null;
}

export function snapshotOutreachForPending(rows: readonly OutreachContact[]): OutreachPendingSnapshot[] {
    return rows.map(c => ({
        id: c.id,
        status: c.status,
        last_invited_at: c.last_invited_at,
    }));
}

/** Restores outreach contacts moved to Pending back to their previous status and invite timestamp. */
export async function restoreOutreachFromPending(snapshots: readonly OutreachPendingSnapshot[]): Promise<void> {
    for (const snap of snapshots) {
        const { error } = await supabase
            .from('outreach_contacts')
            .update({
                status: snap.status,
                last_invited_at: snap.last_invited_at,
            })
            .eq('id', snap.id);
        if (error) throw error;
    }
}

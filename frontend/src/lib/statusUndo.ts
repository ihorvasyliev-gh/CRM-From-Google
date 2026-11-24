// One "Undo" for every status change on the board: a single card (drag, menu), the bulk bar and
// an invitation all put the rows back the same way.
import type { QueryClient } from '@tanstack/react-query';
import type { EnrollmentWithRelations } from './documentRender';
import { refreshCachedEnrollments } from './enrollmentCache';
import { restoreEnrollments, type EnrollmentSnapshot } from './enrollmentStatus';
import type { ShowToast } from './toast';

/** How long a status change offers its Undo. */
export const UNDO_TOAST_MS = 7000;

interface UndoStatusChange {
    queryClient: QueryClient;
    /** Updates the cached enrollment list */
    setEnrollments: (updater: (prev: EnrollmentWithRelations[]) => EnrollmentWithRelations[]) => void;
    /** The rows as they were, and the rows the change deleted (as stored) */
    undo: { snapshots: readonly EnrollmentSnapshot[]; removed: readonly object[] };
    /** The deleted rows as they were loaded (with student and course), to show them again at once */
    removedRows?: readonly EnrollmentWithRelations[];
    showToast: ShowToast;
    /** Shown once the rows are back */
    doneMessage?: string;
    failMessage?: string;
}

/**
 * Puts the rows of a status change back: in the database first, then in the cached list, and
 * finally reads them again so the board shows what the database really has.
 */
export async function undoStatusChange({ queryClient, setEnrollments, undo, removedRows = [], showToast, doneMessage = 'Change undone', failMessage = 'Could not undo the change' }: UndoStatusChange): Promise<boolean> {
    let ok = true;
    try {
        const result = await restoreEnrollments(undo.snapshots, undo.removed);
        const skippedSet = new Set(result.skippedIds);
        const byId = new Map(undo.snapshots.filter(s => !skippedSet.has(s.id)).map(snap => [snap.id, snap]));
        setEnrollments(prev => [
            ...(skippedSet.size === 0 ? removedRows.filter(r => !prev.some(e => e.id === r.id)) : []),
            ...prev.map(e => {
                const snap = byId.get(e.id);
                if (!snap) return e;
                const { expected_status: _es, expected_updated_at: _eu, ...fields } = snap;
                return { ...e, ...fields };
            }),
        ]);
        if (skippedSet.size > 0) {
            const msg = result.restoredCount > 0
                ? `${doneMessage} (${skippedSet.size} skipped — updated by someone else meanwhile)`
                : 'Could not undo — this enrollment was already updated by someone else';
            showToast(msg, 'info');
        } else {
            showToast(doneMessage, 'info');
        }
    } catch (err) {
        console.error('Undo failed:', err);
        showToast(failMessage, 'error');
        ok = false;
    } finally {
        void refreshCachedEnrollments(queryClient, [
            ...undo.snapshots.map(snap => snap.id),
            ...removedRows.map(e => e.id),
        ]);
    }
    return ok;
}

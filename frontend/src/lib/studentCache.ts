// ─── A student's details wherever the app shows them ─────────────────────
import type { QueryClient } from '@tanstack/react-query';
import { updateCachedRelations, type RelationRow } from './enrollmentCache';
import type { Student } from './types';

/** One student's own record, as an open student card shows it (under ['students'], so every students reload covers it). */
export const studentRecordKey = (id: string) => ['students', 'by_id', id] as const;

/**
 * Every cached list that shows students' names or contact details. A change to a student
 * (here, on another page, or by another user through realtime) reloads them all, so no page
 * keeps showing the old values until it is opened again.
 */
export const STUDENT_VIEW_KEYS = [
    'students',
    'palette_students',
    'enrollment_modal_students',
    'outcomes_graduates',
    'pending_completions',
    'restricted_students_search',
    'restricted_student_detail',
    'viewer_students_directory',
    'viewer_course_roster',
    'analytics_enrollments_v2',
    'dashboard_stats',
] as const;

/**
 * After a student was saved: `stored` is the row as the database has it now (or the fields that
 * changed). An open student card and the board's cards show it at once; every list of students
 * (and the card) then reloads.
 */
export function applyStudentChange(queryClient: QueryClient, stored: Partial<Student> & { id: string }): Student | undefined {
    const record = queryClient.setQueryData<Student>(studentRecordKey(stored.id), old => old && { ...old, ...stored });
    updateCachedRelations(queryClient, { students: [stored as unknown as RelationRow] });
    // The open card is read back too: `stored` may hold only the fields that changed
    STUDENT_VIEW_KEYS.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    return record;
}

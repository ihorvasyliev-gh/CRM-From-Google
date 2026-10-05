import { supabase } from '../lib/supabase';
import type { EmploymentStatusRow } from '../lib/types';
import { fetchAllPages, fetchEmploymentStatuses } from '../lib/queries';

export interface GraduateRow {
    student_id: string;
    first_name: string;
    last_name: string;
    email: string;
    courses: string[];
    // Employment status (may be null if not yet submitted)
    is_working: boolean | null;
    started_month: string | null;
    field_of_work: string | null;
    employment_type: string | null;
    status_updated_at: string | null;
    // Tracking
    tracking_status: 'not_contacted' | 'pending' | 'responded';
    last_sent_at: string | null;
}

/** A completed enrollment with the student and course fields the outcomes list needs. */
interface GraduateEnrollment {
    student_id: string;
    course_id: string;
    courses: { name: string } | null;
    students: { id: string; first_name: string; last_name: string; email: string } | null;
}

export async function fetchGraduatesFn(): Promise<GraduateRow[]> {
    // All completed enrollments with student info, and every employment_status row. A failed
    // page throws: an empty or partial list would look like real data.
    const [enrollments, empStatuses] = await Promise.all([
        fetchAllPages((from, to) => supabase
            .from('enrollments')
            .select('student_id, course_id, courses(name), students(id, first_name, last_name, email)')
            .eq('status', 'completed')
            .order('id')
            .range(from, to)
        ) as unknown as Promise<GraduateEnrollment[]>,
        fetchEmploymentStatuses(),
    ]);

    // Index employment statuses by student_id for instant O(1) lookup
    const empStatusMap = new Map<string, EmploymentStatusRow>();
    for (const es of empStatuses) {
        if (es.student_id) {
            empStatusMap.set(es.student_id, es);
        }
    }

    // Build a map of unique students
    const studentMap = new Map<string, GraduateRow>();

    for (const e of enrollments) {
        const student = e.students;
        const course = e.courses;
        if (!student || !student.id) continue;

        if (!studentMap.has(student.id)) {
            const empStatus = empStatusMap.get(student.id);

            let trackingStatus: GraduateRow['tracking_status'] = 'not_contacted';
            if (empStatus) {
                trackingStatus = empStatus.status as GraduateRow['tracking_status'];
            }

            studentMap.set(student.id, {
                student_id: student.id,
                first_name: student.first_name || '',
                last_name: student.last_name || '',
                email: student.email || '',
                courses: [course?.name || 'Unknown'],
                is_working: empStatus?.is_working ?? null,
                started_month: empStatus?.started_month ?? null,
                field_of_work: empStatus?.field_of_work ?? null,
                employment_type: empStatus?.employment_type ?? null,
                status_updated_at: empStatus?.last_responded_at ?? null,
                tracking_status: trackingStatus,
                last_sent_at: empStatus?.last_invited_at ?? null,
            });
        } else {
            // Add course to existing student
            const existing = studentMap.get(student.id)!;
            const courseName = course?.name || 'Unknown';
            if (!existing.courses.includes(courseName)) {
                existing.courses.push(courseName);
            }
        }
    }

    return Array.from(studentMap.values()).sort(
        (a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    );
}

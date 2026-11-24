import { supabase } from '../lib/supabase';
import type { EmploymentStatusRow } from '../lib/types';
import { fetchAllPages, fetchEmploymentStatuses } from '../lib/queries';

export interface GraduateRow {
    student_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
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
    /** Phoned and didn't pick up (migration 90); tracking status is left as it was */
    called_no_answer_at: string | null;
    /** Most recent course completion day (YYYY-MM-DD, migration 97), null when unknown */
    last_completed_date: string | null;
    /** Latest completion day (YYYY-MM-DD) per completed course name (migration 97) */
    course_completed_dates: Record<string, string | null>;
}

/** A completed enrollment with the student, course, and date fields the outcomes list needs. */
interface GraduateEnrollment {
    student_id: string;
    course_id: string;
    completed_date?: string | null;
    confirmed_date?: string | null;
    completed_at?: string | null;
    invited_date?: string | null;
    created_at?: string | null;
    courses: { name: string } | null;
    students: { id: string; first_name: string; last_name: string; email: string; phone?: string | null } | null;
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateOnly(value: string | null | undefined): string | null {
    if (!value) return null;
    const prefix = value.slice(0, 10);
    return ISO_DAY_RE.test(prefix) ? prefix : null;
}

function timestampDay(value: string | null | undefined): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function enrollmentCompletionDay(e: GraduateEnrollment): string | null {
    return (
        dateOnly(e.completed_date) ||
        dateOnly(e.confirmed_date) ||
        timestampDay(e.completed_at) ||
        dateOnly(e.invited_date) ||
        timestampDay(e.created_at)
    );
}

function maxDay(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return b > a ? b : a;
}

function normalizeCourseCompletedDates(raw: unknown): Record<string, string | null> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const result: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        result[k] = typeof v === 'string' ? dateOnly(v) : null;
    }
    return result;
}

const byName = (a: GraduateRow, b: GraduateRow) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);

/** Every student who completed a course, with their employment answer, A–Z by last name. */
export async function fetchGraduatesFn(): Promise<GraduateRow[]> {
    // Built by the database in paged RPC calls (migration 85, extended in 90, 97, 99)
    try {
        const rows = await fetchAllPages<Record<string, unknown>>((from, to) => {
            const req = supabase.rpc('get_outcome_graduates') as unknown as {
                range?: (f: number, t: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
            } & PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
            return typeof req?.range === 'function' ? req.range(from, to) : req;
        });
        // Before migration 97 the RPC doesn't return completion dates; fall back so date filtering still works
        if (rows.length === 0 || 'last_completed_date' in rows[0]) {
            return (rows as unknown as GraduateRow[])
                .map(g => ({
                    ...g,
                    phone: g.phone ?? null,
                    called_no_answer_at: g.called_no_answer_at ?? null,
                    last_completed_date: dateOnly(g.last_completed_date),
                    course_completed_dates: normalizeCourseCompletedDates(g.course_completed_dates),
                }))
                .sort(byName);
        }
        console.warn('get_outcome_graduates has no completion dates (is migration 97 applied?), building the list here');
        return buildGraduates();
    } catch (error) {
        const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error);
        console.warn('get_outcome_graduates unavailable (is migration 85 applied?), building the list here:', msg);
        return buildGraduates();
    }
}

/** The same list from completed enrollments and employment statuses, read in full. */
async function buildGraduates(): Promise<GraduateRow[]> {
    // All completed enrollments with student info, and every employment_status row. A failed
    // page throws: an empty or partial list would look like real data.
    const [enrollments, empStatuses] = await Promise.all([
        fetchAllPages((from, to) => supabase
            .from('enrollments')
            .select('student_id, course_id, completed_date, confirmed_date, completed_at, invited_date, created_at, courses(name), students(id, first_name, last_name, email, phone)')
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

        const courseName = course?.name || 'Unknown';
        const compDay = enrollmentCompletionDay(e);

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
                phone: student.phone?.trim() || null,
                courses: [courseName],
                is_working: empStatus?.is_working ?? null,
                started_month: empStatus?.started_month ?? null,
                field_of_work: empStatus?.field_of_work ?? null,
                employment_type: empStatus?.employment_type ?? null,
                status_updated_at: empStatus?.last_responded_at ?? null,
                tracking_status: trackingStatus,
                last_sent_at: empStatus?.last_invited_at ?? null,
                called_no_answer_at: empStatus?.called_no_answer_at ?? null,
                last_completed_date: compDay,
                course_completed_dates: { [courseName]: compDay },
            });
        } else {
            // Add course and update latest completion dates for existing student
            const existing = studentMap.get(student.id)!;
            if (!existing.courses.includes(courseName)) {
                existing.courses.push(courseName);
            }
            existing.last_completed_date = maxDay(existing.last_completed_date, compDay);
            existing.course_completed_dates[courseName] = maxDay(existing.course_completed_dates[courseName] ?? null, compDay);
        }
    }

    return Array.from(studentMap.values()).sort(byName);
}

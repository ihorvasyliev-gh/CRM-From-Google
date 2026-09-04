import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

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

export async function fetchGraduatesFn(): Promise<GraduateRow[]> {
    // Get all completed enrollments with student info
    let enrollments: any[] = [];
    let from = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('enrollments')
            .select('student_id, course_id, courses(name), students(id, first_name, last_name, email)')
            .eq('status', 'completed')
            .range(from, from + limit - 1);
        if (error) {
            console.error('Error fetching graduates:', error);
            return [];
        }
        if (!data || data.length === 0) break;
        enrollments = [...enrollments, ...data];
        if (data.length < limit) break;
        from += limit;
    }

    // Get all employment_status records
    let empStatuses: any[] = [];
    from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('employment_status')
            .select('*')
            .range(from, from + limit - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        empStatuses = [...empStatuses, ...data];
        if (data.length < limit) break;
        from += limit;
    }

    // Index employment statuses by student_id for instant O(1) lookup
    const empStatusMap = new Map<string, any>();
    for (const es of empStatuses) {
        if (es.student_id) {
            empStatusMap.set(es.student_id, es);
        }
    }

    // Build a map of unique students
    const studentMap = new Map<string, GraduateRow>();

    for (const e of enrollments) {
        const student = e.students as unknown as { id: string; first_name: string; last_name: string; email: string };
        const course = e.courses as unknown as { name: string };
        if (!student || !student.id) continue;

        if (!studentMap.has(student.id)) {
            const empStatus = empStatusMap.get(student.id);

            let trackingStatus: GraduateRow['tracking_status'] = 'not_contacted';
            if (empStatus) {
                trackingStatus = empStatus.status as 'pending' | 'responded';
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

export function useGraduatesQuery() {
    return useQuery<GraduateRow[]>({
        queryKey: ['outcomes_graduates'],
        queryFn: fetchGraduatesFn,
        staleTime: 30_000,
    });
}

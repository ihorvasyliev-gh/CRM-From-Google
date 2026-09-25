// Query functions shared by the pages and App's hover prefetch (App can't import the lazy pages).
import { supabase } from './supabase';
import { buildStudentSearchFilters } from './searchUtils';
import type { Course, Student } from './types';

export const STUDENTS_PAGE_SIZE = 30;

// queryKey: ['students', search]
export async function fetchStudentsPage({ pageParam = 0, queryKey }: { pageParam?: number; queryKey: readonly unknown[] }) {
    const search = queryKey[1] as string;
    const from = pageParam * STUDENTS_PAGE_SIZE;

    let query = supabase.from('students').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (search) {
        buildStudentSearchFilters(search).forEach(filter => {
            query = query.or(filter);
        });
    }

    const { data, count, error } = await query.range(from, from + STUDENTS_PAGE_SIZE - 1);
    if (error) throw error;

    return {
        data: (data || []) as Student[],
        count: count || 0,
        nextPage: (data && data.length === STUDENTS_PAGE_SIZE) ? pageParam + 1 : undefined
    };
}

export async function fetchCourses(): Promise<Course[]> {
    const { data, error } = await supabase.from('courses').select('*').order('name');
    if (error) throw error;
    return (data || []) as Course[];
}

export async function fetchDashboardStats() {
    const [studRes, courseRes, enrollRes] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('courses').select('*', { count: 'exact', head: true }),
        supabase.from('enrollments').select('*', { count: 'exact', head: true }),
    ]);
    return {
        students: studRes.count || 0,
        courses: courseRes.count || 0,
        enrollments: enrollRes.count || 0,
    };
}

export async function fetchEmploymentStatuses() {
    const { data, error } = await supabase.from('employment_status').select('*');
    if (error) throw error;
    return data || [];
}

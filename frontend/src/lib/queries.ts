// Query functions shared by the pages and App's hover prefetch (App can't import the lazy pages).
import { supabase } from './supabase';
import { buildStudentSearchFilters } from './searchUtils';
import type { Course, EmploymentStatusRow, Student } from './types';
import type { EnrollmentWithRelations } from './documentRender';

const STUDENTS_PAGE_SIZE = 30;

/** Rows per request when reading a whole table; PostgREST's default limit (max-rows). */
const FETCH_ALL_PAGE_SIZE = 1000;
/** Pages requested at once after a full first page. */
const FETCH_ALL_PARALLEL_PAGES = 3;

/**
 * Every row of a query, read page by page; the first failed page throws (never a partial list).
 * `page(from, to)` must order by a unique key (e.g. created_at, then id): with ties, rows can move
 * between pages from one request to the next and be skipped or read twice.
 *
 * The first page is read alone (most tables fit in it); after a full one the next pages are
 * requested a few at a time, so a 5000-row table takes 3 round trips instead of 6.
 */
export async function fetchAllPages<T>(
    page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
    const read = (index: number) => page(index * FETCH_ALL_PAGE_SIZE, (index + 1) * FETCH_ALL_PAGE_SIZE - 1);
    const rows: T[] = [];
    for (let next = 0; ;) {
        const count = next === 0 ? 1 : FETCH_ALL_PARALLEL_PAGES;
        const results = await Promise.all(Array.from({ length: count }, (_, i) => read(next + i)));
        next += count;
        // In order: the first error throws, and the first short page is the end
        for (const { data, error } of results) {
            if (error) throw error;
            if (data) rows.push(...data);
            if (!data || data.length < FETCH_ALL_PAGE_SIZE) return rows;
        }
    }
}

/** Enrollment columns plus the student and course fields the board and documents use. */
export const ENROLLMENT_SELECT = '*, students(id, first_name, last_name, email, phone, address, eircode, dob), courses(id, name, requires_english, max_capacity)';

/**
 * Fresh copies of these enrollments, in the order of `ids`. Deleted ones (and ones this user may
 * no longer see) are left out.
 */
export async function fetchEnrollmentsByIds(ids: string[]): Promise<EnrollmentWithRelations[]> {
    const CHUNK = 150; // keeps the id=in.(…) URL well under server limits
    const chunks = Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) => ids.slice(i * CHUNK, (i + 1) * CHUNK));
    const results = await Promise.all(chunks.map(async chunk => {
        const { data, error } = await supabase.from('enrollments').select(ENROLLMENT_SELECT).in('id', chunk);
        if (error) throw error;
        return (data || []) as EnrollmentWithRelations[];
    }));
    const byId = new Map(results.flat().map(e => [e.id, e]));
    return ids.map(id => byId.get(id)).filter((e): e is EnrollmentWithRelations => !!e);
}

export interface StudentsPage {
    data: Student[];
    /** Every student matching the search; counted on the first page only (0 on the others) */
    count: number;
    nextPage: number | undefined;
}

// queryKey: ['students', search]
export async function fetchStudentsPage({ pageParam = 0, queryKey }: { pageParam?: number; queryKey: readonly unknown[] }): Promise<StudentsPage> {
    const search = queryKey[1] as string;
    const from = pageParam * STUDENTS_PAGE_SIZE;

    // id breaks created_at ties, so infinite scroll never repeats or skips a student between pages.
    // Only the first page is counted (the total shown comes from it): an exact count runs the whole
    // search again, and did so for every page scrolled in.
    let query = supabase.from('students').select('*', pageParam === 0 ? { count: 'exact' } : undefined).order('created_at', { ascending: false }).order('id');
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
    // A failed count would otherwise show as 0
    const failed = [studRes, courseRes, enrollRes].find(r => r.error);
    if (failed) throw failed.error;
    return {
        students: studRes.count || 0,
        courses: courseRes.count || 0,
        enrollments: enrollRes.count || 0,
    };
}

export async function fetchEmploymentStatuses(): Promise<EmploymentStatusRow[]> {
    return fetchAllPages((from, to) =>
        supabase.from('employment_status').select('*').order('id').range(from, to)
    ) as Promise<EmploymentStatusRow[]>;
}

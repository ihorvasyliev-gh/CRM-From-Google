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
/** The student fields each enrollment row carries (`students` in ENROLLMENT_SELECT). */
export const ENROLLMENT_STUDENT_FIELDS = ['id', 'first_name', 'last_name', 'email', 'phone', 'address', 'eircode', 'dob'] as const;
/** The course fields each enrollment row carries (`courses` in ENROLLMENT_SELECT). */
export const ENROLLMENT_COURSE_FIELDS = ['id', 'name', 'requires_english', 'max_capacity'] as const;

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

/** Every enrollment of these students, with the same fields as the cached list. */
export async function fetchEnrollmentsByStudentIds(studentIds: string[]): Promise<EnrollmentWithRelations[]> {
    const { data, error } = await supabase.from('enrollments').select(ENROLLMENT_SELECT).in('student_id', studentIds);
    if (error) throw error;
    return (data || []) as EnrollmentWithRelations[];
}

type EnrollmentStudent = NonNullable<EnrollmentWithRelations['students']>;
type EnrollmentCourse = NonNullable<EnrollmentWithRelations['courses']>;
type Changed = { updated_at: string };

export interface ChangesSince {
    /** Enrollments changed or added */
    enrollments: EnrollmentWithRelations[];
    /** How many enrollments there are in all (fewer than the cached list: some were deleted) */
    total: number;
    /** Students and courses changed, with the fields the enrollment rows carry and updated_at */
    students: (EnrollmentStudent & Changed)[];
    courses: (EnrollmentCourse & Changed)[];
}

/**
 * What changed since `since` (an ISO time) for the cached enrollment list: at most `limit + 1`
 * rows of each kind (more than `limit`: too many to catch up on). Students and courses need
 * migration 84 (their updated_at); without it this throws.
 */
export async function fetchChangesSince(since: string, limit: number): Promise<ChangesSince> {
    const [enrollments, all, students, courses] = await Promise.all([
        supabase.from('enrollments').select(ENROLLMENT_SELECT).gte('updated_at', since).order('updated_at').order('id').limit(limit + 1),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }),
        supabase.from('students').select([...ENROLLMENT_STUDENT_FIELDS, 'updated_at'].join(', ')).gte('updated_at', since).limit(limit + 1),
        supabase.from('courses').select([...ENROLLMENT_COURSE_FIELDS, 'updated_at'].join(', ')).gte('updated_at', since).limit(limit + 1),
    ]);
    const failed = [enrollments, all, students, courses].find(r => r.error);
    if (failed) throw failed.error;
    return {
        enrollments: (enrollments.data || []) as EnrollmentWithRelations[],
        total: all.count ?? 0,
        students: (students.data || []) as unknown as ChangesSince['students'],
        courses: (courses.data || []) as unknown as ChangesSince['courses'],
    };
}

export interface StudentsPage {
    data: Student[];
    /** Every student matching the search; counted on the first page only (0 on the others) */
    count: number;
    nextPage: number | undefined;
}

/** The Students list's order: a column, up or down */
export interface StudentSort {
    key: 'name' | 'eircode' | 'created_at';
    dir: 'asc' | 'desc';
}
/** Newest first; the list's key leaves it out, so ['students', search] stays the usual key */
export const DEFAULT_STUDENT_SORT: StudentSort = { key: 'created_at', dir: 'desc' };

// queryKey: ['students', search] or ['students', search, sortKey, sortDir]
export async function fetchStudentsPage({ pageParam = 0, queryKey }: { pageParam?: number; queryKey: readonly unknown[] }): Promise<StudentsPage> {
    const search = queryKey[1] as string;
    const sortKey = (queryKey[2] as StudentSort['key'] | undefined) ?? DEFAULT_STUDENT_SORT.key;
    const ascending = (queryKey[3] ?? DEFAULT_STUDENT_SORT.dir) === 'asc';
    const from = pageParam * STUDENTS_PAGE_SIZE;

    // id breaks ties, so infinite scroll never repeats or skips a student between pages.
    // Only the first page is counted (the total shown comes from it): an exact count runs the whole
    // search again, and did so for every page scrolled in.
    let query = supabase.from('students').select('*', pageParam === 0 ? { count: 'exact' } : undefined);
    if (sortKey === 'name') query = query.order('first_name', { ascending }).order('last_name', { ascending });
    // Students without an Eircode go last either way
    else if (sortKey === 'eircode') query = query.order('eircode', { ascending, nullsFirst: false });
    else query = query.order('created_at', { ascending });
    query = query.order('id');
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

const STATUS_COUNT_KEYS = ['requested', 'invited', 'confirmed', 'completed', 'withdrawn', 'rejected'] as const;

export interface DashboardStats {
    students: number;
    courses: number;
    enrollments: number;
    /** Enrollments in each status, from the per-course counts (null if those can't be read) */
    byStatus: Record<string, number> | null;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
    const [studRes, courseRes, enrollRes, perCourse] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('courses').select('*', { count: 'exact', head: true }),
        supabase.from('enrollments').select('*', { count: 'exact', head: true }),
        supabase.rpc('get_course_enrollment_counts'),
    ]);
    // A failed count would otherwise show as 0
    const failed = [studRes, courseRes, enrollRes].find(r => r.error);
    if (failed) throw failed.error;
    // The dashboard's numbers then don't wait for every enrollment to load
    let byStatus: Record<string, number> | null = null;
    if (!perCourse.error && Array.isArray(perCourse.data)) {
        byStatus = Object.fromEntries(STATUS_COUNT_KEYS.map(key => [key, 0]));
        for (const row of perCourse.data as Record<string, unknown>[]) {
            for (const key of STATUS_COUNT_KEYS) byStatus[key] += Number(row[key] || 0);
        }
    }
    return {
        students: studRes.count || 0,
        courses: courseRes.count || 0,
        enrollments: enrollRes.count || 0,
        byStatus,
    };
}

export async function fetchEmploymentStatuses(): Promise<EmploymentStatusRow[]> {
    return fetchAllPages((from, to) =>
        supabase.from('employment_status').select('*').order('id').range(from, to)
    ) as Promise<EmploymentStatusRow[]>;
}

/**
 * Leaves enrollments out of (or counts them again in) Analytics and the one-page report
 * (a course run marked "Ignore in reports", migration 82).
 */
export async function setExcludedFromReports(ids: string[], exclude: boolean): Promise<void> {
    const CHUNK = 150; // keeps the id=in.(…) URL well under server limits
    for (let i = 0; i < ids.length; i += CHUNK) {
        const { error } = await supabase
            .from('enrollments')
            .update({ exclude_from_reports: exclude })
            .in('id', ids.slice(i, i + CHUNK));
        if (error) throw error;
    }
}

// ─── The Students page's filters, sorting and the loads behind them ──────
import { supabase } from '../../lib/supabase';
import { buildStudentSearchFilters } from '../../lib/searchUtils';
import { DEFAULT_STUDENT_SORT, fetchStudentsPage, type StudentSort, type StudentsPage } from '../../lib/queries';
import { fullName, type EnrollmentStatus, type Student } from '../../lib/types';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

/** What the list can be sorted by. Phone sorts on the server; Courses needs every student loaded. */
export interface ListSort {
    key: StudentSort['key'] | 'phone' | 'courses';
    dir: 'asc' | 'desc';
}

/** Same page size as the shared loader */
const STUDENTS_PAGE_SIZE = 30;

export const DEFAULT_LIST_SORT: ListSort = DEFAULT_STUDENT_SORT;

/** Names, phones and Eircodes start A→Z; dates newest first; courses most first */
export function firstDirection(key: ListSort['key']): ListSort['dir'] {
    return key === 'created_at' || key === 'courses' ? 'desc' : 'asc';
}

export interface StudentFilters {
    /** On this course (any status unless `status` is set too) */
    courseId: string | null;
    /** Has an enrollment in this status (on the chosen course, if one is chosen) */
    status: EnrollmentStatus | null;
    /** Not on any course at all; can't be combined with the two above */
    noCourses: boolean;
}

export const NO_FILTERS: StudentFilters = { courseId: null, status: null, noCourses: false };

export function hasFilters(f: StudentFilters): boolean {
    return !!f.courseId || !!f.status || f.noCourses;
}

/** Does a student with these enrollments pass the filters? */
export function matchesFilters(enrollments: EnrollmentRow[] | undefined, f: StudentFilters): boolean {
    const list = enrollments ?? [];
    if (f.noCourses) return list.length === 0;
    if (!f.courseId && !f.status) return true;
    return list.some(e => (!f.courseId || e.course_id === f.courseId) && (!f.status || e.status === f.status));
}

/** The whole list must be loaded (not page by page) for the filters and the Courses sort */
export function needsAllStudents(filters: StudentFilters, sort: ListSort): boolean {
    return hasFilters(filters) || sort.key === 'courses';
}

const text = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

/** Sorts loaded students the way the server would; empty phones / Eircodes always go last. */
export function sortStudents(students: Student[], sort: ListSort, courseCount: (id: string) => number): Student[] {
    const sign = sort.dir === 'asc' ? 1 : -1;
    const compare = (a: Student, b: Student): number => {
        switch (sort.key) {
            case 'name':
                return sign * fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase());
            case 'phone':
            case 'eircode': {
                const av = text(a[sort.key]);
                const bv = text(b[sort.key]);
                if (!av || !bv) return av ? -1 : bv ? 1 : 0;
                return sign * av.localeCompare(bv);
            }
            case 'courses':
                return sign * (courseCount(a.id) - courseCount(b.id));
            default:
                return sign * (a.created_at ?? '').localeCompare(b.created_at ?? '');
        }
    };
    // Newest first breaks ties, so the order never jumps about between renders
    return [...students].sort((a, b) => compare(a, b) || (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.id.localeCompare(b.id));
}

/**
 * One page of the list for ['students', search] or ['students', search, sortKey, sortDir].
 * The sorts the shared loader knows go through it (so the sidebar's prefetch is reused);
 * Phone is ordered here, with students without a phone last.
 */
export async function fetchStudentsListPage(context: { pageParam?: number; queryKey: readonly unknown[] }): Promise<StudentsPage> {
    if (context.queryKey[2] !== 'phone') return fetchStudentsPage(context);
    const { pageParam = 0, queryKey } = context;
    const search = queryKey[1] as string;
    const ascending = queryKey[3] === 'asc';
    const from = pageParam * STUDENTS_PAGE_SIZE;
    let query = supabase.from('students').select('*', pageParam === 0 ? { count: 'exact' } : undefined)
        .order('phone', { ascending, nullsFirst: false })
        .order('id');
    if (search) buildStudentSearchFilters(search).forEach(filter => { query = query.or(filter); });
    const { data, count, error } = await query.range(from, from + STUDENTS_PAGE_SIZE - 1);
    if (error) throw error;
    return {
        data: (data || []) as Student[],
        count: count || 0,
        nextPage: data && data.length === STUDENTS_PAGE_SIZE ? pageParam + 1 : undefined,
    };
}

const ALL_CHUNK = 1000;


/** Every student matching the search, for the filtered list (read 1000 at a time) */
export async function fetchAllStudents(search: string): Promise<Student[]> {
    const all: Student[] = [];
    for (let from = 0; ; from += ALL_CHUNK) {
        let query = supabase.from('students').select('*').order('created_at', { ascending: false }).order('id');
        if (search) buildStudentSearchFilters(search).forEach(filter => { query = query.or(filter); });
        const { data, error } = await query.range(from, from + ALL_CHUNK - 1);
        if (error) throw error;
        all.push(...((data || []) as Student[]));
        if (!data || data.length < ALL_CHUNK) return all;
    }
}

// ─── Eircode and phone hints for the student form ──────────────────────

export { formatEircode } from '../../lib/contactUtils';

/** An Eircode is a routing key (letter + 2 digits, or D6W) and 4 more letters/digits */
export function looksLikeEircode(value: string): boolean {
    return /^([A-Z]\d{2}|D6W)[0-9A-Z]{4}$/.test(value.replace(/\s+/g, '').toUpperCase());
}

/** A phone we can read: an Irish number (08x… / 0xx…) or one with a country code */
export function looksLikePhone(value: string): boolean {
    const digits = value.replace(/[^\d+]/g, '');
    if (!digits) return false;
    if (digits.startsWith('+') || digits.startsWith('00')) return digits.replace(/\D/g, '').length >= 9;
    if (/^08\d{8}$/.test(digits)) return true;
    return /^0\d{8,9}$/.test(digits);
}

/** What else goes when a student is deleted: "Their 2 course enrollments (ECDL, Barista) will be deleted too." */
export function deleteStudentMessage(student: Pick<Student, 'first_name' | 'last_name'> | null, enrollments: EnrollmentRow[] | undefined): string {
    const list = enrollments ?? [];
    if (list.length === 0) return `${fullName(student) || 'This student'} isn't on any course. This can't be undone.`;
    const courses = [...new Set(list.map(e => e.courses?.name ?? 'Course'))];
    const shown = courses.slice(0, 3).join(', ') + (courses.length > 3 ? ` and ${courses.length - 3} more` : '');
    return `Their ${list.length} course enrollment${list.length === 1 ? '' : 's'} (${shown}) will be deleted too. This can't be undone.`;
}

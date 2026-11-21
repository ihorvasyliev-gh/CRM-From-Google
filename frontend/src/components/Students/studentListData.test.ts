import { describe, it, expect, vi } from 'vitest';
import {
    deleteStudentMessage, formatEircode, looksLikeEircode, looksLikePhone, matchesFilters, needsAllStudents,
    NO_FILTERS, sortStudents, DEFAULT_LIST_SORT,
} from './studentListData';
import { studentExportRows } from './studentExport';
import type { Student } from '../../lib/types';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

const en = (course_id: string, status: string, name = course_id): EnrollmentRow =>
    ({ id: `${course_id}-${status}`, course_id, status, course_variant: null, courses: { name } }) as unknown as EnrollmentRow;

const student = (id: string, extra: Partial<Student> = {}): Student => ({
    id, first_name: id, last_name: 'Murphy', email: `${id}@example.ie`, phone: '', address: null, eircode: null, dob: null,
    created_at: '2026-01-01T00:00:00Z', ...extra,
});

describe('matchesFilters', () => {
    const list = [en('ecdl', 'confirmed'), en('barista', 'requested')];

    it('lets everyone through with no filters', () => {
        expect(matchesFilters(undefined, NO_FILTERS)).toBe(true);
    });
    it('matches a course with any status, or a status on any course', () => {
        expect(matchesFilters(list, { ...NO_FILTERS, courseId: 'ecdl' })).toBe(true);
        expect(matchesFilters(list, { ...NO_FILTERS, courseId: 'first-aid' })).toBe(false);
        expect(matchesFilters(list, { ...NO_FILTERS, status: 'requested' })).toBe(true);
        expect(matchesFilters(list, { ...NO_FILTERS, status: 'completed' })).toBe(false);
    });
    it('needs the status on the chosen course when both are set', () => {
        expect(matchesFilters(list, { courseId: 'ecdl', status: 'confirmed', noCourses: false })).toBe(true);
        expect(matchesFilters(list, { courseId: 'ecdl', status: 'requested', noCourses: false })).toBe(false);
    });
    it('"Not on any course" keeps only students without enrollments', () => {
        const f = { ...NO_FILTERS, noCourses: true };
        expect(matchesFilters([], f)).toBe(true);
        expect(matchesFilters(undefined, f)).toBe(true);
        expect(matchesFilters(list, f)).toBe(false);
    });
});

describe('needsAllStudents', () => {
    it('loads page by page unless filtering or sorting by courses', () => {
        expect(needsAllStudents(NO_FILTERS, DEFAULT_LIST_SORT)).toBe(false);
        expect(needsAllStudents({ ...NO_FILTERS, status: 'invited' }, DEFAULT_LIST_SORT)).toBe(true);
        expect(needsAllStudents(NO_FILTERS, { key: 'courses', dir: 'desc' })).toBe(true);
    });
});

describe('sortStudents', () => {
    const a = student('a', { first_name: 'Aoife', phone: '+353871000000', created_at: '2026-03-01T00:00:00Z' });
    const b = student('b', { first_name: 'Brian', phone: '', created_at: '2026-02-01T00:00:00Z' });
    const c = student('c', { first_name: 'Cian', phone: '+353851000000', created_at: '2026-01-01T00:00:00Z' });
    const counts: Record<string, number> = { a: 1, b: 3, c: 0 };
    const ids = (list: Student[]) => list.map(s => s.id);

    it('sorts by name, date and number of courses', () => {
        expect(ids(sortStudents([c, a, b], { key: 'name', dir: 'asc' }, id => counts[id]))).toEqual(['a', 'b', 'c']);
        expect(ids(sortStudents([c, a, b], { key: 'created_at', dir: 'desc' }, id => counts[id]))).toEqual(['a', 'b', 'c']);
        expect(ids(sortStudents([c, a, b], { key: 'courses', dir: 'desc' }, id => counts[id]))).toEqual(['b', 'a', 'c']);
    });
    it('puts students without a phone last either way', () => {
        expect(ids(sortStudents([a, b, c], { key: 'phone', dir: 'asc' }, () => 0))).toEqual(['c', 'a', 'b']);
        expect(ids(sortStudents([a, b, c], { key: 'phone', dir: 'desc' }, () => 0))).toEqual(['a', 'c', 'b']);
    });
});

describe('form hints', () => {
    it('formats an Eircode as T12 AB34', () => {
        expect(formatEircode('t12ab34')).toBe('T12 AB34');
        expect(formatEircode('T12 ab34')).toBe('T12 AB34');
        expect(formatEircode('cork')).toBe('CORK');
    });
    it('knows what an Eircode looks like', () => {
        expect(looksLikeEircode('T12 AB34')).toBe(true);
        expect(looksLikeEircode('D6W XY12')).toBe(true);
        expect(looksLikeEircode('T12')).toBe(false);
    });
    it('knows what a phone number looks like', () => {
        expect(looksLikePhone('087 123 4567')).toBe(true);
        expect(looksLikePhone('021 456 7890')).toBe(true);
        expect(looksLikePhone('+380 67 123 4567')).toBe(true);
        expect(looksLikePhone('12345')).toBe(false);
    });
});

describe('deleteStudentMessage', () => {
    it('says how many enrollments go too, and on which courses', () => {
        expect(deleteStudentMessage(student('a'), [en('x', 'confirmed', 'ECDL'), en('y', 'requested', 'Barista')]))
            .toBe("Their 2 course enrollments (ECDL, Barista) will be deleted too. This can't be undone.");
        expect(deleteStudentMessage(student('a', { first_name: 'Aoife' }), []))
            .toBe("Aoife Murphy isn't on any course. This can't be undone.");
    });
});

describe('studentExportRows', () => {
    it('writes one row per student with their courses and statuses', () => {
        const rows = studentExportRows(
            [student('a', { first_name: 'Aoife', phone: '+353871234567', dob: '1990-05-04' })],
            () => [en('x', 'confirmed', 'ECDL')],
        );
        expect(rows[0]).toEqual(['Aoife', 'Murphy', 'a@example.ie', '087 123 4567', '', '', '04/05/1990', '01/01/2026', 'ECDL – Confirmed']);
    });
});

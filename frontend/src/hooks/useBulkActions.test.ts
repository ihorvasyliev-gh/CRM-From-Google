/**
 * Tests for useBulkActions utility functions.
 *
 * We test the pure, non-hook utility functions exported from useBulkActions:
 *   - getCoursePill
 *
 * cleanVariant (from types.ts) is also exercised indirectly here.
 */
import { describe, it, expect } from 'vitest';
import { getCoursePill } from './useBulkActions';
import type { EnrollmentRow } from './useEnrollments';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Builds a minimal EnrollmentRow for testing purposes. */
function makeEnrollment(
    courseName: string,
    courseVariant: string | null,
    overrides: Partial<EnrollmentRow> = {}
): EnrollmentRow {
    return {
        id: 'enr-1',
        student_id: 'stu-1',
        course_id: 'crs-1',
        status: 'requested',
        course_variant: courseVariant,
        notes: null,
        is_priority: false,
        invited_date: null,
        confirmed_date: null,
        completed_date: null,
        invited_at: null,
        confirmed_at: null,
        completed_at: null,
        response_days: 7,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        students: null,
        courses: { id: 'crs-1', name: courseName, created_at: '2024-01-01T00:00:00Z' },
        ...overrides,
    } as EnrollmentRow;
}

// ─── getCoursePill ───────────────────────────────────────────────────────────

describe('getCoursePill', () => {
    it('returns "CourseName (Variant)" for a plain variant', () => {
        const enr = makeEnrollment('Python 101', 'English');
        expect(getCoursePill(enr)).toBe('Python 101 (English)');
    });

    it('strips the course name prefix from the variant (cleanVariant behaviour)', () => {
        // cleanVariant('ECDL', 'ECDL Ukrainian') → strips prefix → 'Ukrainian'
        const enr = makeEnrollment('ECDL', 'ECDL Ukrainian');
        expect(getCoursePill(enr)).toBe('ECDL (Ukrainian)');
    });

    it('extracts text inside parentheses from the variant', () => {
        // cleanVariant returns the text inside the first (…)
        const enr = makeEnrollment('Data Analysis', 'Data Analysis (Advanced)');
        expect(getCoursePill(enr)).toBe('Data Analysis (Advanced)');
    });

    it('falls back to "English" when variant is null', () => {
        // cleanVariant('Python 101', null) → 'English' (default)
        const enr = makeEnrollment('Python 101', null);
        expect(getCoursePill(enr)).toBe('Python 101 (English)');
    });

    it('falls back to "English" when variant is empty string', () => {
        const enr = makeEnrollment('Python 101', '');
        expect(getCoursePill(enr)).toBe('Python 101 (English)');
    });

    it('handles null courses gracefully', () => {
        const enr = makeEnrollment('Any', 'Standard', { courses: null });
        // getCoursePill falls back to 'Unknown' when courses is null
        expect(getCoursePill(enr)).toBe('Unknown (Standard)');
    });

    it('capitalises the first letter of the cleaned variant', () => {
        const enr = makeEnrollment('English', 'english');
        expect(getCoursePill(enr)).toBe('English (English)');
    });
});

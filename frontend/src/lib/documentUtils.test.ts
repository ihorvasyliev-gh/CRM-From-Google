/**
 * Tests for documentUtils.ts
 *
 * Covers:
 *   - buildPlaceholderData: maps enrollment fields to template placeholder keys
 *
 * generateDocumentsArchive is NOT tested here (requires heavy libs + Supabase storage).
 */
import { describe, it, expect } from 'vitest';
import { buildPlaceholderData } from './documentUtils';
import type { EnrollmentWithRelations } from './documentUtils';

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeFullEnrollment(): EnrollmentWithRelations {
    return {
        id: 'enr-abc',
        student_id: 'stu-abc',
        course_id: 'crs-abc',
        status: 'invited',
        course_variant: 'English',
        notes: 'Some note',
        is_priority: false,
        invited_date: '2024-06-15',
        confirmed_date: '2024-06-15',
        completed_date: null,
        invited_at: null,
        confirmed_at: null,
        completed_at: null,
        response_days: 7,
        created_at: '2024-01-20T10:00:00Z',
        updated_at: '2024-01-20T10:00:00Z',
        students: {
            id: 'stu-abc',
            first_name: 'Olena',
            last_name: 'Kovalenko',
            email: 'olena@example.com',
            phone: '+353861234567',
            address: '12 Main Street',
            eircode: 'D01 AB12',
            dob: '1990-04-22',
            last_synced_at: null,
            created_at: '2024-01-01T00:00:00Z',
        },
        courses: {
            id: 'crs-abc',
            name: 'Python 101',
            created_at: '2024-01-01T00:00:00Z',
        },
    } as EnrollmentWithRelations;
}

// ─── buildPlaceholderData ────────────────────────────────────────────────────

describe('buildPlaceholderData', () => {
    it('maps student name fields correctly', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.firstName).toBe('Olena');
        expect(data.lastName).toBe('Kovalenko');
        expect(data.fullName).toBe('Olena Kovalenko');
    });

    it('maps student contact fields correctly', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.email).toBe('olena@example.com');
        expect(data.mobileNumber).toBe('+353861234567');
        expect(data.address).toBe('12 Main Street');
        expect(data.eircode).toBe('D01 AB12');
    });

    it('maps course fields correctly', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.courseTitle).toBe('Python 101');
        // courseVariant = cleanVariant('Python 101', 'English') → 'English'
        expect(data.courseVariant).toBe('English');
        expect(data.courseId).toBe('crs-abc');
    });

    it('maps enrollment dates correctly', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        // created_at = 2024-01-20 → registeredAt should be dd/mm/yyyy
        expect(data.registeredAt).toMatch(/20\/01\/2024/);
        // invitedAt = invited_date = 2024-06-15
        expect(data.invitedAt).toMatch(/15/);
    });

    it('isCompleted is "No" for non-completed status', () => {
        const enr = makeFullEnrollment();
        enr.status = 'invited';
        const data = buildPlaceholderData(enr);
        expect(data.isCompleted).toBe('No');
    });

    it('isCompleted is "Yes" for completed status', () => {
        const enr = makeFullEnrollment();
        enr.status = 'completed';
        enr.completed_date = '2024-09-01';
        const data = buildPlaceholderData(enr);
        expect(data.isCompleted).toBe('Yes');
    });

    it('enrollmentNotes maps to notes field', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.enrollmentNotes).toBe('Some note');
    });

    it('returns empty strings for null student', () => {
        const enr = makeFullEnrollment();
        enr.students = null;
        const data = buildPlaceholderData(enr);
        expect(data.firstName).toBe('');
        expect(data.lastName).toBe('');
        expect(data.fullName).toBe('');
        expect(data.email).toBe('');
    });

    it('returns empty strings for null course', () => {
        const enr = makeFullEnrollment();
        enr.courses = null;
        const data = buildPlaceholderData(enr);
        expect(data.courseTitle).toBe('');
        expect(data.courseId).toBe('');
    });

    it('isInvited is "Yes" when invited_date is set', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        expect(data.isInvited).toBe('Yes');
    });

    it('isInvited is "No" when invited_date is null', () => {
        const enr = makeFullEnrollment();
        enr.invited_date = null;
        const data = buildPlaceholderData(enr);
        expect(data.isInvited).toBe('No');
    });

    it('enrollmentStatus capitalises the first letter', () => {
        const enr = makeFullEnrollment();
        enr.status = 'confirmed';
        const data = buildPlaceholderData(enr);
        expect(data.enrollmentStatus).toBe('Confirmed');
    });

    it('includes all expected placeholder keys', () => {
        const data = buildPlaceholderData(makeFullEnrollment());
        const requiredKeys = [
            'userId', 'firstName', 'lastName', 'fullName',
            'email', 'mobileNumber', 'address', 'eircode', 'dateOfBirth',
            'courseId', 'courseTitle', 'courseVariant',
            'registeredAt', 'courseRegistrationDate',
            'isCompleted', 'completedAt',
            'isInvited', 'invitedAt',
            'confirmedDate', 'courseDate',
            'enrollmentStatus', 'enrollmentNotes',
        ];
        for (const key of requiredKeys) {
            expect(data).toHaveProperty(key);
        }
    });
});

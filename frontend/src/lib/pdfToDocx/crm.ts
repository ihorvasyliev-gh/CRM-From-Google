// ─── CRM data for a form: a student, and optionally one of their courses ───

import { courseDateOf, type EnrollmentWithRelations } from '../documentRender';
import type { Student } from '../types';
import type { CrmRecord } from './fields';

export function recordFor(
    student: Pick<Student, 'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'eircode' | 'dob'>,
    enrollment?: Pick<EnrollmentWithRelations, 'courses' | 'confirmed_date' | 'invited_date' | 'completed_date'> | null,
): CrmRecord {
    return {
        firstName: student.first_name ?? '',
        lastName: student.last_name ?? '',
        email: student.email ?? '',
        phone: student.phone ?? '',
        address: student.address ?? '',
        eircode: student.eircode ?? '',
        dob: student.dob,
        courseName: enrollment?.courses?.name ?? '',
        courseDate: enrollment ? courseDateOf(enrollment) : null,
    };
}

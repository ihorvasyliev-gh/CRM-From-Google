import { describe, it, expect } from 'vitest';
import {
    extractAvailableCompletedCourses,
    buildStudentMultiCourseProfiles,
    filterMultiCourseProfiles
} from './multiCourseUtils';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';

describe('multiCourseUtils', () => {
    const mockStudentA = {
        id: 's-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '0871234567',
        address: '10 St. Patrick Street, Cork',
        eircode: 'T12AB34',
        created_at: '2026-01-01',
        updated_at: '2026-01-01'
    };

    const mockStudentB = {
        id: 's-2',
        first_name: 'Mary',
        last_name: 'O\'Connor',
        email: 'mary@example.com',
        phone: '0859876543',
        address: 'Ballyvolane, Cork',
        eircode: 'T23CD56',
        created_at: '2026-01-01',
        updated_at: '2026-01-01'
    };

    const mockStudentC = {
        id: 's-3',
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
        phone: '0891112233',
        address: 'Douglas, Cork',
        eircode: 'T12EF78',
        created_at: '2026-01-01',
        updated_at: '2026-01-01'
    };

    const courseSecurity = { id: 'c-sec', name: 'Door Security Guarding', requires_english: true };
    const courseSafepass = { id: 'c-safe', name: 'Safe Pass', requires_english: false };
    const courseDigital = { id: 'c-dig', name: 'Digital Skills', requires_english: false };

    const mockEnrollments = [
        // John completed Security and Safe Pass
        {
            id: 'e-1',
            student_id: 's-1',
            course_id: 'c-sec',
            status: 'completed',
            completed_date: '2026-03-10',
            course_variant: 'Door',
            created_at: '2026-01-10',
            students: mockStudentA as any,
            courses: courseSecurity as any
        },
        {
            id: 'e-2',
            student_id: 's-1',
            course_id: 'c-safe',
            status: 'completed',
            completed_date: '2026-04-15',
            course_variant: null,
            created_at: '2026-02-10',
            students: mockStudentA as any,
            courses: courseSafepass as any
        },
        // Mary completed ONLY Security (and is confirmed in Safe Pass, but NOT completed)
        {
            id: 'e-3',
            student_id: 's-2',
            course_id: 'c-sec',
            status: 'completed',
            completed_date: '2026-02-20',
            course_variant: 'Static',
            created_at: '2026-01-05',
            students: mockStudentB as any,
            courses: courseSecurity as any
        },
        {
            id: 'e-4',
            student_id: 's-2',
            course_id: 'c-safe',
            status: 'confirmed', // not completed!
            completed_date: null,
            course_variant: null,
            created_at: '2026-03-01',
            students: mockStudentB as any,
            courses: courseSafepass as any
        },
        // Alice completed Safe Pass and Digital Skills
        {
            id: 'e-5',
            student_id: 's-3',
            course_id: 'c-safe',
            status: 'completed',
            completed_date: '2026-05-01',
            course_variant: null,
            created_at: '2026-04-01',
            students: mockStudentC as any,
            courses: courseSafepass as any
        },
        {
            id: 'e-6',
            student_id: 's-3',
            course_id: 'c-dig',
            status: 'completed',
            completed_date: '2026-06-01',
            course_variant: null,
            created_at: '2026-04-02',
            students: mockStudentC as any,
            courses: courseDigital as any
        }
    ] as unknown as EnrollmentWithRelations[];

    it('extractAvailableCompletedCourses correctly identifies courses with completed counts', () => {
        const courses = extractAvailableCompletedCourses(mockEnrollments);
        expect(courses).toHaveLength(3);
        
        const sec = courses.find(c => c.id === 'c-sec');
        const safe = courses.find(c => c.id === 'c-safe');
        const dig = courses.find(c => c.id === 'c-dig');

        expect(sec?.completedStudentsCount).toBe(2); // John, Mary
        expect(safe?.completedStudentsCount).toBe(2); // John, Alice
        expect(dig?.completedStudentsCount).toBe(1); // Alice
    });

    it('buildStudentMultiCourseProfiles groups completed courses by student and ignores incomplete enrollments', () => {
        const profiles = buildStudentMultiCourseProfiles(mockEnrollments);
        expect(profiles).toHaveLength(3);

        const john = profiles.find(p => p.studentId === 's-1');
        const mary = profiles.find(p => p.studentId === 's-2');
        const alice = profiles.find(p => p.studentId === 's-3');

        expect(john?.completedCount).toBe(2);
        expect(john?.completedCourses.has('c-sec')).toBe(true);
        expect(john?.completedCourses.has('c-safe')).toBe(true);

        expect(mary?.completedCount).toBe(1);
        expect(mary?.completedCourses.has('c-sec')).toBe(true);
        expect(mary?.completedCourses.has('c-safe')).toBe(false); // confirmed, not completed

        expect(alice?.completedCount).toBe(2);
        expect(alice?.completedCourses.has('c-safe')).toBe(true);
        expect(alice?.completedCourses.has('c-dig')).toBe(true);
    });

    it('filterMultiCourseProfiles with matchMode "all" returns only students who completed ALL selected courses', () => {
        const profiles = buildStudentMultiCourseProfiles(mockEnrollments);

        // Security AND Safe Pass
        const results = filterMultiCourseProfiles(profiles, {
            selectedCourseIds: ['c-sec', 'c-safe'],
            matchMode: 'all'
        });

        expect(results).toHaveLength(1);
        expect(results[0].studentId).toBe('s-1');
        expect(results[0].fullName).toBe('John Doe');
        expect(results[0].hasAllSelected).toBe(true);
    });

    it('filterMultiCourseProfiles with matchMode "any" returns students who completed AT LEAST ONE selected course, ordered by match count', () => {
        const profiles = buildStudentMultiCourseProfiles(mockEnrollments);

        // Security OR Safe Pass
        const results = filterMultiCourseProfiles(profiles, {
            selectedCourseIds: ['c-sec', 'c-safe'],
            matchMode: 'any'
        });

        // John has both (2), Mary has Security (1), Alice has Safe Pass (1)
        expect(results).toHaveLength(3);
        expect(results[0].studentId).toBe('s-1');
        expect(results[0].matchedCoursesCount).toBe(2);
        expect(results[1].matchedCoursesCount).toBe(1);
        expect(results[2].matchedCoursesCount).toBe(1);
    });

    it('filters by searchQuery matching student name, email, or phone', () => {
        const profiles = buildStudentMultiCourseProfiles(mockEnrollments);

        const results = filterMultiCourseProfiles(profiles, {
            selectedCourseIds: ['c-sec', 'c-safe'],
            matchMode: 'any',
            searchQuery: 'mary'
        });

        expect(results).toHaveLength(1);
        expect(results[0].studentId).toBe('s-2');
    });

    it('when no course is selected, defaults to showing students who completed at least 2 courses', () => {
        const profiles = buildStudentMultiCourseProfiles(mockEnrollments);

        const results = filterMultiCourseProfiles(profiles, {
            selectedCourseIds: [],
            matchMode: 'all'
        });

        // John (2) and Alice (2) have completed at least 2 courses. Mary only completed 1.
        expect(results).toHaveLength(2);
        expect(results.map(r => r.studentId).sort()).toEqual(['s-1', 's-3']);
    });
});

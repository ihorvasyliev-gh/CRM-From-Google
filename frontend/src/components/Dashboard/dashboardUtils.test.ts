import { describe, it, expect } from 'vitest';
import { calculateExpiredInvites, groupUpcomingCohorts } from './dashboardUtils';

describe('dashboardUtils - calculateExpiredInvites', () => {
    it('correctly identifies expired and expiring (<48h) invites and sorts by overdue urgency', () => {
        const now = new Date('2026-09-04T12:00:00Z').getTime();
        const enrollments = [
            {
                id: '1',
                student_id: 's1',
                course_id: 'c1',
                status: 'invited',
                invited_at: '2026-08-25T12:00:00Z', // 10 days ago, 7-day limit -> expired 3 days ago
                response_days: 7,
                students: { first_name: 'Alice', last_name: 'Cooper' },
                courses: { name: 'Manual Handling' },
            },
            {
                id: '2',
                student_id: 's2',
                course_id: 'c2',
                status: 'invited',
                invited_at: '2026-08-29T00:00:00Z', // 6.5 days ago -> ~12h remaining (<48h)
                response_days: 7,
                students: { first_name: 'Bob', last_name: 'Marley' },
                courses: { name: 'SafePass' },
            },
            {
                id: '3',
                student_id: 's3',
                course_id: 'c1',
                status: 'invited',
                invited_at: '2026-09-03T12:00:00Z', // 1 day ago -> 6 days remaining (NOT urgent)
                response_days: 7,
                students: { first_name: 'Charlie', last_name: 'Brown' },
                courses: { name: 'Manual Handling' },
            },
            {
                id: '4',
                student_id: 's4',
                course_id: 'c1',
                status: 'confirmed',
                invited_at: '2026-08-20T12:00:00Z',
                response_days: 7,
            },
        ];

        const urgent = calculateExpiredInvites(enrollments, now);
        expect(urgent).toHaveLength(2);
        // Alice is expired by 3 days -> most urgent, should be first
        expect(urgent[0].id).toBe('1');
        expect(urgent[0].isExpired).toBe(true);
        expect(urgent[0].studentName).toBe('Alice Cooper');
        expect(urgent[0].timeLabel).toBe('Expired 3d ago');

        // Bob has ~12h left -> urgent, second
        expect(urgent[1].id).toBe('2');
        expect(urgent[1].isExpired).toBe(false);
        expect(urgent[1].studentName).toBe('Bob Marley');
        expect(urgent[1].timeLabel).toBe('12h left');
    });

    it('formats time labels correctly for expired today and expiring in days', () => {
        const now = new Date('2026-09-04T12:00:00Z').getTime();
        const enrollments = [
            {
                id: '1',
                student_id: 's1',
                course_id: 'c1',
                status: 'invited',
                invited_at: '2026-09-01T10:00:00Z', // 3 days 2h ago, 3-day limit -> expired 2h ago (today)
                response_days: 3,
                students: { first_name: 'David' },
                courses: null,
            },
            {
                id: '2',
                student_id: 's2',
                course_id: 'c2',
                status: 'invited',
                invited_at: '2026-09-03T00:00:00Z', // 1.5 days ago, 3-day limit -> 36h left (>24h, <=48h)
                response_days: 3,
                students: null,
                courses: { name: 'First Aid' },
            },
        ];

        const urgent = calculateExpiredInvites(enrollments, now);
        expect(urgent).toHaveLength(2);
        expect(urgent[0].timeLabel).toBe('Expired today');
        expect(urgent[0].studentName).toBe('David');
        expect(urgent[0].courseName).toBe('Unknown Course');

        expect(urgent[1].timeLabel).toBe('2d left');
        expect(urgent[1].studentName).toBe('Unknown Student');
        expect(urgent[1].courseName).toBe('First Aid');
    });

    it('ignores invalid dates or missing invite dates', () => {
        const enrollments = [
            { id: '1', status: 'invited', invited_at: null },
            { id: '2', status: 'invited', invited_at: 'invalid-date' },
        ];
        expect(calculateExpiredInvites(enrollments)).toEqual([]);
    });
});

describe('dashboardUtils - groupUpcomingCohorts', () => {
    it('groups confirmed enrollments by upcoming confirmed_date and course', () => {
        const enrollments = [
            {
                id: 'e1',
                course_id: 'c1',
                status: 'confirmed',
                confirmed_date: '2026-09-10',
                courses: { name: 'SafePass' },
            },
            {
                id: 'e2',
                course_id: 'c1',
                status: 'confirmed',
                confirmed_date: '2026-09-10',
                courses: { name: 'SafePass' },
            },
            {
                id: 'e3',
                course_id: 'c2',
                status: 'confirmed',
                confirmed_date: '2026-09-15',
                courses: { name: 'Manual Handling' },
            },
            {
                id: 'e4',
                course_id: 'c1',
                status: 'confirmed',
                confirmed_date: '2026-09-01', // past date
                courses: { name: 'SafePass' },
            },
            {
                id: 'e5',
                course_id: 'c1',
                status: 'requested', // not confirmed
                confirmed_date: '2026-09-10',
                courses: { name: 'SafePass' },
            },
        ];

        const cohorts = groupUpcomingCohorts(enrollments, '2026-09-04');
        expect(cohorts).toHaveLength(2);
        expect(cohorts[0]).toEqual({
            date: '2026-09-10',
            courseId: 'c1',
            courseName: 'SafePass',
            confirmedCount: 2,
        });
        expect(cohorts[1]).toEqual({
            date: '2026-09-15',
            courseId: 'c2',
            courseName: 'Manual Handling',
            confirmedCount: 1,
        });
    });

    it('handles ISO timestamps with time component and caps at 12 cohorts', () => {
        const enrollments = [];
        // Create 15 unique days of cohorts
        for (let i = 1; i <= 15; i++) {
            const day = i < 10 ? `0${i}` : `${i}`;
            enrollments.push({
                id: `e-${i}`,
                course_id: `c-${i}`,
                status: 'confirmed',
                confirmed_date: `2026-10-${day}T09:00:00.000Z`,
                courses: { name: `Course ${i}` },
            });
        }

        const cohorts = groupUpcomingCohorts(enrollments, '2026-10-01');
        expect(cohorts).toHaveLength(12);
        expect(cohorts[0].date).toBe('2026-10-01');
        expect(cohorts[11].date).toBe('2026-10-12');
    });

    it('handles missing course name or missing confirmed_date', () => {
        const enrollments = [
            { id: '1', status: 'confirmed', confirmed_date: null },
            { id: '2', status: 'confirmed', confirmed_date: '2026-09-10', courses: null, course_id: 'c1' },
        ];
        const cohorts = groupUpcomingCohorts(enrollments, '2026-09-01');
        expect(cohorts).toHaveLength(1);
        expect(cohorts[0].courseName).toBe('Unknown Course');
    });
});

import { describe, it, expect } from 'vitest';
import { computeQueuePositions } from './queuePositions';

function enrollment(id: string, student_id: string, course_variant: string | null, day: number, extra: { status?: string; is_priority?: boolean; course_id?: string } = {}) {
    return {
        id,
        student_id,
        course_id: extra.course_id ?? 'safepass',
        status: extra.status ?? 'requested',
        course_variant,
        is_priority: extra.is_priority ?? false,
        created_at: new Date(Date.UTC(2026, 0, 1 + day)).toISOString(), // registered on day N
        courses: { name: 'SafePass' },
    };
}

describe('computeQueuePositions', () => {
    it('keeps a separate queue per language', () => {
        const { positions, details } = computeQueuePositions([
            enrollment('en1', 's1', 'English', 1),
            enrollment('ua1', 's2', 'Ukrainian', 2),
            enrollment('en2', 's3', null, 3), // no variant reads as English
            enrollment('ua2', 's4', 'SafePass (Ukrainian)', 4),
            enrollment('ar1', 's5', 'Arabic', 5),
        ]);
        expect(Object.fromEntries(positions)).toEqual({ en1: 1, ua1: 1, en2: 2, ua2: 2, ar1: 1 });
        expect(details.size).toBe(0);
    });

    it('places a student queued in two languages by each registration date', () => {
        // Arsen registers for Ukrainian on day 10 and for English on day 11; others register in between
        const { positions, details } = computeQueuePositions([
            enrollment('ua-early', 's1', 'Ukrainian', 1),
            enrollment('arsen-ua', 'arsen', 'Ukrainian', 10),
            enrollment('en-early', 's2', 'English', 2),
            enrollment('en-between', 's3', 'English', 10),
            enrollment('arsen-en', 'arsen', 'English', 11),
            enrollment('ua-later', 's4', 'Ukrainian', 12),
        ]);
        expect(positions.get('arsen-ua')).toBe(2);
        expect(positions.get('arsen-en')).toBe(3);
        expect(positions.get('ua-later')).toBe(3);
        expect(details.get('arsen-ua')).toBe('English #3 · Ukrainian #2');
        expect(details.get('arsen-en')).toBe('English #3 · Ukrainian #2');
        expect(details.has('en-between')).toBe(false);
    });

    it('lists only the languages still queued', () => {
        const { details } = computeQueuePositions([
            enrollment('ua', 'arsen', 'Ukrainian', 1),
            enrollment('ar', 'arsen', 'Arabic', 2, { status: 'withdrawn' }),
            enrollment('en', 'arsen', 'English', 3),
            enrollment('other-course', 'arsen', 'English', 3, { course_id: 'ecdl' }),
        ]);
        expect(details.get('ua')).toBe('English #1 · Ukrainian #1');
        expect(details.has('ar')).toBe(false);
        expect(details.has('other-course')).toBe(false);
    });

    it('puts priority first, then the earliest registration, and leaves out everyone not requested', () => {
        const { positions } = computeQueuePositions([
            enrollment('early', 's1', 'English', 1),
            enrollment('done', 's2', 'English', 0, { status: 'completed' }),
            enrollment('vip', 's3', 'English', 9, { is_priority: true }),
            enrollment('other-course', 's4', 'English', 0, { course_id: 'ecdl' }),
        ]);
        expect(Object.fromEntries(positions)).toEqual({ vip: 1, early: 2, 'other-course': 1 });
    });
});

import { describe, it, expect } from 'vitest';
import { computeQueuePositions } from './queuePositions';

function enrollment(id: string, course_variant: string | null, day: number, extra: { status?: string; is_priority?: boolean; course_id?: string } = {}) {
    return {
        id,
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
            enrollment('en1', 'English', 1),
            enrollment('ua1', 'Ukrainian', 2),
            enrollment('en2', null, 3), // no variant reads as English
            enrollment('ua2', 'Ukrainian', 4),
        ]);
        expect(Object.fromEntries(positions)).toEqual({ en1: 1, ua1: 1, en2: 2, ua2: 2 });
        expect(details.size).toBe(0);
    });

    it('puts an "Any language" student in every language queue at once, with a place in each', () => {
        const list = [
            enrollment('en1', 'English', 1),
            enrollment('ua1', 'Ukrainian', 2),
            enrollment('ua2', 'Ukrainian', 3),
            enrollment('any', 'Any language', 4),
            enrollment('en2', 'English', 5),
        ];
        const { positions, details } = computeQueuePositions(list);
        expect(details.get('any')).toBe('English #2 · Ukrainian #3');
        expect(positions.get('any')).toBe(2); // best place when no language is on screen
        // People who registered later queue behind them in their own language
        expect(positions.get('en2')).toBe(3);
        expect(positions.get('ua1')).toBe(1);

        expect(computeQueuePositions(list, 'safepass', 'Ukrainian').positions.get('any')).toBe(3);
        expect(computeQueuePositions(list, 'safepass', 'english').positions.get('any')).toBe(2);
        // A language filter on another course changes nothing here
        expect(computeQueuePositions(list, 'other', 'Ukrainian').positions.get('any')).toBe(2);
    });

    it('counts a language whose students have all moved on, so its queue starts with the "Any language" student', () => {
        const { details } = computeQueuePositions([
            enrollment('en1', 'English', 1),
            enrollment('ua-invited', 'Ukrainian', 2, { status: 'invited' }),
            enrollment('any', 'Any language', 3),
        ]);
        expect(details.get('any')).toBe('English #2 · Ukrainian #1');
    });

    it('queues "Any language" students among themselves when the course has no other language', () => {
        const { positions, details } = computeQueuePositions([
            enrollment('a1', 'Any language', 1),
            enrollment('a2', 'Any language', 2),
        ]);
        expect(Object.fromEntries(positions)).toEqual({ a1: 1, a2: 2 });
        expect(details.size).toBe(0);
    });

    it('puts priority first, then the earliest registration, and leaves out everyone not requested', () => {
        const { positions } = computeQueuePositions([
            enrollment('early', 'English', 1),
            enrollment('done', 'English', 0, { status: 'completed' }),
            enrollment('vip', 'English', 9, { is_priority: true }),
            enrollment('other-course', 'English', 0, { course_id: 'ecdl' }),
        ]);
        expect(Object.fromEntries(positions)).toEqual({ vip: 1, early: 2, 'other-course': 1 });
    });
});

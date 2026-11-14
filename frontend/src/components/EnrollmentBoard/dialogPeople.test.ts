import { describe, it, expect } from 'vitest';
import { describePeople, invitedForLabel } from './dialogPeople';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

function row(over: Partial<EnrollmentRow> = {}): EnrollmentRow {
    return {
        id: 'e1', student_id: 's1', course_id: 'c1', status: 'invited', course_variant: 'English',
        invited_date: '2026-11-20', invited_dates: null,
        students: { id: 's1', first_name: 'Anna', last_name: 'Murphy' },
        courses: { id: 'c1', name: 'Safe Pass' },
        ...over,
    } as EnrollmentRow;
}

describe('describePeople', () => {
    it('names one person and their course with its language', () => {
        expect(describePeople([row()])).toBe('Anna Murphy · Safe Pass (English)');
    });

    it('counts several people, with the language only when they share it', () => {
        expect(describePeople([row(), row({ id: 'e2' })])).toBe('2 people · Safe Pass (English)');
        expect(describePeople([row(), row({ id: 'e2', course_variant: 'Ukrainian' })])).toBe('2 people · Safe Pass');
    });

    it('says how many courses when the people are on different ones', () => {
        const other = row({ id: 'e2', course_id: 'c2', courses: { id: 'c2', name: 'Manual Handling' } as EnrollmentRow['courses'] });
        expect(describePeople([row(), other])).toBe('2 people · 2 courses');
    });

    it('is empty for nobody', () => {
        expect(describePeople([])).toBe('');
    });
});

describe('invitedForLabel', () => {
    it('shows the invited course date', () => {
        expect(invitedForLabel([row()])).toMatch(/20 Nov/);
    });

    it('lists every date of a multi-date invitation once', () => {
        const label = invitedForLabel([
            row({ invited_dates: ['2026-11-20', '2026-11-27'] }),
            row({ id: 'e2', invited_date: '2026-11-27' }),
        ])!;
        expect(label).toMatch(/20 Nov.* or .*27 Nov/);
        expect(label.match(/27 Nov/g)).toHaveLength(1);
    });

    it('is null when nobody is invited', () => {
        expect(invitedForLabel([row({ status: 'requested' })])).toBeNull();
        expect(invitedForLabel([row({ invited_date: null })])).toBeNull();
    });
});

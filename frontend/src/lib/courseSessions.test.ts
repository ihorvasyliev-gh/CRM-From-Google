import { describe, it, expect } from 'vitest';
import {
    courseDateKey, formatTimeRange, normalizeSession, normalizeTime, sessionDays, sessionForEnrollment, sessionFromRow,
    sessionHasSchedule, sessionShortNote, sessionToRow, subjectDateLabel, weeklyDates, weeklySummary, type CourseSession,
} from './courseSessions';

const session = (patch: Partial<CourseSession> = {}): CourseSession => ({
    date: '2026-10-01', start_time: null, end_time: null, location: null, days: null, ...patch,
});

describe('normalizeTime', () => {
    it.each([
        ['10:00:00', '10:00'],
        ['9:30', '09:30'],
        [' 14:05 ', '14:05'],
        ['24:00', null],
        ['10:61', null],
        ['', null],
        [null, null],
        [930, null],
    ])('%s → %s', (input, expected) => {
        expect(normalizeTime(input)).toBe(expected);
    });
});

describe('sessionFromRow', () => {
    it('reads an invite_dates row: times without seconds, trimmed place, sorted unique days from the first on', () => {
        const s = sessionFromRow({
            invite_date: '2026-10-01',
            start_time: '10:00:00',
            end_time: '14:00:00',
            location: '  Heron House  ',
            days: [
                { date: '2026-10-12', start: '10:00:00', end: '12:00' },
                { date: '2026-10-08' },
                { date: '2026-10-08', start: '11:00' },
                { date: '2026-09-30' },
                { nope: true },
                '2026-10-15',
            ],
        });
        expect(s).toEqual({
            date: '2026-10-01',
            start_time: '10:00',
            end_time: '14:00',
            location: 'Heron House',
            days: [
                { date: '2026-10-01' },
                { date: '2026-10-08' },
                { date: '2026-10-12', start: '10:00', end: '12:00' },
                { date: '2026-10-15' },
            ],
        });
    });

    it('reads the public RPC row (course_date) and treats a single day as a one-day course', () => {
        expect(sessionFromRow({ course_date: '2026-10-07', start_time: null, location: '', days: [{ date: '2026-10-07' }] }))
            .toEqual(session({ date: '2026-10-07' }));
    });

    it('needs a date', () => {
        expect(sessionFromRow({ invite_date: null })).toBeNull();
    });
});

describe('normalizeSession / sessionToRow', () => {
    it('drops day times equal to the usual time and empty places', () => {
        const s = session({
            start_time: '10:00', end_time: '14:00', location: '   ',
            days: [{ date: '2026-10-08', start: '10:00', end: '12:00' }, { date: '2026-10-01', start: '10:00', end: '14:00' }],
        });
        expect(normalizeSession(s)).toEqual(session({
            start_time: '10:00', end_time: '14:00',
            days: [{ date: '2026-10-01' }, { date: '2026-10-08', end: '12:00' }],
        }));
        expect(sessionToRow('c-1', s)).toEqual({
            course_id: 'c-1', invite_date: '2026-10-01', start_time: '10:00', end_time: '14:00', location: null,
            days: [{ date: '2026-10-01' }, { date: '2026-10-08', end: '12:00' }],
        });
    });
});

describe('sessionDays / sessionHasSchedule', () => {
    it('a one-day course has just its first day', () => {
        expect(sessionDays(session())).toEqual([{ date: '2026-10-01' }]);
        expect(sessionHasSchedule(session())).toBe(false);
        expect(sessionHasSchedule(null)).toBe(false);
        expect(sessionHasSchedule(session({ location: 'Room 1' }))).toBe(true);
        expect(sessionHasSchedule(session({ days: [{ date: '2026-10-01' }, { date: '2026-10-02' }] }))).toBe(true);
    });
});

describe('weekly courses', () => {
    it('builds weekly dates across the change of the clocks', () => {
        expect(weeklyDates('2026-10-21', 3)).toEqual(['2026-10-21', '2026-10-28', '2026-11-04']);
    });

    it('sums up a long course that meets every week at the same time', () => {
        const eightWeeks = session({ date: '2026-10-07', start_time: '10:00', days: weeklyDates('2026-10-07', 8).map(date => ({ date })) });
        expect(weeklySummary(eightWeeks)).toEqual({ weekday: 'Wednesday', weeks: 8, first: '2026-10-07', last: '2026-11-25' });
    });

    it('lists short, irregular or differently-timed courses day by day', () => {
        const four = session({ days: weeklyDates('2026-10-01', 4).map(date => ({ date })) });
        expect(weeklySummary(four)).toBeNull();

        const days = weeklyDates('2026-10-07', 8).map(date => ({ date }));
        expect(weeklySummary(session({ date: '2026-10-07', days: [...days.slice(0, 7), { date: '2026-11-26' }] }))).toBeNull();
        expect(weeklySummary(session({ date: '2026-10-07', start_time: '10:00', days: days.map((d, i) => (i === 3 ? { ...d, start: '11:00' } : d)) }))).toBeNull();
    });
});

describe('labels', () => {
    it('formats a time range', () => {
        expect(formatTimeRange('10:00', '14:00')).toBe('10:00 – 14:00');
        expect(formatTimeRange('10:00', null)).toBe('from 10:00');
        expect(formatTimeRange(null, '14:00')).toBe('until 14:00');
        expect(formatTimeRange(null, null)).toBe('');
    });

    it('short card note', () => {
        expect(sessionShortNote(session({ start_time: '10:00', days: weeklyDates('2026-10-01', 4).map(date => ({ date })) }))).toBe('4 days · 10:00');
        expect(sessionShortNote(session({ start_time: '10:00', end_time: '14:00' }))).toBe('10:00 – 14:00');
        expect(sessionShortNote(session({ location: 'Room 1' }))).toBe('');
        expect(sessionShortNote(null)).toBe('');
    });

    it('subject date: the first day, with the number of days of a multi-day course', () => {
        const four = (date: string) => session({ date, days: weeklyDates(date, 4).map(d => ({ date: d })) });
        expect(subjectDateLabel([session()])).toBe('01 Oct 2026');
        expect(subjectDateLabel([four('2026-10-01')])).toBe('01 Oct 2026 (4 days)');
        expect(subjectDateLabel([four('2026-10-29'), four('2026-10-01')])).toMatch(/^Thu 1,? or Thu 29 Oct 2026 \(4 days each\)$/);
        expect(subjectDateLabel([session(), session({ date: '2026-10-02' })])).not.toContain('days');
    });
});

describe('sessionForEnrollment', () => {
    const sessions = new Map([[courseDateKey('c-1', '2026-10-01'), session({ location: 'Room 1' })]]);
    const base = { course_id: 'c-1', status: 'confirmed' as const, confirmed_date: '2026-10-01', invited_date: '2026-10-01', invited_dates: null, completed_date: null };

    it('finds the course date of a confirmed or single-date invited enrollment', () => {
        expect(sessionForEnrollment(base, sessions)?.location).toBe('Room 1');
        expect(sessionForEnrollment({ ...base, status: 'invited', confirmed_date: null }, sessions)?.location).toBe('Room 1');
    });

    it('has none while a multi-date invite is open, or for another course', () => {
        expect(sessionForEnrollment({ ...base, status: 'invited', confirmed_date: null, invited_dates: ['2026-10-01', '2026-10-29'] }, sessions)).toBeNull();
        expect(sessionForEnrollment({ ...base, course_id: 'c-2' }, sessions)).toBeNull();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linkedRows, restoreEnrollments, statusUpdate, takeEnrollmentSnapshot } from './enrollmentStatus';
import { supabase } from './supabase';
import type { Enrollment } from './types';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }));

const NOW = new Date('2026-10-05T10:00:00.000Z');
const AT = NOW.toISOString();

describe('statusUpdate', () => {
    it('confirming stamps confirmed_at and the chosen date, and clears any completion', () => {
        expect(statusUpdate(undefined, 'confirmed', { confirmedDate: '2026-10-20' }, NOW)).toEqual({
            status: 'confirmed', confirmed_date: '2026-10-20', confirmed_at: AT, completed_date: null, completed_at: null,
        });
    });

    it('completing takes the course date and keeps an earlier confirmation time', () => {
        expect(statusUpdate({ confirmed_date: '2026-10-01', confirmed_at: '2026-09-20T08:00:00Z' }, 'completed', {}, NOW)).toEqual({
            status: 'completed', completed_date: '2026-10-01', completed_at: AT, confirmed_at: '2026-09-20T08:00:00Z',
        });
    });

    it('completing a row that was never confirmed uses today and stamps the confirmation', () => {
        const fields = statusUpdate({ confirmed_date: null, confirmed_at: null }, 'completed', {}, NOW);
        expect(fields.completed_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(fields.confirmed_at).toBe(AT);
    });

    it('inviting keeps the confirmation date but clears the confirmation time and completion', () => {
        expect(statusUpdate(undefined, 'invited', { invitedDate: '2026-11-02' }, NOW)).toEqual({
            status: 'invited', invited_date: '2026-11-02', completed_date: null, completed_at: null, confirmed_at: null,
        });
    });

    it.each(['requested', 'rejected'] as const)('%s clears the invitation and the course date', status => {
        expect(statusUpdate(undefined, status, {}, NOW)).toEqual({
            status, completed_date: null, completed_at: null, confirmed_at: null,
            confirmed_date: null, invited_date: null, invited_dates: null, invited_at: null,
        });
    });

    it('withdrawing clears the confirmation time and completion only', () => {
        expect(statusUpdate(undefined, 'withdrawn', {}, NOW)).toEqual({
            status: 'withdrawn', completed_date: null, completed_at: null, confirmed_at: null,
        });
    });
});

describe('linkedRows', () => {
    const row = (id: string, student_id: string, course_id: string, status: Enrollment['status']) => ({ id, student_id, course_id, status });
    const all = [
        row('a', 's1', 'c1', 'confirmed'),
        row('b', 's1', 'c1', 'requested'),
        row('c', 's1', 'c1', 'rejected'),
        row('d', 's1', 'c2', 'requested'),
        row('e', 's2', 'c1', 'requested'),
    ];

    it('withdrawing also withdraws the student\'s other rows on that course', () => {
        expect(linkedRows(all, [all[0]], 'withdrawn')).toEqual({ alsoUpdate: [all[1], all[2]], remove: [] });
    });

    it('completing removes only the still-requested rows of that student and course', () => {
        expect(linkedRows(all, [all[0]], 'completed')).toEqual({ alsoUpdate: [], remove: [all[1]] });
    });

    it('never touches a row that is itself chosen', () => {
        expect(linkedRows(all, [all[0], all[1]], 'completed').remove).toEqual([]);
    });

    it('other statuses touch nothing else', () => {
        expect(linkedRows(all, [all[0]], 'rejected')).toEqual({ alsoUpdate: [], remove: [] });
    });
});

describe('takeEnrollmentSnapshot', () => {
    it('keeps exactly the status fields, with null for missing ones', () => {
        expect(takeEnrollmentSnapshot({
            id: 'x', status: 'invited', confirmed_date: null, confirmed_at: null, invited_date: '2026-10-10',
            invited_at: '2026-10-01T00:00:00Z', completed_date: null, completed_at: null,
        })).toEqual({
            id: 'x', status: 'invited', confirmed_date: null, confirmed_at: null, invited_date: '2026-10-10',
            invited_dates: null, invited_at: '2026-10-01T00:00:00Z', completed_date: null, completed_at: null,
        });
    });
});

describe('restoreEnrollments', () => {
    const update = vi.fn();
    const insert = vi.fn();
    beforeEach(() => {
        vi.clearAllMocks();
        (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ update, insert });
    });

    const snapshot = takeEnrollmentSnapshot({
        id: 'a', status: 'requested', confirmed_date: null, confirmed_at: null, invited_date: null,
        invited_at: null, completed_date: null, completed_at: null,
    });
    const removed = { id: 'b', student_id: 's1', course_id: 'c1', status: 'requested', students: { id: 's1' }, courses: { id: 'c1' } } as unknown as Enrollment;

    it('writes the snapshots back, then re-creates removed rows without their joined data', async () => {
        update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
        insert.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: 'b' }], error: null }) });

        await restoreEnrollments([snapshot], [removed]);

        const { id: _id, ...fields } = snapshot;
        expect(update).toHaveBeenCalledWith(fields);
        expect(insert).toHaveBeenCalledWith([{ id: 'b', student_id: 's1', course_id: 'c1', status: 'requested' }]);
    });

    it('throws when a snapshot cannot be written', async () => {
        update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: { message: 'denied' } }) });
        await expect(restoreEnrollments([snapshot])).rejects.toEqual({ message: 'denied' });
        expect(insert).not.toHaveBeenCalled();
    });

    it('throws when the database silently skips a re-created row', async () => {
        update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
        insert.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
        await expect(restoreEnrollments([snapshot], [removed])).rejects.toThrow('could not be re-created');
    });
});

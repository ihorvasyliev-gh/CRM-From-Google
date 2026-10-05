import { describe, it, expect, vi, beforeEach } from 'vitest';
import { changeEnrollmentStatus, linkedRows, restoreEnrollments, statusUpdate, takeEnrollmentSnapshot } from './enrollmentStatus';
import { supabase } from './supabase';
import type { Enrollment } from './types';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const fromMock = supabase.from as ReturnType<typeof vi.fn>;
const rpcMock = supabase.rpc as ReturnType<typeof vi.fn>;
/** PostgREST's answer while migration 77 has not been run */
const MISSING_FUNCTION = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };

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

describe('changeEnrollmentStatus', () => {
    const update = vi.fn();
    const del = vi.fn();
    const updateIn = vi.fn();
    const updateEq = vi.fn();
    const deleteIn = vi.fn();
    beforeEach(() => {
        vi.clearAllMocks();
        fromMock.mockReturnValue({ update, delete: del });
        update.mockReturnValue({ in: updateIn, eq: updateEq });
        del.mockReturnValue({ in: deleteIn });
        updateIn.mockResolvedValue({ error: null });
        updateEq.mockResolvedValue({ error: null });
        deleteIn.mockResolvedValue({ error: null });
    });

    const row = (id: string, status: Enrollment['status'], extra: Partial<Enrollment> = {}) => ({
        id, student_id: 's1', course_id: 'c1', status, confirmed_date: null, confirmed_at: null,
        invited_date: null, invited_dates: null, invited_at: null, completed_date: null, completed_at: null, ...extra,
    });
    const confirmed = row('a', 'confirmed', { confirmed_date: '2026-10-01' });
    const duplicate = row('b', 'requested');
    const all = [confirmed, duplicate];

    it('lets the database make the whole change, and returns what it saved', async () => {
        const saved = { ...takeEnrollmentSnapshot(confirmed), status: 'completed', completed_date: '2026-10-01' };
        const storedDuplicate = { ...duplicate, notes: null, updated_at: '2026-09-01T00:00:00+00:00' };
        rpcMock.mockResolvedValue({
            data: { previous: [takeEnrollmentSnapshot(confirmed)], updated: [saved], removed: [storedDuplicate] },
            error: null,
        });

        const result = await changeEnrollmentStatus(all, [confirmed], 'completed', { confirmedDate: '2026-10-01' });

        expect(rpcMock).toHaveBeenCalledWith('change_enrollment_status', expect.objectContaining({
            p_ids: ['a'], p_status: 'completed', p_confirmed_date: '2026-10-01', p_invited_date: null,
        }));
        expect(fromMock).not.toHaveBeenCalled();
        expect(result).toEqual({
            updated: [saved],
            removed: [duplicate],
            removeFailed: false,
            undo: { snapshots: [takeEnrollmentSnapshot(confirmed)], removed: [storedDuplicate] },
        });
    });

    it('throws a refused change without trying the separate writes', async () => {
        rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
        await expect(changeEnrollmentStatus(all, [confirmed], 'withdrawn')).rejects.toEqual({ code: '42501', message: 'denied' });
        expect(fromMock).not.toHaveBeenCalled();
    });

    describe('without migration 77', () => {
        beforeEach(() => rpcMock.mockResolvedValue(MISSING_FUNCTION));

        it('withdraws the chosen row and its siblings in one update', async () => {
            const result = await changeEnrollmentStatus(all, [confirmed], 'withdrawn');

            expect(updateIn).toHaveBeenCalledWith('id', ['a', 'b']);
            expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'withdrawn', confirmed_at: null }));
            expect(result.updated.map(e => [e.id, e.status])).toEqual([['a', 'withdrawn'], ['b', 'withdrawn']]);
            expect(result.undo.snapshots).toEqual([takeEnrollmentSnapshot(confirmed), takeEnrollmentSnapshot(duplicate)]);
            expect(result.removed).toEqual([]);
        });

        it('completes row by row, then deletes the still-requested duplicate', async () => {
            const result = await changeEnrollmentStatus(all, [confirmed], 'completed');

            expect(updateEq).toHaveBeenCalledWith('id', 'a');
            expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', completed_date: '2026-10-01' }));
            expect(deleteIn).toHaveBeenCalledWith('id', ['b']);
            expect(result).toMatchObject({ removed: [duplicate], removeFailed: false, undo: { removed: [duplicate] } });
        });

        it('reports a failed deletion after the status was saved', async () => {
            deleteIn.mockResolvedValue({ error: { message: 'denied' } });
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

            const result = await changeEnrollmentStatus(all, [confirmed], 'completed');
            expect(result).toMatchObject({ removed: [], removeFailed: true, undo: { removed: [] } });
            consoleError.mockRestore();
        });

        it('throws when the status cannot be written', async () => {
            updateIn.mockResolvedValue({ error: { message: 'denied' } });
            await expect(changeEnrollmentStatus(all, [confirmed], 'rejected')).rejects.toEqual({ message: 'denied' });
            expect(del).not.toHaveBeenCalled();
        });
    });
});

describe('restoreEnrollments', () => {
    const update = vi.fn();
    const insert = vi.fn();
    beforeEach(() => {
        vi.clearAllMocks();
        fromMock.mockReturnValue({ update, insert });
    });

    const snapshot = takeEnrollmentSnapshot({
        id: 'a', status: 'requested', confirmed_date: null, confirmed_at: null, invited_date: null,
        invited_at: null, completed_date: null, completed_at: null,
    });
    const removed = { id: 'b', student_id: 's1', course_id: 'c1', status: 'requested', students: { id: 's1' }, courses: { id: 'c1' } } as unknown as Enrollment;
    const removedColumns = { id: 'b', student_id: 's1', course_id: 'c1', status: 'requested' };

    it('lets the database put everything back in one call, without the joined data', async () => {
        rpcMock.mockResolvedValue({ data: null, error: null });

        await restoreEnrollments([snapshot], [removed]);

        expect(rpcMock).toHaveBeenCalledWith('restore_enrollments', { p_rows: [snapshot], p_removed: [removedColumns] });
        expect(fromMock).not.toHaveBeenCalled();
    });

    it('throws when the database refuses, without trying the separate writes', async () => {
        rpcMock.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'not found' } });
        await expect(restoreEnrollments([snapshot])).rejects.toEqual({ code: 'P0002', message: 'not found' });
        expect(fromMock).not.toHaveBeenCalled();
    });

    describe('without migration 77', () => {
        beforeEach(() => rpcMock.mockResolvedValue(MISSING_FUNCTION));

        it('writes the snapshots back, then re-creates removed rows without their joined data', async () => {
            update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
            insert.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: 'b' }], error: null }) });

            await restoreEnrollments([snapshot], [removed]);

            const { id: _id, ...fields } = snapshot;
            expect(update).toHaveBeenCalledWith(fields);
            expect(insert).toHaveBeenCalledWith([removedColumns]);
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
});

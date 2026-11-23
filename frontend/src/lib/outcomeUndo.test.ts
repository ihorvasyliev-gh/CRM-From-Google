import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    snapshotGraduatesForPending,
    restoreGraduatesFromPending,
    snapshotOutreachForPending,
    restoreOutreachFromPending,
} from './outcomeUndo';
import { supabase } from './supabase';
import type { GraduateRow } from '../hooks/useOutcomes';
import type { OutreachContact } from '../hooks/useOutreach';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }));

const makeGraduate = (overrides: Partial<GraduateRow> = {}): GraduateRow => ({
    student_id: 's1',
    first_name: 'Ann',
    last_name: 'Byrne',
    email: 'ann@example.com',
    phone: '+353871112222',
    courses: ['First Aid'],
    is_working: null,
    started_month: null,
    field_of_work: null,
    employment_type: null,
    status_updated_at: null,
    tracking_status: 'not_contacted',
    last_sent_at: null,
    called_no_answer_at: null,
    last_completed_date: null,
    course_completed_dates: {},
    ...overrides,
});

const makeOutreach = (overrides: Partial<OutreachContact> = {}): OutreachContact => ({
    id: 'c1',
    list_id: 'list-1',
    first_name: 'John',
    last_name: 'Kelly',
    email: 'john@example.com',
    phone: null,
    external_ref: 'IRIS-1',
    notes: null,
    status: 'not_contacted',
    is_working: null,
    started_month: null,
    field_of_work: null,
    employment_type: null,
    last_invited_at: null,
    last_responded_at: null,
    called_no_answer_at: null,
    created_at: '2026-01-01T00:00:00Z',
    in_crm: false,
    ...overrides,
});

describe('outcomeUndo', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('graduates', () => {
        it('snapshots whether a graduate already had a row in employment_status', () => {
            const fresh = makeGraduate({ student_id: 's-fresh', tracking_status: 'not_contacted' });
            const calledOnly = makeGraduate({
                student_id: 's-called',
                tracking_status: 'not_contacted',
                called_no_answer_at: '2026-10-01T09:00:00Z',
            });
            const pendingPrev = makeGraduate({
                student_id: 's-pending',
                tracking_status: 'pending',
                last_sent_at: '2026-09-15T12:00:00Z',
            });
            const respondedNotWorking = makeGraduate({
                student_id: 's-resp',
                tracking_status: 'responded',
                is_working: false,
                last_sent_at: '2026-08-10T10:00:00Z',
            });

            const snaps = snapshotGraduatesForPending([fresh, calledOnly, pendingPrev, respondedNotWorking]);
            expect(snaps).toEqual([
                { student_id: 's-fresh', had_row: false, tracking_status: 'not_contacted', last_sent_at: null },
                { student_id: 's-called', had_row: true, tracking_status: 'not_contacted', last_sent_at: null },
                { student_id: 's-pending', had_row: true, tracking_status: 'pending', last_sent_at: '2026-09-15T12:00:00Z' },
                { student_id: 's-resp', had_row: true, tracking_status: 'responded', last_sent_at: '2026-08-10T10:00:00Z' },
            ]);
        });

        it('deletes rows for graduates without prior rows and updates rows for graduates with prior rows', async () => {
            const delIn = vi.fn().mockResolvedValue({ error: null });
            const del = vi.fn().mockReturnValue({ in: delIn });
            const eq = vi.fn().mockResolvedValue({ error: null });
            const update = vi.fn().mockReturnValue({ eq });
            vi.mocked(supabase.from).mockReturnValue({ delete: del, update } as never);

            const snaps = snapshotGraduatesForPending([
                makeGraduate({ student_id: 's-new-1' }),
                makeGraduate({ student_id: 's-new-2' }),
                makeGraduate({
                    student_id: 's-prev',
                    tracking_status: 'responded',
                    is_working: false,
                    last_sent_at: '2026-09-01T08:00:00Z',
                }),
            ]);

            await restoreGraduatesFromPending(snaps);

            expect(supabase.from).toHaveBeenCalledWith('employment_status');
            expect(del).toHaveBeenCalledTimes(1);
            expect(delIn).toHaveBeenCalledWith('student_id', ['s-new-1', 's-new-2']);
            expect(update).toHaveBeenCalledTimes(1);
            expect(update).toHaveBeenCalledWith({
                status: 'responded',
                last_invited_at: '2026-09-01T08:00:00Z',
            });
            expect(eq).toHaveBeenCalledWith('student_id', 's-prev');
        });

        it('throws when deleting or updating employment_status fails', async () => {
            const delErr = new Error('delete failed');
            vi.mocked(supabase.from).mockReturnValue({
                delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: delErr }) }),
            } as never);

            await expect(
                restoreGraduatesFromPending([
                    { student_id: 's1', had_row: false, tracking_status: 'not_contacted', last_sent_at: null },
                ]),
            ).rejects.toThrow('delete failed');

            const updErr = new Error('update failed');
            vi.mocked(supabase.from).mockReturnValue({
                update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updErr }) }),
            } as never);

            await expect(
                restoreGraduatesFromPending([
                    { student_id: 's2', had_row: true, tracking_status: 'pending', last_sent_at: null },
                ]),
            ).rejects.toThrow('update failed');
        });
    });

    describe('outreach contacts', () => {
        it('snapshots and restores outreach contacts with their previous status and last_invited_at', async () => {
            const eq = vi.fn().mockResolvedValue({ error: null });
            const update = vi.fn().mockReturnValue({ eq });
            vi.mocked(supabase.from).mockReturnValue({ update } as never);

            const snaps = snapshotOutreachForPending([
                makeOutreach({ id: 'c1', status: 'not_contacted', last_invited_at: null }),
                makeOutreach({ id: 'c2', status: 'responded', is_working: false, last_invited_at: '2026-07-01T10:00:00Z' }),
            ]);

            expect(snaps).toEqual([
                { id: 'c1', status: 'not_contacted', last_invited_at: null },
                { id: 'c2', status: 'responded', last_invited_at: '2026-07-01T10:00:00Z' },
            ]);

            await restoreOutreachFromPending(snaps);

            expect(supabase.from).toHaveBeenCalledWith('outreach_contacts');
            expect(update).toHaveBeenNthCalledWith(1, { status: 'not_contacted', last_invited_at: null });
            expect(eq).toHaveBeenNthCalledWith(1, 'id', 'c1');
            expect(update).toHaveBeenNthCalledWith(2, { status: 'responded', last_invited_at: '2026-07-01T10:00:00Z' });
            expect(eq).toHaveBeenNthCalledWith(2, 'id', 'c2');
        });

        it('throws when restoring an outreach contact fails', async () => {
            const err = new Error('outreach restore failed');
            vi.mocked(supabase.from).mockReturnValue({
                update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: err }) }),
            } as never);

            await expect(
                restoreOutreachFromPending([{ id: 'c1', status: 'pending', last_invited_at: null }]),
            ).rejects.toThrow('outreach restore failed');
        });
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setGraduateCallMark, setContactCallMark, callMarkErrorMessage } from './callMark';
import { supabase } from './supabase';
import type { GraduateRow } from '../hooks/useOutcomes';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }));

const grad = (tracking_status: GraduateRow['tracking_status']): GraduateRow => ({
    student_id: 's1', first_name: 'Ann', last_name: 'Byrne', email: 'ann@example.com', phone: null, courses: ['First Aid'],
    is_working: null, started_month: null, field_of_work: null, employment_type: null, status_updated_at: null,
    tracking_status, last_sent_at: null, called_no_answer_at: null,
});

function mockTable() {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ update, upsert } as never);
    return { update, upsert, eq };
}

describe('call mark', () => {
    beforeEach(() => vi.clearAllMocks());

    it('marks a pending graduate without touching the status', async () => {
        const { update, upsert, eq } = mockTable();
        await setGraduateCallMark(grad('pending'), '2026-11-12T10:00:00Z');
        expect(upsert).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith({ called_no_answer_at: '2026-11-12T10:00:00Z' });
        expect(eq).toHaveBeenCalledWith('student_id', 's1');
    });

    it('gives a not-contacted graduate a row only if missing, still Not Contacted', async () => {
        const { update, upsert } = mockTable();
        await setGraduateCallMark(grad('not_contacted'), '2026-11-12T10:00:00Z');
        expect(upsert).toHaveBeenCalledWith(
            { student_id: 's1', email: 'ann@example.com', status: 'not_contacted' },
            { onConflict: 'student_id', ignoreDuplicates: true },
        );
        expect(update).toHaveBeenCalledWith({ called_no_answer_at: '2026-11-12T10:00:00Z' });
    });

    it('clears the mark on an external contact', async () => {
        const { update, eq } = mockTable();
        await setContactCallMark('c1', null);
        expect(supabase.from).toHaveBeenCalledWith('outreach_contacts');
        expect(update).toHaveBeenCalledWith({ called_no_answer_at: null });
        expect(eq).toHaveBeenCalledWith('id', 'c1');
    });

    it('says to run the migration when the column is missing', () => {
        expect(callMarkErrorMessage({ code: 'PGRST204', message: "Could not find the 'called_no_answer_at' column" })).toMatch(/migration 90/);
        expect(callMarkErrorMessage({ message: 'JWT expired' })).not.toMatch(/migration/);
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGraduatesFn } from './useOutcomes';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
        rpc: vi.fn(),
    },
}));

describe('useOutcomes - fetchGraduatesFn', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Before migration 85: the list is built here
        vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } as never);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('takes the list from the database when it can, A–Z by last name', async () => {
        const row = (student_id: string, first_name: string, last_name: string, last_completed_date: string | null) => ({
            student_id, first_name, last_name, email: '', courses: ['First Aid'], is_working: null, started_month: null,
            field_of_work: null, employment_type: null, status_updated_at: null, tracking_status: 'not_contacted', last_sent_at: null,
            last_completed_date, course_completed_dates: { 'First Aid': last_completed_date },
        });
        vi.mocked(supabase.rpc).mockResolvedValue({
            data: [row('s2', 'Zoe', 'Walsh', '2026-10-01'), row('s1', 'Ann', 'Byrne', '2025-05-15')],
            error: null,
        } as never);

        const graduates = await fetchGraduatesFn();

        expect(supabase.rpc).toHaveBeenCalledWith('get_outcome_graduates');
        expect(supabase.from).not.toHaveBeenCalled();
        expect(graduates.map(g => g.last_name)).toEqual(['Byrne', 'Walsh']);
        expect(graduates.map(g => g.last_completed_date)).toEqual(['2025-05-15', '2026-10-01']);
        expect(graduates[0].course_completed_dates).toEqual({ 'First Aid': '2025-05-15' });
    });

    it('falls back to building the list when RPC rows predate migration 97 (no completion dates)', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
            data: [{
                student_id: 's1', first_name: 'Ann', last_name: 'Byrne', email: 'ann@example.com',
                courses: ['First Aid'], is_working: null, started_month: null, field_of_work: null,
                employment_type: null, status_updated_at: null, tracking_status: 'not_contacted', last_sent_at: null,
            }],
            error: null,
        } as never);
        (supabase.from as any).mockImplementation((table: string) => {
            const data = table === 'enrollments' ? [{
                student_id: 's1',
                course_id: 'c1',
                completed_date: '2026-08-20',
                courses: { name: 'First Aid' },
                students: { id: 's1', first_name: 'Ann', last_name: 'Byrne', email: 'ann@example.com' },
            }] : [];
            const range = vi.fn().mockResolvedValue({ data, error: null });
            const order = vi.fn().mockReturnValue({ range });
            return { select: vi.fn().mockReturnValue({ order, eq: vi.fn().mockReturnValue({ order }) }) };
        });

        const graduates = await fetchGraduatesFn();

        expect(supabase.from).toHaveBeenCalledWith('enrollments');
        expect(graduates).toHaveLength(1);
        expect(graduates[0].last_completed_date).toBe('2026-08-20');
        expect(graduates[0].course_completed_dates).toEqual({ 'First Aid': '2026-08-20' });
    });

    it('processes enrollments, aggregates completion dates across courses, and matches employment status', async () => {
        const mockEnrollments = [
            {
                student_id: 's1',
                course_id: 'c1',
                completed_date: '2025-04-12',
                courses: { name: 'Manual Handling' },
                students: { id: 's1', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
            },
            {
                student_id: 's1',
                course_id: 'c2',
                completed_date: null,
                confirmed_date: '2026-10-05',
                courses: { name: 'First Aid' },
                students: { id: 's1', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
            },
        ];

        const mockEmploymentStatus = [
            {
                student_id: 's1',
                status: 'responded',
                is_working: true,
                field_of_work: 'Construction',
                started_month: '2026-01',
                employment_type: 'Full-time',
                last_responded_at: '2026-02-01T10:00:00Z',
                last_invited_at: '2026-01-15T10:00:00Z',
            },
        ];

        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'enrollments') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            order: vi.fn().mockReturnValue({
                                range: vi.fn().mockResolvedValue({
                                    data: mockEnrollments,
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === 'employment_status') {
                return {
                    select: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                            range: vi.fn().mockResolvedValue({
                                data: mockEmploymentStatus,
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            return {};
        });

        const graduates = await fetchGraduatesFn();
        expect(graduates).toHaveLength(1);
        expect(graduates[0].student_id).toBe('s1');
        expect(graduates[0].courses).toEqual(['Manual Handling', 'First Aid']);
        expect(graduates[0].last_completed_date).toBe('2026-10-05');
        expect(graduates[0].course_completed_dates).toEqual({
            'Manual Handling': '2025-04-12',
            'First Aid': '2026-10-05',
        });
        expect(graduates[0].tracking_status).toBe('responded');
        expect(graduates[0].is_working).toBe(true);
        expect(graduates[0].field_of_work).toBe('Construction');
    });

    it('fails instead of returning an empty or partial list when a request fails', async () => {
        const failing = { data: null, error: { message: 'JWT expired' } };
        (supabase.from as any).mockImplementation((table: string) => {
            const range = vi.fn().mockResolvedValue(table === 'employment_status' ? failing : { data: [], error: null });
            const order = vi.fn().mockReturnValue({ range });
            return { select: vi.fn().mockReturnValue({ order, eq: vi.fn().mockReturnValue({ order }) }) };
        });

        await expect(fetchGraduatesFn()).rejects.toMatchObject({ message: 'JWT expired' });
    });
});

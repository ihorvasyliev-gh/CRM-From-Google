import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGraduatesFn } from './useOutcomes';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
    },
}));

describe('useOutcomes - fetchGraduatesFn', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('processes enrollments and matches employment status correctly', async () => {
        const mockEnrollments = [
            {
                student_id: 's1',
                course_id: 'c1',
                courses: { name: 'Manual Handling' },
                students: { id: 's1', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
            },
            {
                student_id: 's1',
                course_id: 'c2',
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

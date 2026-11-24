import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAdminStudentsRpcPage, NO_FILTERS, DEFAULT_LIST_SORT } from './studentListData';
import { supabase } from '../../lib/supabase';
import type { Student } from '../../lib/types';

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
        rpc: vi.fn(),
    },
}));

const mockRpc = vi.mocked(supabase.rpc);

function makeRpcRow(id: string, totalCount: number | string | null = 2): Student & { total_count?: number | string | null } {
    return {
        id,
        first_name: `First-${id}`,
        last_name: 'Murphy',
        email: `${id}@example.ie`,
        phone: '+353871234567',
        address: '1 Main St',
        eircode: 'T12 AB34',
        dob: '1990-01-01',
        created_at: '2026-03-01T10:00:00Z',
        total_count: totalCount,
    };
}

describe('fetchAdminStudentsRpcPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls get_admin_students_page with trimmed search, filters, sort, limit 30, and computed offset', async () => {
        mockRpc.mockResolvedValueOnce({
            data: [makeRpcRow('s1', 42)],
            error: null,
        } as never);

        const result = await fetchAdminStudentsRpcPage({
            pageParam: 2,
            search: '  murphy  ',
            filters: { courseId: 'course-9', status: 'confirmed', noCourses: false },
            sort: { key: 'courses', dir: 'desc' },
        });

        expect(mockRpc).toHaveBeenCalledWith('get_admin_students_page', {
            p_search: 'murphy',
            p_course_id: 'course-9',
            p_status: 'confirmed',
            p_no_courses: false,
            p_sort_key: 'courses',
            p_sort_dir: 'desc',
            p_limit: 30,
            p_offset: 60,
        });

        expect(result).not.toBeNull();
        expect(result?.count).toBe(42);
    });

    it('parses total_count (including numeric string) and strips total_count from returned Student objects', async () => {
        mockRpc.mockResolvedValueOnce({
            data: [makeRpcRow('s1', '128'), makeRpcRow('s2', '128')],
            error: null,
        } as never);

        const result = await fetchAdminStudentsRpcPage({
            search: '',
            filters: NO_FILTERS,
            sort: DEFAULT_LIST_SORT,
        });

        expect(result).not.toBeNull();
        expect(result?.count).toBe(128);
        expect(result?.data).toHaveLength(2);
        for (const student of result!.data) {
            expect('total_count' in student).toBe(false);
        }
        expect(result?.data[0].id).toBe('s1');
        expect(result?.data[1].id).toBe('s2');
    });

    it('computes nextPage as pageParam + 1 for a full page of 30 rows and undefined for partial or empty pages', async () => {
        // Full page (30 rows) on pageParam 1 -> nextPage = 2
        const fullRows = Array.from({ length: 30 }, (_, i) => makeRpcRow(`s-${i + 1}`, 75));
        mockRpc.mockResolvedValueOnce({ data: fullRows, error: null } as never);

        const fullPage = await fetchAdminStudentsRpcPage({
            pageParam: 1,
            search: '',
            filters: NO_FILTERS,
            sort: DEFAULT_LIST_SORT,
        });
        expect(fullPage?.data).toHaveLength(30);
        expect(fullPage?.count).toBe(75);
        expect(fullPage?.nextPage).toBe(2);

        // Partial page (12 rows) on pageParam 2 -> nextPage = undefined
        const partialRows = Array.from({ length: 12 }, (_, i) => makeRpcRow(`p-${i + 1}`, 72));
        mockRpc.mockResolvedValueOnce({ data: partialRows, error: null } as never);

        const partialPage = await fetchAdminStudentsRpcPage({
            pageParam: 2,
            search: '',
            filters: { ...NO_FILTERS, noCourses: true },
            sort: { key: 'name', dir: 'asc' },
        });
        expect(partialPage?.data).toHaveLength(12);
        expect(partialPage?.count).toBe(72);
        expect(partialPage?.nextPage).toBeUndefined();

        // Empty page -> count 0, nextPage undefined
        mockRpc.mockResolvedValueOnce({ data: [], error: null } as never);
        const emptyPage = await fetchAdminStudentsRpcPage({
            search: 'nobody',
            filters: NO_FILTERS,
            sort: DEFAULT_LIST_SORT,
        });
        expect(emptyPage).toEqual({ data: [], count: 0, nextPage: undefined });
    });

    it('returns null on PGRST202 and 42883 when migration 101 has not been applied', async () => {
        mockRpc.mockResolvedValueOnce({
            data: null,
            error: { code: 'PGRST202', message: 'Could not find the function public.get_admin_students_page' },
        } as never);

        await expect(
            fetchAdminStudentsRpcPage({
                search: '',
                filters: NO_FILTERS,
                sort: DEFAULT_LIST_SORT,
            }),
        ).resolves.toBeNull();

        mockRpc.mockResolvedValueOnce({
            data: null,
            error: { code: '42883', message: 'function get_admin_students_page does not exist' },
        } as never);

        await expect(
            fetchAdminStudentsRpcPage({
                search: '',
                filters: NO_FILTERS,
                sort: DEFAULT_LIST_SORT,
            }),
        ).resolves.toBeNull();
    });

    it('throws real database errors such as 42501 permission denied', async () => {
        const permError = { code: '42501', message: 'Only admins can list students' };
        mockRpc.mockResolvedValueOnce({ data: null, error: permError } as never);

        await expect(
            fetchAdminStudentsRpcPage({
                search: '',
                filters: NO_FILTERS,
                sort: DEFAULT_LIST_SORT,
            }),
        ).rejects.toEqual(permError);
    });
});

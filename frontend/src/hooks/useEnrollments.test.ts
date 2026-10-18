/**
 * Tests for useEnrollments.ts
 *
 * Tests the fetchAllEnrollments function which handles paginated fetching from Supabase.
 * The Supabase client is mocked via vitest-setup.ts (and extended here as needed).
 *
 * Note: The useEnrollments hook itself (which uses useMutation and React context)
 * is not tested here — those require a full React wrapper and are out of scope for unit tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

// We mock the supabase module so fetchAllEnrollments doesn't hit the network
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
    },
}));

import { fetchAllEnrollments } from './useEnrollments';
import { supabase } from '../lib/supabase';
import { isPartialList } from '../lib/enrollmentCache';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEnrollmentRecord(id: string) {
    return {
        id,
        student_id: 'stu-1',
        course_id: 'crs-1',
        status: 'requested',
        course_variant: 'English',
        notes: null,
        is_priority: false,
        invited_date: null,
        confirmed_date: null,
        completed_date: null,
        invited_at: null,
        confirmed_at: null,
        completed_at: null,
        response_days: 7,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        students: { id: 'stu-1', first_name: 'Test', last_name: 'User', email: 'test@example.com', phone: null, address: null, eircode: null, dob: null, last_synced_at: null, created_at: '2024-01-01T00:00:00Z' },
        courses: { id: 'crs-1', name: 'Test Course', created_at: '2024-01-01T00:00:00Z' },
    };
}

/** Creates a chainable Supabase query mock that resolves with the given data. */
function mockFromChain(data: unknown[], error: unknown = null) {
    const chain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data, error }),
    };
    return chain;
}

// ─── fetchAllEnrollments ─────────────────────────────────────────────────────

describe('fetchAllEnrollments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns an empty array when there are no enrollments', async () => {
        (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockFromChain([]));
        const result = await fetchAllEnrollments();
        expect(result).toEqual([]);
    });

    it('returns all enrollments when data fits in one page', async () => {
        const records = [makeEnrollmentRecord('enr-1'), makeEnrollmentRecord('enr-2')];
        (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockFromChain(records));
        const result = await fetchAllEnrollments();
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('enr-1');
        expect(result[1].id).toBe('enr-2');
    });

    it('paginates when the first page is full (1000 records)', async () => {
        // First page: 1000 records (triggers another fetch)
        const firstPage = Array.from({ length: 1000 }, (_, i) => makeEnrollmentRecord(`enr-${i}`));
        // Second page: 5 records (signals end of data)
        const secondPage = Array.from({ length: 5 }, (_, i) => makeEnrollmentRecord(`enr-extra-${i}`));

        const chain1 = mockFromChain(firstPage);
        const chain2 = mockFromChain(secondPage);

        let callCount = 0;
        (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callCount++;
            return callCount === 1 ? chain1 : chain2;
        });

        const result = await fetchAllEnrollments();
        expect(result).toHaveLength(1005);
        // The first page alone, then the next pages three at a time (the ones after the short page are ignored)
        expect(supabase.from).toHaveBeenCalledTimes(4);
    });

    it('throws when Supabase returns an error', async () => {
        const chain = {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } }),
        };
        (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);
        await expect(fetchAllEnrollments()).rejects.toMatchObject({ message: 'Database error' });
    });
});

describe('fetchAllEnrollments, first load', () => {
    /** One query's filters and the rows it returns: the current part, or the rest */
    function mockParts(current: unknown[], history: unknown[]) {
        const calls: { or?: string; not?: unknown[] }[] = [];
        (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
            const call: { or?: string; not?: unknown[] } = {};
            calls.push(call);
            const chain = {
                select: vi.fn().mockReturnThis(),
                or: vi.fn((filter: string) => { call.or = filter; return chain; }),
                not: vi.fn((...args: unknown[]) => { call.not = args; return chain; }),
                order: vi.fn().mockReturnThis(),
                range: vi.fn(() => Promise.resolve({ data: call.not ? history : current, error: null })),
            };
            return chain;
        });
        return calls;
    }

    it('shows the current enrollments first, then adds the rest', async () => {
        const client = new QueryClient();
        const calls = mockParts([makeEnrollmentRecord('enr-current')], [makeEnrollmentRecord('enr-old')]);
        const seen: string[][] = [];
        client.getQueryCache().subscribe(() => {
            const data = client.getQueryData<{ id: string }[]>(['enrollments']);
            if (data && seen[seen.length - 1]?.length !== data.length) seen.push(data.map(e => e.id));
        });

        const rows = await client.fetchQuery({ queryKey: ['enrollments'], queryFn: fetchAllEnrollments });

        expect(seen[0]).toEqual(['enr-current']);
        expect(rows.map(e => e.id)).toEqual(['enr-current', 'enr-old']);
        expect(isPartialList()).toBe(false);
        // Both parts at once. Current: the open statuses, or anything changed lately; the rest: neither
        expect(calls).toHaveLength(2);
        const current = calls.find(call => !call.not)!;
        expect(current.or).toMatch(/^status\.in\.\(requested,invited,confirmed\),updated_at\.gte\.\d{4}-\d{2}-\d{2}$/);
        const rest = calls.find(call => call.not)!;
        expect(rest.not).toEqual(['status', 'in', '(requested,invited,confirmed)']);
        expect(rest.or).toMatch(/^updated_at\.lt\.\d{4}-\d{2}-\d{2},updated_at\.is\.null$/);
    });

    it('reads everything at once when the list is already cached (a reload)', async () => {
        const client = new QueryClient();
        client.setQueryData(['enrollments'], []);
        const calls = mockParts([makeEnrollmentRecord('enr-1')], []);

        await client.fetchQuery({ queryKey: ['enrollments'], queryFn: fetchAllEnrollments, staleTime: 0 });

        expect(calls.every(call => !call.or && !call.not)).toBe(true);
    });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    computeDuplicateScan,
    scanDuplicateStudents,
    markStudentsAsNonDuplicates,
    markPairAsNonDuplicates,
    restoreNonDuplicatePair,
    makePairKey,
    orderStudentPair,
} from './duplicates';
import { supabase } from './supabase';
import type { Student } from './types';

function makeStudent(overrides: Partial<Student> & { id: string }): Student {
    return {
        first_name: 'Jane',
        last_name: 'Doe',
        email: `${overrides.id}@example.com`,
        phone: '',
        address: null,
        eircode: null,
        dob: null,
        created_at: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

describe('duplicates', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('computeDuplicateScan', () => {
        it('returns empty results for empty or clean student lists', () => {
            const empty = computeDuplicateScan([], []);
            expect(empty.totalStudents).toBe(0);
            expect(empty.exactEmailGroups).toEqual([]);
            expect(empty.potentialMatches).toEqual([]);
            expect(empty.ignoredPairs).toEqual([]);
            expect(empty.nonDupKeys.size).toBe(0);

            const clean = computeDuplicateScan([
                makeStudent({ id: 'a', first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com', phone: '0871111111', dob: '1990-01-01' }),
                makeStudent({ id: 'b', first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com', phone: '0872222222', dob: '1991-02-02' }),
                makeStudent({ id: 'c', first_name: 'Cara', last_name: 'Lynch', email: '   ', phone: '', dob: null }),
            ], []);
            expect(clean.totalStudents).toBe(3);
            expect(clean.exactEmailGroups).toEqual([]);
            expect(clean.potentialMatches).toEqual([]);
            expect(clean.ignoredPairs).toEqual([]);
        });

        it('groups exact email matches case-insensitively and tracks unresolved pairs for 3+ student groups', () => {
            const s1 = makeStudent({ id: 'id-1', first_name: 'Olena', last_name: 'Koval', email: 'Family@Example.com', created_at: '2026-01-01T00:00:00Z' });
            const s2 = makeStudent({ id: 'id-2', first_name: 'Ivan', last_name: 'Koval', email: ' family@example.com ', created_at: '2026-01-05T00:00:00Z' });
            const s3 = makeStudent({ id: 'id-3', first_name: 'Olena', last_name: 'Koval', email: 'FAMILY@EXAMPLE.COM', created_at: '2026-01-10T00:00:00Z' });

            // Mark (id-1, id-2) as not duplicates — (id-1, id-3) and (id-2, id-3) must remain unresolved
            const partial = computeDuplicateScan(
                [s3, s2, s1],
                [{ student_a_id: 'id-1', student_b_id: 'id-2', created_at: '2026-02-01T00:00:00Z' }],
            );

            expect(partial.exactEmailGroups).toHaveLength(1);
            const group = partial.exactEmailGroups[0];
            expect(group.key).toBe('family@example.com');
            expect(group.students).toHaveLength(3);
            expect(group.unresolvedPairs).toHaveLength(2);
            const pairKeys = group.unresolvedPairs.map(([a, b]) => makePairKey(a.id, b.id)).sort();
            expect(pairKeys).toEqual(['id-1_id-3', 'id-2_id-3']);
            // Older profile comes first in each unresolved pair
            for (const [older, newer] of group.unresolvedPairs) {
                expect(new Date(older.created_at).getTime()).toBeLessThanOrEqual(new Date(newer.created_at).getTime());
            }

            // Once all 3 pairs are marked non-duplicates, the group disappears completely
            const resolved = computeDuplicateScan(
                [s1, s2, s3],
                [
                    { student_a_id: 'id-1', student_b_id: 'id-2' },
                    { student_a_id: 'id-1', student_b_id: 'id-3' },
                    { student_a_id: 'id-2', student_b_id: 'id-3' },
                ],
            );
            expect(resolved.exactEmailGroups).toEqual([]);
            expect(resolved.ignoredPairs).toHaveLength(3);
        });

        it('detects potential matches with same normalized phone or same DOB and similar names', () => {
            const older = makeStudent({
                id: 's-old',
                first_name: 'Oleksandr',
                last_name: 'Shevchenko',
                email: 'alex.old@example.com',
                phone: '+353 87 123 4567',
                address: '1 Main St',
                dob: '1988-05-12',
                created_at: '2025-06-01T10:00:00Z',
            });
            const newerSamePhone = makeStudent({
                id: 's-new',
                first_name: 'Oleksander', // Levenshtein distance 1
                last_name: 'Shevchenko',
                email: 'alex.new@example.com',
                phone: '0871234567',
                address: '2 Oak Rd',
                dob: null,
                created_at: '2026-01-15T10:00:00Z',
            });
            const sameDobSwapped = makeStudent({
                id: 's-dob',
                first_name: 'Shevchenko',
                last_name: 'Oleksandr',
                email: 'shev@example.com',
                phone: '0859999999',
                address: '1 Main St',
                dob: '1988-05-12',
                created_at: '2026-02-01T10:00:00Z',
            });
            // Different person sharing a family phone should NOT match
            const sibling = makeStudent({
                id: 's-sib',
                first_name: 'Nataliia',
                last_name: 'Shevchenko',
                email: 'nataliia@example.com',
                phone: '0871234567',
                dob: '1992-08-20',
                created_at: '2026-02-02T10:00:00Z',
            });
            // Short phone (< 6 digits) should NOT match
            const shortA = makeStudent({ id: 'sh-a', first_name: 'John', last_name: 'Murphy', email: 'j1@x.ie', phone: '12345' });
            const shortB = makeStudent({ id: 'sh-b', first_name: 'John', last_name: 'Murphy', email: 'j2@x.ie', phone: '12345' });

            const result = computeDuplicateScan([newerSamePhone, older, sameDobSwapped, sibling, shortA, shortB], []);

            expect(result.exactEmailGroups).toEqual([]);
            expect(result.potentialMatches).toHaveLength(2);

            const phoneMatch = result.potentialMatches.find(m => m.pairKey === makePairKey('s-old', 's-new'));
            expect(phoneMatch).toBeDefined();
            expect(phoneMatch!.studentA.id).toBe('s-old');
            expect(phoneMatch!.studentB.id).toBe('s-new');
            expect(phoneMatch!.reason).toBe('Same Phone, different address/email');
            expect(phoneMatch!.diffs).toEqual(['address', 'email']);

            const dobMatch = result.potentialMatches.find(m => m.pairKey === makePairKey('s-old', 's-dob'));
            expect(dobMatch).toBeDefined();
            expect(dobMatch!.studentA.id).toBe('s-old');
            expect(dobMatch!.studentB.id).toBe('s-dob');
            expect(dobMatch!.reason).toBe('Same DOB, different phone/email');
            expect(dobMatch!.diffs).toEqual(['phone', 'email']);
        });

        it('reports both Same DOB & Same Phone and skips pairs already in exactEmailGroups or ignored', () => {
            const a = makeStudent({ id: 'a', first_name: 'Maria', last_name: 'Silva', email: 'm1@x.ie', phone: '0871234567', dob: '1995-03-10', created_at: '2026-01-01T00:00:00Z' });
            const b = makeStudent({ id: 'b', first_name: 'María', last_name: 'Silva', email: 'm2@x.ie', phone: '+353871234567', dob: '1995-03-10', created_at: '2026-01-02T00:00:00Z' });
            const c = makeStudent({ id: 'c', first_name: 'Maria', last_name: 'Silva', email: 'm1@x.ie', phone: '0871234567', dob: '1995-03-10', created_at: '2026-01-03T00:00:00Z' });

            const result = computeDuplicateScan([a, b, c], [{ student_a_id: 'b', student_b_id: 'c' }]);

            // (a, c) share exact email -> in exactEmailGroups, NOT potentialMatches
            expect(result.exactEmailGroups).toHaveLength(1);
            expect(result.exactEmailGroups[0].unresolvedPairs).toHaveLength(1);
            // (a, b) -> potentialMatch with both Same DOB & Same Phone; (b, c) is ignored
            expect(result.potentialMatches).toHaveLength(1);
            expect(result.potentialMatches[0].pairKey).toBe('a_b');
            expect(result.potentialMatches[0].reason).toBe('Same DOB & Same Phone, different email');
        });

        it('resolves ignoredPairs newest first and filters out orphaned student IDs', () => {
            const s1 = makeStudent({ id: 'u1', first_name: 'Ann', last_name: 'One' });
            const s2 = makeStudent({ id: 'u2', first_name: 'Ben', last_name: 'Two' });
            const s3 = makeStudent({ id: 'u3', first_name: 'Cam', last_name: 'Three' });

            const result = computeDuplicateScan(
                [s1, s2, s3],
                [
                    { student_a_id: 'u1', student_b_id: 'u2', created_at: '2026-01-01T00:00:00Z' },
                    { student_a_id: 'u3', student_b_id: 'u1', created_at: '2026-03-15T12:00:00Z' },
                    // Orphaned pair where 'deleted-id' no longer exists
                    { student_a_id: 'u1', student_b_id: 'deleted-id', created_at: '2026-04-01T00:00:00Z' },
                ],
            );

            expect(result.ignoredPairs).toHaveLength(2);
            expect(result.ignoredPairs[0]).toMatchObject({
                pairKey: 'u1_u3',
                studentAId: 'u1',
                studentBId: 'u3',
                studentA: s1,
                studentB: s3,
                createdAt: '2026-03-15T12:00:00Z',
            });
            expect(result.ignoredPairs[1]).toMatchObject({
                pairKey: 'u1_u2',
                studentAId: 'u1',
                studentBId: 'u2',
                studentA: s1,
                studentB: s2,
                createdAt: '2026-01-01T00:00:00Z',
            });
            // Non-dup key set still tracks all valid rows
            expect(result.nonDupKeys.has('deleted-id_u1')).toBe(true);
        });
    });

    describe('DB helpers', () => {
        it('scanDuplicateStudents fetches all pages beyond 1,000 rows', async () => {
            const allStudents: Student[] = Array.from({ length: 1005 }, (_, i) =>
                makeStudent({
                    id: `s-${String(i).padStart(4, '0')}`,
                    email: i === 0 || i === 1004 ? 'dup@example.com' : `u${i}@example.com`,
                }),
            );

            vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
                const chain: Record<string, any> = {};
                chain.select = () => chain;
                chain.order = () => chain;
                chain.range = (from: number, to: number) => {
                    if (table === 'students') {
                        return Promise.resolve({ data: allStudents.slice(from, to + 1), error: null });
                    }
                    return Promise.resolve({ data: [], error: null });
                };
                return chain as any;
            });

            const result = await scanDuplicateStudents();
            expect(result.totalStudents).toBe(1005);
            expect(result.exactEmailGroups).toHaveLength(1);
            expect(result.exactEmailGroups[0].students.map(s => s.id)).toEqual(['s-0000', 's-1004']);
        });

        it('scanDuplicateStudents ignores missing student_non_duplicates table (42P01 / PGRST205) but throws real errors', async () => {
            for (const code of ['42P01', 'PGRST205']) {
                vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
                    const chain: Record<string, any> = {};
                    chain.select = () => chain;
                    chain.order = () => chain;
                    chain.range = () => {
                        if (table === 'students') {
                            return Promise.resolve({ data: [makeStudent({ id: 'a' })], error: null });
                        }
                        return Promise.resolve({ data: null, error: { code, message: 'missing table' } });
                    };
                    return chain as any;
                });

                const result = await scanDuplicateStudents();
                expect(result.totalStudents).toBe(1);
                expect(result.ignoredPairs).toEqual([]);
            }

            vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
                const chain: Record<string, any> = {};
                chain.select = () => chain;
                chain.order = () => chain;
                chain.range = () => {
                    if (table === 'students') {
                        return Promise.resolve({ data: [], error: null });
                    }
                    return Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } });
                };
                return chain as any;
            });

            await expect(scanDuplicateStudents()).rejects.toMatchObject({ code: '42501' });
        });

        it('markStudentsAsNonDuplicates, markPairAsNonDuplicates, and restoreNonDuplicatePair enforce ordered IDs', async () => {
            expect(orderStudentPair('z', 'a')).toEqual(['a', 'z']);

            const upsert = vi.fn().mockResolvedValue({ error: null });
            const eqCalls: [string, string][] = [];
            const deleteChain: Record<string, any> = {};
            deleteChain.eq = (col: string, val: string) => {
                eqCalls.push([col, val]);
                return eqCalls.length === 2 ? Promise.resolve({ error: null }) : deleteChain;
            };

            vi.spyOn(supabase, 'from').mockReturnValue({
                upsert,
                delete: () => deleteChain,
            } as any);

            await markStudentsAsNonDuplicates(['c', 'a', 'b', 'a']);
            expect(upsert).toHaveBeenCalledWith(
                [
                    { student_a_id: 'a', student_b_id: 'c' },
                    { student_a_id: 'b', student_b_id: 'c' },
                    { student_a_id: 'a', student_b_id: 'b' },
                ],
                { onConflict: 'student_a_id,student_b_id' },
            );

            upsert.mockClear();
            await markPairAsNonDuplicates('z-id', 'a-id');
            expect(upsert).toHaveBeenCalledWith(
                { student_a_id: 'a-id', student_b_id: 'z-id' },
                { onConflict: 'student_a_id,student_b_id' },
            );

            await restoreNonDuplicatePair('z-id', 'a-id');
            expect(eqCalls).toEqual([
                ['student_a_id', 'a-id'],
                ['student_b_id', 'z-id'],
            ]);
        });
    });
});

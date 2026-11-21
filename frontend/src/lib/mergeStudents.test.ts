import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from './supabase';
import { mergeStudents, isMissingFunction } from './mergeStudents';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const rpc = vi.mocked(supabase.rpc);
const from = vi.mocked(supabase.from);

function updateChain(result: { error: unknown } = { error: null }) {
    const eq = vi.fn().mockResolvedValue(result);
    const update = vi.fn(() => ({ eq }));
    return { update, eq };
}

beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
});

describe('mergeStudents', () => {
    it('merges in one database call, passing the picked details', async () => {
        rpc.mockResolvedValue({ error: null } as never);
        await mergeStudents('p', 'd', 'dup@x.ie', { email: 'dup@x.ie' });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('merge_students_with_changes', {
            p_primary_id: 'p', p_duplicate_id: 'd', p_changes: { email: 'dup@x.ie' },
        });
        expect(from).not.toHaveBeenCalled();
    });

    it('reports a database error without touching the students separately', async () => {
        rpc.mockResolvedValue({ error: { code: 'P0001', message: 'boom' } } as never);
        await expect(mergeStudents('p', 'd', null, { phone: '087' })).rejects.toThrow('boom');
        expect(from).not.toHaveBeenCalled();
    });

    it('falls back to the step-by-step merge before migration 94 is applied', async () => {
        rpc.mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'Could not find the function' } } as never)
            .mockResolvedValueOnce({ error: null } as never);
        const chain = updateChain();
        from.mockReturnValue(chain as never);
        await mergeStudents('p', 'd', 'dup@x.ie', { email: 'dup@x.ie' });
        expect(chain.update).toHaveBeenNthCalledWith(1, { email: null });
        expect(chain.update).toHaveBeenNthCalledWith(2, { email: 'dup@x.ie' });
        expect(rpc).toHaveBeenLastCalledWith('merge_students', { p_primary_id: 'p', p_duplicate_id: 'd' });
    });

    it('fallback puts the duplicate email back when the merge fails', async () => {
        rpc.mockResolvedValueOnce({ error: { code: 'PGRST202', message: '' } } as never)
            .mockResolvedValueOnce({ error: { message: 'merge failed' } } as never);
        const chain = updateChain();
        from.mockReturnValue(chain as never);
        await expect(mergeStudents('p', 'd', 'dup@x.ie', { phone: '087' })).rejects.toThrow('merge failed');
        expect(chain.update).toHaveBeenLastCalledWith({ email: 'dup@x.ie' });
    });
});

describe('isMissingFunction', () => {
    it('recognises a function that does not exist yet', () => {
        expect(isMissingFunction({ code: 'PGRST202' })).toBe(true);
        expect(isMissingFunction({ code: '42883' })).toBe(true);
        expect(isMissingFunction({ code: '42501', message: 'Only admins can merge students' })).toBe(false);
    });
});

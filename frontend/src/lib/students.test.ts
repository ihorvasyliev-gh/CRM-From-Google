import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStudent, deleteStudent, updateStudent } from './students';
import { supabase } from './supabase';
import type { StudentPayload } from './types';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }));

const payload: StudentPayload = {
    id: 'ignored', first_name: 'Liam', last_name: 'Murphy', email: 'liam@example.ie',
    phone: null, address: null, eircode: null, dob: null,
};

/** A query builder whose final call resolves to `result`. */
function builder(result: unknown) {
    const b: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ['insert', 'update', 'delete', 'select', 'eq']) b[m] = vi.fn(() => b);
    b.maybeSingle = vi.fn().mockResolvedValue(result);
    b.eq = vi.fn(() => Object.assign(Promise.resolve(result), b));
    return b;
}

describe('students', () => {
    beforeEach(() => vi.clearAllMocks());

    it('creates a student without sending an id', async () => {
        const b = builder({ data: { id: 's1' }, error: null });
        vi.mocked(supabase.from).mockReturnValue(b as never);
        await createStudent(payload);
        const { id: _id, ...fields } = payload;
        expect(b.insert).toHaveBeenCalledWith(fields);
    });

    it('explains a duplicate (same name and email) on create and on update', async () => {
        const duplicate = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "students_first_last_email_key"' } };
        vi.mocked(supabase.from).mockReturnValue(builder(duplicate) as never);
        await expect(createStudent(payload)).rejects.toThrow('A student with this name and email already exists');
        await expect(updateStudent('s1', payload)).rejects.toThrow('A student with this name and email already exists');
    });

    it('passes other errors through, and a failed delete throws', async () => {
        vi.mocked(supabase.from).mockReturnValue(builder({ data: null, error: { code: '42501', message: 'permission denied' } }) as never);
        await expect(createStudent(payload)).rejects.toThrow('permission denied');
        await expect(deleteStudent('s1')).rejects.toMatchObject({ message: 'permission denied' });
    });
});

// ─── Student records: the writes the app makes from several places ──────
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Student, StudentPayload } from './types';

/** students_first_last_email_key: the same first name, last name and email can't be stored twice. */
function writeError(error: PostgrestError): Error {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
        return new Error('A student with this name and email already exists');
    }
    return new Error(error.message);
}

export async function fetchStudent(id: string): Promise<Student> {
    const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
    if (error) throw error;
    return data as Student;
}

/** Adds a student; throws a readable error (e.g. for a duplicate). */
export async function createStudent(payload: StudentPayload): Promise<Student | null> {
    const { id: _id, ...fields } = payload;
    const { data, error } = await supabase.from('students').insert(fields).select().maybeSingle();
    if (error) throw writeError(error);
    return data as Student | null;
}

/** Saves changes to a student; resolves to the stored row (null if it can't be read back). */
export async function updateStudent(id: string, fields: Omit<StudentPayload, 'id'>): Promise<Student | null> {
    const { data, error } = await supabase.from('students').update(fields).eq('id', id).select().maybeSingle();
    if (error) throw writeError(error);
    return data as Student | null;
}

/** Deletes a student; their enrollments, flags and outcomes go with them (ON DELETE CASCADE). */
export async function deleteStudent(id: string): Promise<void> {
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) throw error;
}

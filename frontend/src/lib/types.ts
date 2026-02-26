// ─── Shared Type Definitions ─────────────────────────────────
// Single source of truth for all domain types used across components.

export interface Student {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string | null;
    eircode: string | null;
    dob: string | null;
    created_at: string;
}

export interface Course {
    id: string;
    name: string;
    created_at: string;
}

export interface Enrollment {
    id: string;
    student_id: string;
    course_id: string;
    status: string;
    course_variant: string | null;
    notes: string | null;
    confirmed_date: string | null;
    invited_date: string | null;
    is_priority: boolean;
    created_at: string;
}

/** Enrollment with joined student and course data (from Supabase select with joins). */
export interface EnrollmentWithRelations extends Enrollment {
    students: Student | null;
    courses: Course | null;
}

/** Form data for creating/editing a student. */
export interface StudentFormData {
    id?: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    eircode: string;
    dob: string;
}

export interface DocumentTemplate {
    id: string;
    name: string;
    storage_path: string;
    created_at: string;
    updated_at: string;
}

// ─── UI Utilities ────────────────────────────────────────────

export const AVATAR_GRADIENTS = [
    'from-brand-500 to-brand-600',
    'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-blue-600',
];

export function getAvatarGradient(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

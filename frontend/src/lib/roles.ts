// ─── App roles ─────────────────────────────────────────────────
// Stored in auth app_metadata.role (migrations 58, 65, 75). A missing role means admin.
//   admin    — everything
//   viewer   — read-only viewer portal + External Lists (migration 69) + PDF Forms
//   outreach — External Lists (Outcomes → External lists, e.g. Action 11) + PDF Forms
//   forms    — PDF Forms only, including setting up templates (migration 75)
import type { User } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'viewer' | 'outreach' | 'forms';

export const ROLE_LABELS: Record<AppRole, string> = {
    admin: 'Admin',
    viewer: 'Viewer',
    outreach: 'External Lists',
    forms: 'PDF Forms',
};

export function normalizeRole(role: string | null | undefined): AppRole {
    return role === 'viewer' || role === 'outreach' || role === 'forms' ? role : 'admin';
}

/** Create / edit PDF form templates (everyone else only fills forms from them) */
export function canManagePdfForms(role: AppRole): boolean {
    return role === 'admin' || role === 'forms';
}

export function getUserRole(user: User | null | undefined): AppRole {
    return normalizeRole(user?.app_metadata?.role);
}

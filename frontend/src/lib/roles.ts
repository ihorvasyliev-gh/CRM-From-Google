// ─── App roles ─────────────────────────────────────────────────
// Stored in auth app_metadata.role (migrations 58, 65). A missing role means admin.
//   admin    — everything
//   viewer   — read-only viewer portal
//   outreach — External Lists only (Outcomes → External lists, e.g. Action 11)
import type { User } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'viewer' | 'outreach';

export const ROLE_LABELS: Record<AppRole, string> = {
    admin: 'Admin',
    viewer: 'Viewer',
    outreach: 'External Lists',
};

export function normalizeRole(role: string | null | undefined): AppRole {
    return role === 'viewer' || role === 'outreach' ? role : 'admin';
}

export function getUserRole(user: User | null | undefined): AppRole {
    return normalizeRole(user?.app_metadata?.role);
}

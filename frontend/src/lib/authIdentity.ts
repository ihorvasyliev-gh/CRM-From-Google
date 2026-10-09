// Supabase announces the session again on every return to the tab (SIGNED_IN on hidden → visible)
// and on each token refresh, each time as new objects read back from storage. Kept as state, every
// such event looked like a new sign-in to the useAuth() consumers: the app re-rendered and every
// realtime channel (keyed on the user) was torn down and joined again. These tell when the new
// objects hold nothing new, so the old ones can be kept.
import type { Session, User } from '@supabase/supabase-js';

function sameJson(a: unknown, b: unknown): boolean {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

/** Whether two user objects (or two "signed out"s) carry the same data. */
export function sameUser(a: User | null, b: User | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.id === b.id && sameJson(a, b);
}

/** Whether two sessions are the same tokens for the same user data. */
export function sameSession(a: Session | null, b: Session | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.access_token === b.access_token
        && a.refresh_token === b.refresh_token
        && a.expires_at === b.expires_at
        && sameUser(a.user, b.user);
}

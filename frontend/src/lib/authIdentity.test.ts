import { describe, it, expect } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import { sameSession, sameUser } from './authIdentity';

const user = (overrides: Partial<User> = {}): User => ({
    id: 'u1',
    aud: 'authenticated',
    email: 'a@example.com',
    app_metadata: { role: 'admin' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
});

const session = (overrides: Partial<Session> = {}): Session => ({
    access_token: 'token-1',
    refresh_token: 'refresh-1',
    expires_in: 3600,
    expires_at: 1_800_000_000,
    token_type: 'bearer',
    user: user(),
    ...overrides,
});

describe('sameUser', () => {
    it('treats a copy read back from storage as the same user', () => {
        // What every return to the tab hands over: equal data, new objects
        expect(sameUser(user(), JSON.parse(JSON.stringify(user())))).toBe(true);
    });

    it('sees a changed role, email or another account', () => {
        expect(sameUser(user(), user({ app_metadata: { role: 'viewer' } }))).toBe(false);
        expect(sameUser(user(), user({ email: 'b@example.com' }))).toBe(false);
        expect(sameUser(user(), user({ id: 'u2' }))).toBe(false);
    });

    it('handles signing in and out', () => {
        expect(sameUser(null, null)).toBe(true);
        expect(sameUser(null, user())).toBe(false);
        expect(sameUser(user(), null)).toBe(false);
    });
});

describe('sameSession', () => {
    it('treats a repeated announcement of the same session as the same', () => {
        expect(sameSession(session(), JSON.parse(JSON.stringify(session())))).toBe(true);
    });

    it('sees a refreshed token', () => {
        expect(sameSession(session(), session({ access_token: 'token-2', expires_at: 1_800_003_600 }))).toBe(false);
    });

    it('sees new user data under the same token', () => {
        expect(sameSession(session(), session({ user: user({ app_metadata: { role: 'viewer' } }) }))).toBe(false);
    });

    it('handles signing in and out', () => {
        expect(sameSession(null, null)).toBe(true);
        expect(sameSession(session(), null)).toBe(false);
    });
});

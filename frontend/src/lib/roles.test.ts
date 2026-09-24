import { describe, it, expect } from 'vitest';
import { getUserRole, normalizeRole } from './roles';

describe('roles', () => {
    it('treats a missing or unknown role as admin (same rule as the database)', () => {
        expect(normalizeRole(undefined)).toBe('admin');
        expect(normalizeRole('')).toBe('admin');
        expect(normalizeRole('admin')).toBe('admin');
        expect(normalizeRole('something-else')).toBe('admin');
    });

    it('recognises viewer and outreach', () => {
        expect(normalizeRole('viewer')).toBe('viewer');
        expect(normalizeRole('outreach')).toBe('outreach');
    });

    it('reads the role from app_metadata', () => {
        expect(getUserRole({ app_metadata: { role: 'outreach' } } as any)).toBe('outreach');
        expect(getUserRole(null)).toBe('admin');
    });
});

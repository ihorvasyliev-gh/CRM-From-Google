import { describe, it, expect } from 'vitest';
import { canManagePdfForms, getUserRole, normalizeRole } from './roles';

describe('roles', () => {
    it('treats a missing or unknown role as admin (same rule as the database)', () => {
        expect(normalizeRole(undefined)).toBe('admin');
        expect(normalizeRole('')).toBe('admin');
        expect(normalizeRole('admin')).toBe('admin');
        expect(normalizeRole('something-else')).toBe('admin');
    });

    it('recognises viewer, outreach and forms', () => {
        expect(normalizeRole('viewer')).toBe('viewer');
        expect(normalizeRole('outreach')).toBe('outreach');
        expect(normalizeRole('forms')).toBe('forms');
    });

    it('lets admins and forms users manage PDF form templates', () => {
        expect(canManagePdfForms('admin')).toBe(true);
        expect(canManagePdfForms('forms')).toBe(true);
        expect(canManagePdfForms('viewer')).toBe(false);
        expect(canManagePdfForms('outreach')).toBe(false);
    });

    it('reads the role from app_metadata', () => {
        expect(getUserRole({ app_metadata: { role: 'outreach' } } as any)).toBe('outreach');
        expect(getUserRole(null)).toBe('admin');
    });
});

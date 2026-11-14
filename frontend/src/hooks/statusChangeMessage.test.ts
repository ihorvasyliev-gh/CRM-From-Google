import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { statusChangeMessage } from './useEnrollments';

describe('statusChangeMessage', () => {
    it('names the person and the column', () => {
        expect(statusChangeMessage('Anna Murphy', 'confirmed', 0, 0)).toBe('Anna Murphy → Confirmed');
    });

    it('says in plain words that a completion removed the other request', () => {
        expect(statusChangeMessage('Anna Murphy', 'completed', 0, 1))
            .toBe('Anna Murphy → Completed. Removed their other request for this course');
        expect(statusChangeMessage('Anna Murphy', 'completed', 0, 2))
            .toBe('Anna Murphy → Completed. Removed their 2 other requests for this course');
    });

    it('says when a withdrawal took the other requests along', () => {
        expect(statusChangeMessage('Anna Murphy', 'withdrawn', 1, 0))
            .toBe('Anna Murphy → Withdrawn, with their other request for this course');
    });
});

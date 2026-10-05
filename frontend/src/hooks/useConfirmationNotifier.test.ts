import { describe, it, expect } from 'vitest';
import { isNewConfirmation } from './useConfirmationNotifier';

const update = (confirmed_at: string | null, commit_timestamp: string) => ({ new: { confirmed_at }, commit_timestamp });

describe('isNewConfirmation', () => {
    it('is true for the update that confirmed the enrollment', () => {
        expect(isNewConfirmation(update('2026-10-05T10:00:00.000+00:00', '2026-10-05T10:00:00.250Z'))).toBe(true);
    });

    it('is false for a later edit of an enrollment confirmed earlier (notes, priority, reminder)', () => {
        expect(isNewConfirmation(update('2026-10-01T09:00:00Z', '2026-10-05T10:00:00Z'))).toBe(false);
    });

    it('is false without a confirmation time', () => {
        expect(isNewConfirmation(update(null, '2026-10-05T10:00:00Z'))).toBe(false);
    });
});

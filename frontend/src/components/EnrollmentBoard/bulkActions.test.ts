import { describe, it, expect } from 'vitest';
import { fittingActions } from './bulkActions';
import type { EnrollmentStatus } from '../../lib/types';

const fits = (...statuses: EnrollmentStatus[]) => fittingActions(new Set(statuses));

describe('fittingActions', () => {
    it('offers the whole flow for people still queued', () => {
        expect(fits('requested')).toEqual({
            invite: true, remind: false, confirm: true, reschedule: false,
            complete: true, backToRequested: false, withdraw: true, reject: true,
        });
    });

    it('offers Change date (reschedule) when everyone selected is confirmed', () => {
        const actions = fits('confirmed');
        expect(actions.reschedule).toBe(true);
        expect(actions.confirm).toBe(false);
        expect(actions.remind).toBe(true);
        expect(actions.complete).toBe(true);
    });

    it('leaves out Invite, Confirm and Reschedule when selection mixes confirmed and completed', () => {
        const actions = fits('confirmed', 'completed');
        expect(actions.invite).toBe(false);
        expect(actions.confirm).toBe(false);
        expect(actions.reschedule).toBe(false);
        expect(actions.complete).toBe(true);
        expect(actions.remind).toBe(true);
    });

    it('offers only going back, rejecting and deleting when everyone completed', () => {
        expect(fits('completed')).toEqual({
            invite: false, remind: false, confirm: false, reschedule: false,
            complete: false, backToRequested: true, withdraw: true, reject: true,
        });
    });

    it('keeps an action when it fits at least one of a mixed selection', () => {
        expect(fits('completed', 'invited').invite).toBe(true);
    });
});

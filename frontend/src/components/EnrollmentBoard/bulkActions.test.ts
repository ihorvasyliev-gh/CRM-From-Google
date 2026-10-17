import { describe, it, expect } from 'vitest';
import { fittingActions } from './bulkActions';
import type { EnrollmentStatus } from '../../lib/types';

const fits = (...statuses: EnrollmentStatus[]) => fittingActions(new Set(statuses));

describe('fittingActions', () => {
    it('offers the whole flow for people still queued', () => {
        expect(fits('requested')).toEqual({ invite: true, remind: false, confirm: true, complete: true, backToRequested: false, reject: true });
    });

    it('leaves out Invite and Confirm when everyone is already confirmed or done', () => {
        const actions = fits('confirmed', 'completed');
        expect(actions.invite).toBe(false);
        expect(actions.confirm).toBe(false);
        expect(actions.complete).toBe(true);
        expect(actions.remind).toBe(true);
    });

    it('offers only going back, rejecting and deleting when everyone completed', () => {
        expect(fits('completed')).toEqual({ invite: false, remind: false, confirm: false, complete: false, backToRequested: true, reject: true });
    });

    it('keeps an action when it fits at least one of a mixed selection', () => {
        expect(fits('completed', 'invited').invite).toBe(true);
    });
});

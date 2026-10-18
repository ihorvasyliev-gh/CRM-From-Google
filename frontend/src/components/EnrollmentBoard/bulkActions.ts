import type { EnrollmentStatus } from '../../lib/types';

/**
 * The actions that make sense for the selection: an action is left out when it would change
 * nothing or go backwards for every selected enrollment (Invite for people who all completed).
 */
export function fittingActions(statuses: ReadonlySet<EnrollmentStatus>) {
    const only = (...allowed: EnrollmentStatus[]) => [...statuses].every(s => allowed.includes(s));
    return {
        invite: !only('confirmed', 'completed'),
        remind: statuses.has('confirmed'),
        confirm: !only('confirmed', 'completed'),
        complete: !only('completed'),
        backToRequested: !only('requested'),
        reject: !only('rejected'),
    };
}

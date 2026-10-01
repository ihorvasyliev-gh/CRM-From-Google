import type { Enrollment } from './types';

type Dated = Pick<Enrollment, 'status' | 'confirmed_date' | 'invited_date' | 'invited_dates' | 'completed_date'>;

const dayOf = (d: string) => d.split('T')[0];

/**
 * Every course date (YYYY-MM-DD) an enrollment belongs to, for date filters and date counts.
 * Usually one date (confirmed → invited → completed). An open multi-date invitation belongs to
 * every offered date until the student picks one — the same rule as the dashboard's sessions.
 */
export function courseDatesOf(e: Dated): string[] {
    if (e.confirmed_date) return [dayOf(e.confirmed_date)];
    if (e.status === 'invited' && e.invited_dates && e.invited_dates.length > 1) {
        return [...new Set(e.invited_dates.map(dayOf))].sort();
    }
    const d = e.invited_date || e.completed_date;
    return d ? [dayOf(d)] : [];
}

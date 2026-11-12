// Sorting of the Outcomes tables (CRM graduates and External Lists) by one column.
export type OutcomeSortKey = 'name' | 'courses' | 'ref' | 'tracking' | 'employment' | 'updated';
export interface OutcomeSort { key: OutcomeSortKey; dir: 'asc' | 'desc' }

/** The fields of a row that the columns sort by */
export interface SortFields {
    first_name: string;
    last_name: string;
    email: string;
    /** Courses (graduates) or IRIS ID (lists) */
    courses?: string[];
    ref?: string | null;
    tracking_status: 'not_contacted' | 'pending' | 'responded';
    called_no_answer_at?: string | null;
    sent_at?: string | null;
    is_working: boolean | null;
    employment_type: string | null;
    updated_at: string | null;
}

const TRACKING_RANK = { not_contacted: 0, pending: 1, responded: 2 } as const;

function employmentRank(r: SortFields): number {
    if (r.tracking_status !== 'responded' || r.is_working === null) return 4; // No data
    if (!r.is_working) return 3;
    return r.employment_type === 'full_time' ? 0 : r.employment_type === 'part_time' ? 1 : 2;
}

const text = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
const byName = (a: SortFields, b: SortFields) =>
    text(`${a.last_name} ${a.first_name} ${a.email}`, `${b.last_name} ${b.first_name} ${b.email}`);
const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN);

/**
 * Sorts a copy of the rows by one column. Empty values (no date, no IRIS ID) always go last,
 * whichever way the column is sorted; ties fall back to the name A–Z.
 */
export function sortOutcomeRows<T>(rows: T[], sort: OutcomeSort, fields: (row: T) => SortFields): T[] {
    const sign = sort.dir === 'asc' ? 1 : -1;
    const keyed = rows.map(row => ({ row, f: fields(row) }));

    const compare = (a: SortFields, b: SortFields): number => {
        switch (sort.key) {
            case 'name':
                return sign * byName(a, b);
            case 'courses':
            case 'ref': {
                const av = sort.key === 'courses' ? (a.courses ?? []).join(', ') : a.ref?.trim() ?? '';
                const bv = sort.key === 'courses' ? (b.courses ?? []).join(', ') : b.ref?.trim() ?? '';
                if (!av !== !bv) return av ? -1 : 1;
                return sign * text(av, bv) || byName(a, b);
            }
            case 'tracking': {
                // Not contacted → Pending → Responded; inside a status, people not called yet come first,
                // then by when the survey was sent (oldest first)
                const d = TRACKING_RANK[a.tracking_status] - TRACKING_RANK[b.tracking_status];
                if (d) return sign * d;
                const ac = time(a.called_no_answer_at), bc = time(b.called_no_answer_at);
                if (isNaN(ac) !== isNaN(bc)) return sign * (isNaN(ac) ? -1 : 1);
                if (!isNaN(ac) && ac !== bc) return sign * (ac - bc);
                const as = time(a.sent_at), bs = time(b.sent_at);
                if (!isNaN(as) && !isNaN(bs) && as !== bs) return sign * (as - bs);
                return byName(a, b);
            }
            case 'employment': {
                const ar = employmentRank(a), br = employmentRank(b);
                if (ar === 4 || br === 4) return ar === br ? byName(a, b) : ar === 4 ? 1 : -1;
                return sign * (ar - br) || byName(a, b);
            }
            case 'updated': {
                const at = time(a.updated_at), bt = time(b.updated_at);
                if (isNaN(at) || isNaN(bt)) return isNaN(at) === isNaN(bt) ? byName(a, b) : isNaN(at) ? 1 : -1;
                return sign * (at - bt) || byName(a, b);
            }
        }
    };

    return keyed.sort((x, y) => compare(x.f, y.f)).map(k => k.row);
}

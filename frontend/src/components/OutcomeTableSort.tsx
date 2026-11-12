// Click-to-sort column headers for the Outcomes tables (CRM graduates and External Lists).
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

import type { OutcomeSort, OutcomeSortKey } from '../lib/outcomeSort';

const thCls = 'py-3 px-4 text-left text-xs font-semibold text-muted uppercase tracking-wider';

/** A column header that sorts the table; aria-sort tells screen readers which one is in use. */
export function SortHeader({ label, column, sort, onSort, className = '' }: {
    label: string;
    column: OutcomeSortKey;
    sort: OutcomeSort | null;
    onSort: (s: OutcomeSort) => void;
    className?: string;
}) {
    const dir = sort?.key === column ? sort.dir : null;
    const active = dir !== null;
    // Names and statuses start A→Z, dates newest first
    const firstDir: OutcomeSort['dir'] = column === 'updated' ? 'desc' : 'asc';
    const Icon = !dir ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
    return (
        <th className={`${thCls} ${className}`} aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            <button
                type="button"
                onClick={() => onSort({ key: column, dir: dir ? (dir === 'asc' ? 'desc' : 'asc') : firstDir })}
                className={`group/sort inline-flex items-center gap-1 -mx-1 px-1 rounded-md uppercase tracking-wider transition-colors hover:text-primary ${active ? 'text-primary' : ''}`}
            >
                {label}
                <Icon size={13} className={active ? '' : 'opacity-40 group-hover/sort:opacity-100'} aria-hidden />
            </button>
        </th>
    );
}

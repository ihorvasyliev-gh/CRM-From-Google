import { ArrowDownUp, X } from 'lucide-react';
import { ALL_STATUSES, isEnrollmentStatus, type Course } from '../../lib/types';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import { firstDirection, hasFilters, NO_FILTERS, type ListSort, type StudentFilters } from './studentListData';

const selectCls = 'h-9 min-w-0 text-sm bg-surface border border-border-subtle rounded-xl pl-2.5 pr-7 text-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400';
const SORT_KEYS: ListSort['key'][] = ['created_at', 'name', 'phone', 'courses', 'eircode'];

interface Props {
    filters: StudentFilters;
    onChange: (next: StudentFilters) => void;
    courses: Course[];
    sort: ListSort;
    onSort: (next: ListSort) => void;
}

/** Filter chips: each one says what is on and takes it off again */
function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 max-w-full pl-2.5 pr-1 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-xs">
            <span className="text-muted shrink-0">{label}:</span>
            <span className="font-semibold text-primary truncate">{value}</span>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${label} filter`}
                className="p-1 rounded-full text-muted hover:text-primary hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
            >
                <X size={12} />
            </button>
        </span>
    );
}

/**
 * Course, status and "not on any course" filters for the Students page, the active ones as
 * removable chips with Reset, and (on phones, where there are no column headers) the sort.
 */
export default function StudentFilterBar({ filters, onChange, courses, sort, onSort }: Props) {
    const courseName = courses.find(c => c.id === filters.courseId)?.name ?? 'Course';
    const sortValue = `${sort.key}:${sort.dir}`;
    return (
        <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <select
                    aria-label="Filter by course"
                    value={filters.courseId ?? ''}
                    onChange={e => onChange({ ...filters, courseId: e.target.value || null, noCourses: false })}
                    className={`${selectCls} w-full sm:w-56`}
                >
                    <option value="">All courses</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select
                    aria-label="Filter by enrollment status"
                    value={filters.status ?? ''}
                    onChange={e => onChange({ ...filters, status: isEnrollmentStatus(e.target.value) ? e.target.value : null, noCourses: false })}
                    className={`${selectCls} w-full sm:w-44`}
                >
                    <option value="">Any status</option>
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>)}
                </select>
                <button
                    type="button"
                    aria-pressed={filters.noCourses}
                    onClick={() => onChange(filters.noCourses ? NO_FILTERS : { courseId: null, status: null, noCourses: true })}
                    className={`h-9 px-2.5 sm:px-3 min-w-0 truncate rounded-xl text-[13px] sm:text-sm font-medium border transition-colors whitespace-nowrap ${filters.noCourses
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'bg-surface border-border-subtle text-primary hover:border-border-strong'}`}
                >
                    Not on any course
                </button>
                {/* Phones have no column headers to sort by */}
                <label className="md:hidden flex items-center gap-1.5 min-w-0 sm:flex-1">
                    <ArrowDownUp size={14} className="text-muted shrink-0" aria-hidden />
                    <span className="sr-only">Sort by</span>
                    <select
                        value={sortValue}
                        onChange={e => {
                            const [key, dir] = e.target.value.split(':') as [ListSort['key'], ListSort['dir']];
                            onSort({ key, dir });
                        }}
                        className={`${selectCls} flex-1 w-full`}
                    >
                        {SORT_KEYS.flatMap(key => {
                            const first = firstDirection(key);
                            const other = first === 'asc' ? 'desc' : 'asc';
                            const words: Record<ListSort['key'], [string, string]> = {
                                created_at: ['Newest first', 'Oldest first'],
                                name: ['Name A–Z', 'Name Z–A'],
                                phone: ['Phone 0–9', 'Phone 9–0'],
                                courses: ['Most courses', 'Fewest courses'],
                                eircode: ['Eircode A–Z', 'Eircode Z–A'],
                            };
                            return [
                                <option key={`${key}:${first}`} value={`${key}:${first}`}>{words[key][0]}</option>,
                                <option key={`${key}:${other}`} value={`${key}:${other}`}>{words[key][1]}</option>,
                            ];
                        })}
                    </select>
                </label>
            </div>
            {hasFilters(filters) && (
                <div className="flex flex-wrap items-center gap-1.5" aria-label="Filters in use">
                    {filters.courseId && <FilterChip label="Course" value={courseName} onRemove={() => onChange({ ...filters, courseId: null })} />}
                    {filters.status && <FilterChip label="Status" value={STATUS_CONFIG[filters.status]?.label ?? filters.status} onRemove={() => onChange({ ...filters, status: null })} />}
                    {filters.noCourses && <FilterChip label="Courses" value="None" onRemove={() => onChange(NO_FILTERS)} />}
                    <button
                        type="button"
                        onClick={() => onChange(NO_FILTERS)}
                        className="text-xs font-semibold text-muted hover:text-primary px-2 py-1 rounded-lg hover:bg-surface-elevated transition-colors"
                    >
                        Reset filters
                    </button>
                </div>
            )}
        </div>
    );
}

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, GraduationCap, Search } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';

type CourseOption = { id: string; name: string };

/** How many recently picked courses are offered first */
const RECENT_LIMIT = 4;
const ALL: CourseOption = { id: 'all', name: 'All courses' };

const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');

/**
 * The board's course filter: one button instead of a chip per course. It opens a list to search by
 * typing, with the courses picked last at the top (remembered in this browser). ↑/↓ move, Enter
 * picks, Escape closes.
 */
export default function CourseFilter({ courses, value, onChange }: {
    courses: CourseOption[];
    /** A course id, or 'all' */
    value: string;
    onChange: (courseId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [recentIds, setRecentIds] = usePersistentState<string[]>('board-recent-courses', [], { storage: 'local', validate: isIdList });
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const selected = courses.find(c => c.id === value);

    // All courses, the recent ones, then the rest A–Z
    const { listed, recentCount } = useMemo(() => {
        const byId = new Map(courses.map(c => [c.id, c]));
        const recent = recentIds.map(id => byId.get(id)).filter((c): c is CourseOption => !!c).slice(0, RECENT_LIMIT);
        const recentSet = new Set(recent.map(c => c.id));
        return { listed: [ALL, ...recent, ...courses.filter(c => !recentSet.has(c.id))], recentCount: recent.length };
    }, [courses, recentIds]);
    // Typing searches every course
    const searching = query.trim() !== '';
    const options = useMemo(
        () => searching ? courses.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase())) : listed,
        [courses, listed, query, searching],
    );

    const openList = () => {
        setQuery('');
        setActive(Math.max(0, listed.findIndex(c => c.id === value)));
        setOpen(true);
    };

    const close = (refocus: boolean) => {
        setOpen(false);
        if (refocus) triggerRef.current?.focus();
    };
    const pick = (course: CourseOption | undefined) => {
        if (!course) return;
        onChange(course.id);
        if (course.id !== 'all') setRecentIds(ids => [course.id, ...ids.filter(id => id !== course.id)].slice(0, RECENT_LIMIT * 2));
        close(true);
    };

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('pointerdown', onPointer);
        return () => document.removeEventListener('pointerdown', onPointer);
    }, [open]);

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }, [active, open]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, options.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(options[active]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
        else if (e.key === 'Tab') setOpen(false);
    };

    const groupLabel = (text: string) => (
        <div role="presentation" className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{text}</div>
    );

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => (open ? setOpen(false) : openList())}
                onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); openList(); } }}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`Course: ${selected?.name ?? 'all courses'}`}
                className={`inline-flex items-center gap-1.5 h-9 pl-3 pr-2 max-w-64 rounded-xl border text-xs font-semibold transition-all ${
                    selected
                        ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                        : 'bg-surface-elevated text-primary border-border-strong hover:border-brand-500'
                }`}
            >
                <GraduationCap size={14} className="shrink-0" />
                <span className="truncate">{selected?.name ?? 'All courses'}</span>
                <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 top-full left-0 mt-1.5 w-72 bg-surface rounded-xl shadow-float border border-border-subtle p-1 animate-popoverScaleIn origin-top-left">
                    <div className="relative mb-1">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                        <input
                            autoFocus
                            role="combobox"
                            aria-label="Search courses"
                            aria-expanded
                            aria-controls={listId}
                            aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
                            value={query}
                            onChange={e => { setQuery(e.target.value); setActive(0); }}
                            onKeyDown={onKeyDown}
                            placeholder="Search courses…"
                            className="w-full h-9 pl-8 pr-3 bg-surface-elevated/60 border border-border-subtle rounded-lg text-sm text-primary placeholder:text-muted focus:outline-hidden focus:border-brand-500"
                        />
                    </div>
                    <div ref={listRef} id={listId} role="listbox" aria-label="Courses" className="max-h-80 overflow-y-auto">
                        {options.length === 0 && <div className="px-4 py-3 text-sm text-muted text-center">No matching courses</div>}
                        {options.map((c, i) => {
                            const isSelected = c.id === value || (c.id === 'all' && !selected);
                            return (
                                <div key={c.id}>
                                    {!searching && recentCount > 0 && i === 1 && groupLabel('Recent')}
                                    {!searching && recentCount > 0 && i === 1 + recentCount && groupLabel('All courses A–Z')}
                                    <div
                                        id={`${listId}-${i}`}
                                        data-index={i}
                                        role="option"
                                        aria-selected={isSelected}
                                        onMouseEnter={() => setActive(i)}
                                        onClick={() => pick(c)}
                                        className={`px-3 py-2 rounded-lg text-sm truncate cursor-pointer transition-colors ${
                                            isSelected ? 'text-brand-600 dark:text-brand-400 font-semibold' : 'text-primary'
                                        } ${i === active ? 'bg-surface-elevated' : ''}`}
                                    >
                                        {c.name}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Search } from 'lucide-react';
import Badge from '../ui/Badge';
import type { Course } from '../../lib/types';

/**
 * Course dropdown with type-to-filter and keyboard control
 * (↑/↓ to move, Enter to pick, Escape to close).
 */
export default function CoursePicker({ courses, counts, countLabel, value, onChange }: {
    courses: Course[];
    counts: Map<string, number>;
    /** "confirmed" / "completed" — shown next to each count. */
    countLabel: string;
    value: string;
    onChange: (courseId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const selected = courses.find(c => c.id === value);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? courses.filter(c => c.name.toLowerCase().includes(q)) : courses;
    }, [courses, query]);

    const openList = () => {
        setQuery('');
        setActive(Math.max(0, courses.findIndex(c => c.id === value)));
        setOpen(true);
    };
    const pick = (course: Course | undefined) => {
        if (!course) return;
        onChange(course.id);
        setOpen(false);
    };

    // Close when focus or a click leaves the picker
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
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, matches.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(matches[active]); }
        else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };

    return (
        <div ref={rootRef} className="relative z-30">
            <button
                type="button"
                onClick={() => (open ? setOpen(false) : openList())}
                onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); openList(); } }}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-3 h-11 px-3.5 bg-surface border border-border-subtle rounded-xl text-sm transition-colors hover:border-border-strong focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
                <span className="flex items-center gap-2.5 min-w-0">
                    <BookOpen size={16} className="text-muted shrink-0" />
                    <span className={`truncate ${selected ? 'text-primary font-medium' : 'text-muted'}`}>
                        {selected?.name || 'Choose a course...'}
                    </span>
                </span>
                <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-surface rounded-xl shadow-float border border-border-subtle p-1 animate-popoverScaleIn origin-top">
                    <div className="relative mb-1">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                        <input
                            autoFocus
                            role="combobox"
                            aria-label="Search courses"
                            aria-expanded
                            aria-controls={listId}
                            aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
                            value={query}
                            onChange={e => { setQuery(e.target.value); setActive(0); }}
                            onKeyDown={onKeyDown}
                            placeholder="Search courses…"
                            className="w-full h-9 pl-8 pr-3 bg-surface-elevated/60 border border-border-subtle rounded-lg text-sm text-primary placeholder:text-muted/70 focus:outline-hidden focus:border-brand-500"
                        />
                    </div>
                    <div ref={listRef} id={listId} role="listbox" aria-label="Courses" className="max-h-72 overflow-y-auto">
                        {matches.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-muted text-center">
                                {courses.length === 0 ? `No courses with ${countLabel} participants` : 'No matching courses'}
                            </div>
                        ) : matches.map((c, i) => {
                            const isSelected = c.id === value;
                            return (
                                <div
                                    key={c.id}
                                    id={`${listId}-${i}`}
                                    data-index={i}
                                    role="option"
                                    aria-selected={isSelected}
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => pick(c)}
                                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-sm cursor-pointer transition-colors ${
                                        isSelected ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-primary'
                                    } ${i === active ? 'bg-surface-elevated' : ''}`}
                                >
                                    <span className="truncate">{c.name}</span>
                                    <Badge tone={isSelected ? 'brand' : 'neutral'} shape="pill" className="tabular-nums shrink-0">
                                        {counts.get(c.id) || 0} {countLabel}
                                    </Badge>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, User, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildStudentSearchFilters } from '../../lib/searchUtils';
import { useDebounce } from '../../hooks/useDebounce';
import { fullName } from '../../lib/types';
import type { TodoLinkedStudent } from '../../lib/todos';

interface StudentOption extends TodoLinkedStudent {
    email?: string | null;
}

async function searchStudents(query: string): Promise<StudentOption[]> {
    const trimmed = query.trim();
    if (!trimmed) {
        const { data, error } = await supabase
            .from('students')
            .select('id, first_name, last_name, email')
            .order('created_at', { ascending: false })
            .limit(8);
        if (error) throw error;
        return (data ?? []) as StudentOption[];
    }
    let q = supabase.from('students').select('id, first_name, last_name, email').limit(12);
    buildStudentSearchFilters(trimmed).forEach(filter => {
        q = q.or(filter);
    });
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as StudentOption[];
}

export interface TodoStudentPickerProps {
    value: TodoLinkedStudent | null;
    onChange: (student: TodoLinkedStudent | null) => void;
    compact?: boolean;
}

export default function TodoStudentPicker({ value, onChange, compact = false }: TodoStudentPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const debounced = useDebounce(query, 200);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { data: results = [], isFetching } = useQuery({
        queryKey: ['todo_student_picker', debounced],
        queryFn: () => searchStudents(debounced),
        enabled: open,
        staleTime: 30_000,
    });

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 20);
    }, [open]);

    if (value) {
        return (
            <div className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-xl bg-info/10 text-status-invited border border-info/25 text-xs font-semibold max-w-full">
                <User size={13} className="shrink-0" />
                <span className="truncate max-w-[180px]">{fullName(value) || 'Student'}</span>
                <button
                    type="button"
                    onClick={() => onChange(null)}
                    aria-label="Remove linked student"
                    className="p-0.5 rounded-md hover:bg-info/20 transition-colors cursor-pointer shrink-0"
                >
                    <X size={12} />
                </button>
            </div>
        );
    }

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-elevated text-muted hover:text-primary transition-colors cursor-pointer ${
                    compact ? 'h-8 px-2.5 text-xs font-medium' : 'h-9 px-3 text-sm font-medium w-full justify-between'
                }`}
            >
                <span className="inline-flex items-center gap-1.5 truncate">
                    <User size={13} className="shrink-0" />
                    <span>Link student</span>
                </span>
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-1.5 z-60 w-72 rounded-xl bg-surface border border-border-subtle shadow-float p-2 space-y-1.5 animate-scaleIn">
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search student name or email…"
                            className="w-full h-8 pl-8 pr-7 rounded-lg bg-surface-elevated border border-border-subtle text-xs text-primary placeholder:text-muted/70 focus:outline-hidden focus:border-brand-500"
                        />
                        {isFetching && (
                            <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted animate-spin" />
                        )}
                    </div>

                    <div className="max-h-52 overflow-y-auto divide-y divide-border-subtle/60">
                        {results.length === 0 ? (
                            <p className="py-4 text-center text-xs text-muted">
                                {isFetching ? 'Searching…' : 'No matching students'}
                            </p>
                        ) : (
                            results.map(s => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                        onChange({ id: s.id, first_name: s.first_name, last_name: s.last_name });
                                        setOpen(false);
                                        setQuery('');
                                    }}
                                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
                                >
                                    <p className="text-xs font-semibold text-primary truncate">{fullName(s) || 'Unnamed student'}</p>
                                    {s.email && <p className="text-[11px] text-muted truncate">{s.email}</p>}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

import { useMemo, useState } from 'react';
import { ChevronDown, History, Info } from 'lucide-react';
import Badge from '../ui/Badge';
import { formatDisplayDate } from '../../lib/dateUtils';
import type { DocumentGenerationRecord } from '../../lib/types';
import { formatRelativeTime, plural } from './helpers';

export interface RecentRunsPanelProps {
    records: DocumentGenerationRecord[];
    ready: boolean;
    currentCourseId?: string;
    currentSessionDate?: string | null;
}

const INITIAL_VISIBLE = 6;

export default function RecentRunsPanel({
    records,
    ready,
    currentCourseId,
    currentSessionDate,
}: RecentRunsPanelProps) {
    const [open, setOpen] = useState(false);
    const [scope, setScope] = useState<'all' | 'course'>('all');
    const [showAll, setShowAll] = useState(false);

    const courseRecords = useMemo(
        () => (currentCourseId ? records.filter(r => r.course_id === currentCourseId) : []),
        [records, currentCourseId],
    );

    if (!ready) {
        return (
            <div className="rounded-xl border border-border-subtle bg-surface-elevated/50 px-3.5 py-2.5 flex items-center gap-2 text-xs text-muted">
                <Info size={14} className="shrink-0 text-status-invited" />
                <span>
                    Run <code className="font-mono text-[11px] text-primary">supabase/93_documents_redesign.sql</code> to enable generation history.
                </span>
            </div>
        );
    }

    const activeScope = currentCourseId ? scope : 'all';
    const filtered = activeScope === 'course' ? courseRecords : records;
    const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);
    const latest = records[0];

    return (
        <section className="rounded-2xl bg-surface border border-border-subtle shadow-card overflow-hidden">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(prev => !prev)}
                className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 text-left hover:bg-surface-elevated/40 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-inset"
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-elevated text-muted shrink-0">
                        <History size={14} />
                    </span>
                    <span className="text-[13px] font-semibold text-primary truncate">
                        Recent generations
                    </span>
                    <Badge tone="neutral" shape="pill" className="tabular-nums shrink-0">
                        {records.length}
                    </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!open && latest && (
                        <span className="hidden sm:inline text-xs text-muted truncate max-w-[200px]">
                            Last: {latest.course_name} · {formatRelativeTime(latest.created_at)}
                        </span>
                    )}
                    <ChevronDown
                        size={15}
                        className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                </div>
            </button>

            {open && (
                <div className="border-t border-border-subtle px-4 sm:px-5 py-3 space-y-2.5">
                    {currentCourseId && records.length > 0 && (
                        <div className="flex items-center justify-between gap-2">
                            <div
                                role="group"
                                aria-label="Filter recent generations"
                                className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-elevated border border-border-subtle"
                            >
                                <button
                                    type="button"
                                    aria-pressed={activeScope === 'all'}
                                    onClick={() => { setScope('all'); setShowAll(false); }}
                                    className={`h-6 px-2 rounded-md text-xs font-semibold transition-all ${
                                        activeScope === 'all'
                                            ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle'
                                            : 'text-muted hover:text-primary'
                                    }`}
                                >
                                    All recent ({records.length})
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={activeScope === 'course'}
                                    onClick={() => { setScope('course'); setShowAll(false); }}
                                    className={`h-6 px-2 rounded-md text-xs font-semibold transition-all ${
                                        activeScope === 'course'
                                            ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle'
                                            : 'text-muted hover:text-primary'
                                    }`}
                                >
                                    This course ({courseRecords.length})
                                </button>
                            </div>
                        </div>
                    )}

                    {visible.length === 0 ? (
                        <p className="text-xs text-muted py-3 text-center">
                            {activeScope === 'course'
                                ? 'No archives have been generated for this course yet.'
                                : 'No archives have been generated yet.'}
                        </p>
                    ) : (
                        <>
                            <ul className="divide-y divide-border-subtle/70">
                                {visible.map(r => {
                                    const fileCount = r.total_docs + r.extras.length;
                                    const isCurrentSession =
                                        !!currentCourseId &&
                                        r.course_id === currentCourseId &&
                                        (currentSessionDate ?? null) === (r.session_date ?? null);
                                    const rel = formatRelativeTime(r.created_at);
                                    const exactTime = Number.isFinite(Date.parse(r.created_at))
                                        ? new Date(r.created_at).toLocaleString('en-IE')
                                        : r.created_at;

                                    return (
                                        <li
                                            key={r.id}
                                            className={`py-2 first:pt-0.5 last:pb-0.5 flex items-start justify-between gap-3 text-xs ${
                                                isCurrentSession ? 'bg-brand-500/[0.04] -mx-2 px-2 rounded-lg' : ''
                                            }`}
                                        >
                                            <div className="flex items-start gap-2 min-w-0">
                                                <span
                                                    aria-hidden="true"
                                                    title={r.had_problems ? 'Completed with problems' : 'Completed cleanly'}
                                                    className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                                                        r.had_problems ? 'bg-warning' : 'bg-success'
                                                    }`}
                                                />
                                                <span className="sr-only">
                                                    {r.had_problems ? 'Had problems' : 'Succeeded'}
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-medium text-primary truncate">
                                                            {r.course_name}
                                                        </span>
                                                        {r.session_date && (
                                                            <span className="text-muted whitespace-nowrap">
                                                                · {formatDisplayDate(r.session_date)}
                                                            </span>
                                                        )}
                                                        {r.source === 'board' && (
                                                            <Badge tone="info" shape="pill">Board</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                                                        <span>{plural(r.participant_count, 'student')}</span>
                                                        <span>· {plural(fileCount, 'file')}</span>
                                                        {r.staff_name && <span>· {r.staff_name}</span>}
                                                    </p>
                                                </div>
                                            </div>
                                            <span
                                                title={exactTime}
                                                className="text-[11px] text-muted whitespace-nowrap shrink-0 tabular-nums mt-0.5"
                                            >
                                                {rel}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>

                            {filtered.length > INITIAL_VISIBLE && (
                                <div className="pt-1 flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => setShowAll(prev => !prev)}
                                        className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                                    >
                                        {showAll ? 'Show fewer' : `Show all ${filtered.length} runs`}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </section>
    );
}

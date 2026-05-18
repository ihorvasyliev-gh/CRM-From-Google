import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import type { StudentFlag } from '../../lib/types';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import EnrollmentCard from './EnrollmentCard';

interface StatusColumnProps {
    status: string;
    items: EnrollmentRow[];
    selectedIds: Set<string>;
    selectAllInList: (items: EnrollmentRow[]) => void;
    handleCopyEmails: (items: EnrollmentRow[], label: string) => void;
    toggleSelect: (id: string) => void;
    togglePriority: (id: string, current: boolean) => void;
    openEditNote: (enrollment: EnrollmentRow) => void;
    queuePositions: Map<string, number>;
    flagsByStudentId: Map<string, StudentFlag[]>;
    completedCoursesByStudentId: Map<string, Array<{id: string, name: string}>>;
    onFlagClick: (enrollment: EnrollmentRow) => void;
    emptyFlags: StudentFlag[];
    emptyCompletedCourses: Array<{id: string, name: string}>;
    totalCount?: number;
}

const StatusColumn = function StatusColumn({
    status,
    items,
    selectedIds,
    selectAllInList,
    handleCopyEmails,
    toggleSelect,
    togglePriority,
    openEditNote,
    queuePositions,
    flagsByStudentId,
    completedCoursesByStudentId,
    onFlagClick,
    emptyFlags,
    emptyCompletedCourses,
    totalCount = 0,
}: StatusColumnProps) {
    const cfg = STATUS_CONFIG[status];
    
    const { isOver, setNodeRef } = useDroppable({
        id: status
    });

    const [visibleCount, setVisibleCount] = useState(50);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    // Intersection Observer for reliable infinite scroll
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(prev => {
                        if (prev >= items.length) return prev;
                        return prev + 50;
                    });
                }
            },
            {
                root: scrollContainerRef.current,
                rootMargin: '200px',
                threshold: 0,
            }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [items.length, visibleCount]);

    // Reset visibleCount when items change significantly (filter change)
    useEffect(() => {
        setVisibleCount(50);
    }, [items]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
            setVisibleCount(prev => {
                if (prev >= items.length) return prev;
                return prev + 50;
            });
        }
    }, [items.length]);


    if (!cfg) return null;

    const allSelected = items.length > 0 && items.every(e => selectedIds.has(e.id));
    const someSelected = items.some(e => selectedIds.has(e.id));
    const priorityCount = items.filter(e => e.is_priority).length;

    const progressPercent = totalCount > 0 ? Math.round((items.length / totalCount) * 100) : 0;

    const progressBarClass: Record<string, string> = {
        requested: 'from-amber-400 to-amber-500',
        invited: 'from-blue-400 to-blue-500',
        confirmed: 'from-emerald-400 to-emerald-500',
        completed: 'from-indigo-400 to-brand-500',
        withdrawn: 'from-zinc-400 to-zinc-500',
        rejected: 'from-red-400 to-red-500',
    };

    return (
        <div 
            ref={setNodeRef}
            className={`flex-1 min-h-0 flex flex-col bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden transition-colors duration-200 ${
                isOver ? 'ring-2 ring-brand-500 bg-brand-50/50 dark:bg-brand-500/5' : ''
            }`}
        >
            <div className={`sticky top-0 z-10 border-b-2 ${cfg.border} bg-surface-elevated/95 backdrop-blur-sm`}>
                <div className="p-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${cfg.gradient} shadow-sm`} />
                            <h3 className="text-[13px] font-bold text-primary uppercase tracking-wider">{cfg.label}</h3>
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${cfg.pillBg} shadow-sm`}>
                                {items.length}
                            </span>
                            {priorityCount > 0 && (
                                <span
                                    className="flex items-center gap-0.5 text-[11px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full"
                                    title={`${priorityCount} priority enrollment${priorityCount > 1 ? 's' : ''}`}
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                    {priorityCount}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {items.length > 0 && (
                                <button
                                    onClick={() => handleCopyEmails(items, cfg.label)}
                                    title={`Copy all ${cfg.label} emails`}
                                    className="p-1.5 text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-colors"
                                >
                                    <Copy size={14} />
                                </button>
                            )}
                            {items.length > 0 && (
                                <button
                                    onClick={() => selectAllInList(items)}
                                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${allSelected
                                        ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                                        : someSelected
                                            ? 'bg-brand-500/20 border-brand-500/50 text-brand-500'
                                            : 'border-border-strong hover:border-brand-500/50'
                                        }`}
                                >
                                    {(allSelected || someSelected) && <Check size={12} strokeWidth={3} />}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="h-1 w-full bg-border-subtle rounded-full overflow-hidden" title={`${progressPercent}% of all enrollments`}>
                        <div
                            className={`h-full rounded-full bg-gradient-to-r ${progressBarClass[status] || 'from-zinc-400 to-zinc-500'} transition-all duration-700 ease-out`}
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    {items.length > 0 && (
                        <p className="text-[10px] text-muted/50 mt-0.5 text-right tabular-nums">{progressPercent}%</p>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 relative" style={{ minHeight: 0 }}>
                <div 
                    ref={scrollContainerRef}
                    className="p-2 overflow-y-auto space-y-1.5 bg-surface will-change-scroll"
                    style={{ height: '100%' }}
                    onScroll={handleScroll}
                >
                    {items.length === 0 && (
                        <div className={`flex flex-col items-center justify-center py-10 mx-1 mt-2 rounded-xl border-2 border-dashed transition-all duration-200 ${
                            isOver
                                ? `${cfg.border} ${cfg.bg}`
                                : 'border-border-strong/40'
                        }`}>
                            <div className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center mb-2.5 ${cfg.color} ${isOver ? 'scale-110' : 'opacity-40'} transition-transform`}>
                                {cfg.icon}
                            </div>
                            <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${isOver ? cfg.color : 'text-muted/50'}`}>
                                {isOver ? 'Drop here' : 'No enrollments'}
                            </p>
                        </div>
                    )}
                    {items.slice(0, visibleCount).map(enrollment => (
                        <EnrollmentCard
                            key={enrollment.id}
                            enrollment={enrollment}
                            status={status}
                            isSelected={selectedIds.has(enrollment.id)}
                            toggleSelect={toggleSelect}
                            togglePriority={togglePriority}
                            openEditNote={openEditNote}
                            queuePosition={queuePositions.get(enrollment.id)}
                            studentFlags={flagsByStudentId.get(enrollment.student_id) || emptyFlags}
                            completedCourses={completedCoursesByStudentId.get(enrollment.student_id) || emptyCompletedCourses}
                            onFlagClick={onFlagClick}
                        />
                    ))}
                    {/* Sentinel for IntersectionObserver lazy load */}
                    {visibleCount < items.length && (
                        <div ref={sentinelRef} className="py-3 flex items-center justify-center">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    )}
                </div>
                {items.length > 0 && (
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-surface to-transparent rounded-b-2xl" />
                )}
            </div>
        </div>
    );
};

export default memo(StatusColumn, (prev, next) => {
    if (prev.status !== next.status) return false;
    if (prev.toggleSelect !== next.toggleSelect) return false;
    if (prev.togglePriority !== next.togglePriority) return false;
    if (prev.openEditNote !== next.openEditNote) return false;
    if (prev.selectAllInList !== next.selectAllInList) return false;
    if (prev.handleCopyEmails !== next.handleCopyEmails) return false;
    if (prev.onFlagClick !== next.onFlagClick) return false;
    if (prev.totalCount !== next.totalCount) return false;

    if (prev.items === next.items && 
        prev.selectedIds === next.selectedIds && 
        prev.queuePositions === next.queuePositions && 
        prev.flagsByStudentId === next.flagsByStudentId &&
        prev.completedCoursesByStudentId === next.completedCoursesByStudentId) {
        return true;
    }

    if (prev.items.length !== next.items.length) return false;
    for (let i = 0; i < prev.items.length; i++) {
        const a = prev.items[i];
        const b = next.items[i];
        if (a.id !== b.id || a.status !== b.status || a.is_priority !== b.is_priority || a.notes !== b.notes || a.confirmed_date !== b.confirmed_date || a.invited_date !== b.invited_date || a.completed_date !== b.completed_date || a.response_days !== b.response_days) return false;
    }

    for (const item of prev.items) {
        if (prev.selectedIds.has(item.id) !== next.selectedIds.has(item.id)) return false;
    }
    for (const item of next.items) {
        if (prev.selectedIds.has(item.id) !== next.selectedIds.has(item.id)) return false;
    }

    for (const item of prev.items) {
        if (prev.queuePositions.get(item.id) !== next.queuePositions.get(item.id)) return false;
    }

    // Compare flags and completed courses count for students in this column
    for (const item of prev.items) {
        const prevFlags = prev.flagsByStudentId.get(item.student_id);
        const nextFlags = next.flagsByStudentId.get(item.student_id);
        if ((prevFlags?.length || 0) !== (nextFlags?.length || 0)) return false;

        const prevCourses = prev.completedCoursesByStudentId.get(item.student_id);
        const nextCourses = next.completedCoursesByStudentId.get(item.student_id);
        if ((prevCourses?.length || 0) !== (nextCourses?.length || 0)) return false;
    }

    return true;
});

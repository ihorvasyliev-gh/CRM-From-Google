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
    onShowDetail?: (enrollment: EnrollmentRow) => void;
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
    totalCount: _totalCount = 0,
    onShowDetail,
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

    return (
        <div 
            ref={setNodeRef}
            className={`flex-1 min-h-0 flex flex-col bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden transition-colors duration-200 ${
                isOver ? 'ring-2 ring-brand-500 bg-brand-50/50 dark:bg-brand-500/5' : ''
            }`}
        >
            <div className={`sticky top-0 z-10 border-b ${cfg.border} bg-surface-elevated/95 backdrop-blur-sm`}>
                <div className={`h-[3px] w-full bg-gradient-to-r ${cfg.gradient}`} />
                <div className="px-2 py-2 md:px-3.5 md:py-2.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className={`${cfg.color} flex items-center flex-shrink-0 scale-90 md:scale-100`}>
                                {cfg.icon}
                            </span>
                            <h3 className={`text-xs md:text-sm font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</h3>
                            <span className={`text-[10px] md:text-xs font-semibold px-1.5 py-0.5 md:px-2 md:py-0.5 rounded-full ${cfg.pillBg} shadow-sm`}>
                                {items.length}
                            </span>
                            {status === 'requested' && priorityCount > 0 && (
                                <span
                                    className="flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full priority-badge shadow-sm"
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
                            onShowDetail={onShowDetail}
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
    if (prev.onShowDetail !== next.onShowDetail) return false;

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

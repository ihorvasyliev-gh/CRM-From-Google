import { memo } from 'react';
import { Check, Copy } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { CustomTooltip } from '../ui/Tooltip';
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
    onFlagClick: (enrollment: EnrollmentRow) => void;
    emptyFlags: StudentFlag[];
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
    onFlagClick,
    emptyFlags
}: StatusColumnProps) {
    const cfg = STATUS_CONFIG[status];
    
    const { isOver, setNodeRef } = useDroppable({
        id: status
    });

    if (!cfg) return null;

    const allSelected = items.length > 0 && items.every(e => selectedIds.has(e.id));
    const someSelected = items.some(e => selectedIds.has(e.id));

    return (
        <div 
            ref={setNodeRef}
            className={`flex flex-col bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden transition-colors duration-200 ${
                isOver ? 'ring-2 ring-brand-500 bg-brand-50/50' : ''
            }`}
        >
            {/* Column Header */}
            <div className={`p-3.5 border-b-2 ${cfg.border} bg-surface-elevated/50`}>
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${cfg.gradient} shadow-sm`} />
                        <h3 className="text-[13px] font-bold text-primary uppercase tracking-wider">{cfg.label}</h3>
                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${cfg.pillBg} shadow-sm`}>
                            {items.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        {items.length > 0 && (
                            <CustomTooltip content={`Copy all ${cfg.label} emails`}>
                                <button
                                    onClick={() => handleCopyEmails(items, cfg.label)}
                                    className="p-1.5 text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-colors"
                                >
                                    <Copy size={14} />
                                </button>
                            </CustomTooltip>
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

            {/* Cards */}
            <div className="p-2 overflow-y-auto flex-1 space-y-1.5 bg-surface min-h-0 min-h-[500px]">
                {items.length === 0 && (
                    <div className="text-center py-8 text-muted/60">
                        <div className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center mx-auto mb-2 ${cfg.color} opacity-40`}>
                            {cfg.icon}
                        </div>
                        <p className="text-xs uppercase tracking-wider font-semibold">No enrollments</p>
                    </div>
                )}
                {items.map(enrollment => (
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
                        onFlagClick={onFlagClick}
                    />
                ))}
            </div>
        </div>
    );
};

export default memo(StatusColumn, (prev, next) => {
    // Fast reference checks for stable callbacks
    if (prev.status !== next.status) return false;
    if (prev.toggleSelect !== next.toggleSelect) return false;
    if (prev.togglePriority !== next.togglePriority) return false;
    if (prev.openEditNote !== next.openEditNote) return false;
    if (prev.selectAllInList !== next.selectAllInList) return false;
    if (prev.handleCopyEmails !== next.handleCopyEmails) return false;
    if (prev.onFlagClick !== next.onFlagClick) return false;

    // Fast reference checks for data sources
    if (prev.items === next.items && 
        prev.selectedIds === next.selectedIds && 
        prev.queuePositions === next.queuePositions && 
        prev.flagsByStudentId === next.flagsByStudentId) {
        return true;
    }

    // Deep compare items array by ID + key fields
    if (prev.items.length !== next.items.length) return false;
    for (let i = 0; i < prev.items.length; i++) {
        const a = prev.items[i];
        const b = next.items[i];
        if (a.id !== b.id || a.status !== b.status || a.is_priority !== b.is_priority || a.notes !== b.notes || a.confirmed_date !== b.confirmed_date || a.invited_date !== b.invited_date || a.completed_date !== b.completed_date) return false;
    }

    // Compare selection state for items in this column only
    for (const item of prev.items) {
        if (prev.selectedIds.has(item.id) !== next.selectedIds.has(item.id)) return false;
    }
    // Also check if any new items are selected
    for (const item of next.items) {
        if (prev.selectedIds.has(item.id) !== next.selectedIds.has(item.id)) return false;
    }

    // Compare queue positions for items in this column
    for (const item of prev.items) {
        if (prev.queuePositions.get(item.id) !== next.queuePositions.get(item.id)) return false;
    }

    // Compare flags count for students in this column
    for (const item of prev.items) {
        const prevFlags = prev.flagsByStudentId.get(item.student_id);
        const nextFlags = next.flagsByStudentId.get(item.student_id);
        if ((prevFlags?.length || 0) !== (nextFlags?.length || 0)) return false;
    }

    return true;
});

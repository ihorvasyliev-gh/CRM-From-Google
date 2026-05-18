import { useMemo, memo, useState, useEffect } from 'react';
import { Check, Star, Timer, Pencil, Send, CheckCircle, GraduationCap, AlertTriangle, Mail, Phone, Award } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import type { StudentFlag } from '../../lib/types';
import { getCoursePill } from '../../hooks/useBulkActions';
import { formatDateLong } from '../../lib/dateUtils';
import { STATUS_CONFIG } from '../../lib/statusConfig';

interface EnrollmentCardProps {
    enrollment: EnrollmentRow;
    status: string;
    isSelected: boolean;
    toggleSelect: (id: string) => void;
    togglePriority: (id: string, current: boolean) => void;
    queuePosition?: number;
    openEditNote: (enrollment: EnrollmentRow) => void;
    studentFlags?: StudentFlag[];
    completedCourses?: Array<{id: string, name: string}>;
    onFlagClick?: (enrollment: EnrollmentRow) => void;
    isOverlay?: boolean;
}

// --- п.7: Relative time helper ---
function getRelativeTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

// Left accent border color per status — п.13
const STATUS_LEFT_BORDER: Record<string, string> = {
    requested: 'border-l-warning',
    invited:   'border-l-info',
    confirmed: 'border-l-success',
    completed: 'border-l-brand-500',
    withdrawn: 'border-l-muted',
    rejected:  'border-l-danger',
};

const EnrollmentCard = function EnrollmentCard({
    enrollment,
    status,
    isSelected,
    toggleSelect,
    togglePriority,
    queuePosition,
    openEditNote,
    studentFlags = [],
    completedCourses = [],
    onFlagClick,
    isOverlay
}: EnrollmentCardProps) {
    const [now, setNow] = useState(() => Date.now());
    const [showCompleted, setShowCompleted] = useState(false);
    const [noteTooltipVisible, setNoteTooltipVisible] = useState(false);
    
    useEffect(() => {
        if (status === 'invited') {
            const interval = setInterval(() => setNow(Date.now()), 60000);
            return () => clearInterval(interval);
        }
    }, [status]);

    const cfg = STATUS_CONFIG[status];
    const draggableData = useMemo(() => ({ status }), [status]);

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: enrollment.id,
        data: draggableData,
        disabled: isOverlay
    });

    const style = useMemo(() => ({
        opacity: isDragging && !isOverlay ? 0.3 : 1,
        contentVisibility: (isOverlay || showCompleted) ? 'visible' as const : 'auto' as const,
        containIntrinsicSize: '0 100px',
    }), [isDragging, isOverlay, showCompleted]);

    // п.3: Timer level — grey / orange / red
    const timerLevel = useMemo(() => {
        if (status !== 'invited') return null;
        const invitedAt = enrollment.invited_at;
        if (!invitedAt) return null;
        const days = enrollment.response_days ?? 7;
        const deadline = new Date(invitedAt).getTime() + days * 24 * 60 * 60 * 1000;
        const remaining = deadline - now;
        if (remaining <= 0) return 'expired';
        const daysLeft = Math.floor(remaining / (24 * 60 * 60 * 1000));
        if (daysLeft <= 2) return 'urgent';
        return 'ok';
    }, [status, enrollment.invited_at, enrollment.response_days, now]);

    const leftBorder = STATUS_LEFT_BORDER[status] || 'border-l-border-subtle';

    return (
        <div
            ref={isOverlay ? undefined : setNodeRef}
            style={style}
            {...(isOverlay ? {} : attributes)}
            {...(isOverlay ? {} : listeners)}
            className={`group relative p-3 rounded-xl border border-l-4 ${leftBorder} ${
                isOverlay
                    ? 'cursor-grabbing shadow-2xl ring-2 ring-brand-500 bg-surface z-[100]'
                    : 'cursor-grab'
            } ${isSelected
                ? 'border-brand-500 bg-brand-50/80 dark:bg-brand-500/10 shadow-md ring-1 ring-brand-500'
                : 'border-border-subtle bg-surface hover:shadow-card hover:border-brand-500/30'
            } transition-all duration-200 animate-card-drop-in`}
            onClick={() => toggleSelect(enrollment.id)}
        >
            <div className="flex items-start gap-3">
                {/* Left Actions Column */}
                <div className="mt-0.5 flex flex-col items-center gap-2 flex-shrink-0">
                    <div
                        className={`w-[16px] h-[16px] rounded flex items-center justify-center border transition-all ${isSelected
                            ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                            : 'border-border-strong group-hover:border-brand-500/50 bg-background'
                            }`}
                    >
                        {isSelected && <Check size={11} strokeWidth={3} />}
                    </div>

                    {/* Star Priority */}
                    <button
                        title={enrollment.is_priority ? "Remove priority" : "Mark as priority"}
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePriority(enrollment.id, !!enrollment.is_priority);
                        }}
                        className={`transition-all ${enrollment.is_priority
                            ? 'text-warning hover:text-warning/80 drop-shadow-sm'
                            : 'text-muted/30 hover:text-warning/60 opacity-0 group-hover:opacity-100'
                            }`}
                    >
                        <Star size={14} fill={enrollment.is_priority ? "currentColor" : "none"} />
                    </button>

                    {/* ⚠ Student Flags */}
                    {studentFlags.length > 0 ? (
                        <button
                            title={`⚠ Didn't pass:\n${studentFlags.map(f => `${f.courses?.name || 'Unknown'}${f.comment ? ` — ${f.comment}` : ''}`).join('\n')}`}
                            onClick={e => { e.stopPropagation(); onFlagClick?.(enrollment); }}
                            className="text-orange-500 hover:text-orange-600 transition-colors drop-shadow-sm"
                        >
                            <AlertTriangle size={14} strokeWidth={2.5} />
                        </button>
                    ) : (
                        <button
                            title="Flag student (e.g. failed a course)"
                            onClick={e => { e.stopPropagation(); onFlagClick?.(enrollment); }}
                            className="text-muted/30 hover:text-orange-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <AlertTriangle size={14} />
                        </button>
                    )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col">
                    {/* Header: Name, Badges & Actions */}
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                            <p className="font-bold text-primary text-[15px] leading-tight">
                                {enrollment.students?.first_name} {enrollment.students?.last_name}
                            </p>

                            {/* Course Pill — inline with name */}
                            <span className={`inline-block text-[12px] font-medium px-2 py-0.5 rounded-md ${cfg.pillBg} flex-shrink-0`}>
                                {getCoursePill(enrollment)}
                            </span>
                            
                            {/* Queue Number */}
                            {status === 'requested' && queuePosition !== undefined && (
                                <div title="Position in queue for this course">
                                    <span className="inline-flex items-center justify-center bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 font-mono text-[11px] font-bold rounded px-1.5 py-0.5 border border-violet-200 dark:border-violet-500/30">
                                        #{queuePosition}
                                    </span>
                                </div>
                            )}

                            {/* 🥇 Completed Courses Badge */}
                            {completedCourses.length > 0 && (
                                <>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowCompleted(true); }}
                                        title="Click to view completed courses"
                                        className="flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 cursor-pointer transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20"
                                    >
                                        <Award size={12} strokeWidth={2.5} />
                                        <span className="text-[11px] font-bold">{completedCourses.length}</span>
                                    </button>
                                    
                                    {showCompleted && (
                                        <div 
                                            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn" 
                                            onClick={(e) => { e.stopPropagation(); setShowCompleted(false); }}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            <div 
                                                onClick={e => e.stopPropagation()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                className="bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl p-5 w-full max-w-sm animate-scaleIn cursor-default"
                                            >
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 rounded-xl text-amber-500">
                                                        <Award size={22} strokeWidth={2.5} />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-primary">Completed Courses</h3>
                                                        <p className="text-xs text-muted mt-0.5">
                                                            {enrollment.students?.first_name} {enrollment.students?.last_name} has completed {completedCourses.length} course{completedCourses.length > 1 ? 's' : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                                                    {completedCourses.map(c => (
                                                        <div key={c.id} className="flex items-center gap-2.5 bg-surface p-3 rounded-xl border border-border-subtle shadow-sm">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                                                            <span className="text-[13px] font-bold text-primary">{c.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                
                                                <div className="mt-5 text-right">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setShowCompleted(false); }}
                                                        className="px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-all shadow-sm active:scale-[0.98]"
                                                    >
                                                        Close
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                        </div>

                        {/* Right Quick Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {/* ✏ Edit Note — п.6: hover tooltip with note preview */}
                            <div
                                className="relative"
                                onMouseEnter={() => enrollment.notes && setNoteTooltipVisible(true)}
                                onMouseLeave={() => setNoteTooltipVisible(false)}
                            >
                                <button
                                    title={enrollment.notes ? '' : 'Add Note'}
                                    onClick={e => { e.stopPropagation(); openEditNote(enrollment); }}
                                    className={`p-1 rounded transition-colors border ${enrollment.notes
                                        ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/30 hover:bg-brand-100 dark:hover:bg-brand-500/20'
                                        : 'text-muted/40 hover:text-brand-500 hover:bg-surface-elevated border-transparent opacity-0 group-hover:opacity-100'
                                        }`}
                                >
                                    <Pencil size={14} strokeWidth={enrollment.notes ? 2.5 : 2} />
                                </button>
                                {/* Note preview tooltip — п.6 */}
                                {noteTooltipVisible && enrollment.notes && (
                                    <div
                                        className="absolute right-0 top-full mt-1.5 z-50 w-56 bg-surface-elevated border border-border-subtle rounded-xl shadow-float p-3 animate-fadeIn pointer-events-none"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <p className="text-[11px] text-muted-strong leading-relaxed italic line-clamp-4">
                                            {enrollment.notes}
                                        </p>
                                        <p className="text-[10px] text-muted/50 mt-1.5 font-medium">Click to edit</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] text-muted truncate">
                        {enrollment.students?.email && (
                            <div className="flex items-center gap-1.5 truncate min-w-0">
                                <Mail size={12} className="flex-shrink-0 text-muted/70" />
                                <span className="truncate">{enrollment.students.email}</span>
                            </div>
                        )}
                        {enrollment.students?.phone && (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                <Phone size={12} className="flex-shrink-0 text-muted/70" />
                                <span>{enrollment.students.phone}</span>
                            </div>
                        )}
                    </div>

                    {/* Info row */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                        {/* п.7: Registration date with relative time */}
                        <span className="flex items-center gap-1">
                            {formatDateLong(enrollment.created_at)}
                            <span className="text-muted/40 font-normal">·</span>
                            <span className="text-muted/60">{getRelativeTime(enrollment.created_at)}</span>
                        </span>

                        {enrollment.invited_date && enrollment.status !== 'completed' && (
                            <>
                                <span>•</span>
                                <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded">
                                    <Send size={11} />
                                    {formatDateLong(enrollment.invited_date)}
                                </span>
                            </>
                        )}
                        {enrollment.confirmed_date && enrollment.status !== 'completed' && (
                            <>
                                <span>•</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    <CheckCircle size={11} />
                                    {formatDateLong(enrollment.confirmed_date)}
                                </span>
                            </>
                        )}
                        {enrollment.completed_date && enrollment.status === 'completed' && (
                            <>
                                <span>•</span>
                                <span className="text-brand-600 dark:text-brand-400 font-medium flex items-center gap-1 bg-brand-50 dark:bg-brand-500/10 px-1.5 py-0.5 rounded">
                                    <GraduationCap size={11} />
                                    {formatDateLong(enrollment.completed_date)}
                                </span>
                            </>
                        )}

                        {/* Invitation Timer — п.3: three-level colour */}
                        {status === 'invited' && (() => {
                            const invitedAt = enrollment.invited_at;
                            if (!invitedAt) return null;
                            const days = enrollment.response_days ?? 7;
                            const deadline = new Date(invitedAt).getTime() + days * 24 * 60 * 60 * 1000;
                            const remaining = deadline - now;

                            if (remaining <= 0) {
                                const invitedDate = new Date(invitedAt).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
                                return (
                                    <div className="flex items-center gap-1 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded text-[11px] font-bold animate-pulse-timer" title={`Expired (${days}-day deadline) • Invited on ${invitedDate}`}>
                                        <Timer size={12} strokeWidth={2.5} />
                                        <span>Expired</span>
                                    </div>
                                );
                            }

                            const daysLeft = Math.floor(remaining / (24 * 60 * 60 * 1000));
                            const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                            const timerText = daysLeft > 0 ? `${daysLeft}d ${hours}h` : `${hours}h`;

                            // п.3: urgent = ≤2 days left → orange with pulse
                            const isUrgent = timerLevel === 'urgent';
                            return (
                                <div
                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium shadow-sm transition-colors ${
                                        isUrgent
                                            ? 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 animate-pulse-timer'
                                            : 'bg-surface-elevated border border-border-subtle text-muted-strong'
                                    }`}
                                    title={`${timerText} remaining (${days}-day deadline)`}
                                >
                                    <Timer size={12} />
                                    <span>{timerText}</span>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Notes */}
                    {enrollment.notes && (
                        <div className="mt-1.5 flex items-start gap-1.5 text-[12px] text-muted-strong bg-surface-elevated border border-border-subtle p-2 rounded-md shadow-sm">
                            <Pencil size={12} className="mt-0.5 flex-shrink-0 text-brand-500" />
                            <p className="italic leading-relaxed">{enrollment.notes}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default memo(EnrollmentCard, (prev, next) => {
    return (
        prev.enrollment === next.enrollment &&
        prev.status === next.status &&
        prev.isSelected === next.isSelected &&
        prev.queuePosition === next.queuePosition &&
        prev.isOverlay === next.isOverlay &&
        (prev.studentFlags?.length || 0) === (next.studentFlags?.length || 0) &&
        (prev.completedCourses?.length || 0) === (next.completedCourses?.length || 0)
    );
});

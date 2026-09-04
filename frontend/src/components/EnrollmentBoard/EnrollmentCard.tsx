import { useMemo, memo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Star, Timer, Pencil, Send, CheckCircle, GraduationCap, AlertTriangle, Mail, Phone, Award, Info, Clock, MessageSquare, ArrowRightLeft, X } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import type { StudentFlag } from '../../lib/types';
import { getCoursePill } from '../../hooks/useBulkActions';
import { formatDateLong } from '../../lib/dateUtils';
import { formatPhoneForWhatsApp, formatPhoneForCall } from '../../lib/contactUtils';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import { useIsMobile, useIsSmallScreen } from '../../hooks/useScreenSize';
import { useNowMinute } from '../../hooks/useNow';
import { CustomTooltip } from '../ui/Tooltip';

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
    onShowDetail?: (enrollment: EnrollmentRow) => void;
    onMoveStatus?: (id: string, currentStatus: string, targetStatus: string) => void;
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

// Left accent border per status
const STATUS_LEFT_BORDER: Record<string, string> = {
    requested: 'border-l-warning',
    invited:   'border-l-info',
    confirmed: 'border-l-success',
    completed: 'border-l-[oklch(var(--status-completed))]',
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
    isOverlay,
    onShowDetail,
    onMoveStatus
}: EnrollmentCardProps) {
    const now = useNowMinute(status === 'invited');
    const isMobile = useIsMobile();
    const isSmallScreen = useIsSmallScreen();
    const [showCompleted, setShowCompleted] = useState(false);
    const [showQuickMove, setShowQuickMove] = useState(false);
    const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; isAbove?: boolean } | null>(null);
    const [noteTooltipVisible, setNoteTooltipVisible] = useState(false);
    const quickMoveBtnRef = useRef<HTMLButtonElement | null>(null);
    const touchStartPos = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (!showQuickMove) return;
        const handleDismiss = () => setShowQuickMove(false);
        window.addEventListener('scroll', handleDismiss, true);
        window.addEventListener('resize', handleDismiss);
        return () => {
            window.removeEventListener('scroll', handleDismiss, true);
            window.removeEventListener('resize', handleDismiss);
        };
    }, [showQuickMove]);

    const cfg = STATUS_CONFIG[status];
    const draggableData = useMemo(() => ({ status }), [status]);

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: enrollment.id,
        data: draggableData,
        disabled: isOverlay || isMobile
    });

    const style = useMemo(() => ({
        opacity: isDragging && !isOverlay ? 0.3 : 1,
    }), [isDragging, isOverlay]);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            touchStartPos.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
            };
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartPos.current && e.changedTouches.length === 1) {
            const touch = e.changedTouches[0];
            const dx = Math.abs(touch.clientX - touchStartPos.current.x);
            const dy = Math.abs(touch.clientY - touchStartPos.current.y);
            if (dx > 8 || dy > 8) {
                touchStartPos.current = { x: -9999, y: -9999 };
                return;
            }
        }
        touchStartPos.current = null;
    };

    const handleClick = () => {
        if (touchStartPos.current && (touchStartPos.current.x === -9999 || touchStartPos.current.y === -9999)) {
            touchStartPos.current = null;
            return;
        }
        touchStartPos.current = null;
        toggleSelect(enrollment.id);
    };

    const handleOpenQuickMove = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        const trigger = (e.currentTarget as HTMLElement) || quickMoveBtnRef.current;
        if (trigger) {
            const rect = trigger.getBoundingClientRect();
            const width = 176;
            const height = 210;
            let left = rect.right - width;
            if (left < 10) left = 10;
            if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10;
            let top = rect.bottom + 6;
            let isAbove = false;
            // if dropdown exceeds bottom of viewport, position above button
            if (top + height > window.innerHeight - 10 && rect.top > height + 10) {
                top = rect.top - height - 6;
                isAbove = true;
            }
            setPopoverPos({ top, left, isAbove });
        }
        setShowQuickMove(prev => !prev);
    };

    // Timer level — grey / orange / red
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
            ref={isOverlay || isMobile ? undefined : setNodeRef}
            style={style}
            {...(isOverlay || isMobile ? {} : attributes)}
            {...(isOverlay || isMobile ? {} : listeners)}
            className={`group relative enrollment-card cv-auto-card p-2 md:p-2.5 rounded-lg md:rounded-xl border border-l-4 ${leftBorder} ${
                isOverlay
                    ? 'cursor-grabbing shadow-2xl ring-2 ring-brand-500 bg-surface z-[100] scale-[1.02] transform-gpu'
                    : isMobile
                        ? ''
                        : 'cursor-grab'
            } ${isSelected
                ? 'border-brand-500 bg-brand-50/80 dark:bg-brand-500/10 shadow-md ring-1 ring-brand-500'
                : isDragging
                    ? 'border-border-subtle bg-surface/50'
                    : 'border-border-subtle bg-surface hover:shadow-card hover:border-brand-500/30'
            } ${isOverlay ? '' : 'card-transition'} ${isOverlay || isDragging ? '' : 'animate-card-drop-in'}`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={handleClick}
        >
            {/* Top Row: Checkbox, Name, Badges & Quick Action Buttons */}
            <div className="flex items-start justify-between gap-1.5 min-w-0">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                    {/* Checkbox */}
                    <div
                        className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center border transition-all flex-shrink-0 ${
                            isSelected
                                ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                                : 'border-border-strong group-hover:border-brand-500/50 bg-background'
                        }`}
                    >
                        {isSelected && <Check size={11} strokeWidth={3} />}
                    </div>

                    {/* Name & Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                        <p className="card-title font-bold text-primary text-xs sm:text-[13px] md:text-sm leading-snug break-words" title={`${enrollment.students?.first_name || ''} ${enrollment.students?.last_name || ''}`}>
                            {enrollment.students?.first_name} {enrollment.students?.last_name}
                        </p>

                        {/* Badges row with strict unified height and alignment */}
                        <div className="inline-flex items-center gap-1 flex-wrap min-w-0">
                            {/* Course Pill */}
                            <span
                                title={getCoursePill(enrollment)}
                                className={`card-pill inline-flex items-center h-5 text-[11px] leading-none font-semibold px-2 rounded-md ${cfg.pillBg} truncate max-w-full select-none`}
                            >
                                {getCoursePill(enrollment)}
                            </span>

                            {/* Queue Number */}
                            {status === 'requested' && queuePosition !== undefined && (
                                <span
                                    title="Position in queue for this course"
                                    className="card-pill inline-flex items-center justify-center h-5 px-1.5 text-[11px] leading-none font-bold font-mono rounded-md border border-violet-200 dark:border-violet-500/30 bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 flex-shrink-0 select-none"
                                >
                                    #{queuePosition}
                                </span>
                            )}

                            {/* 🥇 Completed Courses Badge */}
                            {completedCourses.length > 0 && (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setShowCompleted(true); }}
                                    title={`Completed ${completedCourses.length} course${completedCourses.length > 1 ? 's' : ''}. Click to view.`}
                                    className="card-pill inline-flex items-center justify-center gap-1 h-5 px-1.5 text-[11px] leading-none font-bold rounded-md border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 cursor-pointer flex-shrink-0 transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20 shadow-2xs"
                                >
                                    <Award size={11} strokeWidth={2.5} className="flex-shrink-0" />
                                    <span className="leading-none">{completedCourses.length}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Quick Actions (In one horizontal row) */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                    {/* Star Priority */}
                    <CustomTooltip content={enrollment.is_priority ? "Remove priority" : "Mark as priority"}>
                        <button
                            aria-label={enrollment.is_priority ? "Remove priority" : "Mark as priority"}
                            onClick={(e) => {
                                e.stopPropagation();
                                togglePriority(enrollment.id, !!enrollment.is_priority);
                            }}
                            className={`p-1 rounded-md transition-colors ${enrollment.is_priority
                                ? 'text-warning hover:text-warning/80 drop-shadow-sm'
                                : 'text-muted/50 hover:text-warning/90 hover:bg-surface-elevated lg:opacity-0 lg:group-hover:opacity-100 opacity-100'
                            }`}
                        >
                            <Star size={14} fill={enrollment.is_priority ? "currentColor" : "none"} />
                        </button>
                    </CustomTooltip>

                    {/* ⚠ Student Flags */}
                    {studentFlags.length > 0 ? (
                        <CustomTooltip content={`⚠ Didn't pass:\n${studentFlags.map(f => `${f.courses?.name || 'Unknown'}${f.comment ? ` — ${f.comment}` : ''}`).join('\n')}`}>
                            <button
                                aria-label="Student flags"
                                onClick={e => { e.stopPropagation(); onFlagClick?.(enrollment); }}
                                className="p-1 text-orange-500 hover:text-orange-600 transition-colors drop-shadow-sm rounded-md"
                            >
                                <AlertTriangle size={14} strokeWidth={2.5} />
                            </button>
                        </CustomTooltip>
                    ) : (
                        <CustomTooltip content="Flag student (e.g. failed a course)">
                            <button
                                aria-label="Flag student"
                                onClick={e => { e.stopPropagation(); onFlagClick?.(enrollment); }}
                                className="p-1 text-muted/50 hover:text-orange-400 hover:bg-surface-elevated transition-colors lg:opacity-0 lg:group-hover:opacity-100 opacity-100 rounded-md"
                            >
                                <AlertTriangle size={14} />
                            </button>
                        </CustomTooltip>
                    )}

                    {/* ⇄ Quick Move Status Button */}
                    {onMoveStatus && (
                        <CustomTooltip content="Move status">
                            <button
                                ref={quickMoveBtnRef}
                                title="Move status"
                                aria-label="Move status"
                                onClick={handleOpenQuickMove}
                                className={`p-1 rounded-md transition-colors border ${showQuickMove
                                    ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/30 shadow-xs'
                                    : 'text-muted/50 hover:text-brand-500 hover:bg-surface-elevated border-transparent lg:opacity-0 lg:group-hover:opacity-100 opacity-100'
                                }`}
                            >
                                <ArrowRightLeft size={13} />
                            </button>
                        </CustomTooltip>
                    )}

                    {/* ℹ Student Info Button */}
                    <CustomTooltip content="View Student Details">
                        <button
                            aria-label="View Student Details"
                            onClick={e => { e.stopPropagation(); onShowDetail?.(enrollment); }}
                            className="p-1 rounded-md transition-colors border text-muted/50 hover:text-brand-500 hover:bg-surface-elevated border-transparent lg:opacity-0 lg:group-hover:opacity-100 opacity-100"
                        >
                            <Info size={14} />
                        </button>
                    </CustomTooltip>
                </div>
            </div>

            {/* Middle Row: Contacts (Phone + WhatsApp & Email) */}
            {(enrollment.students?.phone || enrollment.students?.email) && (
                <div className="card-contact mt-1.5 flex items-center gap-2.5 text-xs text-primary/90 min-w-0 flex-wrap sm:flex-nowrap">
                    {enrollment.students?.phone && (() => {
                        const waUrl = formatPhoneForWhatsApp(enrollment.students.phone);
                        const telUrl = formatPhoneForCall(enrollment.students.phone);
                        return (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                {telUrl ? (
                                    <a
                                        href={telUrl}
                                        onClick={e => e.stopPropagation()}
                                        onPointerDown={e => e.stopPropagation()}
                                        onTouchStart={e => e.stopPropagation()}
                                        className="flex items-center gap-1 font-medium text-primary hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                                        title="Click to call"
                                    >
                                        <Phone size={12} className="flex-shrink-0 text-primary/60" />
                                        <span>{enrollment.students.phone}</span>
                                    </a>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <Phone size={12} className="flex-shrink-0 text-primary/60" />
                                        <span>{enrollment.students.phone}</span>
                                    </div>
                                )}
                                {waUrl && (
                                    <CustomTooltip content="Chat on WhatsApp">
                                        <a
                                            href={waUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            onPointerDown={e => e.stopPropagation()}
                                            onTouchStart={e => e.stopPropagation()}
                                            className="flex items-center justify-center w-5 h-5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/25 rounded shadow-2xs transition-all active:scale-95 flex-shrink-0"
                                            title="Chat on WhatsApp"
                                            aria-label="Chat on WhatsApp"
                                        >
                                            <MessageSquare size={11} />
                                        </a>
                                    </CustomTooltip>
                                )}
                            </div>
                        );
                    })()}

                    {enrollment.students?.phone && enrollment.students?.email && (
                        <span className="text-border-strong hidden sm:inline select-none">·</span>
                    )}

                    {enrollment.students?.email && (
                        <div className="flex items-center gap-1 min-w-0 truncate">
                            <Mail size={12} className="flex-shrink-0 text-primary/60" />
                            <a
                                href={`mailto:${enrollment.students.email}`}
                                onClick={e => e.stopPropagation()}
                                onPointerDown={e => e.stopPropagation()}
                                touch-action="manipulation"
                                onTouchStart={e => e.stopPropagation()}
                                className="text-primary/75 hover:underline hover:text-brand-600 dark:hover:text-brand-400 transition-colors truncate"
                                title={`Send email to ${enrollment.students.email}`}
                            >
                                {enrollment.students.email}
                            </a>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Row: Meta Dates / Timers & Compact Note */}
            <div className="card-info mt-1.5 pt-1.5 border-t border-border-subtle/60 flex items-center justify-between gap-1.5 text-[11px] text-primary/75 min-w-0">
                <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 min-w-0">
                    <span className="flex items-center gap-1 flex-shrink-0">
                        {formatDateLong(enrollment.created_at)}
                        <span className="text-primary/40 font-normal">·</span>
                        <span className="text-primary/60">{getRelativeTime(enrollment.created_at)}</span>
                    </span>

                    {enrollment.invited_date && enrollment.status !== 'completed' && (
                        <span className="text-status-invited font-medium flex items-center gap-0.5 bg-info/10 px-1.5 py-0.2 rounded border border-info/20 flex-shrink-0">
                            <Send size={10} />
                            <span>{formatDateLong(enrollment.invited_date)}</span>
                        </span>
                    )}
                    {enrollment.confirmed_date && enrollment.status !== 'completed' && (
                        <span className="text-status-confirmed font-medium flex items-center gap-0.5 bg-success/10 px-1.5 py-0.2 rounded border border-success/20 flex-shrink-0">
                            <CheckCircle size={10} />
                            <span>{formatDateLong(enrollment.confirmed_date)}</span>
                        </span>
                    )}
                    {enrollment.completed_date && enrollment.status === 'completed' && (
                        <span className="text-status-completed font-medium flex items-center gap-0.5 bg-[oklch(var(--status-completed)/0.1)] px-1.5 py-0.2 rounded border border-[oklch(var(--status-completed)/0.2)] flex-shrink-0">
                            <GraduationCap size={10} />
                            <span>{formatDateLong(enrollment.completed_date)}</span>
                        </span>
                    )}

                    {/* Invitation Timer */}
                    {status === 'invited' && (() => {
                        const invitedAt = enrollment.invited_at;
                        if (!invitedAt) return null;
                        const days = enrollment.response_days ?? 7;
                        const deadline = new Date(invitedAt).getTime() + days * 24 * 60 * 60 * 1000;
                        const remaining = deadline - now;

                        if (remaining <= 0) {
                            const invitedDate = new Date(invitedAt).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
                            return (
                                <div className="flex items-center gap-1 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-1.5 py-0.2 rounded text-[10px] font-bold animate-pulse-timer flex-shrink-0" title={`Expired (${days}-day deadline) • Invited on ${invitedDate}`}>
                                    <Timer size={10} strokeWidth={2.5} />
                                    <span>Expired</span>
                                </div>
                            );
                        }

                        const daysLeft = Math.floor(remaining / (24 * 60 * 60 * 1000));
                        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                        const timerText = daysLeft > 0 ? `${daysLeft}d ${hours}h` : `${hours}h`;
                        const isUrgent = timerLevel === 'urgent';
                        return (
                            <div
                                className={`flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium shadow-2xs transition-colors flex-shrink-0 ${
                                    isUrgent
                                        ? 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 animate-pulse-timer'
                                        : 'bg-surface-elevated border border-border-subtle text-primary/80'
                                }`}
                                title={`${timerText} remaining (${days}-day deadline)`}
                            >
                                <Timer size={10} />
                                <span>{timerText}</span>
                            </div>
                        );
                    })()}
                </div>

                {/* Compact Note Badge (1 row with line-clamp-1) or Add Note pencil */}
                {enrollment.notes ? (
                    <button
                        onClick={e => { e.stopPropagation(); openEditNote(enrollment); }}
                        onMouseEnter={() => setNoteTooltipVisible(true)}
                        onMouseLeave={() => setNoteTooltipVisible(false)}
                        className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 px-1.5 py-0.2 rounded font-normal italic max-w-[130px] sm:max-w-[180px] truncate transition-colors text-left flex-shrink-0"
                        title={enrollment.notes}
                    >
                        <Pencil size={10} className="flex-shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="truncate">{enrollment.notes}</span>
                    </button>
                ) : (
                    <button
                        title="Add Note"
                        onClick={e => { e.stopPropagation(); openEditNote(enrollment); }}
                        className="p-1 text-muted/40 hover:text-brand-500 hover:bg-surface-elevated rounded transition-colors lg:opacity-0 lg:group-hover:opacity-100 opacity-100 flex-shrink-0"
                    >
                        <Pencil size={12} />
                    </button>
                )}
            </div>

            {/* Note hover preview tooltip on desktop */}
            {noteTooltipVisible && enrollment.notes && (
                <div
                    className="absolute right-2 bottom-full mb-1.5 z-50 w-56 bg-surface-elevated border border-border-subtle rounded-xl shadow-float p-2.5 animate-fadeIn pointer-events-none"
                    onClick={e => e.stopPropagation()}
                >
                    <p className="text-[11px] text-primary/90 leading-relaxed italic line-clamp-4">
                        {enrollment.notes}
                    </p>
                    <p className="text-[10px] text-primary/50 mt-1 font-medium">Click to edit</p>
                </div>
            )}

            {/* Pending Completion Approval Highlight */}
            {enrollment.completion_request_status === 'pending' && (
                <div className="mt-1 flex items-center gap-1.5 px-1.5 py-1 bg-amber-500/15 border border-amber-500/30 rounded-md text-amber-700 dark:text-amber-300 text-[10px] md:text-[11px] font-semibold animate-pulse shadow-2xs">
                    <Clock size={11} className="flex-shrink-0" />
                    <span className="truncate">
                        Completion requested for <strong>{formatDateLong(enrollment.pending_completion_date)}</strong>
                        {enrollment.completion_requested_by ? ` (${enrollment.completion_requested_by})` : ''}
                    </span>
                </div>
            )}

            {/* Completed Courses Modal in Portal */}
            {showCompleted && createPortal(
                <div 
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn" 
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
                </div>,
                document.body
            )}

            {/* Quick Move Dropdown rendered in Portal (eliminates any clipping by sibling cards or scroll containers) */}
            {showQuickMove && (isSmallScreen || popoverPos) && createPortal(
                <div
                    className={`fixed inset-0 z-[9999] ${
                        isSmallScreen
                            ? 'flex items-end justify-center bg-black/40 backdrop-blur-xs animate-fadeIn'
                            : 'bg-transparent'
                    }`}
                    onClick={(e) => { e.stopPropagation(); setShowQuickMove(false); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <div
                        style={!isSmallScreen && popoverPos ? {
                            position: 'fixed',
                            top: `${popoverPos.top}px`,
                            left: `${popoverPos.left}px`,
                        } : undefined}
                        onClick={e => e.stopPropagation()}
                        onPointerDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                        className={
                            isSmallScreen
                                ? 'w-full bg-surface-elevated border border-border-subtle rounded-t-2xl shadow-2xl p-3 space-y-1 z-[10000] animate-sheetSlideUp'
                                : `w-44 bg-surface-elevated border border-border-subtle rounded-xl shadow-2xl p-1.5 space-y-1 z-[10000] animate-popoverScaleIn ${popoverPos?.isAbove ? 'origin-bottom-right' : 'origin-top-right'}`
                        }
                    >
                        <div className="px-2 py-1 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-subtle flex justify-between items-center">
                            <span>Move to Status</span>
                            <button
                                onClick={() => setShowQuickMove(false)}
                                className="text-muted hover:text-primary p-0.5 rounded transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </div>
                        <div className="py-1 space-y-0.5 max-h-[50vh] sm:max-h-none overflow-y-auto">
                            {['requested', 'invited', 'confirmed', 'completed', 'rejected', 'withdrawn'].map(st => {
                                if (st === status) return null;
                                const stCfg = STATUS_CONFIG[st];
                                if (!stCfg) return null;
                                return (
                                    <button
                                        key={st}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowQuickMove(false);
                                            onMoveStatus?.(enrollment.id, status, st);
                                        }}
                                        className="w-full flex items-center gap-2 px-2.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-surface active:bg-brand-50/10 transition-colors text-left cursor-pointer"
                                    >
                                        <span className={`${stCfg.color} flex items-center`}>{stCfg.icon}</span>
                                        <span>{stCfg.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>,
                document.body
            )}
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

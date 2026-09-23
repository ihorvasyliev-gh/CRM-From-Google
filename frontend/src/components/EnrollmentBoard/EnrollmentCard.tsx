import { useMemo, memo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Star, Timer, Pencil, Send, CheckCircle, GraduationCap, AlertTriangle, Mail, Phone, Award, Info, Clock, MessageSquare, ArrowRightLeft, X } from 'lucide-react';
import { useDraggable, type DraggableAttributes, type DraggableSyntheticListeners } from '@dnd-kit/core';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import type { StudentFlag } from '../../lib/types';
import { getCoursePill } from '../../hooks/useBulkActions';
import { formatDateChoiceList, formatDateLong, formatShortDate, formatShortDateList } from '../../lib/dateUtils';
import { formatPhoneForWhatsApp, formatPhoneForCall } from '../../lib/contactUtils';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import { useIsMobile, useIsSmallScreen } from '../../hooks/useScreenSize';
import { useNowMinute } from '../../hooks/useNow';
import { CustomTooltip } from '../ui/Tooltip';
import { useModalBehavior } from '../../hooks/useModalBehavior';

interface EnrollmentCardProps {
    enrollment: EnrollmentRow;
    status: string;
    isSelected: boolean;
    toggleSelect: (id: string) => void;
    togglePriority: (id: string, current: boolean) => void;
    queuePosition?: number;
    openEditNote: (enrollment: EnrollmentRow) => void;
    onUpdateNote?: (id: string, noteText: string) => Promise<void> | void;
    studentFlags?: StudentFlag[];
    completedCourses?: Array<{id: string, name: string}>;
    onFlagClick?: (enrollment: EnrollmentRow) => void;
    isOverlay?: boolean;
    onShowDetail?: (enrollment: EnrollmentRow) => void;
    onMoveStatus?: (id: string, currentStatus: string, targetStatus: string) => void;
}

/** Props the thin draggable wrapper hands down to the (memoised) card body. */
interface EnrollmentCardBodyProps extends EnrollmentCardProps {
    isMobile: boolean;
    isEditingNote: boolean;
    setIsEditingNote: (editing: boolean) => void;
    dragRef: (element: HTMLElement | null) => void;
    dragAttributes: DraggableAttributes;
    dragListeners: DraggableSyntheticListeners;
    isDragging: boolean;
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

// Shared class strings for the compact card layout
const iconBtnBase = 'w-6 h-6 inline-flex items-center justify-center rounded-md transition-colors';
const iconBtn = `${iconBtnBase} text-muted/60 hover:text-brand-500 hover:bg-surface-elevated`;
const contactBtn = 'w-6 h-6 -my-1 inline-flex items-center justify-center rounded-md transition-colors flex-shrink-0';
const metaChip = 'inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10.5px] leading-none font-medium flex-shrink-0 whitespace-nowrap';

const EnrollmentCardBody = function EnrollmentCardBody({
    enrollment,
    status,
    isSelected,
    toggleSelect,
    togglePriority,
    queuePosition,
    openEditNote,
    onUpdateNote,
    studentFlags = [],
    completedCourses = [],
    onFlagClick,
    isOverlay,
    onShowDetail,
    onMoveStatus,
    isMobile,
    isEditingNote,
    setIsEditingNote,
    dragRef,
    dragAttributes,
    dragListeners,
    isDragging,
}: EnrollmentCardBodyProps) {
    const now = useNowMinute(status === 'invited');
    const isSmallScreen = useIsSmallScreen();
    const [showCompleted, setShowCompleted] = useState(false);
    const [showQuickMove, setShowQuickMove] = useState(false);
    const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; isAbove?: boolean } | null>(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
    const quickMoveBtnRef = useRef<HTMLButtonElement | null>(null);
    const touchStartPos = useRef<{ x: number; y: number } | null>(null);

    useModalBehavior(showCompleted, () => setShowCompleted(false));
    useModalBehavior(showQuickMove, () => setShowQuickMove(false));

    useEffect(() => {
        if (isEditingNote && noteInputRef.current) {
            noteInputRef.current.focus();
            noteInputRef.current.select();
        }
    }, [isEditingNote]);

    const handleStartEditNote = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onUpdateNote) {
            setIsEditingNote(true);
            setNoteDraft(enrollment.notes || '');
        } else {
            openEditNote(enrollment);
        }
    };

    const handleSaveNote = async (e?: React.MouseEvent | React.KeyboardEvent) => {
        if (e) e.stopPropagation();
        if (!onUpdateNote) return;
        setIsSavingNote(true);
        try {
            await onUpdateNote(enrollment.id, noteDraft.trim());
            setIsEditingNote(false);
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleCancelNote = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setIsEditingNote(false);
        setNoteDraft(enrollment.notes || '');
    };

    const handleNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSaveNote();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelNote();
        }
    };

    useEffect(() => {
        if (!showQuickMove) return;
        const handleDismiss = () => {
            if (isSmallScreen) return; // Don't dismiss bottom action sheet on scroll
            setShowQuickMove(false);
        };
        window.addEventListener('scroll', handleDismiss, true);
        window.addEventListener('resize', handleDismiss);
        return () => {
            window.removeEventListener('scroll', handleDismiss, true);
            window.removeEventListener('resize', handleDismiss);
        };
    }, [showQuickMove, isSmallScreen]);

    const cfg = STATUS_CONFIG[status];

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

    const fullName = `${enrollment.students?.first_name || ''} ${enrollment.students?.last_name || ''}`.trim();
    const initials = `${enrollment.students?.first_name?.[0] || ''}${enrollment.students?.last_name?.[0] || ''}`.toUpperCase() || '?';

    // Multi-date invitation: the student has not picked one of the offered dates yet
    const offeredDates = status === 'invited' && enrollment.invited_dates && enrollment.invited_dates.length > 1
        ? enrollment.invited_dates
        : null;

    // Date shown on the card: the one that matters for the current stage; the full history goes in the tooltip
    const stageDate = status === 'completed' && enrollment.completed_date
        ? <><GraduationCap size={10} />{formatShortDate(enrollment.completed_date)}</>
        : status === 'confirmed' && enrollment.confirmed_date
            ? <><CheckCircle size={10} />{formatShortDate(enrollment.confirmed_date)}</>
            : offeredDates
                ? <><Send size={10} />{formatShortDateList(offeredDates)}</>
            : status === 'invited' && enrollment.invited_date
                ? <><Send size={10} />{formatShortDate(enrollment.invited_date)}</>
                : <>{formatShortDate(enrollment.created_at)} · {getRelativeTime(enrollment.created_at).replace(/ ago$/, '')}</>;
    const dateTooltip = [
        `Added ${formatDateLong(enrollment.created_at)} (${getRelativeTime(enrollment.created_at)})`,
        offeredDates
            ? `Invited — student picks one: ${formatDateChoiceList(offeredDates)}`
            : enrollment.invited_date && `Invited ${formatDateLong(enrollment.invited_date)}`,
        enrollment.confirmed_date && `Confirmed ${formatDateLong(enrollment.confirmed_date)}`,
        enrollment.completed_date && `Completed ${formatDateLong(enrollment.completed_date)}`,
    ].filter(Boolean).join('\n');

    return (
        <div
            ref={isOverlay || isMobile ? undefined : dragRef}
            style={style}
            {...(isOverlay || isMobile ? {} : dragAttributes)}
            {...(isOverlay || isMobile ? {} : dragListeners)}
            className={`group relative enrollment-card cv-auto-card flex items-start gap-2.5 p-2 md:p-2.5 rounded-lg md:rounded-xl border ${
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
            {/* Avatar — initials, doubles as the selection checkbox; queue position sits on its corner */}
            <div
                aria-hidden="true"
                className={`relative w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[13px] font-extrabold select-none transition-colors ${
                    isSelected ? 'bg-brand-500 text-white border border-brand-500' : cfg.pillBg
                }`}
            >
                {isSelected ? (
                    <Check size={16} strokeWidth={3} />
                ) : (
                    <>
                        <span className="group-hover:opacity-0 transition-opacity">{initials}</span>
                        <span className="absolute inset-0 m-auto w-4 h-4 rounded border-2 border-current opacity-0 group-hover:opacity-60 transition-opacity" />
                    </>
                )}
                {status === 'requested' && queuePosition !== undefined && (
                    <span
                        title="Position in queue for this course"
                        className="card-pill absolute -bottom-1.5 -right-2 px-1 min-w-[18px] h-[15px] inline-flex items-center justify-center text-[9.5px] leading-none font-extrabold font-mono rounded-md border-2 border-surface bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                    >
                        #{queuePosition}
                    </span>
                )}
            </div>

            <div className="flex-1 min-w-0">
                {/* Row 1: Name, timer & actions */}
                <div className="flex items-center gap-1 min-w-0">
                    <p className="card-title min-w-0 flex-1 font-bold text-primary text-[13px] md:text-sm leading-tight truncate" title={fullName}>
                        {fullName}
                    </p>

                    {/* Invitation Timer */}
                    {status === 'invited' && enrollment.invited_at && (() => {
                        const days = enrollment.response_days ?? 7;
                        const deadline = new Date(enrollment.invited_at).getTime() + days * 24 * 60 * 60 * 1000;
                        const remaining = deadline - now;

                        if (remaining <= 0) {
                            const invitedDate = new Date(enrollment.invited_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
                            return (
                                <span className={`${metaChip} bg-red-500/10 text-red-600 dark:text-red-400 font-bold animate-pulse-timer`} title={`Expired (${days}-day deadline) • Invited on ${invitedDate}`}>
                                    <Timer size={10} strokeWidth={2.5} />
                                    Expired
                                </span>
                            );
                        }

                        const daysLeft = Math.floor(remaining / (24 * 60 * 60 * 1000));
                        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                        const timerText = daysLeft > 0 ? `${daysLeft}d ${hours}h` : `${hours}h`;
                        return (
                            <span
                                className={`${metaChip} ${timerLevel === 'urgent'
                                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 animate-pulse-timer'
                                    : 'bg-info/10 text-status-invited'
                                }`}
                                title={`${timerText} remaining (${days}-day deadline)`}
                            >
                                <Timer size={10} />
                                {timerText}
                            </span>
                        );
                    })()}

                    <div className="card-actions-col flex items-center flex-shrink-0 -my-1 -mr-1">
                        {/* Secondary actions — revealed on hover (always visible on touch screens) */}
                        <div className="flex items-center lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity">
                            {!enrollment.notes && (
                                <CustomTooltip content="Add note">
                                    <button aria-label="Add Note" onClick={handleStartEditNote} className={iconBtn}>
                                        <Pencil size={13} />
                                    </button>
                                </CustomTooltip>
                            )}

                            {onMoveStatus && (
                                <CustomTooltip content="Move status">
                                    <button
                                        ref={quickMoveBtnRef}
                                        aria-label="Move status"
                                        onClick={handleOpenQuickMove}
                                        className={showQuickMove
                                            ? `${iconBtnBase} text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10`
                                            : iconBtn}
                                    >
                                        <ArrowRightLeft size={13} />
                                    </button>
                                </CustomTooltip>
                            )}

                            <CustomTooltip content="View student details">
                                <button
                                    aria-label="View Student Details"
                                    onClick={e => { e.stopPropagation(); onShowDetail?.(enrollment); }}
                                    className={iconBtn}
                                >
                                    <Info size={13} />
                                </button>
                            </CustomTooltip>

                            {studentFlags.length === 0 && (
                                <CustomTooltip content="Flag student (e.g. failed a course)">
                                    <button
                                        aria-label="Flag student"
                                        onClick={e => { e.stopPropagation(); onFlagClick?.(enrollment); }}
                                        className={`${iconBtnBase} text-muted/60 hover:text-orange-500 hover:bg-surface-elevated`}
                                    >
                                        <AlertTriangle size={13} />
                                    </button>
                                </CustomTooltip>
                            )}
                        </div>

                        {/* ⚠ Student Flags — always visible when set */}
                        {studentFlags.length > 0 && (
                            <CustomTooltip content={`⚠ Didn't pass:\n${studentFlags.map(f => `${f.courses?.name || 'Unknown'}${f.comment ? ` — ${f.comment}` : ''}`).join('\n')}`}>
                                <button
                                    aria-label="Student flags"
                                    onClick={e => { e.stopPropagation(); onFlagClick?.(enrollment); }}
                                    className={`${iconBtnBase} text-orange-500 hover:text-orange-600 hover:bg-orange-500/10`}
                                >
                                    <AlertTriangle size={13} strokeWidth={2.5} />
                                </button>
                            </CustomTooltip>
                        )}

                        {/* Star Priority — always visible when set */}
                        <CustomTooltip content={enrollment.is_priority ? "Remove priority" : "Mark as priority"}>
                            <button
                                aria-label={enrollment.is_priority ? "Remove priority" : "Mark as priority"}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    togglePriority(enrollment.id, !!enrollment.is_priority);
                                }}
                                className={`${iconBtnBase} ${enrollment.is_priority
                                    ? 'text-warning hover:bg-warning/10'
                                    : 'text-muted/60 hover:text-warning hover:bg-surface-elevated lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100'
                                }`}
                            >
                                <Star size={13} fill={enrollment.is_priority ? "currentColor" : "none"} />
                            </button>
                        </CustomTooltip>
                    </div>
                </div>

                {/* Row 2: Course (coloured text) & completed-courses badge */}
                <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                    <span
                        title={getCoursePill(enrollment)}
                        className={`min-w-0 truncate text-[11.5px] font-semibold ${cfg.color}`}
                    >
                        {getCoursePill(enrollment)}
                    </span>
                    {completedCourses.length > 0 && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowCompleted(true); }}
                            title={`Completed ${completedCourses.length} course${completedCourses.length > 1 ? 's' : ''}. Click to view.`}
                            className="card-pill inline-flex items-center gap-0.5 h-[18px] px-1.5 text-[10.5px] leading-none font-bold rounded-md text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer flex-shrink-0 transition-colors"
                        >
                            <Award size={10} strokeWidth={2.5} className="flex-shrink-0" />
                            {completedCourses.length}
                        </button>
                    )}
                </div>

                {/* Row 3: Contacts & date */}
                <div className="card-contact mt-1.5 flex items-center gap-0.5 text-xs min-w-0">
                    {enrollment.students?.phone && (() => {
                        const waUrl = formatPhoneForWhatsApp(enrollment.students.phone);
                        const telUrl = formatPhoneForCall(enrollment.students.phone);
                        return (
                            <>
                                {telUrl ? (
                                    <a
                                        href={telUrl}
                                        onClick={e => e.stopPropagation()}
                                        onPointerDown={e => e.stopPropagation()}
                                        onTouchStart={e => e.stopPropagation()}
                                        className="flex items-center gap-1 font-medium tabular-nums text-primary hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors flex-shrink-0 mr-1"
                                        title="Click to call"
                                    >
                                        <Phone size={11} className="flex-shrink-0 text-primary/50" />
                                        <span>{enrollment.students.phone}</span>
                                    </a>
                                ) : (
                                    <span className="flex items-center gap-1 tabular-nums text-primary flex-shrink-0 mr-1">
                                        <Phone size={11} className="flex-shrink-0 text-primary/50" />
                                        {enrollment.students.phone}
                                    </span>
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
                                            className={`${contactBtn} text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15`}
                                            aria-label="Chat on WhatsApp"
                                        >
                                            <MessageSquare size={13} />
                                        </a>
                                    </CustomTooltip>
                                )}
                            </>
                        );
                    })()}

                    {enrollment.students?.email && (
                        <CustomTooltip content={enrollment.students.email}>
                            <a
                                href={`mailto:${enrollment.students.email}`}
                                onClick={e => e.stopPropagation()}
                                onPointerDown={e => e.stopPropagation()}
                                onTouchStart={e => e.stopPropagation()}
                                className={`${contactBtn} text-primary/60 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-surface-elevated`}
                                aria-label={`Send email to ${enrollment.students.email}`}
                            >
                                <Mail size={13} />
                            </a>
                        </CustomTooltip>
                    )}

                    {/* Stage date — the most relevant date for the current status; all dates in the tooltip */}
                    <CustomTooltip content={dateTooltip}>
                        <span className="card-info ml-auto text-[11px] text-primary/50 whitespace-nowrap tabular-nums flex-shrink-0 flex items-center gap-1">
                            {stageDate}
                        </span>
                    </CustomTooltip>
                </div>

                {/* Row 4: Note (only when present) — one line; hover shows the whole text */}
                {enrollment.notes && !isEditingNote && (
                    <CustomTooltip content={<><span className="italic">{enrollment.notes}</span>{'\n'}<span className="text-[10px] text-primary/50">Click to edit</span></>}>
                        <button
                            onClick={handleStartEditNote}
                            className="card-note mt-1.5 w-full flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-0.5 rounded italic transition-colors text-left cursor-pointer min-w-0"
                        >
                            <Pencil size={10} className="flex-shrink-0 text-amber-600 dark:text-amber-400" />
                            <span className="truncate">{enrollment.notes}</span>
                        </button>
                    </CustomTooltip>
                )}

            {/* Inline Quick Note Editor */}
            {isEditingNote && (
                <div
                    className="mt-2 p-2.5 rounded-xl bg-surface-elevated border border-amber-500/40 shadow-card animate-fadeIn cursor-default select-text"
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Pencil size={10} /> Quick Note
                        </span>
                        <span className="text-[9px] text-muted font-mono">↵ Save · Esc Cancel</span>
                    </div>
                    <textarea
                        ref={noteInputRef}
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        onKeyDown={handleNoteKeyDown}
                        placeholder="Add quick note for this student..."
                        rows={2}
                        className="w-full text-xs p-2 bg-background border border-border-subtle rounded-lg text-primary placeholder:text-muted focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none font-sans"
                    />
                    <div className="flex items-center justify-end gap-1.5 mt-2">
                        <button
                            type="button"
                            onClick={handleCancelNote}
                            disabled={isSavingNote}
                            className="px-2.5 py-1 text-[11px] font-medium text-muted hover:text-primary rounded-lg hover:bg-surface transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSaveNote()}
                            disabled={isSavingNote}
                            className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold text-white bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 rounded-lg shadow-xs transition-colors cursor-pointer"
                        >
                            <Check size={12} />
                            Save
                        </button>
                    </div>
                </div>
            )}

            {/* Pending Completion Approval Highlight */}
            {enrollment.completion_request_status === 'pending' && (
                <div className="mt-1.5 flex items-center gap-1.5 px-1.5 py-1 bg-amber-500/15 border border-amber-500/30 rounded-md text-amber-700 dark:text-amber-300 text-[10px] md:text-[11px] font-semibold animate-pulse shadow-2xs">
                    <Clock size={11} className="flex-shrink-0" />
                    <span className="truncate">
                        Completion requested for <strong>{formatDateLong(enrollment.pending_completion_date)}</strong>
                        {enrollment.completion_requested_by ? ` (${enrollment.completion_requested_by})` : ''}
                    </span>
                </div>
            )}

            </div>

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

            {/* Quick Move Dropdown / Mobile Action Sheet rendered in Portal */}
            {showQuickMove && createPortal(
                isSmallScreen ? (
                    <div
                        className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 animate-fadeIn"
                        onClick={(e) => { e.stopPropagation(); setShowQuickMove(false); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            onPointerDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            className="w-full max-w-lg bg-surface-elevated border-t border-border-subtle rounded-t-3xl shadow-2xl p-4 pb-6 space-y-3 z-[10000] animate-sheetSlideUp max-h-[85vh] flex flex-col"
                        >
                            {/* Drag Handle Bar */}
                            <div className="w-12 h-1.5 bg-muted/30 rounded-full mx-auto cursor-pointer" onClick={() => setShowQuickMove(false)} />

                            {/* Sheet Header */}
                            <div className="flex items-center justify-between px-1 pb-2 border-b border-border-subtle">
                                <div>
                                    <h3 className="text-sm font-bold text-primary">Move to Status</h3>
                                    <p className="text-xs text-muted truncate max-w-[260px]">
                                        {enrollment.students?.first_name} {enrollment.students?.last_name} • Current: <span className="font-semibold text-primary">{cfg.label}</span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowQuickMove(false)}
                                    className="p-1.5 rounded-full text-muted hover:text-primary hover:bg-surface transition-colors"
                                    aria-label="Close"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Status Option Buttons */}
                            <div className="py-1 space-y-2 overflow-y-auto flex-1">
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
                                            className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border border-border-subtle text-sm font-semibold transition-all active:scale-[0.98] ${stCfg.bg} ${stCfg.color} hover:shadow-xs text-left cursor-pointer min-h-[48px]`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <span className="p-1.5 rounded-lg bg-white/20 dark:bg-black/20 flex-shrink-0">
                                                    {stCfg.icon}
                                                </span>
                                                <span>{stCfg.label}</span>
                                            </div>
                                            <span className="text-xs font-normal opacity-70">Tap to move</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Cancel Button */}
                            <button
                                type="button"
                                onClick={() => setShowQuickMove(false)}
                                className="w-full py-3 text-sm font-bold text-muted hover:text-primary bg-surface border border-border-strong rounded-xl transition-all active:scale-[0.98] mt-2"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    popoverPos && (
                        <div
                            className="fixed inset-0 z-[9999] bg-transparent"
                            onClick={(e) => { e.stopPropagation(); setShowQuickMove(false); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                        >
                            <div
                                style={{
                                    position: 'fixed',
                                    top: `${popoverPos.top}px`,
                                    left: `${popoverPos.left}px`,
                                }}
                                onClick={e => e.stopPropagation()}
                                onPointerDown={e => e.stopPropagation()}
                                className={`w-44 bg-surface-elevated border border-border-subtle rounded-xl shadow-2xl p-1.5 space-y-1 z-[10000] animate-popoverScaleIn ${popoverPos?.isAbove ? 'origin-bottom-right' : 'origin-top-right'}`}
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
                                <div className="py-1 space-y-0.5 overflow-y-auto">
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
                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-surface active:bg-brand-50/10 transition-colors text-left cursor-pointer"
                                            >
                                                <span className={`${stCfg.color} flex items-center`}>{stCfg.icon}</span>
                                                <span>{stCfg.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )
                ),
                document.body
            )}
        </div>
    );
};

const sameCardData = (prev: EnrollmentCardProps, next: EnrollmentCardProps) =>
    prev.enrollment === next.enrollment &&
    prev.status === next.status &&
    prev.isSelected === next.isSelected &&
    prev.queuePosition === next.queuePosition &&
    prev.isOverlay === next.isOverlay &&
    prev.onUpdateNote === next.onUpdateNote &&
    (prev.studentFlags?.length || 0) === (next.studentFlags?.length || 0) &&
    (prev.completedCourses?.length || 0) === (next.completedCourses?.length || 0);

const MemoCardBody = memo(EnrollmentCardBody, (prev, next) =>
    sameCardData(prev, next) &&
    prev.isMobile === next.isMobile &&
    prev.isEditingNote === next.isEditingNote &&
    prev.isDragging === next.isDragging &&
    prev.dragRef === next.dragRef &&
    prev.dragAttributes === next.dragAttributes &&
    prev.dragListeners === next.dragListeners
);

/**
 * Thin wrapper that owns the dnd-kit subscription. `useDraggable` re-renders every card whenever
 * the drag context changes (drag start, hovering a new column, drop) — and the dragged card on every
 * pointer move — bypassing `memo`. Keeping that here means only this few-line component re-renders;
 * the heavy card body is skipped unless its own data or drag state actually changed.
 */
function EnrollmentCard(props: EnrollmentCardProps) {
    const isMobile = useIsMobile();
    const [isEditingNote, setIsEditingNote] = useState(false);
    const draggableData = useMemo(() => ({ status: props.status }), [props.status]);

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: props.enrollment.id,
        data: draggableData,
        disabled: props.isOverlay || isMobile || isEditingNote
    });

    return (
        <MemoCardBody
            {...props}
            isMobile={isMobile}
            isEditingNote={isEditingNote}
            setIsEditingNote={setIsEditingNote}
            dragRef={setNodeRef}
            dragAttributes={attributes}
            dragListeners={listeners}
            isDragging={isDragging}
        />
    );
}

export default memo(EnrollmentCard, sameCardData);

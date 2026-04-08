import { useState, useEffect } from 'react';
import { Check, Star, Timer, Pencil, Send, CheckCircle, GraduationCap, AlertTriangle, Mail, Phone } from 'lucide-react';
import { CustomTooltip } from '../ui/Tooltip';
import { useDraggable } from '@dnd-kit/core';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import type { StudentFlag } from '../../lib/types';
import { getCoursePill } from '../../hooks/useBulkActions';
import { formatShortDate, formatDateLong } from '../../lib/dateUtils';
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
    onFlagClick?: (enrollment: EnrollmentRow) => void;
    isOverlay?: boolean;
}

export default function EnrollmentCard({
    enrollment,
    status,
    isSelected,
    toggleSelect,
    togglePriority,
    queuePosition,
    openEditNote,
    studentFlags = [],
    onFlagClick,
    isOverlay
}: EnrollmentCardProps) {
    const cfg = STATUS_CONFIG[status];
    const [now, setNow] = useState(() => Date.now());

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: enrollment.id,
        data: { status },
        disabled: isOverlay
    });

    const style = {
        opacity: isDragging && !isOverlay ? 0.3 : 1,
    };

    useEffect(() => {
        if (status === 'invited') {
            const interval = setInterval(() => setNow(Date.now()), 60000);
            return () => clearInterval(interval);
        }
    }, [status]);

    return (
        <div
            ref={isOverlay ? undefined : setNodeRef}
            style={style}
            {...(isOverlay ? {} : attributes)}
            {...(isOverlay ? {} : listeners)}
            className={`group relative p-3 rounded-xl border transition-all ${isOverlay ? 'cursor-grabbing shadow-2xl ring-2 ring-brand-500 scale-[1.02] bg-surface z-[100] rotate-2' : 'cursor-pointer'} ${isSelected
                ? 'border-brand-400 bg-brand-500/5 shadow-sm ring-1 ring-brand-500/20'
                : 'border-border-strong bg-surface-elevated hover:shadow-card hover:border-brand-500/30'
                }`}
            onClick={() => toggleSelect(enrollment.id)}
        >
            <div className="flex items-start gap-3">
                {/* Left Actions Column */}
                <div className="flex flex-col items-center gap-2 mt-0.5">
                    {/* Checkbox */}
                    <div
                        className={`w-[16px] h-[16px] rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${isSelected
                            ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                            : 'border-border-strong group-hover:border-brand-500/50 bg-background'
                            }`}
                    >
                        {isSelected && <Check size={10} strokeWidth={3} />}
                    </div>

                    {/* Star Priority */}
                    <CustomTooltip content={enrollment.is_priority ? "Remove priority" : "Mark as priority"} side="right">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                togglePriority(enrollment.id, !!enrollment.is_priority);
                            }}
                            className={`p-0.5 rounded transition-all flex-shrink-0 ${enrollment.is_priority
                                ? 'text-warning hover:text-warning/80 drop-shadow-sm'
                                : 'text-muted/40 hover:text-warning/60'
                                }`}
                        >
                            <Star size={16} fill={enrollment.is_priority ? "currentColor" : "none"} />
                        </button>
                    </CustomTooltip>

                    {/* Queue Number */}
                    {status === 'requested' && queuePosition !== undefined && (
                        <div className="flex-shrink-0 mt-0.5">
                            <CustomTooltip content="Position in queue for this course" side="right">
                                <span
                                    className="inline-flex items-center justify-center bg-violet-500 text-white font-mono text-[11px] font-bold rounded-md px-1.5 h-[20px] shadow-sm ring-1 ring-violet-600/20 group-hover:ring-violet-500/50 transition-colors"
                                >
                                    #{queuePosition}
                                </span>
                            </CustomTooltip>
                        </div>
                    )}

                    {/* Invitation Timer */}
                    {status === 'invited' && (() => {
                        const invitedAt = enrollment.invited_at;
                        if (!invitedAt) return null;
                        const deadline = new Date(invitedAt).getTime() + 7 * 24 * 60 * 60 * 1000;
                        const remaining = deadline - now;
                        const isExpired = remaining <= 0;

                        if (isExpired) {
                            const invitedDate = new Date(invitedAt).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
                            return (
                                <CustomTooltip content={`Expired • Invited on ${invitedDate}`} side="right">
                                    <div className="flex-shrink-0 mt-0.5">
                                        <Timer size={16} className="text-red-400 drop-shadow-sm" />
                                    </div>
                                </CustomTooltip>
                            );
                        }

                        const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
                        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                        const timerText = days > 0 ? `${days}d ${hours}h remaining` : `${hours}h remaining`;
                        return (
                            <CustomTooltip content={timerText} side="right">
                                <div className="flex-shrink-0 mt-0.5">
                                    <Timer size={16} className="text-muted-strong drop-shadow-sm" />
                                </div>
                            </CustomTooltip>
                        );
                    })()}
                </div>

                <div className="flex-1 min-w-0">
                    {/* Name + Actions */}
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col items-start min-w-0 flex-1 pr-2">
                            <p className="font-semibold text-primary text-[13px] truncate leading-5 tracking-tight w-full">
                                {enrollment.students?.first_name} {enrollment.students?.last_name}
                            </p>
                            {/* Course pill */}
                            <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 max-w-full truncate ${cfg.pillBg}`}>
                                {getCoursePill(enrollment)}
                            </span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                            {/* ✏ Edit Note */}
                            <CustomTooltip content="Edit Note" side="top">
                                <button
                                    onClick={e => { e.stopPropagation(); openEditNote(enrollment); }}
                                    className={`p-1 rounded-md transition-all ${enrollment.notes
                                        ? 'text-brand-500 hover:bg-brand-500/10'
                                        : 'text-muted/40 hover:text-muted hover:bg-surface'
                                        }`}
                                >
                                    <Pencil size={14} />
                                </button>
                            </CustomTooltip>

                            {/* ⚠ Student Flags */}
                            {studentFlags.length > 0 ? (
                                <CustomTooltip
                                    content={
                                        <div className="max-w-[260px]">
                                            <p className="font-semibold text-orange-400 mb-1">⚠ Didn't pass:</p>
                                            {studentFlags.map(flag => (
                                                <div key={flag.id} className="text-[11px] mb-0.5">
                                                    <span className="font-medium text-primary">{flag.courses?.name || 'Unknown'}</span>
                                                    {flag.comment && (
                                                        <span className="text-muted"> — {flag.comment}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    }
                                    side="top"
                                >
                                    <button
                                        onClick={e => { e.stopPropagation(); onFlagClick?.(enrollment); }}
                                        className="p-1 rounded-md transition-all text-orange-400 hover:bg-orange-500/10 animate-pulse"
                                    >
                                        <AlertTriangle size={14} />
                                    </button>
                                </CustomTooltip>
                            ) : (
                                <CustomTooltip content="Flag student (e.g. failed a course)" side="top">
                                    <button
                                        onClick={e => { e.stopPropagation(); onFlagClick?.(enrollment); }}
                                        className="p-1 rounded-md transition-all text-muted/40 hover:text-orange-400 hover:bg-orange-50"
                                    >
                                        <AlertTriangle size={14} />
                                    </button>
                                </CustomTooltip>
                            )}
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="mt-2 flex flex-col gap-1 text-[11px] text-muted">
                        {enrollment.students?.email && (
                            <div className="flex items-center gap-1.5 truncate">
                                <Mail size={12} className="flex-shrink-0 text-muted/60" />
                                <span className="truncate">{enrollment.students.email}</span>
                            </div>
                        )}
                        {enrollment.students?.phone && (
                            <div className="flex items-center gap-1.5 truncate">
                                <Phone size={12} className="flex-shrink-0 text-muted/60" />
                                <span className="truncate">{enrollment.students.phone}</span>
                            </div>
                        )}
                    </div>

                    {/* Info row */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[11px] text-muted">
                        <span>{formatDateLong(enrollment.created_at)}</span>
                        {enrollment.invited_date && enrollment.status !== 'completed' && (
                            <>
                                <span>•</span>
                                <span className="text-blue-600 font-medium flex items-center gap-0.5">
                                    <Send size={10} />
                                    {formatDateLong(enrollment.invited_date)}
                                </span>
                            </>
                        )}
                        {enrollment.confirmed_date && enrollment.status !== 'completed' && (
                            <>
                                <span>•</span>
                                <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                                    <CheckCircle size={10} />
                                    {formatDateLong(enrollment.confirmed_date)}
                                </span>
                            </>
                        )}
                        {enrollment.completed_date && enrollment.status === 'completed' && (
                            <>
                                <span>•</span>
                                <span className="text-brand-500 font-medium flex items-center gap-0.5">
                                    <GraduationCap size={10} />
                                    {formatDateLong(enrollment.completed_date)}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Notes */}
                    {enrollment.notes && (
                        <p className="text-[11px] text-muted italic mt-1 bg-surface px-2 py-1 rounded-md truncate">
                            📝 {enrollment.notes}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

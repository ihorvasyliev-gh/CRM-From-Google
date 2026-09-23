import React, { useState, useEffect } from 'react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useRequestCompletion } from '../hooks/useApprovals';
import { cleanVariant, getAvatarGradient } from '../lib/types';
import { formatDateDMY, todayISO } from '../lib/dateUtils';
import {
    formatPhoneForWhatsApp,
    formatPhoneForCall,
    formatGoogleMapsUrl,
    formatStudentContactSummary
} from '../lib/contactUtils';
import Toast, { ToastData } from './Toast';
import {
    X, Mail, Phone, MapPin, Calendar, Clock, Send,
    CheckCircle, GraduationCap, XCircle, AlertTriangle,
    MessageSquare, Star, Copy, Navigation, Loader2
} from 'lucide-react';

export interface EnrollmentDetail {
    id: string;
    status: string;
    course_variant: string | null;
    created_at: string;
    invited_at: string | null;
    invited_date: string | null;
    confirmed_at: string | null;
    confirmed_date: string | null;
    completed_at: string | null;
    completed_date: string | null;
    pending_completion_date?: string | null;
    completion_request_status?: 'none' | 'pending' | 'approved' | 'rejected' | null;
    completion_requested_at?: string | null;
    completion_requested_by?: string | null;
    completion_rejection_reason?: string | null;
    course_id: string;
    course_name: string;
    queue_position: number | null;
    notes: string | null;
    is_priority: boolean;
}

export interface StudentFlag {
    id: string;
    course_id: string;
    course_name: string;
    comment: string | null;
    created_at: string;
}

export interface StudentDetailData {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    address: string | null;
    eircode: string | null;
    dob: string | null;
    created_at: string;
    enrollments: EnrollmentDetail[];
    flags: StudentFlag[];
}

export interface StudentDetailDrawerProps {
    studentId: string | null;
    onClose: () => void;
}

const STATUS_BADGE: Record<string, { icon: React.ReactElement; className: string; label: string }> = {
    requested: {
        icon: <Clock size={12} />,
        className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
        label: 'Requested'
    },
    invited: {
        icon: <Send size={12} />,
        className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
        label: 'Invited'
    },
    confirmed: {
        icon: <CheckCircle size={12} />,
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
        label: 'Confirmed'
    },
    rejected: {
        icon: <XCircle size={12} />,
        className: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
        label: 'Rejected'
    },
    completed: {
        icon: <GraduationCap size={12} />,
        className: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20',
        label: 'Completed'
    },
    withdrawn: {
        icon: <XCircle size={12} />,
        className: 'bg-muted/10 text-muted border-border-subtle',
        label: 'Withdrawn'
    },
};

function InfoField({
    icon,
    label,
    value,
    copyValue,
    onCopy,
    extraActions
}: {
    icon: React.ReactElement;
    label: string;
    value: string | null;
    copyValue?: string | null;
    onCopy?: (value: string, label: string) => void;
    extraActions?: React.ReactNode;
}) {
    const isClickable = !!(copyValue ?? value) && !!onCopy;
    return (
        <div
            onClick={() => {
                if (isClickable && onCopy) {
                    onCopy(copyValue ?? value!, label);
                }
            }}
            className={`flex items-center gap-3 p-3 rounded-xl bg-surface-elevated/60 border border-border-subtle shadow-sm transition-all group ${
                isClickable
                    ? 'cursor-pointer hover:border-brand-500/40 hover:bg-brand-50/10 dark:hover:bg-brand-500/5 hover:shadow-sm'
                    : ''
            }`}
            title={isClickable ? `Click to copy ${label} to clipboard` : undefined}
        >
            <span className="text-muted flex-shrink-0 group-hover:text-brand-500 transition-colors">{icon}</span>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider">{label}</p>
                <p className="text-sm text-primary font-medium truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {value || <span className="text-muted/50 italic font-normal">Not set</span>}
                </p>
            </div>
            {extraActions && (
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {extraActions}
                </div>
            )}
            {isClickable && (
                <span className="text-muted/30 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors flex-shrink-0">
                    <Copy size={13} />
                </span>
            )}
        </div>
    );
}

export default function StudentDetailDrawer({ studentId, onClose }: StudentDetailDrawerProps) {
    const [toast, setToast] = useState<ToastData | null>(null);
    const [completionModalOpen, setCompletionModalOpen] = useState(false);
    const [targetEnrollment, setTargetEnrollment] = useState<EnrollmentDetail | null>(null);
    const [selectedCompletionDate, setSelectedCompletionDate] = useState<string>(() => todayISO());

    const requestCompletionMutation = useRequestCompletion();

    // Register in the shared modal stack (suppresses page hotkeys behind the drawer, restores focus).
    // Escape itself is handled below so the inner completion modal closes first.
    useModalBehavior(true, onClose, { closeOnEscape: false });

    // Keyboard listener for Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if something on top (command palette, inline editor) already handled it
            if (e.key === 'Escape' && !e.defaultPrevented) {
                if (completionModalOpen) {
                    setCompletionModalOpen(false);
                    setTargetEnrollment(null);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, completionModalOpen]);

    // Query for student details
    const {
        data: studentDetail,
        isLoading,
        error: detailError,
        refetch
    } = useQuery<StudentDetailData | null>({
        queryKey: ['restricted_student_detail', studentId],
        queryFn: async () => {
            if (!studentId) return null;
            const { data, error } = await supabase.rpc('get_student_detail_restricted', {
                p_student_id: studentId
            });
            if (error) throw error;
            return data;
        },
        enabled: !!studentId
    });

    if (!studentId) {
        return null;
    }

    const handleCopyField = (value: string | null | undefined, label: string) => {
        if (!value) return;
        navigator.clipboard.writeText(value)
            .then(() => {
                setToast({
                    message: `${label} copied to clipboard!`,
                    type: 'success',
                });
            })
            .catch((err) => {
                console.error('Failed to copy text:', err);
                setToast({
                    message: `Failed to copy ${label.toLowerCase()}`,
                    type: 'error',
                });
            });
    };

    const handleCopySummary = () => {
        if (!studentDetail) return;
        const summary = formatStudentContactSummary(studentDetail);
        navigator.clipboard.writeText(summary)
            .then(() => {
                setToast({
                    message: 'Contact summary copied to clipboard!',
                    type: 'success',
                });
            })
            .catch((err) => {
                console.error('Failed to copy contact summary:', err);
                setToast({
                    message: 'Failed to copy contact summary',
                    type: 'error',
                });
            });
    };

    const initials = studentDetail
        ? `${(studentDetail.first_name?.[0] || '').toUpperCase()}${(studentDetail.last_name?.[0] || '').toUpperCase()}`
        : '';

    return (
        <div className="fixed inset-0 z-50 overflow-hidden animate-fadeIn">
            {/* Backdrop overlay */}
            <div
                data-testid="drawer-backdrop"
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Slide-over drawer */}
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-surface border-l border-border-subtle shadow-2xl flex flex-col transform transition-transform duration-300 animate-slideInRight">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border-subtle px-6 py-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        {studentDetail && (
                            <div className={`w-11 h-11 bg-gradient-to-br ${getAvatarGradient(studentDetail.id)} rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-border-subtle shadow-md flex-shrink-0`}>
                                {initials}
                            </div>
                        )}
                        <div className="min-w-0">
                            {studentDetail ? (
                                <>
                                    <h2
                                        onClick={() => handleCopyField(`${studentDetail.first_name} ${studentDetail.last_name}`, 'Name')}
                                        className="font-bold text-primary text-base leading-tight truncate cursor-pointer hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
                                        title="Click to copy name to clipboard"
                                    >
                                        {studentDetail.first_name} {studentDetail.last_name}
                                    </h2>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-muted font-semibold">
                                            Registered {formatDateDMY(studentDetail.created_at)}
                                        </span>
                                        <span className="text-[9px] text-muted font-bold uppercase tracking-wider bg-brand-500/10 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded">
                                            Viewer Portal
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <div className="h-6 w-32 bg-surface-elevated rounded animate-pulse" />
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {studentDetail && (
                            <button
                                onClick={handleCopySummary}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-primary/80 hover:text-primary bg-surface-elevated hover:bg-surface border border-border-subtle hover:border-border-strong rounded-xl transition-all shadow-sm active:scale-95"
                                title="Copy contact summary"
                            >
                                <Copy size={13} className="text-brand-500" />
                                <span className="hidden sm:inline">Copy Card</span>
                            </button>
                        )}
                        <button
                            aria-label="Close drawer"
                            onClick={onClose}
                            className="p-2 text-muted hover:text-primary hover:bg-surface-elevated rounded-xl transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Drawer Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted">
                            <Loader2 size={32} className="animate-spin text-brand-500" />
                            <span className="text-sm font-semibold">Loading student record...</span>
                        </div>
                    ) : detailError || !studentDetail ? (
                        <div className="text-center py-16 px-4 bg-red-500/5 rounded-2xl border border-red-500/15">
                            <XCircle className="text-red-500 mx-auto mb-2" size={36} />
                            <h3 className="font-bold text-primary text-sm">Failed to load student record</h3>
                            <p className="text-xs text-muted mt-1">Please try again or contact your administrator.</p>
                            <button
                                onClick={() => refetch()}
                                className="mt-4 px-3 py-1.5 bg-surface border border-border-subtle rounded-xl text-xs font-semibold hover:bg-surface-elevated"
                            >
                                Retry
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Quick Contacts Section */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Quick Contacts</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <InfoField
                                        icon={<Mail size={15} />}
                                        label="Email"
                                        value={studentDetail.email}
                                        onCopy={handleCopyField}
                                    />
                                    <InfoField
                                        icon={<Phone size={15} />}
                                        label="Phone"
                                        value={studentDetail.phone}
                                        onCopy={handleCopyField}
                                        extraActions={
                                            studentDetail.phone ? (
                                                <div className="flex items-center gap-1">
                                                    {formatPhoneForWhatsApp(studentDetail.phone) && (
                                                        <a
                                                            href={formatPhoneForWhatsApp(studentDetail.phone)!}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center justify-center w-7 h-7 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/25 rounded-lg shadow-sm transition-all active:scale-95"
                                                            title="WhatsApp"
                                                        >
                                                            <MessageSquare size={13} />
                                                        </a>
                                                    )}
                                                    {formatPhoneForCall(studentDetail.phone) && (
                                                        <a
                                                            href={formatPhoneForCall(studentDetail.phone)!}
                                                            className="flex items-center justify-center w-7 h-7 text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 active:bg-blue-500/30 border border-blue-500/25 rounded-lg shadow-sm transition-all active:scale-95"
                                                            title="Call"
                                                        >
                                                            <Phone size={13} />
                                                        </a>
                                                    )}
                                                </div>
                                            ) : undefined
                                        }
                                    />
                                    <InfoField
                                        icon={<MapPin size={15} />}
                                        label="Address"
                                        value={studentDetail.address}
                                        onCopy={handleCopyField}
                                        extraActions={
                                            studentDetail.address && formatGoogleMapsUrl(studentDetail.address) ? (
                                                <a
                                                    href={formatGoogleMapsUrl(studentDetail.address)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all"
                                                    title="Open in Google Maps"
                                                >
                                                    <Navigation size={13} />
                                                </a>
                                            ) : undefined
                                        }
                                    />
                                    <InfoField
                                        icon={<MapPin size={15} />}
                                        label="Eircode"
                                        value={studentDetail.eircode}
                                        onCopy={handleCopyField}
                                        extraActions={
                                            studentDetail.eircode && formatGoogleMapsUrl(studentDetail.eircode) ? (
                                                <a
                                                    href={formatGoogleMapsUrl(studentDetail.eircode)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all"
                                                    title="Open in Google Maps"
                                                >
                                                    <Navigation size={13} />
                                                </a>
                                            ) : undefined
                                        }
                                    />
                                    {studentDetail.dob && (
                                        <div className="sm:col-span-2">
                                            <InfoField
                                                icon={<Calendar size={15} />}
                                                label="Date of Birth"
                                                value={formatDateDMY(studentDetail.dob)}
                                                copyValue={formatDateDMY(studentDetail.dob)}
                                                onCopy={handleCopyField}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Notes & Flags Section */}
                            {studentDetail.flags && studentDetail.flags.length > 0 && (
                                <div className="space-y-2.5">
                                    <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <AlertTriangle size={13} />
                                        Notes & Flags ({studentDetail.flags.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {studentDetail.flags.map(flag => (
                                            <div
                                                key={flag.id}
                                                className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 flex items-start gap-3"
                                            >
                                                <div className="flex-shrink-0 w-7 h-7 bg-red-500/10 rounded-lg flex items-center justify-center mt-0.5">
                                                    <XCircle size={15} className="text-red-500" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-xs font-bold text-red-700 dark:text-red-400 truncate">
                                                            {flag.course_name}
                                                        </p>
                                                        {flag.created_at && (
                                                            <span className="text-[10px] text-muted flex-shrink-0">
                                                                {formatDateDMY(flag.created_at)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {flag.comment && (
                                                        <p className="text-xs text-red-600/90 dark:text-red-300/80 mt-1 leading-relaxed">
                                                            {flag.comment}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Enrollments Section */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider">
                                        Course Enrollments ({studentDetail.enrollments?.length || 0})
                                    </h3>
                                </div>

                                {(!studentDetail.enrollments || studentDetail.enrollments.length === 0) ? (
                                    <div className="text-center py-8 bg-surface-elevated/40 rounded-2xl border border-border-subtle">
                                        <p className="text-xs text-muted italic">No course enrollments found for this student.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {studentDetail.enrollments.map(en => {
                                            const isConfirmed = en.status === 'confirmed';
                                            const isCompleted = en.status === 'completed';
                                            const courseDate = isCompleted
                                                ? en.completed_date
                                                : (isConfirmed ? (en.confirmed_date || en.invited_date) : en.invited_date);

                                            return (
                                                <div
                                                    key={en.id}
                                                    className="p-4 rounded-2xl bg-surface-elevated/50 border border-border-subtle shadow-sm space-y-3"
                                                >
                                                    {/* Course Title & Status Header */}
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <h4 className="font-bold text-primary text-sm leading-snug">
                                                                    {en.course_name}
                                                                </h4>
                                                                {en.is_priority && (
                                                                    <span className="text-amber-500 flex-shrink-0" title="Priority enrollment">
                                                                        <Star size={13} fill="currentColor" />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {en.course_variant && (
                                                                <p className="text-[11px] text-muted mt-0.5">
                                                                    Variant: <span className="font-medium text-primary/80">{cleanVariant(en.course_name, en.course_variant)}</span>
                                                                </p>
                                                            )}
                                                        </div>

                                                        {/* Status or Pending Badge */}
                                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                            {en.completion_request_status === 'pending' ? (
                                                                <span className="px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-lg flex items-center gap-1 animate-pulse">
                                                                    <Clock size={11} />
                                                                    <span>Pending Approval</span>
                                                                </span>
                                                            ) : (
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-lg flex items-center gap-1 border font-semibold ${
                                                                    STATUS_BADGE[en.status]?.className || 'bg-surface-elevated text-muted border-border-subtle'
                                                                }`}>
                                                                    {STATUS_BADGE[en.status]?.icon}
                                                                    {STATUS_BADGE[en.status]?.label || en.status}
                                                                </span>
                                                            )}
                                                            {en.status === 'requested' && en.queue_position !== null && (
                                                                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                                                    Queue: #{en.queue_position}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Enrollment Notes if any */}
                                                    {en.notes && (
                                                        <div className="flex items-start gap-1.5 p-2 bg-surface rounded-xl border border-border-subtle/80 text-[11px] text-primary/75">
                                                            <MessageSquare size={12} className="text-brand-500 flex-shrink-0 mt-0.5" />
                                                            <p className="leading-snug">{en.notes}</p>
                                                        </div>
                                                    )}

                                                    {/* Scheduled date highlight if any */}
                                                    {courseDate && (
                                                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xl border ${
                                                            isCompleted
                                                                ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20'
                                                                : (isConfirmed
                                                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                                                                    : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20')
                                                        }`}>
                                                            <Calendar size={12} />
                                                            <span>
                                                                {isCompleted ? 'Completed:' : (isConfirmed ? 'Confirmed date:' : 'Scheduled:')}{' '}
                                                                <strong className="font-bold">{formatDateDMY(courseDate)}</strong>
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Timeline dates grid */}
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 border-t border-border-subtle/50 text-[11px] text-muted">
                                                        <div>
                                                            <span className="font-semibold text-primary/70 mr-1">Registered:</span>
                                                            <span>{formatDateDMY(en.created_at)}</span>
                                                        </div>
                                                        {(en.invited_at || en.invited_date) && (
                                                            <div>
                                                                <span className="font-semibold text-primary/70 mr-1">Invited:</span>
                                                                <span>{formatDateDMY(en.invited_at || en.invited_date)}</span>
                                                            </div>
                                                        )}
                                                        {(en.confirmed_at || en.confirmed_date) && (
                                                            <div>
                                                                <span className="font-semibold text-primary/70 mr-1">Confirmed:</span>
                                                                <span>{formatDateDMY(en.confirmed_at || en.confirmed_date)}</span>
                                                            </div>
                                                        )}
                                                        {en.status === 'completed' && (en.completed_at || en.completed_date) && (
                                                            <div>
                                                                <span className="font-semibold text-primary/70 mr-1">Completed:</span>
                                                                <span>{formatDateDMY(en.completed_at || en.completed_date)}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Rejection Notice */}
                                                    {en.completion_request_status === 'rejected' && (
                                                        <div className="text-[11px] text-red-500 bg-red-500/10 border border-red-500/20 p-2 rounded-xl">
                                                            <strong>Completion Request Rejected:</strong> {en.completion_rejection_reason || 'No reason specified'}.
                                                        </div>
                                                    )}

                                                    {/* Request Completion Button for confirmed enrollments */}
                                                    {en.status === 'confirmed' && en.completion_request_status !== 'pending' && (
                                                        <div className="pt-1 flex justify-end">
                                                            <button
                                                                onClick={() => {
                                                                    setTargetEnrollment(en);
                                                                    setSelectedCompletionDate(en.confirmed_date || en.invited_date || todayISO());
                                                                    setCompletionModalOpen(true);
                                                                }}
                                                                className="px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                                                            >
                                                                <GraduationCap size={13} />
                                                                <span>{en.completion_request_status === 'rejected' ? 'Re-submit Completion' : 'Request Completion'}</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Date Confirmation Modal for Viewer Completion Request */}
            {completionModalOpen && targetEnrollment && (
                <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-surface rounded-3xl border border-border-subtle shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleIn">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                                <GraduationCap size={24} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="font-bold text-base text-primary">Mark Course Completion</h3>
                                <p className="text-xs text-muted truncate">
                                    {targetEnrollment.course_name}
                                </p>
                            </div>
                        </div>

                        <div className="p-3.5 bg-surface-elevated rounded-2xl border border-border-subtle space-y-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider block">
                                Completion Date
                            </label>
                            <input
                                type="date"
                                value={selectedCompletionDate}
                                onChange={e => setSelectedCompletionDate(e.target.value)}
                                className="w-full px-3 py-2 bg-surface border border-border-strong rounded-xl text-sm text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                            />
                            <p className="text-[11px] text-muted">
                                This will submit a completion request to the admin for verification.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => {
                                    setCompletionModalOpen(false);
                                    setTargetEnrollment(null);
                                }}
                                className="px-4 py-2 text-xs font-semibold text-muted hover:text-primary hover:bg-surface-elevated rounded-xl transition-all"
                                disabled={requestCompletionMutation.isPending}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await requestCompletionMutation.mutateAsync({
                                            enrollmentIds: [targetEnrollment.id],
                                            completedDate: selectedCompletionDate,
                                        });
                                        setToast({
                                            message: `Completion request submitted for ${targetEnrollment.course_name}. Awaiting admin approval.`,
                                            type: 'success',
                                        });
                                        setCompletionModalOpen(false);
                                        setTargetEnrollment(null);
                                        refetch();
                                    } catch (err: any) {
                                        setToast({
                                            message: err.message || 'Failed to submit request',
                                            type: 'error',
                                        });
                                    }
                                }}
                                disabled={requestCompletionMutation.isPending || !selectedCompletionDate}
                                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                            >
                                {requestCompletionMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                                <span>Submit Request</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}

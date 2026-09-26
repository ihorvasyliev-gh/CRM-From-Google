import { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useApproveCompletion, useRejectCompletion } from '../hooks/useApprovals';
import { X, Edit2, Trash2, UserPlus, Mail, Phone, MapPin, Calendar, Clock, CheckCircle, Send, XCircle, GraduationCap, Check, Loader2, ExternalLink, GitMerge, Copy, MessageSquare, Navigation } from 'lucide-react';
import { Student, getAvatarGradient, cleanVariant } from '../lib/types';
import { formatPhoneForWhatsApp, formatPhoneForCall, formatGoogleMapsUrl, formatStudentContactSummary, normalizePhone } from '../lib/contactUtils';
import { formatDateDMY, todayISO } from '../lib/dateUtils';
import { STATUS_CONFIG } from '../lib/statusConfig';
import { useModalBehavior } from '../hooks/useModalBehavior';
import MergeModal from './MergeModal';
import { CalendarPanel } from './ui/DatePicker';
import Toast, { ToastData } from './Toast';

interface Enrollment {
    id: string;
    status: string;
    course_variant: string | null;
    created_at: string;
    confirmed_date: string | null;
    confirmed_at?: string | null;
    completed_date?: string | null;
    completed_at?: string | null;
    pending_completion_date?: string | null;
    completion_request_status?: string | null;
    completion_requested_at?: string | null;
    completion_requested_by?: string | null;
    completion_rejection_reason?: string | null;
    course_id: string;
    courses: { name: string } | null;
}

interface Props {
    student: Student;
    onClose: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onEnroll?: () => void;
    onStudentUpdated?: (student: Student) => void;
    onNavigate?: (tab: string, filter?: { courseId?: string }) => void;
}

const STATUS_BADGE: Record<string, { icon: React.JSX.Element; className: string }> = {
    requested: { icon: <Clock size={12} />, className: 'bg-warning/10 text-status-requested border-warning/30' },
    invited: { icon: <Send size={12} />, className: 'bg-info/10 text-status-invited border-info/25' },
    confirmed: { icon: <CheckCircle size={12} />, className: 'bg-success/10 text-status-confirmed border-success/25' },
    rejected: { icon: <XCircle size={12} />, className: 'bg-danger/10 text-status-rejected border-danger/25' },
    completed: { icon: <GraduationCap size={12} />, className: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20' },
    withdrawn: { icon: <XCircle size={12} />, className: 'bg-muted/10 text-muted border-border-subtle' },
};

// ─── Inline Editable Field ──────────────────────────────────
function InlineEditField({
    value,
    displayValue,
    field,
    studentId,
    type = 'text',
    icon,
    label,
    onSaved,
    onCopy,
    onError,
    extraActions,
}: {
    value: string;
    displayValue?: string;
    field: string;
    studentId: string;
    type?: string;
    icon: React.JSX.Element;
    label: string;
    onSaved: (field: string, value: string) => void;
    onCopy: (value: string, label: string) => void;
    onError?: (message: string) => void;
    extraActions?: React.ReactNode;
}) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);
    const [saving, setSaving] = useState(false);
    // Enter saves and then the input blurs — guard so the same edit is never written twice
    const savingRef = useRef(false);

    // Keep state in sync with external value prop changes
    useEffect(() => {
        setEditValue(value);
    }, [value]);

    async function handleSave(next = editValue) {
        if (savingRef.current) return;
        if (next.trim() === value.trim()) {
            setEditValue(value);
            setEditing(false);
            return;
        }
        savingRef.current = true;
        setSaving(true);

        let cleanValue = next.trim();
        if (field === 'phone') {
            cleanValue = normalizePhone(next);
        } else if (field === 'email') {
            cleanValue = next.trim().toLowerCase();
        } else if (field === 'eircode') {
            cleanValue = next.trim().toUpperCase();
        }

        try {
            const { error } = await supabase
                .from('students')
                .update({ [field]: cleanValue || null })
                .eq('id', studentId);
            if (error) {
                setEditValue(value);
                onError?.(error.message.includes('duplicate') || error.message.includes('unique')
                    ? `Another student already uses this ${label.toLowerCase()}`
                    : `Failed to update ${label.toLowerCase()}`);
            } else {
                onSaved(field, cleanValue);
            }
        } finally {
            savingRef.current = false;
            setSaving(false);
            setEditing(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            // Cancel the edit only — don't let the drawer close
            e.preventDefault();
            e.stopPropagation();
            setEditValue(value);
            setEditing(false);
        }
    }

    if (editing && type === 'date') {
        return (
            <div className="p-2.5 rounded-xl bg-brand-500/5 border border-brand-500/20" onKeyDown={handleKeyDown}>
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-brand-500 shrink-0">{icon}</span>
                    <p className="flex-1 text-[10px] text-muted font-medium">{label}</p>
                    {saving ? (
                        <Loader2 size={14} className="animate-spin text-brand-500" />
                    ) : (
                        <button onClick={() => setEditing(false)} className="p-1 text-muted hover:text-primary rounded-sm transition-all" title="Cancel">
                            <X size={14} />
                        </button>
                    )}
                </div>
                <CalendarPanel mode="date" value={editValue} max={todayISO()} onChange={handleSave} className="bg-surface" />
            </div>
        );
    }

    if (editing) {
        return (
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-brand-500/5 border border-brand-500/20">
                <span className="text-brand-500 shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted font-medium mb-1">{label}</p>
                    <input
                        type={type}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleSave()}
                        autoFocus
                        className="w-full text-sm text-primary bg-transparent border-none outline-hidden p-0"
                    />
                </div>
                {saving ? (
                    <Loader2 size={14} className="animate-spin text-brand-500 shrink-0" />
                ) : (
                    <button
                        onClick={() => handleSave()}
                        className="p-1 text-brand-500 hover:bg-brand-500/10 rounded-sm transition-all shrink-0"
                    >
                        <Check size={14} />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface transition-all cursor-pointer group"
            onClick={() => {
                if (value) {
                    onCopy(displayValue || value, label);
                }
            }}
            title="Click to copy to clipboard"
        >
            <span className="text-muted">{icon}</span>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted font-medium">{label}</p>
                <p className="text-sm text-primary">{displayValue || value || <span className="text-muted/50 italic">Not set</span>}</p>
            </div>
            {extraActions && (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {extraActions}
                </div>
            )}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setEditValue(value);
                    setEditing(true);
                }}
                className="p-1.5 text-muted/30 group-hover:text-muted/70 hover:text-brand-500 dark:hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all shrink-0"
                title={`Edit ${label}`}
            >
                <Edit2 size={12} />
            </button>
        </div>
    );
}


export default function StudentDetail({ student, onClose, onEdit, onDelete, onEnroll, onStudentUpdated, onNavigate }: Props) {
    const queryClient = useQueryClient();
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [toast, setToast] = useState<ToastData | null>(null);
    const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(null);

    useModalBehavior(true, onClose);

    // Keyed under ['enrollments', …] so every global enrollments invalidation (realtime sync,
    // board actions, new enrollment modal) refreshes this drawer automatically.
    const enrollmentsKey = ['enrollments', 'by_student', student.id] as const;
    const { data: enrollments = [], isLoading: enrollmentsLoading, refetch: fetchEnrollments } = useQuery({
        queryKey: enrollmentsKey,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('enrollments')
                .select('id, student_id, course_id, status, course_variant, created_at, confirmed_date, confirmed_at, completed_date, completed_at, pending_completion_date, completion_request_status, completion_requested_at, completion_requested_by, completion_rejection_reason, courses(name)')
                .eq('student_id', student.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []) as unknown as Enrollment[];
        },
        staleTime: 10_000,
    });

    const setEnrollments = useCallback((updater: (prev: Enrollment[]) => Enrollment[]) => {
        queryClient.setQueryData<Enrollment[]>(enrollmentsKey, (old = []) => updater(old));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, student.id]);

    const handleCopyField = (value: string, label: string) => {
        if (!value) return;
        let textToCopy = value;
        if (label.toLowerCase() === 'phone') {
            let clean = value.trim();
            if (clean.startsWith('+353')) {
                clean = '0' + clean.slice(4);
            } else if (clean.startsWith('353')) {
                clean = '0' + clean.slice(3);
            }
            textToCopy = clean.replace(/[\s-]/g, '');
        }
        
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                setToast({
                    message: `${label} copied to clipboard!`,
                    type: 'success'
                });
            })
            .catch((err) => {
                console.error('Failed to copy text:', err);
                setToast({
                    message: `Failed to copy ${label.toLowerCase()}`,
                    type: 'error'
                });
            });
    };

    const handleCopySummary = () => {
        const summary = formatStudentContactSummary(student);
        navigator.clipboard.writeText(summary)
            .then(() => {
                setToast({
                    message: 'Contact summary copied to clipboard!',
                    type: 'success'
                });
            })
            .catch((err) => {
                console.error('Failed to copy contact summary:', err);
                setToast({
                    message: 'Failed to copy contact summary',
                    type: 'error'
                });
            });
    };

    const approveMutation = useApproveCompletion();
    const rejectMutation = useRejectCompletion();

    const invalidateRelated = () => {
        queryClient.invalidateQueries({ queryKey: ['enrollments'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
        queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
    };

    async function handleUpdateStatus(id: string, newStatus: string) {
        if (busyEnrollmentId) return;
        const updatePayload: Record<string, string | null | boolean> = { status: newStatus };
        const currentEnrollment = enrollments.find(e => e.id === id);
        if (newStatus === 'confirmed') {
            updatePayload.confirmed_at = new Date().toISOString();
        }
        if (newStatus === 'completed') {
            updatePayload.completed_date = currentEnrollment?.confirmed_date || todayISO();
            updatePayload.completed_at = new Date().toISOString();
            if (currentEnrollment && !currentEnrollment.confirmed_at) {
                updatePayload.confirmed_at = new Date().toISOString();
            }
        } else {
            updatePayload.completed_date = null;
            updatePayload.completed_at = null;
        }

        if (newStatus !== 'confirmed' && newStatus !== 'completed') {
            updatePayload.confirmed_at = null;
        }

        const label = STATUS_CONFIG[newStatus]?.label || newStatus;
        setBusyEnrollmentId(id);
        try {
            if (newStatus === 'completed' || newStatus === 'withdrawn') {
                if (!currentEnrollment || !currentEnrollment.course_id) return;

                const relatedIds = enrollments
                    .filter(e => e.course_id === currentEnrollment.course_id)
                    .map(e => e.id);

                const { error } = await supabase
                    .from('enrollments')
                    .update(updatePayload)
                    .in('id', relatedIds);

                if (error) throw error;
                setEnrollments(prev => prev.map(e => relatedIds.includes(e.id) ? { ...e, ...updatePayload, status: newStatus } as Enrollment : e));
            } else {
                const { error } = await supabase
                    .from('enrollments')
                    .update(updatePayload)
                    .eq('id', id);

                if (error) throw error;
                setEnrollments(prev => prev.map(e => e.id === id ? { ...e, ...updatePayload, status: newStatus } as Enrollment : e));
            }
            setToast({ message: `Marked as ${label.toLowerCase()}`, type: 'success' });
            invalidateRelated();
        } catch {
            setToast({ message: `Failed to mark as ${label.toLowerCase()}`, type: 'error' });
        } finally {
            setBusyEnrollmentId(null);
        }
    }

    async function handleDeleteEnrollment(id: string) {
        if (busyEnrollmentId) return;
        setBusyEnrollmentId(id);
        try {
            const { error } = await supabase
                .from('enrollments')
                .delete()
                .eq('id', id);
            if (error) throw error;
            setEnrollments(prev => prev.filter(e => e.id !== id));
            setConfirmDeleteId(null);
            setToast({ message: 'Enrollment deleted', type: 'success' });
            invalidateRelated();
        } catch {
            setToast({ message: 'Failed to delete enrollment', type: 'error' });
        } finally {
            setBusyEnrollmentId(null);
        }
    }

    // Handle inline edit save
    function handleFieldSaved(field: string, value: string) {
        const updated = { ...student, [field]: value || null };
        onStudentUpdated?.(updated as Student);
        queryClient.invalidateQueries({ queryKey: ['students'] });
        setToast({ message: 'Saved', type: 'success' });
    }

    // Navigate to enrollments filtered by course
    function handleCourseClick(courseId: string) {
        if (onNavigate) {
            onClose();
            onNavigate('enrollments', { courseId });
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end overflow-hidden animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
            <div className="relative w-full sm:w-96 max-h-[92vh] sm:max-h-[85vh] h-auto bg-surface border border-border-subtle rounded-t-2xl sm:rounded-2xl shadow-float overflow-y-auto sm:mr-4 animate-slideUp sm:animate-slideInRight pb-[max(env(safe-area-inset-bottom),1rem)]">
                {/* Mobile pull handle */}
                <div className="w-10 h-1 bg-border-strong rounded-full mx-auto my-2.5 sm:hidden" />

                {/* Header */}
                <div className="sticky top-0 z-10 bg-surface border-b border-border-subtle px-5 py-3.5 sm:py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 bg-linear-to-br ${getAvatarGradient(student.id)} rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-surface-elevated shadow-md`}>
                                {(student.first_name?.[0] || '').toUpperCase()}{(student.last_name?.[0] || '').toUpperCase()}
                            </div>
                            <div>
                                <h2 
                                    onClick={() => handleCopyField(`${student.first_name} ${student.last_name}`, 'Name')}
                                    className="font-bold text-primary cursor-pointer hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
                                    title="Click to copy name to clipboard"
                                >
                                    {student.first_name} {student.last_name}
                                </h2>
                                <p className="text-xs text-muted">{enrollments.length} enrollment{enrollments.length !== 1 ? 's' : ''}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-muted hover:text-primary hover:bg-surface rounded-lg transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {/* Actions */}
                    {/* Actions */}
                    <div className="space-y-2">
                        {(onEdit || onEnroll || onDelete) && (
                            <div className="flex gap-2">
                                {onEdit && (
                                    <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2.5 text-xs sm:text-sm font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 rounded-xl transition-all">
                                        <Edit2 size={14} /> Edit
                                    </button>
                                )}
                                {onEnroll && (
                                    <button onClick={onEnroll} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2.5 text-xs sm:text-sm font-semibold text-status-confirmed bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-all">
                                        <UserPlus size={14} /> Enroll
                                    </button>
                                )}
                                <button onClick={() => setMergeModalOpen(true)} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2.5 text-xs sm:text-sm font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 rounded-xl transition-all" title="Merge student profiles">
                                    <GitMerge size={14} /> Merge
                                </button>
                                {onDelete && (
                                    <button onClick={onDelete} className="flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-status-rejected bg-danger/10 hover:bg-danger/20 rounded-xl transition-all" title="Delete student">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        )}
                        <button
                            onClick={handleCopySummary}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-primary/80 hover:text-primary bg-surface hover:bg-surface-elevated border border-border-subtle hover:border-border-strong rounded-xl transition-all shadow-xs active:scale-95"
                            title="Copy full contact card (Name, Email, Phone, Address, Eircode, DOB)"
                        >
                            <Copy size={13} className="text-brand-500" />
                            <span>Copy Contact Summary</span>
                        </button>
                    </div>

                    {/* Contact Info — Inline Editable */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Contact Info</h3>
                        <div className="space-y-1.5">
                            <InlineEditField
                                icon={<Mail size={14} />}
                                label="Email"
                                value={student.email || ''}
                                field="email"
                                type="email"
                                studentId={student.id}
                                onSaved={handleFieldSaved}
                                onCopy={handleCopyField}
                                onError={message => setToast({ message, type: 'error' })}
                            />
                            <InlineEditField
                                icon={<Phone size={14} />}
                                label="Phone"
                                value={student.phone || ''}
                                field="phone"
                                type="tel"
                                studentId={student.id}
                                onSaved={handleFieldSaved}
                                onCopy={handleCopyField}
                                onError={message => setToast({ message, type: 'error' })}
                                extraActions={
                                    student.phone ? (
                                        <div className="flex items-center gap-1">
                                            {formatPhoneForWhatsApp(student.phone) && (
                                                <a
                                                    href={formatPhoneForWhatsApp(student.phone)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-center min-w-[28px] h-[28px] px-1.5 text-status-confirmed bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/25 rounded-lg shadow-2xs transition-all active:scale-95"
                                                    title="Chat on WhatsApp"
                                                >
                                                    <MessageSquare size={14} />
                                                </a>
                                            )}
                                            {formatPhoneForCall(student.phone) && (
                                                <a
                                                    href={formatPhoneForCall(student.phone)!}
                                                    className="flex items-center justify-center min-w-[28px] h-[28px] px-1.5 text-status-invited bg-blue-500/10 hover:bg-blue-500/20 active:bg-blue-500/30 border border-blue-500/25 rounded-lg shadow-2xs transition-all active:scale-95"
                                                    title="Call Phone Number"
                                                >
                                                    <Phone size={14} />
                                                </a>
                                            )}
                                        </div>
                                    ) : undefined
                                }
                            />
                            <InlineEditField
                                icon={<MapPin size={14} />}
                                label="Address"
                                value={student.address || ''}
                                field="address"
                                studentId={student.id}
                                onSaved={handleFieldSaved}
                                onCopy={handleCopyField}
                                onError={message => setToast({ message, type: 'error' })}
                                extraActions={
                                    student.address && formatGoogleMapsUrl(student.address) ? (
                                        <a
                                            href={formatGoogleMapsUrl(student.address)!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1.5 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all"
                                            title="Open Address in Google Maps"
                                        >
                                            <Navigation size={13} />
                                        </a>
                                    ) : undefined
                                }
                            />
                            <InlineEditField
                                icon={<MapPin size={14} />}
                                label="Eircode"
                                value={student.eircode || ''}
                                field="eircode"
                                studentId={student.id}
                                onSaved={handleFieldSaved}
                                onCopy={handleCopyField}
                                onError={message => setToast({ message, type: 'error' })}
                                extraActions={
                                    student.eircode && formatGoogleMapsUrl(student.eircode) ? (
                                        <a
                                            href={formatGoogleMapsUrl(student.eircode)!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1.5 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all"
                                            title="Open Eircode in Google Maps"
                                        >
                                            <Navigation size={13} />
                                        </a>
                                    ) : undefined
                                }
                            />
                            <InlineEditField
                                icon={<Calendar size={14} />}
                                label="Date of Birth"
                                value={student.dob || ''}
                                displayValue={student.dob ? formatDateDMY(student.dob) : ''}
                                field="dob"
                                type="date"
                                studentId={student.id}
                                onSaved={handleFieldSaved}
                                onCopy={handleCopyField}
                                onError={message => setToast({ message, type: 'error' })}
                            />
                        </div>
                    </div>

                    {/* Enrollments — with clickable course names */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Enrollments</h3>
                        {enrollmentsLoading ? (
                            <div className="space-y-2.5" aria-busy="true">
                                {[0, 1].map(i => (
                                    <div key={i} className="p-3 rounded-xl bg-surface/50 border border-border-subtle animate-pulse space-y-2">
                                        <div className="h-4 w-40 rounded-sm bg-surface-elevated" />
                                        <div className="h-3 w-24 rounded-sm bg-surface-elevated" />
                                    </div>
                                ))}
                            </div>
                        ) : enrollments.length === 0 ? (
                            <div className="text-center py-6">
                                <p className="text-sm text-muted">No enrollments yet</p>
                                {onEnroll && (
                                    <button
                                        onClick={onEnroll}
                                        className="mt-2 text-xs font-semibold text-status-confirmed hover:underline"
                                    >
                                        + Enroll in a course
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {enrollments.map(en => (
                                    <div key={en.id} className="p-3 rounded-xl bg-surface/50 border border-border-subtle hover:bg-surface transition-all group">
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <button
                                                    onClick={() => handleCourseClick(en.course_id)}
                                                    className="text-sm font-medium text-primary hover:text-brand-500 transition-colors inline-flex items-center gap-1.5 group/link"
                                                    title="View in Enrollment Board"
                                                >
                                                    {en.courses?.name || 'Unknown'}
                                                    <ExternalLink size={11} className="opacity-0 group-hover/link:opacity-60 transition-opacity" />
                                                </button>
                                                {en.course_variant && (
                                                    <span className="text-[10px] text-muted block">{cleanVariant(en.courses?.name || '', en.course_variant)}</span>
                                                )}
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 border font-medium ${STATUS_BADGE[en.status]?.className || 'bg-surface-elevated text-muted border-border-subtle'}`}>
                                                {STATUS_BADGE[en.status]?.icon} {STATUS_CONFIG[en.status]?.label || en.status}
                                            </span>
                                        </div>

                                        {/* Pending Completion Approval Banner */}
                                        {en.completion_request_status === 'pending' && (
                                            <div className="mb-2 p-2 bg-amber-500/10 border border-amber-500/25 rounded-lg flex items-center justify-between gap-2 text-xs animate-pulse">
                                                <span className="text-status-requested font-semibold flex items-center gap-1">
                                                    <Clock size={12} />
                                                    Completion requested for <strong>{en.pending_completion_date ? formatDateDMY(en.pending_completion_date) : 'Today'}</strong>
                                                    {en.completion_requested_by ? ` (${en.completion_requested_by})` : ''}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await approveMutation.mutateAsync({ enrollmentIds: [en.id] });
                                                                fetchEnrollments();
                                                                setToast({ message: 'Approved completion', type: 'success' });
                                                            } catch (err: any) {
                                                                setToast({ message: err.message || 'Failed to approve', type: 'error' });
                                                            }
                                                        }}
                                                        disabled={approveMutation.isPending}
                                                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-[10px] font-bold shadow-xs"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await rejectMutation.mutateAsync({ enrollmentIds: [en.id] });
                                                                fetchEnrollments();
                                                                setToast({ message: 'Rejected completion request', type: 'info' });
                                                            } catch (err: any) {
                                                                setToast({ message: err.message || 'Failed to reject', type: 'error' });
                                                            }
                                                        }}
                                                        disabled={rejectMutation.isPending}
                                                        className="px-2 py-0.5 bg-danger/10 hover:bg-danger/20 text-status-rejected rounded-sm text-[10px] font-semibold"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className={`flex items-center gap-1.5 sm:opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ${busyEnrollmentId === en.id ? 'pointer-events-none opacity-50' : ''}`}>
                                            {/* Actions */}
                                            {en.status !== 'completed' && (
                                                <button
                                                    onClick={() => handleUpdateStatus(en.id, 'completed')}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-surface-elevated border border-border-subtle shadow-xs rounded-lg text-xs font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 hover:border-teal-500/20 transition-all"
                                                    title="Mark as Completed"
                                                >
                                                    <GraduationCap size={12} /> Complete
                                                </button>
                                            )}
                                            {en.status !== 'withdrawn' && (
                                                <button
                                                    onClick={() => handleUpdateStatus(en.id, 'withdrawn')}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-surface-elevated border border-border-subtle shadow-xs rounded-lg text-xs font-medium text-muted hover:bg-surface hover:border-border-strong transition-all"
                                                    title="Withdraw"
                                                >
                                                    <XCircle size={12} /> Withdraw
                                                </button>
                                            )}

                                            {confirmDeleteId === en.id ? (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleDeleteEnrollment(en.id)}
                                                        className="px-2 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600"
                                                    >
                                                        Confirm
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="px-2 py-1.5 bg-surface text-muted border border-border-subtle rounded-lg text-xs hover:bg-surface-elevated transition-all"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmDeleteId(en.id)}
                                                    className="flex items-center justify-center px-2.5 py-1.5 bg-surface-elevated border border-border-subtle shadow-xs rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
                                                    title="Delete permanently"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <MergeModal
                open={mergeModalOpen}
                student={student}
                onClose={() => setMergeModalOpen(false)}
                onSuccess={onClose}
            />
            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}

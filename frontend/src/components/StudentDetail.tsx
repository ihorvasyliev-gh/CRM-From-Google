import { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useApproveCompletion, useRejectCompletion } from '../hooks/useApprovals';
import { X, Edit2, Pencil, Trash2, UserPlus, Mail, Phone, MapPin, Calendar, Clock, CheckCircle, CheckSquare, Send, XCircle, GraduationCap, Check, Loader2, ExternalLink, GitMerge, Copy, MessageSquare, Navigation, House, Mailbox } from 'lucide-react';
import { Student, getAvatarGradient, cleanVariant, fullName, type EnrollmentStatus, type EmploymentStatusRow } from '../lib/types';
import { changeEnrollmentStatus } from '../lib/enrollmentStatus';
import { formatPhoneForWhatsApp, formatPhoneForCall, formatGoogleMapsUrl, formatStudentContactSummary, normalizePhone } from '../lib/contactUtils';
import { formatDateLongWithWeekday, todayISO, formatDisplayDate, formatLocalDate } from '../lib/dateUtils';
import { useCourseSessions } from '../hooks/useCourseSessions';
import { formatTimeRange, hasDayOverrides, sessionDays, sessionForEnrollment, sessionHasSchedule, sessionTooltip, type CourseSession } from '../lib/courseSessions';
import { STATUS_CONFIG } from '../lib/statusConfig';
import DialogLayer from './ui/DialogLayer';
import MergeModal from './MergeModal';
import ConfirmDialog from './ConfirmDialog';
import { CalendarPanel } from './ui/DatePicker';
import { notify } from '../lib/toast';
import type { NavigateFn } from '../lib/navigation';
import { errorMessage } from '../lib/errors';
import { refreshCachedEnrollments } from '../lib/enrollmentCache';
import { fetchStudent } from '../lib/students';
import { applyStudentChange, studentRecordKey } from '../lib/studentCache';
import { TrackingBadge, EmploymentBadge, CallMarkButton } from './OutcomeBadges';
import OutcomeEditModal, { type OutcomeValues } from './OutcomeEditModal';
import { setGraduateCallMark, callMarkErrorMessage } from '../lib/callMark';
import { useDialogMount, useLastPresent } from '../hooks/usePresence';
import type { GraduateRow } from '../hooks/useOutcomes';

const EMPTY_OUTCOME = { is_working: null, employment_type: null, field_of_work: null };

/** How the saved-field toast names each field */
const FIELD_LABELS: Record<string, string> = { email: 'Email', phone: 'Phone', address: 'Address', eircode: 'Eircode', dob: 'Date of birth' };

function formatStartedMonth(value: string): string {
    const d = new Date(`${value}-01T12:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return formatLocalDate(d, { month: 'short', year: 'numeric' }, 'en-GB');
}

interface Enrollment {
    id: string;
    student_id: string;
    status: EnrollmentStatus;
    course_variant: string | null;
    created_at: string;
    confirmed_date: string | null;
    confirmed_at: string | null;
    invited_date: string | null;
    invited_dates: string[] | null;
    invited_at: string | null;
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
    /** False while it animates out (the parent keeps it mounted with the last student) */
    open?: boolean;
    /** The record the card opens with; it then shows the stored one, kept current (see below) */
    student: Student;
    onClose: () => void;
    /** Gets the card's current record, so the form never starts from values edited since */
    onEdit?: (student: Student) => void;
    onDelete?: () => void;
    onEnroll?: () => void;
    onStudentUpdated?: (student: Student) => void;
    onNavigate?: NavigateFn;
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
    /** `row`: the stored record as the database returned it after the write */
    onSaved: (field: string, value: string, row: Student | null) => void;
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
            const { data: row, error } = await supabase
                .from('students')
                .update({ [field]: cleanValue || null })
                .eq('id', studentId)
                .select()
                .maybeSingle();
            if (error) {
                setEditValue(value);
                onError?.(error.message.includes('duplicate') || error.message.includes('unique')
                    ? `Another student already uses this ${label.toLowerCase()}`
                    : `Failed to update ${label.toLowerCase()}`);
            } else {
                onSaved(field, cleanValue, (row as Student | null) ?? null);
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
                    <p className="flex-1 text-xs text-muted font-medium">{label}</p>
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
                    <p className="text-xs text-muted font-medium mb-1">{label}</p>
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
                <p className="text-xs text-muted font-medium">{label}</p>
                <p className="text-sm text-primary">{displayValue || value || <span className="text-muted italic">Not set</span>}</p>
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


export default function StudentDetail({ open = true, student: openedWith, onClose, onEdit, onDelete, onEnroll, onStudentUpdated, onNavigate }: Props) {
    const queryClient = useQueryClient();

    // The card shows the stored record, not the copy it was opened with: that copy is a snapshot
    // the page took, and an edit here (or anywhere else: the Edit form, a merge, another user)
    // left the card on the old values until it was opened again. Keyed under ['students', …], so
    // every students invalidation — realtime sync, list edits, merges — reloads it too.
    const { data: stored } = useQuery({
        queryKey: studentRecordKey(openedWith.id),
        queryFn: () => fetchStudent(openedWith.id),
        // Shown at once; read again on opening, as the page's copy may be old
        initialData: openedWith,
        initialDataUpdatedAt: 0,
    });
    // A failed read (e.g. a student just merged away) keeps the last record shown
    const student = stored ?? openedWith;

    const courseSessions = useCourseSessions();
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(null);
    const [callMarkBusy, setCallMarkBusy] = useState(false);
    const [editingOutcome, setEditingOutcome] = useState<(OutcomeValues & { first_name: string; last_name: string }) | null>(null);
    const outcomeModalMount = useDialogMount(!!editingOutcome);
    const shownOutcome = useLastPresent(editingOutcome);

    // Keyed under ['enrollments', …] so every global enrollments invalidation (realtime sync,
    // board actions, new enrollment modal) refreshes this drawer automatically.
    const enrollmentsKey = ['enrollments', 'by_student', student.id] as const;
    const { data: enrollments = [], isLoading: enrollmentsLoading, refetch: fetchEnrollments } = useQuery({
        queryKey: enrollmentsKey,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('enrollments')
                .select('id, student_id, course_id, status, course_variant, created_at, confirmed_date, confirmed_at, invited_date, invited_dates, invited_at, completed_date, completed_at, pending_completion_date, completion_request_status, completion_requested_at, completion_requested_by, completion_rejection_reason, courses(name)')
                .eq('student_id', student.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []) as unknown as Enrollment[];
        },
        staleTime: 10_000,
    });

    // Keyed under ['outcomes_graduates', …] so global realtime sync invalidations of
    // ['outcomes_graduates'] refresh this card automatically.
    const outcomeKey = ['outcomes_graduates', 'by_student', student.id] as const;
    const { data: outcomeRow = null } = useQuery({
        queryKey: outcomeKey,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('employment_status')
                .select('*')
                .eq('student_id', student.id)
                .order('id');
            if (error) throw error;
            return (data?.[0] ?? null) as EmploymentStatusRow | null;
        },
        enabled: open,
        staleTime: 10_000,
    });

    const trackingStatus: 'not_contacted' | 'pending' | 'responded' = outcomeRow?.status ?? 'not_contacted';
    const showEmploymentOutcome = enrollments.some(e => e.status === 'completed') || !!outcomeRow;

    const setEnrollments = useCallback((updater: (prev: Enrollment[]) => Enrollment[]) => {
        queryClient.setQueryData<Enrollment[]>(enrollmentsKey, (old = []) => updater(old));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, student.id]);

    async function handleToggleCallMark() {
        if (callMarkBusy) return;
        const prevRow = outcomeRow;
        const calledAt = outcomeRow?.called_no_answer_at ? null : new Date().toISOString();
        const grad: GraduateRow = {
            student_id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            email: student.email || '',
            phone: student.phone || null,
            courses: [],
            is_working: outcomeRow?.is_working ?? null,
            started_month: outcomeRow?.started_month ?? null,
            field_of_work: outcomeRow?.field_of_work ?? null,
            employment_type: outcomeRow?.employment_type ?? null,
            status_updated_at: outcomeRow?.last_responded_at ?? null,
            tracking_status: trackingStatus,
            last_sent_at: outcomeRow?.last_invited_at ?? null,
            called_no_answer_at: outcomeRow?.called_no_answer_at ?? null,
            last_completed_date: null,
            course_completed_dates: {},
        };
        const optimisticRow: EmploymentStatusRow = prevRow
            ? { ...prevRow, called_no_answer_at: calledAt }
            : {
                id: `optimistic-${student.id}`,
                student_id: student.id,
                email: student.email || null,
                is_working: null,
                started_month: null,
                field_of_work: null,
                employment_type: null,
                status: 'not_contacted',
                last_invited_at: null,
                last_responded_at: null,
                called_no_answer_at: calledAt,
            };
        setCallMarkBusy(true);
        queryClient.setQueryData<EmploymentStatusRow | null>(outcomeKey, optimisticRow);
        try {
            await setGraduateCallMark(grad, calledAt);
            queryClient.invalidateQueries({ queryKey: ['outcomes_graduates'] });
        } catch (err) {
            console.error(err);
            queryClient.setQueryData<EmploymentStatusRow | null>(outcomeKey, prevRow);
            notify({ message: callMarkErrorMessage(err as { code?: string; message?: string }), type: 'error' });
        } finally {
            setCallMarkBusy(false);
        }
    }

    async function handleSaveOutcome(values: OutcomeValues) {
        if (values.tracking_status === 'not_contacted') {
            if (outcomeRow?.called_no_answer_at) {
                const { error } = await supabase
                    .from('employment_status')
                    .update({
                        status: 'not_contacted',
                        is_working: null,
                        started_month: null,
                        field_of_work: null,
                        employment_type: null,
                        last_invited_at: null,
                        last_responded_at: null,
                    })
                    .eq('student_id', student.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('employment_status')
                    .delete()
                    .eq('student_id', student.id);
                if (error) throw error;
            }
            return;
        }

        const responded = values.tracking_status === 'responded';
        const { error } = await supabase
            .from('employment_status')
            .upsert({
                student_id: student.id,
                email: student.email,
                status: responded ? 'responded' : 'pending',
                is_working: values.is_working,
                started_month: values.started_month,
                field_of_work: values.field_of_work,
                employment_type: values.employment_type,
                ...(responded ? { last_responded_at: new Date().toISOString(), called_no_answer_at: null } : {}),
            }, { onConflict: 'student_id' });
        if (error) throw error;
    }

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
                notify({
                    message: `${label} copied to clipboard!`,
                    type: 'success'
                });
            })
            .catch((err) => {
                console.error('Failed to copy text:', err);
                notify({
                    message: `Failed to copy ${label.toLowerCase()}`,
                    type: 'error'
                });
            });
    };

    const handleCopySummary = () => {
        const summary = formatStudentContactSummary(student);
        navigator.clipboard.writeText(summary)
            .then(() => {
                notify({
                    message: 'Contact summary copied to clipboard!',
                    type: 'success'
                });
            })
            .catch((err) => {
                console.error('Failed to copy contact summary:', err);
                notify({
                    message: 'Failed to copy contact summary',
                    type: 'error'
                });
            });
    };

    const approveMutation = useApproveCompletion();
    const rejectMutation = useRejectCompletion();

    /** After these enrollments changed here: re-read into the board's list, not the whole list reloaded. */
    const invalidateRelated = (ids: string[]) => {
        void refreshCachedEnrollments(queryClient, ids);
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
        queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
    };

    async function handleUpdateStatus(id: string, newStatus: EnrollmentStatus) {
        if (busyEnrollmentId) return;
        const current = enrollments.find(e => e.id === id);
        if (!current) return;
        const label = STATUS_CONFIG[newStatus]?.label || newStatus;
        setBusyEnrollmentId(id);
        try {
            // Same rules as the board: withdrawing covers the student's other rows on the course,
            // completing removes the ones still "requested"
            const { updated, removed, removeFailed } = await changeEnrollmentStatus(enrollments, [current], newStatus);
            const saved = new Map(updated.map(snap => [snap.id, snap]));
            const removedIds = new Set(removed.map(e => e.id));
            setEnrollments(prev => prev
                .filter(e => !removedIds.has(e.id))
                .map(e => saved.has(e.id) ? { ...e, ...saved.get(e.id)! } : e)
            );
            notify(removeFailed
                ? { message: `Marked as ${label.toLowerCase()}, but the requested duplicates could not be removed`, type: 'error' }
                : { message: `Marked as ${label.toLowerCase()}`, type: 'success' });
            invalidateRelated([...updated.map(snap => snap.id), ...removed.map(e => e.id)]);
        } catch (err) {
            console.error('Status update failed:', err);
            notify({ message: `Failed to mark as ${label.toLowerCase()}`, type: 'error' });
        } finally {
            setBusyEnrollmentId(null);
        }
    }

    async function handleDeleteEnrollment(id: string) {
        if (busyEnrollmentId) return;
        const courseName = enrollments.find(e => e.id === id)?.courses?.name || 'the course';
        setBusyEnrollmentId(id);
        try {
            const { error } = await supabase
                .from('enrollments')
                .delete()
                .eq('id', id);
            if (error) throw error;
            setEnrollments(prev => prev.filter(e => e.id !== id));
            setConfirmDeleteId(null);
            notify({ message: `Removed from ${courseName}`, type: 'success' });
            invalidateRelated([id]);
        } catch {
            setConfirmDeleteId(null);
            notify({ message: `Could not remove the ${courseName} enrollment. Please try again.`, type: 'error' });
        } finally {
            setBusyEnrollmentId(null);
        }
    }

    // Handle inline edit save
    function handleFieldSaved(field: string, value: string, row: Student | null) {
        // The card, the board and every list show the new value; built on the record as it is
        // now, not as the card was opened, so a second edit in a row keeps the first one
        const updated = applyStudentChange(queryClient, row ?? { id: student.id, [field]: value || null })
            ?? ({ ...student, ...row, [field]: row ? row[field as keyof Student] : value || null } as Student);
        onStudentUpdated?.(updated);
        const label = FIELD_LABELS[field] ?? 'Change';
        notify({ message: value ? `${label} saved` : `${label} cleared`, type: 'success' });
    }

    // Navigate to enrollments filtered by course
    function handleCourseClick(courseId: string) {
        if (onNavigate) {
            onClose();
            onNavigate('enrollments', { courseId });
        }
    }

    return (
        <>
            <DialogLayer
                open={open}
                onClose={onClose}
                label={`Student ${fullName(student)}`}
                className="z-50 flex items-end sm:items-center sm:justify-end overflow-hidden"
                panelClassName="w-full sm:w-96 max-h-[92vh] sm:max-h-[85vh] h-auto bg-surface border border-border-subtle rounded-t-2xl sm:rounded-2xl shadow-float overflow-y-auto overscroll-contain sm:mr-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
                enter="animate-slideUp sm:animate-slideInRight"
                exit="animate-sheetSlideDown sm:animate-slideOutRight"
            >
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
                                    onClick={() => handleCopyField(fullName(student), 'Name')}
                                    className="font-bold text-primary cursor-pointer hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
                                    title="Click to copy name to clipboard"
                                >
                                    {student.first_name} {student.last_name}
                                </h2>
                                <p className="text-xs text-muted">{enrollments.length} enrollment{enrollments.length !== 1 ? 's' : ''}</p>
                            </div>
                        </div>
                        <button type="button" onClick={onClose} aria-label="Close student details" title="Close (Esc)" className="p-2 text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-all">
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
                                    <button onClick={() => onEdit(student)} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2.5 text-xs sm:text-sm font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 rounded-xl transition-all">
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
                        <div className="flex gap-2">
                            <button
                                onClick={handleCopySummary}
                                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-primary/80 hover:text-primary bg-surface hover:bg-surface-elevated border border-border-subtle hover:border-border-strong rounded-xl transition-all shadow-xs active:scale-95"
                                title="Copy full contact card (Name, Email, Phone, Address, Eircode, DOB)"
                            >
                                <Copy size={13} className="text-brand-500 shrink-0" />
                                <span className="truncate">Copy Contact Summary</span>
                            </button>
                            {onNavigate && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        onNavigate('todos', {
                                            newTodo: true,
                                            studentId: student.id,
                                            studentName: fullName(student),
                                        });
                                    }}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-primary/80 hover:text-primary bg-surface hover:bg-surface-elevated border border-border-subtle hover:border-border-strong rounded-xl transition-all shadow-xs active:scale-95 shrink-0"
                                    title="Create a team To-Do linked to this student"
                                >
                                    <CheckSquare size={13} className="text-brand-500 shrink-0" />
                                    <span>Add To-Do</span>
                                </button>
                            )}
                        </div>
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
                                onError={message => notify({ message, type: 'error' })}
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
                                onError={message => notify({ message, type: 'error' })}
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
                                icon={<House size={14} />}
                                label="Address"
                                value={student.address || ''}
                                field="address"
                                studentId={student.id}
                                onSaved={handleFieldSaved}
                                onCopy={handleCopyField}
                                onError={message => notify({ message, type: 'error' })}
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
                                icon={<Mailbox size={14} />}
                                label="Eircode"
                                value={student.eircode || ''}
                                field="eircode"
                                studentId={student.id}
                                onSaved={handleFieldSaved}
                                onCopy={handleCopyField}
                                onError={message => notify({ message, type: 'error' })}
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
                                displayValue={student.dob ? formatDisplayDate(student.dob) : ''}
                                field="dob"
                                type="date"
                                studentId={student.id}
                                onSaved={handleFieldSaved}
                                onCopy={handleCopyField}
                                onError={message => notify({ message, type: 'error' })}
                            />
                        </div>
                    </div>

                    {/* Employment Outcome — shown for graduates or anyone with an outcome record */}
                    {showEmploymentOutcome && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Employment Outcome</h3>
                                <button
                                    type="button"
                                    onClick={() => setEditingOutcome({
                                        first_name: student.first_name,
                                        last_name: student.last_name,
                                        tracking_status: trackingStatus,
                                        is_working: outcomeRow?.is_working ?? null,
                                        started_month: outcomeRow?.started_month ?? null,
                                        field_of_work: outcomeRow?.field_of_work ?? null,
                                        employment_type: outcomeRow?.employment_type ?? null,
                                    })}
                                    title="Edit employment outcome"
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all"
                                >
                                    <Pencil size={11} /> Edit
                                </button>
                            </div>
                            <div className="p-3 rounded-xl bg-surface/50 border border-border-subtle space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <TrackingBadge status={trackingStatus} />
                                    {trackingStatus === 'pending' && outcomeRow?.last_invited_at && (
                                        <span className="text-xs text-muted">Sent {formatDisplayDate(outcomeRow.last_invited_at)}</span>
                                    )}
                                    {trackingStatus === 'responded' && outcomeRow?.last_responded_at && (
                                        <span className="text-xs text-muted">Updated {formatDisplayDate(outcomeRow.last_responded_at)}</span>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <EmploymentBadge status={trackingStatus} row={outcomeRow ?? EMPTY_OUTCOME} />
                                    {trackingStatus === 'responded' && outcomeRow?.is_working && outcomeRow?.started_month && (
                                        <p className="text-xs text-muted">
                                            Since {formatStartedMonth(outcomeRow.started_month)}
                                        </p>
                                    )}
                                </div>
                                {trackingStatus !== 'responded' && (
                                    <div className="pt-0.5">
                                        <CallMarkButton
                                            status={trackingStatus}
                                            calledAt={outcomeRow?.called_no_answer_at}
                                            busy={callMarkBusy}
                                            onToggle={handleToggleCallMark}
                                            name={fullName(student) || student.email || 'Student'}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

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
                                                    <span className="text-xs text-muted block">{cleanVariant(en.courses?.name || '', en.course_variant)}</span>
                                                )}
                                                <SessionLine session={sessionForEnrollment({ ...en, completed_date: en.completed_date ?? null }, courseSessions)} />
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 border font-medium ${STATUS_BADGE[en.status]?.className || 'bg-surface-elevated text-muted border-border-subtle'}`}>
                                                {STATUS_BADGE[en.status]?.icon} {STATUS_CONFIG[en.status]?.label || en.status}
                                            </span>
                                        </div>

                                        {/* Pending Completion Approval Banner */}
                                        {en.completion_request_status === 'pending' && (
                                            <div className="mb-2 p-2 bg-amber-500/10 border border-amber-500/25 rounded-lg flex items-center justify-between gap-2 text-xs animate-pulse">
                                                <span className="text-status-requested font-semibold flex items-center gap-1">
                                                    <Clock size={12} />
                                                    Completion requested for <strong>{en.pending_completion_date ? formatDisplayDate(en.pending_completion_date) : 'Today'}</strong>
                                                    {en.completion_requested_by ? ` (${en.completion_requested_by})` : ''}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await approveMutation.mutateAsync({ enrollmentIds: [en.id] });
                                                                fetchEnrollments();
                                                                notify({ message: 'Approved completion', type: 'success' });
                                                            } catch (err) {
                                                                notify({ message: errorMessage(err, 'Failed to approve'), type: 'error' });
                                                            }
                                                        }}
                                                        disabled={approveMutation.isPending}
                                                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-xs font-bold shadow-xs"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await rejectMutation.mutateAsync({ enrollmentIds: [en.id] });
                                                                fetchEnrollments();
                                                                notify({ message: 'Rejected completion request', type: 'info' });
                                                            } catch (err) {
                                                                notify({ message: errorMessage(err, 'Failed to reject'), type: 'error' });
                                                            }
                                                        }}
                                                        disabled={rejectMutation.isPending}
                                                        className="px-2 py-0.5 bg-danger/10 hover:bg-danger/20 text-status-rejected rounded-sm text-xs font-semibold"
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

                                            <button
                                                type="button"
                                                onClick={() => setConfirmDeleteId(en.id)}
                                                className="flex items-center justify-center px-2.5 py-1.5 bg-surface-elevated border border-border-subtle shadow-xs rounded-lg text-xs font-medium text-status-rejected hover:bg-danger/10 hover:border-danger/20 transition-all"
                                                title="Delete this enrollment"
                                                aria-label={`Delete the ${en.courses?.name || 'course'} enrollment`}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </DialogLayer>
            <ConfirmDialog
                open={!!confirmDeleteId}
                title="Delete this enrollment?"
                message={`${fullName(student)} will be taken off ${enrollments.find(e => e.id === confirmDeleteId)?.courses?.name || 'this course'} and its history removed. To keep the history, use Withdraw instead. This can't be undone.`}
                confirmLabel="Delete enrollment"
                onConfirm={() => confirmDeleteId ? handleDeleteEnrollment(confirmDeleteId) : undefined}
                onCancel={() => setConfirmDeleteId(null)}
            />
            <MergeModal
                open={mergeModalOpen}
                student={student}
                onClose={() => setMergeModalOpen(false)}
                onSuccess={onClose}
            />
            {outcomeModalMount.mounted && shownOutcome && (
                <OutcomeEditModal
                    key={outcomeModalMount.key}
                    isOpen={!!editingOutcome}
                    person={shownOutcome}
                    onSave={handleSaveOutcome}
                    onClose={() => setEditingOutcome(null)}
                    onSaved={() => {
                        queryClient.invalidateQueries({ queryKey: ['outcomes_graduates'] });
                        queryClient.invalidateQueries({ queryKey: ['analytics_employment_statuses_v1'] });
                        notify({ message: 'Employment status updated', type: 'success' });
                    }}
                />
            )}
        </>
    );
}

/** Course date of an enrollment with its days, time and place (when they are set). */
function SessionLine({ session }: { session: CourseSession | null }) {
    if (!sessionHasSchedule(session)) return null;
    const days = sessionDays(session);
    const time = days.length > 1 && hasDayOverrides(session) ? '' : formatTimeRange(session.start_time, session.end_time);
    return (
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted" title={sessionTooltip(session)} data-testid="student-session">
            <span className="inline-flex items-center gap-1"><Calendar size={11} />{formatDateLongWithWeekday(session.date)}{days.length > 1 ? ` · ${days.length} days` : ''}</span>
            {time && <span className="inline-flex items-center gap-1"><Clock size={11} />{time}</span>}
            {session.location && <span className="inline-flex items-center gap-1 min-w-0"><MapPin size={11} className="shrink-0" /><span className="truncate">{session.location}</span></span>}
        </span>
    );
}

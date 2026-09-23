import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    X, Mail, Phone, MapPin, Calendar, Copy, Navigation, Loader2, XCircle, AlertTriangle, MessageSquare,
    MessageCircle, ChevronUp, ChevronDown, GraduationCap, ArrowRight, Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { toast } from '../lib/toast';
import { cleanVariant } from '../lib/types';
import { formatDateDMY } from '../lib/dateUtils';
import { formatPhoneForWhatsApp, formatPhoneForCall, formatGoogleMapsUrl, formatStudentContactSummary } from '../lib/contactUtils';
import { Avatar, PriorityStar, StatusBadge } from './Viewer/ViewerUI';
import CompletionRequestModal, { type CompletionTarget } from './Viewer/CompletionRequestModal';
import { copyText, fullName, isCompletable, relativeDay, sessionDate, weekdayDate } from './Viewer/viewerUtils';

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
    /** Previous / next student in the list the drawer was opened from */
    onPrev?: () => void;
    onNext?: () => void;
    position?: { index: number; total: number };
    /** Opens a course roster (the drawer closes itself first) */
    onOpenCourse?: (courseId: string) => void;
}

const STATUS_ORDER: Record<string, number> = { confirmed: 0, invited: 1, requested: 2, completed: 3, rejected: 4, withdrawn: 5 };

function ageFrom(dob: string | null): number | null {
    if (!dob) return null;
    const d = new Date(`${dob.slice(0, 10)}T12:00:00`);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age >= 0 && age < 130 ? age : null;
}

function QuickAction({ href, onClick, icon, label, tone = 'default', external }: {
    href?: string | null; onClick?: () => void; icon: React.ReactNode; label: string; tone?: 'default' | 'green' | 'blue'; external?: boolean;
}) {
    const tones = {
        default: 'text-primary hover:border-brand-500/40',
        green: 'text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/40',
        blue: 'text-sky-700 dark:text-sky-300 hover:border-sky-500/40',
    }[tone];
    const cls = `flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-surface-elevated/70 border border-border-subtle text-[11px] font-semibold transition-all active:scale-[0.97] ${tones}`;
    if (href) {
        return <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{icon}{label}</a>;
    }
    return <button type="button" onClick={onClick} className={cls}>{icon}{label}</button>;
}

function InfoField({ icon, label, value, copyValue, action }: {
    icon: React.ReactElement; label: string; value: string | null; copyValue?: string | null; action?: React.ReactNode;
}) {
    const toCopy = copyValue ?? value;
    return (
        <div className="flex items-center gap-3 px-3 py-2.5 group">
            <span className="text-muted shrink-0">{icon}</span>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider">{label}</p>
                {value ? (
                    <button
                        type="button"
                        onClick={() => copyText(toCopy, label)}
                        className="block max-w-full text-left text-sm text-primary font-medium truncate hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-copy"
                        title={`Copy ${label.toLowerCase()}`}
                    >
                        {value}
                    </button>
                ) : (
                    <p className="text-sm text-muted/60 italic">Not set</p>
                )}
            </div>
            {action}
            {value && (
                <button type="button" onClick={() => copyText(toCopy, label)} aria-label={`Copy ${label}`} className="p-1.5 rounded-lg text-muted/50 hover:text-primary hover:bg-surface-elevated opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-all">
                    <Copy size={13} />
                </button>
            )}
        </div>
    );
}

/** Registered → Invited → Confirmed → Completed */
function Timeline({ en }: { en: EnrollmentDetail }) {
    const steps = [
        { key: 'registered', label: 'Registered', date: en.created_at, done: true },
        { key: 'invited', label: 'Invited', date: en.invited_at || en.invited_date, done: ['invited', 'confirmed', 'completed'].includes(en.status) || !!en.invited_date },
        { key: 'confirmed', label: 'Confirmed', date: en.confirmed_at || en.confirmed_date, done: ['confirmed', 'completed'].includes(en.status) },
        { key: 'completed', label: 'Completed', date: en.completed_date || en.completed_at, done: en.status === 'completed' },
    ];
    return (
        <ol className="grid grid-cols-4 gap-1" aria-label="Enrollment progress">
            {steps.map((s, i) => (
                <li key={s.key} className="min-w-0">
                    <div className="flex items-center gap-1">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${s.done ? 'bg-brand-500 text-white' : 'bg-surface-elevated border border-border-strong'}`}>
                            {s.done && <Check size={10} strokeWidth={3} />}
                        </span>
                        {i < steps.length - 1 && <span className={`h-0.5 flex-1 rounded-full ${steps[i + 1].done ? 'bg-brand-500' : 'bg-border-subtle'}`} />}
                    </div>
                    <p className={`text-[10px] font-semibold mt-1 ${s.done ? 'text-primary' : 'text-muted'}`}>{s.label}</p>
                    <p className="text-[10px] text-muted tabular-nums">{s.done && s.date ? formatDateDMY(s.date) : '—'}</p>
                </li>
            ))}
        </ol>
    );
}

export default function StudentDetailDrawer({ studentId, onClose, onPrev, onNext, position, onOpenCourse }: StudentDetailDrawerProps) {
    const [completionTarget, setCompletionTarget] = useState<{ targets: CompletionTarget[]; course: string } | null>(null);

    // Registers in the shared modal stack: Escape closes only the top-most layer (the completion modal first)
    useModalBehavior(!!studentId, onClose);

    const { data: student, isLoading, error, refetch } = useQuery<StudentDetailData | null>({
        queryKey: ['restricted_student_detail', studentId],
        queryFn: async () => {
            if (!studentId) return null;
            const { data, error } = await supabase.rpc('get_student_detail_restricted', { p_student_id: studentId });
            if (error) throw error;
            return data;
        },
        enabled: !!studentId,
    });

    // ↑ / ↓ (or K / J) step through the list the drawer was opened from
    useEffect(() => {
        if (!studentId || completionTarget) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if ((e.key === 'ArrowDown' || e.key === 'j') && onNext) { e.preventDefault(); onNext(); }
            else if ((e.key === 'ArrowUp' || e.key === 'k') && onPrev) { e.preventDefault(); onPrev(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [studentId, completionTarget, onNext, onPrev]);

    const enrollments = useMemo(
        () => [...(student?.enrollments || [])].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || b.created_at.localeCompare(a.created_at)),
        [student]
    );

    if (!studentId) return null;

    const name = student ? fullName(student) : '';
    const call = formatPhoneForCall(student?.phone);
    const whatsapp = formatPhoneForWhatsApp(student?.phone);
    const age = ageFrom(student?.dob ?? null);

    const copyCard = () => {
        if (!student) return;
        navigator.clipboard.writeText(formatStudentContactSummary(student)).then(
            () => toast.success('Contact card copied'),
            () => toast.error('Failed to copy contact card')
        );
    };

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div data-testid="drawer-backdrop" className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fadeIn" onClick={onClose} />

            <aside
                role="dialog"
                aria-modal="true"
                aria-label={name ? `Student ${name}` : 'Student details'}
                className="absolute inset-y-0 right-0 w-full sm:max-w-[480px] bg-surface border-l border-border-subtle shadow-2xl flex flex-col animate-slideInRight"
            >
                {/* Header */}
                <header className="px-4 sm:px-5 pt-4 pb-3 border-b border-border-subtle space-y-3 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                            {position && position.total > 1 && (
                                <>
                                    <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous student" title="Previous (↑ / K)" className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated disabled:opacity-30">
                                        <ChevronUp size={18} />
                                    </button>
                                    <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next student" title="Next (↓ / J)" className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated disabled:opacity-30">
                                        <ChevronDown size={18} />
                                    </button>
                                    <span className="text-[11px] font-semibold text-muted tabular-nums ml-1">{position.index + 1} / {position.total}</span>
                                </>
                            )}
                        </div>
                        <button type="button" aria-label="Close drawer" onClick={onClose} className="p-1.5 -mr-1 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated" title="Close (Esc)">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex items-center gap-3 min-w-0">
                        {student ? <Avatar id={student.id} person={student} size="lg" /> : <div className="w-12 h-12 rounded-full bg-muted/15 animate-pulse shrink-0" />}
                        <div className="min-w-0">
                            {student ? (
                                <>
                                    <h2
                                        onClick={() => copyText(name, 'Name')}
                                        className="font-bold text-primary text-lg leading-tight truncate cursor-copy hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                        title="Copy name"
                                    >
                                        {name}
                                    </h2>
                                    <p className="text-xs text-muted mt-0.5">
                                        Registered {formatDateDMY(student.created_at)} · {relativeDay(student.created_at.slice(0, 10))}
                                    </p>
                                </>
                            ) : (
                                <div className="space-y-1.5">
                                    <div className="h-5 w-40 bg-muted/15 rounded animate-pulse" />
                                    <div className="h-3 w-28 bg-muted/10 rounded animate-pulse" />
                                </div>
                            )}
                        </div>
                    </div>

                    {student && (
                        <div className="grid grid-cols-4 gap-2">
                            <QuickAction href={student.email ? `mailto:${student.email}` : null} icon={<Mail size={16} />} label="Email" />
                            {call ? <QuickAction href={call} icon={<Phone size={16} />} label="Call" tone="blue" /> : <QuickAction onClick={() => copyText(student.phone, 'Phone')} icon={<Phone size={16} />} label="No phone" />}
                            {whatsapp ? <QuickAction href={whatsapp} external icon={<MessageCircle size={16} />} label="WhatsApp" tone="green" /> : <QuickAction onClick={() => copyText(student.email, 'Email')} icon={<Copy size={16} />} label="Copy email" />}
                            <QuickAction onClick={copyCard} icon={<Copy size={16} />} label="Copy card" />
                        </div>
                    )}
                </header>

                {/* Body */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
                            <Loader2 size={28} className="animate-spin text-brand-500" />
                            <span className="text-sm font-medium">Loading student…</span>
                        </div>
                    ) : error || !student ? (
                        <div className="text-center py-14 px-4 bg-red-500/5 rounded-2xl border border-red-500/15">
                            <XCircle className="text-red-500 mx-auto mb-2" size={32} />
                            <h3 className="font-bold text-primary text-sm">Failed to load student record</h3>
                            <p className="text-xs text-muted mt-1">Please try again or contact your administrator.</p>
                            <button type="button" onClick={() => refetch()} className="mt-4 h-8 px-3 bg-surface border border-border-subtle rounded-xl text-xs font-semibold hover:bg-surface-elevated">
                                Retry
                            </button>
                        </div>
                    ) : (
                        <>
                            {student.flags?.length > 0 && (
                                <section className="space-y-2">
                                    <h3 className="text-[11px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <AlertTriangle size={13} /> Notes & Flags ({student.flags.length})
                                    </h3>
                                    {student.flags.map(flag => (
                                        <div key={flag.id} className="p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-bold text-red-700 dark:text-red-400 truncate">{flag.course_name}</p>
                                                {flag.created_at && <span className="text-[10px] text-muted shrink-0">{formatDateDMY(flag.created_at)}</span>}
                                            </div>
                                            {flag.comment && <p className="text-xs text-red-700/90 dark:text-red-300/80 mt-1 leading-relaxed">{flag.comment}</p>}
                                        </div>
                                    ))}
                                </section>
                            )}

                            <section className="space-y-2">
                                <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">Contact details</h3>
                                <div className="rounded-xl border border-border-subtle bg-surface-elevated/30 divide-y divide-border-subtle">
                                    <InfoField icon={<Mail size={15} />} label="Email" value={student.email} />
                                    <InfoField icon={<Phone size={15} />} label="Phone" value={student.phone} />
                                    <InfoField
                                        icon={<MapPin size={15} />}
                                        label="Address"
                                        value={student.address}
                                        action={student.address && formatGoogleMapsUrl(student.address) ? (
                                            <a href={formatGoogleMapsUrl(student.address)!} target="_blank" rel="noopener noreferrer" className="p-1.5 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-lg" title="Open in Google Maps" aria-label="Open address in Google Maps">
                                                <Navigation size={13} />
                                            </a>
                                        ) : undefined}
                                    />
                                    <InfoField
                                        icon={<MapPin size={15} />}
                                        label="Eircode"
                                        value={student.eircode}
                                        action={student.eircode && formatGoogleMapsUrl(student.eircode) ? (
                                            <a href={formatGoogleMapsUrl(student.eircode)!} target="_blank" rel="noopener noreferrer" className="p-1.5 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-lg" title="Open in Google Maps" aria-label="Open eircode in Google Maps">
                                                <Navigation size={13} />
                                            </a>
                                        ) : undefined}
                                    />
                                    {student.dob && (
                                        <InfoField icon={<Calendar size={15} />} label="Date of Birth" value={`${formatDateDMY(student.dob)}${age !== null ? ` · ${age} y.o.` : ''}`} copyValue={formatDateDMY(student.dob)} />
                                    )}
                                </div>
                            </section>

                            <section className="space-y-2">
                                <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">Course Enrollments ({enrollments.length})</h3>
                                {enrollments.length === 0 ? (
                                    <p className="text-xs text-muted italic text-center py-6 bg-surface-elevated/40 rounded-xl border border-border-subtle">No course enrollments found for this student.</p>
                                ) : (
                                    enrollments.map(en => {
                                        const pending = en.completion_request_status === 'pending';
                                        const declined = en.completion_request_status === 'rejected' && en.status !== 'completed';
                                        const session = sessionDate(en);
                                        const canComplete = isCompletable(en.status, en.completion_request_status);
                                        return (
                                            <article key={en.id} className="p-3.5 rounded-xl border border-border-subtle bg-surface-elevated/30 space-y-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <h4 className="font-bold text-primary text-sm leading-snug">{en.course_name}</h4>
                                                            {en.is_priority && <PriorityStar />}
                                                        </div>
                                                        {en.course_variant && (
                                                            <p className="text-[11px] text-muted mt-0.5">Variant: <span className="font-medium text-primary/80">{cleanVariant(en.course_name, en.course_variant)}</span></p>
                                                        )}
                                                    </div>
                                                    <StatusBadge status={en.status} queuePosition={en.queue_position} pendingApproval={pending} />
                                                </div>

                                                {session && (
                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-brand-500/5 border border-brand-500/15">
                                                        <Calendar size={12} className="text-brand-500" />
                                                        <span className="text-muted">Course day</span>
                                                        <strong className="text-primary">{weekdayDate(session)}</strong>
                                                        <span className="text-muted">· {relativeDay(session)}</span>
                                                    </div>
                                                )}

                                                <Timeline en={en} />

                                                {en.notes && (
                                                    <div className="flex items-start gap-1.5 p-2 bg-surface rounded-lg border border-border-subtle text-[11px] text-primary/80">
                                                        <MessageSquare size={12} className="text-brand-500 shrink-0 mt-0.5" />
                                                        <p className="leading-snug whitespace-pre-line">{en.notes}</p>
                                                    </div>
                                                )}

                                                {declined && (
                                                    <p className="text-[11px] text-red-600 dark:text-red-400 bg-red-500/5 border border-red-500/20 p-2 rounded-lg">
                                                        <strong>Completion Request Rejected:</strong> {en.completion_rejection_reason || 'No reason specified'}.
                                                    </p>
                                                )}

                                                <div className="flex items-center justify-between gap-2 pt-0.5">
                                                    {onOpenCourse ? (
                                                        <button type="button" onClick={() => onOpenCourse(en.course_id)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                                                            Open course <ArrowRight size={12} />
                                                        </button>
                                                    ) : <span />}
                                                    {canComplete && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setCompletionTarget({ targets: [{ enrollmentId: en.id, name, sessionDate: session }], course: en.course_name })}
                                                            className="h-8 px-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all inline-flex items-center gap-1.5 active:scale-95"
                                                        >
                                                            <GraduationCap size={13} />
                                                            {declined ? 'Re-submit Completion' : 'Request Completion'}
                                                        </button>
                                                    )}
                                                </div>
                                            </article>
                                        );
                                    })
                                )}
                            </section>
                        </>
                    )}
                </div>
            </aside>

            {completionTarget && (
                <CompletionRequestModal
                    targets={completionTarget.targets}
                    context={completionTarget.course}
                    onClose={() => setCompletionTarget(null)}
                    onSubmitted={() => refetch()}
                />
            )}
        </div>
    );
}

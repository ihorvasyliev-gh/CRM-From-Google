import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Edit2, Trash2, UserPlus, Mail, Phone, MapPin, Calendar, Clock, CheckCircle, Send, XCircle, GraduationCap } from 'lucide-react';

interface Student {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    eircode: string;
    dob: string;
}

interface Enrollment {
    id: string;
    status: string;
    course_variant: string | null;
    created_at: string;
    courses: { name: string } | null;
}

interface Props {
    student: Student;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onEnroll: () => void;
}

const STATUS_BADGE: Record<string, { icon: JSX.Element; className: string }> = {
    requested: { icon: <Clock size={12} />, className: 'bg-amber-50 text-amber-700 border-amber-200' },
    invited: { icon: <Send size={12} />, className: 'bg-blue-50 text-blue-700 border-blue-200' },
    confirmed: { icon: <CheckCircle size={12} />, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    rejected: { icon: <XCircle size={12} />, className: 'bg-red-50 text-red-600 border-red-200' },
    completed: { icon: <GraduationCap size={12} />, className: 'bg-teal-50 text-teal-700 border-teal-200' },
    withdrawn: { icon: <XCircle size={12} />, className: 'bg-muted/10 text-muted border-border-subtle' },
};

const AVATAR_GRADIENTS = [
    'from-brand-500 to-brand-600',
    'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-blue-600',
];

export default function StudentDetail({ student, onClose, onEdit, onDelete, onEnroll }: Props) {
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    useEffect(() => {
        fetchEnrollments();
    }, [student.id]);

    async function fetchEnrollments() {
        const { data } = await supabase
            .from('enrollments')
            .select('id, student_id, course_id, status, course_variant, created_at, courses(name)')
            .eq('student_id', student.id)
            .order('created_at', { ascending: false });
        if (data) setEnrollments(data as unknown as Enrollment[]);
    }

    async function handleUpdateStatus(id: string, newStatus: string) {
        // For completed/withdrawn, update ALL variants of this course for this student
        if (newStatus === 'completed' || newStatus === 'withdrawn') {
            const currentEnrollment = enrollments.find(e => e.id === id);
            // @ts-ignore
            if (!currentEnrollment || !currentEnrollment.course_id) return;

            const relatedEnrollments = enrollments.filter(e =>
                // @ts-ignore
                e.course_id === currentEnrollment.course_id
            );

            const relatedIds = relatedEnrollments.map(e => e.id);

            const { error } = await supabase
                .from('enrollments')
                .update({ status: newStatus })
                .in('id', relatedIds);

            if (!error) {
                setEnrollments(prev => prev.map(e => relatedIds.includes(e.id) ? { ...e, status: newStatus } : e));
            }
        } else {
            const { error } = await supabase
                .from('enrollments')
                .update({ status: newStatus })
                .eq('id', id);

            if (!error) {
                setEnrollments(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
            }
        }
    }

    async function handleDeleteEnrollment(id: string) {
        const { error } = await supabase
            .from('enrollments')
            .delete()
            .eq('id', id);

        if (!error) {
            setEnrollments(prev => prev.filter(e => e.id !== id));
            setConfirmDeleteId(null);
        }
    }

    function getAvatarGradient(id: string): string {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
    }

    const infoItems = [
        { icon: <Mail size={14} />, label: 'Email', value: student.email },
        { icon: <Phone size={14} />, label: 'Phone', value: student.phone },
        { icon: <MapPin size={14} />, label: 'Address', value: student.address },
        { icon: <MapPin size={14} />, label: 'Eircode', value: student.eircode },
        { icon: <Calendar size={14} />, label: 'Date of Birth', value: student.dob ? new Date(student.dob).toLocaleDateString('en-IE') : '' },
    ].filter(item => item.value);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full sm:w-96 h-full sm:h-auto sm:max-h-[85vh] bg-surface-elevated sm:rounded-2xl shadow-2xl overflow-y-auto sm:mr-4 animate-slideInRight">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur-sm border-b border-border-subtle px-5 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 bg-gradient-to-br ${getAvatarGradient(student.id)} rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-surface-elevated shadow-md`}>
                                {(student.first_name?.[0] || '').toUpperCase()}{(student.last_name?.[0] || '').toUpperCase()}
                            </div>
                            <div>
                                <h2 className="font-bold text-primary">{student.first_name} {student.last_name}</h2>
                                <p className="text-xs text-muted">{enrollments.length} enrollment{enrollments.length !== 1 ? 's' : ''}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-muted hover:text-muted hover:bg-surface-elevated rounded-lg transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {/* Actions */}
                    <div className="flex gap-2">
                        <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-xl transition-all">
                            <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={onEnroll} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all">
                            <UserPlus size={14} /> Enroll
                        </button>
                        <button onClick={onDelete} className="flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-all">
                            <Trash2 size={14} />
                        </button>
                    </div>

                    {/* Contact Info */}
                    {infoItems.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Contact Info</h3>
                            <div className="space-y-1.5">
                                {infoItems.map(item => (
                                    <div key={item.label} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface transition-all">
                                        <span className="text-muted">{item.icon}</span>
                                        <div>
                                            <p className="text-[10px] text-muted font-medium">{item.label}</p>
                                            <p className="text-sm text-primary">{item.value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Enrollments */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Enrollments</h3>
                        {enrollments.length === 0 ? (
                            <div className="text-center py-6">
                                <p className="text-sm text-muted">No enrollments yet</p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {enrollments.map(en => (
                                    <div key={en.id} className="p-3 rounded-xl bg-surface-50/50 border border-border-subtle hover:bg-surface transition-all group">
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <p className="text-sm font-medium text-primary">{en.courses?.name || 'Unknown'}</p>
                                                {en.course_variant && (
                                                    <span className="text-[10px] text-muted">{en.course_variant}</span>
                                                )}
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 border font-medium ${STATUS_BADGE[en.status]?.className || 'bg-surface-100 text-muted border-border-subtle'}`}>
                                                {STATUS_BADGE[en.status]?.icon} {en.status}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                            {/* Actions */}
                                            {en.status !== 'completed' && (
                                                <button
                                                    onClick={() => handleUpdateStatus(en.id, 'completed')}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-surface-elevated border border-border-subtle shadow-sm rounded-lg text-xs font-medium text-teal-600 hover:bg-teal-50 hover:border-teal-200 transition-all"
                                                    title="Mark as Completed"
                                                >
                                                    <GraduationCap size={12} /> Complete
                                                </button>
                                            )}
                                            {en.status !== 'withdrawn' && (
                                                <button
                                                    onClick={() => handleUpdateStatus(en.id, 'withdrawn')}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-surface-elevated border border-border-subtle shadow-sm rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 hover:border-slate-200 transition-all"
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
                                                    className="flex items-center justify-center px-2.5 py-1.5 bg-surface-elevated border border-border-subtle shadow-sm rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
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
        </div>
    );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Mail, Phone, MapPin, Calendar, BookOpen, Edit2, Trash2, Plus, Loader2 } from 'lucide-react';

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
    course_id: string;
    status: string;
    course_variant: string | null;
    notes: string | null;
    created_at: string;
    courses: { name: string } | null;
}

interface StudentDetailProps {
    student: Student;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onEnroll: () => void;
}

const STATUS_COLORS: Record<string, string> = {
    requested: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    invited: 'bg-blue-50 text-blue-700 border-blue-200',
    confirmed: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200'
};

export default function StudentDetail({ student, onClose, onEdit, onDelete, onEnroll }: StudentDetailProps) {
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEnrollments();
    }, [student.id]);

    async function fetchEnrollments() {
        setLoading(true);
        const { data } = await supabase
            .from('enrollments')
            .select('*, courses(name)')
            .eq('student_id', student.id)
            .order('created_at', { ascending: false });
        if (data) setEnrollments(data as Enrollment[]);
        setLoading(false);
    }

    const infoItems = [
        { icon: <Mail size={14} />, label: 'Email', value: student.email },
        { icon: <Phone size={14} />, label: 'Phone', value: student.phone },
        { icon: <MapPin size={14} />, label: 'Address', value: student.address },
        { icon: <MapPin size={14} />, label: 'Eircode', value: student.eircode },
        { icon: <Calendar size={14} />, label: 'DOB', value: student.dob ? new Date(student.dob).toLocaleDateString('en-IE') : null },
    ];

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30 animate-fadeIn" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white shadow-2xl animate-slideInRight h-full overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {(student.first_name?.[0] || '').toUpperCase()}{(student.last_name?.[0] || '').toUpperCase()}
                        </div>
                        <div>
                            <h2 className="font-semibold text-slate-900">{student.first_name} {student.last_name}</h2>
                            <p className="text-xs text-slate-500">{student.email}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={onEdit}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                        >
                            <Edit2 size={14} /> Edit
                        </button>
                        <button
                            onClick={onEnroll}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition"
                        >
                            <Plus size={14} /> Enroll in Course
                        </button>
                        <button
                            onClick={onDelete}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition ml-auto"
                        >
                            <Trash2 size={14} /> Delete
                        </button>
                    </div>

                    {/* Info */}
                    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Contact Info</h3>
                        {infoItems.map(item => item.value ? (
                            <div key={item.label} className="flex items-center gap-3 text-sm">
                                <span className="text-slate-400">{item.icon}</span>
                                <span className="text-slate-500 w-16">{item.label}</span>
                                <span className="text-slate-800 font-medium">{item.value}</span>
                            </div>
                        ) : null)}
                    </div>

                    {/* Enrollments */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                <BookOpen size={14} /> Enrollments ({enrollments.length})
                            </h3>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-6">
                                <Loader2 size={20} className="animate-spin text-blue-500" />
                            </div>
                        ) : enrollments.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-xl">
                                No enrollments yet
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {enrollments.map(en => (
                                    <div key={en.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm transition">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-sm text-slate-900">
                                                    {en.courses?.name || 'Unknown Course'}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {en.course_variant && <span className="mr-2">{en.course_variant}</span>}
                                                    {new Date(en.created_at).toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </p>
                                                {en.notes && (
                                                    <p className="text-xs text-slate-400 mt-1 italic">{en.notes}</p>
                                                )}
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[en.status] || 'bg-slate-50 text-slate-600'}`}>
                                                {en.status}
                                            </span>
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

import { useState, useEffect, FormEvent, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { X, Loader2, Search, UserPlus } from 'lucide-react';

interface Student {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
}

interface Course {
    id: string;
    name: string;
}

interface EnrollmentModalProps {
    open: boolean;
    preselectedStudentId?: string;
    preselectedCourseId?: string;
    onSave: () => void;
    onClose: () => void;
}

export default function EnrollmentModal({ open, preselectedStudentId, preselectedCourseId, onSave, onClose }: EnrollmentModalProps) {
    const [students, setStudents] = useState<Student[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [studentSearch, setStudentSearch] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [variant, setVariant] = useState('');
    const [status, setStatus] = useState('requested');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showStudentDropdown, setShowStudentDropdown] = useState(false);

    useEffect(() => {
        if (open) {
            loadData();
            setSelectedStudentId(preselectedStudentId || '');
            setSelectedCourseId(preselectedCourseId || '');
            setVariant('');
            setStatus('requested');
            setNotes('');
            setError('');
            setStudentSearch('');
        }
    }, [open, preselectedStudentId, preselectedCourseId]);

    async function loadData() {
        const [studRes, courseRes] = await Promise.all([
            supabase.from('students').select('id, first_name, last_name, email').order('first_name'),
            supabase.from('courses').select('id, name').order('name')
        ]);
        if (studRes.data) setStudents(studRes.data);
        if (courseRes.data) setCourses(courseRes.data);
    }

    const filteredStudents = useMemo(() => {
        if (!studentSearch.trim()) return students.slice(0, 20);
        const q = studentSearch.toLowerCase();
        return students.filter(s =>
            `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q)
        ).slice(0, 20);
    }, [students, studentSearch]);

    const selectedStudent = students.find(s => s.id === selectedStudentId);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');

        if (!selectedStudentId) {
            setError('Please select a student');
            return;
        }
        if (!selectedCourseId) {
            setError('Please select a course');
            return;
        }

        setSaving(true);
        try {
            const payload: any = {
                student_id: selectedStudentId,
                course_id: selectedCourseId,
                status,
                course_variant: variant.trim() || null,
            };
            if (notes.trim()) payload.notes = notes.trim();

            const { error: dbError } = await supabase.from('enrollments').insert(payload);
            if (dbError) {
                if (dbError.message.includes('duplicate') || dbError.message.includes('unique')) {
                    throw new Error('This student is already enrolled in this course with this variant');
                }
                throw new Error(dbError.message);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create enrollment');
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    const AVATAR_GRADIENTS = [
        'from-brand-500 to-brand-600',
        'from-violet-500 to-purple-600',
        'from-emerald-500 to-teal-600',
        'from-amber-500 to-orange-600',
        'from-rose-500 to-pink-600',
        'from-cyan-500 to-blue-600',
    ];

    function getGradient(id: string): string {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface-elevated rounded-2xl shadow-2xl w-full max-w-lg animate-scaleIn max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-surface-elevated/95 backdrop-blur-sm border-b border-border-subtle px-6 py-4 rounded-t-2xl z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                                <UserPlus size={18} />
                            </div>
                            <h2 className="text-lg font-bold text-primary">Add Enrollment</h2>
                        </div>
                        <button onClick={onClose} className="p-2 text-muted hover:text-muted hover:bg-surface-elevated rounded-lg transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl animate-slideDown">
                            {error}
                        </div>
                    )}

                    {/* Student Selector */}
                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Student *</label>
                        {preselectedStudentId && selectedStudent ? (
                            <div className="flex items-center gap-3 px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm text-primary">
                                <div className={`w-7 h-7 bg-gradient-to-br ${getGradient(selectedStudent.id)} rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                    {selectedStudent.first_name[0]}{selectedStudent.last_name[0]}
                                </div>
                                {selectedStudent.first_name} {selectedStudent.last_name}
                                <span className="text-muted">({selectedStudent.email})</span>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search by name or email..."
                                    className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated transition-all placeholder:text-muted"
                                    value={selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : studentSearch}
                                    onChange={e => {
                                        setStudentSearch(e.target.value);
                                        setSelectedStudentId('');
                                        setShowStudentDropdown(true);
                                    }}
                                    onFocus={() => setShowStudentDropdown(true)}
                                />
                                {showStudentDropdown && !selectedStudentId && (
                                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-elevated border border-border-subtle rounded-xl shadow-lg max-h-48 overflow-y-auto z-20 animate-slideDown">
                                        {filteredStudents.length === 0 ? (
                                            <div className="px-4 py-3 text-sm text-muted text-center">No students found</div>
                                        ) : (
                                            filteredStudents.map(s => (
                                                <button
                                                    type="button"
                                                    key={s.id}
                                                    onClick={() => {
                                                        setSelectedStudentId(s.id);
                                                        setShowStudentDropdown(false);
                                                        setStudentSearch('');
                                                    }}
                                                    className="w-full text-left px-3.5 py-2.5 hover:bg-brand-50 text-sm border-b border-border-subtle last:border-0 transition-all flex items-center gap-3"
                                                >
                                                    <div className={`w-7 h-7 bg-gradient-to-br ${getGradient(s.id)} rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                                        {s.first_name[0]}{s.last_name[0]}
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-primary">{s.first_name} {s.last_name}</span>
                                                        <span className="text-muted text-xs ml-2">{s.email}</span>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Course Selector */}
                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Course *</label>
                        <select
                            value={selectedCourseId}
                            onChange={e => setSelectedCourseId(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated transition-all"
                        >
                            <option value="">Select a course...</option>
                            {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Variant */}
                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">
                            Variant <span className="text-muted font-normal normal-case">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={variant}
                            onChange={e => setVariant(e.target.value)}
                            placeholder="e.g. English, Ukrainian"
                            className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated transition-all placeholder:text-muted"
                        />
                    </div>

                    {/* Status */}
                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Initial Status</label>
                        <select
                            value={status}
                            onChange={e => setStatus(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated transition-all"
                        >
                            <option value="requested">Requested</option>
                            <option value="invited">Invited</option>
                            <option value="confirmed">Confirmed</option>
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">
                            Notes <span className="text-muted font-normal normal-case">(optional)</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Any notes about this enrollment..."
                            rows={2}
                            className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated transition-all resize-none placeholder:text-muted"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-muted bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving && <Loader2 size={16} className="animate-spin" />}
                            Enroll Student
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

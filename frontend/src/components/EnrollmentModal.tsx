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
            // Only add notes if the column exists (graceful)
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 animate-fadeIn" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-scaleIn max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 rounded-t-2xl flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg text-green-600">
                            <UserPlus size={20} />
                        </div>
                        <h2 className="text-lg font-semibold text-slate-900">Add Enrollment</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                            {error}
                        </div>
                    )}

                    {/* Student Selector */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Student <span className="text-red-400">*</span>
                        </label>
                        {preselectedStudentId && selectedStudent ? (
                            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                                {selectedStudent.first_name} {selectedStudent.last_name} ({selectedStudent.email})
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search by name or email..."
                                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                    value={selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : studentSearch}
                                    onChange={e => {
                                        setStudentSearch(e.target.value);
                                        setSelectedStudentId('');
                                        setShowStudentDropdown(true);
                                    }}
                                    onFocus={() => setShowStudentDropdown(true)}
                                />
                                {showStudentDropdown && !selectedStudentId && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-20">
                                        {filteredStudents.length === 0 ? (
                                            <div className="px-4 py-3 text-sm text-slate-400">No students found</div>
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
                                                    className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm border-b border-slate-100 last:border-0 transition"
                                                >
                                                    <span className="font-medium text-slate-800">{s.first_name} {s.last_name}</span>
                                                    <span className="text-slate-400 ml-2">{s.email}</span>
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Course <span className="text-red-400">*</span>
                        </label>
                        <select
                            value={selectedCourseId}
                            onChange={e => setSelectedCourseId(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                        >
                            <option value="">Select a course...</option>
                            {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Variant */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Variant <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={variant}
                            onChange={e => setVariant(e.target.value)}
                            placeholder="e.g. English, Ukrainian"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                        />
                    </div>

                    {/* Status */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Initial Status</label>
                        <select
                            value={status}
                            onChange={e => setStatus(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                        >
                            <option value="requested">Requested</option>
                            <option value="invited">Invited</option>
                            <option value="confirmed">Confirmed</option>
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Notes <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Any notes about this enrollment..."
                            rows={2}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
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

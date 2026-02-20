import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Plus, Edit2, Trash2, ChevronRight, Loader2, Users } from 'lucide-react';
import StudentModal, { StudentFormData } from './StudentModal';
import StudentDetail from './StudentDetail';
import EnrollmentModal from './EnrollmentModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';

interface Student {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    eircode: string;
    dob: string;
    created_at: string;
}

export default function StudentList() {
    const [students, setStudents] = useState<Student[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    const [studentModalOpen, setStudentModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<StudentFormData | null>(null);
    const [detailStudent, setDetailStudent] = useState<Student | null>(null);
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const [enrollStudentId, setEnrollStudentId] = useState<string | undefined>();
    const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

    useEffect(() => { fetchStudents(); }, []);

    async function fetchStudents() {
        setLoading(true);
        const { data } = await supabase.from('students').select('*').order('created_at', { ascending: false });
        if (data) setStudents(data);
        setLoading(false);
    }

    async function handleSaveStudent(data: StudentFormData) {
        if (data.id) {
            const { id, ...rest } = data;
            const { error } = await supabase.from('students').update(rest).eq('id', id);
            if (error) throw new Error(error.message);
            setStudents(prev => prev.map(s => s.id === id ? { ...s, ...rest } as Student : s));
            if (detailStudent?.id === id) {
                setDetailStudent(prev => prev ? { ...prev, ...rest } as Student : null);
            }
            setToast({ message: 'Student updated', type: 'success' });
        } else {
            const { error, data: inserted } = await supabase.from('students').insert(data).select();
            if (error) {
                if (error.message.includes('duplicate') || error.message.includes('unique')) {
                    throw new Error('A student with this email already exists');
                }
                throw new Error(error.message);
            }
            if (inserted) setStudents(prev => [inserted[0], ...prev]);
            setToast({ message: 'Student added', type: 'success' });
        }
    }

    async function handleDeleteStudent() {
        if (!deleteTarget) return;
        const { error } = await supabase.from('students').delete().eq('id', deleteTarget.id);
        if (error) {
            setToast({ message: 'Failed to delete student', type: 'error' });
        } else {
            setStudents(prev => prev.filter(s => s.id !== deleteTarget.id));
            if (detailStudent?.id === deleteTarget.id) setDetailStudent(null);
            setToast({ message: 'Student deleted', type: 'success' });
        }
        setDeleteTarget(null);
    }

    function openEdit(student: Student) {
        setEditingStudent({
            id: student.id,
            first_name: student.first_name || '',
            last_name: student.last_name || '',
            email: student.email || '',
            phone: student.phone || '',
            address: student.address || '',
            eircode: student.eircode || '',
            dob: student.dob || '',
        });
        setStudentModalOpen(true);
    }

    function openEnrollFromDetail() {
        if (detailStudent) {
            setEnrollStudentId(detailStudent.id);
            setEnrollModalOpen(true);
        }
    }

    const filteredStudents = students.filter(s => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q) ||
            (s.phone || '').toLowerCase().includes(q)
        );
    });

    const AVATAR_GRADIENTS = [
        'from-brand-500 to-brand-600',
        'from-violet-500 to-purple-600',
        'from-emerald-500 to-teal-600',
        'from-amber-500 to-orange-600',
        'from-rose-500 to-pink-600',
        'from-cyan-500 to-blue-600',
    ];

    function getAvatarGradient(id: string): string {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-50 rounded-xl text-brand-600">
                            <Users size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-primary tracking-tight">Students</h2>
                                <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full">{students.length}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                            <input
                                type="text"
                                placeholder="Search by name, email or phone..."
                                className="w-full pl-9 pr-4 py-2.5 bg-surface-elevated border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 focus:bg-background transition-all placeholder:text-muted/60 text-primary"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => { setEditingStudent(null); setStudentModalOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-sm hover:shadow-brand-500/25 active:scale-[0.98] whitespace-nowrap"
                        >
                            <Plus size={16} /> Add Student
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-brand-500" />
                    </div>
                ) : filteredStudents.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Users size={28} className="text-surface-300" />
                        </div>
                        <p className="text-lg font-semibold text-primary">No students found</p>
                        <p className="text-sm text-muted mt-1">{search ? 'Try adjusting your search' : 'Add your first student to get started'}</p>
                        {!search && (
                            <button
                                onClick={() => { setEditingStudent(null); setStudentModalOpen(true); }}
                                className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all active:scale-[0.98] inline-flex items-center gap-2"
                            >
                                <Plus size={16} /> Add Student
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-surface-elevated/50 text-xs uppercase font-bold tracking-wider text-muted border-b border-border-strong">
                                <tr>
                                    <th className="px-5 py-3.5">Name</th>
                                    <th className="px-5 py-3.5">Email</th>
                                    <th className="px-5 py-3.5 hidden md:table-cell">Phone</th>
                                    <th className="px-5 py-3.5 hidden lg:table-cell">Eircode</th>
                                    <th className="px-5 py-3.5 w-28">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {filteredStudents.map(student => (
                                    <tr
                                        key={student.id}
                                        className="hover:bg-brand-50/30 cursor-pointer transition-all group"
                                        onClick={() => setDetailStudent(student)}
                                    >
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 bg-gradient-to-br ${getAvatarGradient(student.id)} rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm`}>
                                                    {(student.first_name?.[0] || '').toUpperCase()}{(student.last_name?.[0] || '').toUpperCase()}
                                                </div>
                                                <span className="font-semibold text-primary">{student.first_name} {student.last_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-muted">{student.email}</td>
                                        <td className="px-5 py-3.5 text-muted hidden md:table-cell">{student.phone}</td>
                                        <td className="px-5 py-3.5 text-muted hidden lg:table-cell">{student.eircode}</td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => openEdit(student)}
                                                    className="p-2 text-muted hover:text-brand-500 hover:bg-surface-elevated rounded-lg transition-all"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(student)}
                                                    className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                                <ChevronRight size={14} className="text-muted/50 ml-1 group-hover:translate-x-0.5 transition-transform" />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="text-xs text-surface-400 text-center font-medium">
                Showing {filteredStudents.length} of {students.length} students
            </div>

            {detailStudent && (
                <StudentDetail
                    student={detailStudent}
                    onClose={() => setDetailStudent(null)}
                    onEdit={() => openEdit(detailStudent)}
                    onDelete={() => setDeleteTarget(detailStudent)}
                    onEnroll={openEnrollFromDetail}
                />
            )}

            <StudentModal
                open={studentModalOpen}
                student={editingStudent}
                onSave={handleSaveStudent}
                onClose={() => setStudentModalOpen(false)}
            />
            <EnrollmentModal
                open={enrollModalOpen}
                preselectedStudentId={enrollStudentId}
                onSave={() => {
                    setToast({ message: 'Enrollment created', type: 'success' });
                    if (detailStudent) setDetailStudent({ ...detailStudent });
                }}
                onClose={() => setEnrollModalOpen(false)}
            />
            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Student"
                message={`Are you sure you want to delete ${deleteTarget?.first_name} ${deleteTarget?.last_name}? All their enrollments will also be deleted.`}
                onConfirm={handleDeleteStudent}
                onCancel={() => setDeleteTarget(null)}
            />
            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}

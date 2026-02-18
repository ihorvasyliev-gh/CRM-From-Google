import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Plus, Edit2, Trash2, ChevronRight, Loader2 } from 'lucide-react';
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

    // Modals
    const [studentModalOpen, setStudentModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<StudentFormData | null>(null);
    const [detailStudent, setDetailStudent] = useState<Student | null>(null);
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const [enrollStudentId, setEnrollStudentId] = useState<string | undefined>();
    const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

    // Toast
    const [toast, setToast] = useState<ToastData | null>(null);

    useEffect(() => {
        fetchStudents();
    }, []);

    async function fetchStudents() {
        setLoading(true);
        const { data } = await supabase.from('students').select('*').order('created_at', { ascending: false });
        if (data) setStudents(data);
        setLoading(false);
    }

    async function handleSaveStudent(data: StudentFormData) {
        if (data.id) {
            // Update
            const { id, ...rest } = data;
            const { error } = await supabase.from('students').update(rest).eq('id', id);
            if (error) throw new Error(error.message);
            setStudents(prev => prev.map(s => s.id === id ? { ...s, ...rest } as Student : s));
            if (detailStudent?.id === id) {
                setDetailStudent(prev => prev ? { ...prev, ...rest } as Student : null);
            }
            setToast({ message: 'Student updated', type: 'success' });
        } else {
            // Insert
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

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-slate-800">Students</h2>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{students.length}</span>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search by name, email or phone..."
                                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => { setEditingStudent(null); setStudentModalOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition whitespace-nowrap"
                        >
                            <Plus size={16} /> Add Student
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-blue-500" />
                    </div>
                ) : filteredStudents.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <p className="text-lg">No students found</p>
                        <p className="text-sm mt-1">{search ? 'Try adjusting your search' : 'Add your first student to get started'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-5 py-3">Name</th>
                                    <th className="px-5 py-3">Email</th>
                                    <th className="px-5 py-3">Phone</th>
                                    <th className="px-5 py-3">Eircode</th>
                                    <th className="px-5 py-3 w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredStudents.map(student => (
                                    <tr
                                        key={student.id}
                                        className="hover:bg-blue-50/50 cursor-pointer transition group"
                                        onClick={() => setDetailStudent(student)}
                                    >
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                                    {(student.first_name?.[0] || '').toUpperCase()}{(student.last_name?.[0] || '').toUpperCase()}
                                                </div>
                                                <span className="font-medium text-slate-900">{student.first_name} {student.last_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-slate-600">{student.email}</td>
                                        <td className="px-5 py-3 text-slate-600">{student.phone}</td>
                                        <td className="px-5 py-3 text-slate-600">{student.eircode}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => openEdit(student)}
                                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(student)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                                <ChevronRight size={14} className="text-slate-300 ml-1" />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="text-xs text-slate-400 text-center">
                Showing {filteredStudents.length} of {students.length} students
            </div>

            {/* Student Detail Panel */}
            {detailStudent && (
                <StudentDetail
                    student={detailStudent}
                    onClose={() => setDetailStudent(null)}
                    onEdit={() => openEdit(detailStudent)}
                    onDelete={() => setDeleteTarget(detailStudent)}
                    onEnroll={openEnrollFromDetail}
                />
            )}

            {/* Modals */}
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
                    // Refresh detail if open
                    if (detailStudent) {
                        setDetailStudent({ ...detailStudent }); // trigger re-render
                    }
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

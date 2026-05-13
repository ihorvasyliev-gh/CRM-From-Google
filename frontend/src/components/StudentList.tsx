import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Search, Plus, Edit2, Trash2, ChevronRight, Loader2, Users, Check, X } from 'lucide-react';
import StudentModal from './StudentModal';
import StudentDetail from './StudentDetail';
import EnrollmentModal from './EnrollmentModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';
import { Student, StudentFormData, getAvatarGradient } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';

const PAGE_SIZE = 30;

function SkeletonRow() {
    return (
        <tr className="animate-pulse">
            <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-surface-elevated" />
                    <div className="h-4 w-32 rounded-lg bg-surface-elevated" />
                </div>
            </td>
            <td className="px-5 py-3.5"><div className="h-4 w-40 rounded-lg bg-surface-elevated" /></td>
            <td className="px-5 py-3.5 hidden md:table-cell"><div className="h-4 w-28 rounded-lg bg-surface-elevated" /></td>
            <td className="px-5 py-3.5 hidden lg:table-cell"><div className="h-4 w-20 rounded-lg bg-surface-elevated" /></td>
            <td className="px-5 py-3.5 w-28"><div className="h-4 w-16 rounded-lg bg-surface-elevated" /></td>
        </tr>
    );
}

interface StudentListProps {
    onNavigate?: (tab: string, filter?: { courseId?: string }) => void;
}

async function fetchStudentsPage({ pageParam = 0, queryKey }: any) {
    const [_key, search] = queryKey;
    const limit = PAGE_SIZE;
    const from = pageParam * limit;
    const to = from + limit - 1;

    let query = supabase.from('students').select('*', { count: 'exact' }).order('created_at', { ascending: false });

    if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    return {
        data: (data || []) as Student[],
        count: count || 0,
        nextPage: (data && data.length === limit) ? pageParam + 1 : undefined
    };
}

export default function StudentList({ onNavigate }: StudentListProps) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);

    const {
        data,
        isLoading: loading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useInfiniteQuery({
        queryKey: ['students', debouncedSearch],
        queryFn: fetchStudentsPage,
        getNextPageParam: (lastPage) => lastPage.nextPage,
        initialPageParam: 0
    });

    const displayedStudents = useMemo(() => {
        if (!data) return [];
        return data.pages.flatMap(page => page.data);
    }, [data]);

    const totalCount = data?.pages[0]?.count || 0;

    const [studentModalOpen, setStudentModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<StudentFormData | null>(null);
    const [detailStudent, setDetailStudent] = useState<Student | null>(null);
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const [enrollStudentId, setEnrollStudentId] = useState<string | undefined>();
    const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

    // Inline Editing State
    const [editingRowId, setEditingRowId] = useState<string | null>(null);
    const [inlineEditForm, setInlineEditForm] = useState<StudentFormData | null>(null);
    const [inlineSaving, setInlineSaving] = useState(false);

    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        }, { rootMargin: '200px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    // Optimistic cache updates
    const updateStudentInCache = useCallback((updatedStudent: Student) => {
        queryClient.setQueryData(['students', debouncedSearch], (oldData: any) => {
            if (!oldData) return oldData;
            return {
                ...oldData,
                pages: oldData.pages.map((page: any) => ({
                    ...page,
                    data: page.data.map((s: Student) => s.id === updatedStudent.id ? updatedStudent : s)
                }))
            };
        });
        queryClient.invalidateQueries({ queryKey: ['students'] });
    }, [queryClient, debouncedSearch]);

    const addStudentToCache = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['students'] });
    }, [queryClient]);

    const removeStudentFromCache = useCallback((id: string) => {
        queryClient.setQueryData(['students', debouncedSearch], (oldData: any) => {
            if (!oldData) return oldData;
            return {
                ...oldData,
                pages: oldData.pages.map((page: any) => ({
                    ...page,
                    data: page.data.filter((s: Student) => s.id !== id)
                }))
            };
        });
        queryClient.invalidateQueries({ queryKey: ['students'] });
    }, [queryClient, debouncedSearch]);

    async function handleSaveStudent(formData: StudentFormData) {
        if (formData.id) {
            const { id, ...rest } = formData;
            const { error } = await supabase.from('students').update(rest).eq('id', id);
            if (error) throw new Error(error.message);
            updateStudentInCache({ ...formData } as Student);
            if (detailStudent?.id === id) {
                setDetailStudent({ ...detailStudent, ...rest } as Student);
            }
            setToast({ message: 'Student updated', type: 'success' });
        } else {
            const { error, data: inserted } = await supabase.from('students').insert(formData).select();
            if (error) {
                if (error.message.includes('duplicate') || error.message.includes('unique')) {
                    throw new Error('A student with this email already exists');
                }
                throw new Error(error.message);
            }
            if (inserted) addStudentToCache();
            setToast({ message: 'Student added', type: 'success' });
        }
    }

    async function handleInlineSave() {
        if (!inlineEditForm || !inlineEditForm.id) return;
        setInlineSaving(true);
        try {
            const { id, ...rest } = inlineEditForm;
            const { error } = await supabase.from('students').update(rest).eq('id', id);
            if (error) throw error;
            updateStudentInCache(inlineEditForm as Student);
            setToast({ message: 'Saved inline edit', type: 'success' });
            setEditingRowId(null);
        } catch (e: any) {
            setToast({ message: e.message || 'Failed to save', type: 'error' });
        } finally {
            setInlineSaving(false);
        }
    }

    async function handleDeleteStudent() {
        if (!deleteTarget) return;
        const { error } = await supabase.from('students').delete().eq('id', deleteTarget.id);
        if (error) {
            setToast({ message: 'Failed to delete student', type: 'error' });
        } else {
            removeStudentFromCache(deleteTarget.id);
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

    const handleRowDoubleClick = (e: React.MouseEvent, student: Student) => {
        e.stopPropagation();
        setDetailStudent(null);
        setEditingRowId(student.id);
        setInlineEditForm({
            id: student.id,
            first_name: student.first_name || '',
            last_name: student.last_name || '',
            email: student.email || '',
            phone: student.phone || '',
            address: student.address || '',
            eircode: student.eircode || '',
            dob: student.dob || '',
        });
    };

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
                                <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full">{totalCount}</span>
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
                                {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
                            </tbody>
                        </table>
                    </div>
                ) : displayedStudents.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 bg-surface-elevated border border-border-subtle shadow-sm rounded-full flex items-center justify-center mx-auto mb-4">
                            <Users size={28} className="text-muted" />
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
                                {displayedStudents.map(student => {
                                    const isEditing = editingRowId === student.id;
                                    if (isEditing && inlineEditForm) {
                                        return (
                                            <tr key={`edit-${student.id}`} className="bg-brand-50/30">
                                                <td className="px-5 py-3.5">
                                                    <div className="flex gap-2">
                                                        <input 
                                                            autoFocus
                                                            className="w-1/2 px-2 py-1.5 bg-surface border border-brand-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-primary" 
                                                            value={inlineEditForm.first_name} 
                                                            placeholder="First name"
                                                            onChange={e => setInlineEditForm({...inlineEditForm, first_name: e.target.value})}
                                                            onKeyDown={e => e.key === 'Enter' && handleInlineSave()}
                                                        />
                                                        <input 
                                                            className="w-1/2 px-2 py-1.5 bg-surface border border-brand-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-primary" 
                                                            value={inlineEditForm.last_name} 
                                                            placeholder="Last name"
                                                            onChange={e => setInlineEditForm({...inlineEditForm, last_name: e.target.value})}
                                                            onKeyDown={e => e.key === 'Enter' && handleInlineSave()}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <input 
                                                        className="w-full px-2 py-1.5 bg-surface border border-brand-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-primary" 
                                                        value={inlineEditForm.email} 
                                                        placeholder="Email"
                                                        onChange={e => setInlineEditForm({...inlineEditForm, email: e.target.value})}
                                                        onKeyDown={e => e.key === 'Enter' && handleInlineSave()}
                                                    />
                                                </td>
                                                <td className="px-5 py-3.5 hidden md:table-cell">
                                                    <input 
                                                        className="w-full px-2 py-1.5 bg-surface border border-brand-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-primary" 
                                                        value={inlineEditForm.phone} 
                                                        placeholder="Phone"
                                                        onChange={e => setInlineEditForm({...inlineEditForm, phone: e.target.value})}
                                                        onKeyDown={e => e.key === 'Enter' && handleInlineSave()}
                                                    />
                                                </td>
                                                <td className="px-5 py-3.5 hidden lg:table-cell">
                                                    <input 
                                                        className="w-full px-2 py-1.5 bg-surface border border-brand-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-primary" 
                                                        value={inlineEditForm.eircode} 
                                                        placeholder="Eircode"
                                                        onChange={e => setInlineEditForm({...inlineEditForm, eircode: e.target.value})}
                                                        onKeyDown={e => e.key === 'Enter' && handleInlineSave()}
                                                    />
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={handleInlineSave}
                                                            disabled={inlineSaving}
                                                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                                            title="Save"
                                                        >
                                                            {inlineSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingRowId(null)}
                                                            disabled={inlineSaving}
                                                            className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                                                            title="Cancel"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return (
                                        <tr
                                            key={student.id}
                                            className="hover:bg-brand-50/30 cursor-pointer transition-all group"
                                            onClick={() => {
                                                if (!editingRowId) setDetailStudent(student);
                                            }}
                                            onDoubleClick={(e) => handleRowDoubleClick(e, student)}
                                            title="Double-click to edit inline"
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
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Infinite scroll sentinel + loading indicator */}
            <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-2">
                {isFetchingNextPage && (
                    <div className="flex items-center gap-2 text-muted">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs font-medium">Loading more...</span>
                    </div>
                )}
                <div className="text-xs text-muted text-center font-medium">
                    Showing {displayedStudents.length} of {totalCount} students
                    {search && (
                        <span className="text-muted/60"> (filtered)</span>
                    )}
                </div>
            </div>

            {detailStudent && (
                <StudentDetail
                    student={detailStudent}
                    onClose={() => setDetailStudent(null)}
                    onEdit={() => openEdit(detailStudent)}
                    onDelete={() => setDeleteTarget(detailStudent)}
                    onEnroll={openEnrollFromDetail}
                    onStudentUpdated={updateStudentInCache}
                    onNavigate={onNavigate}
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

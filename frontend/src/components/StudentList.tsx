import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, ChevronRight, Loader2, Users, Phone, MessageSquare, X } from 'lucide-react';
import StudentModal from './StudentModal';
import StudentDetail from './StudentDetail';
import EnrollmentModal from './EnrollmentModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';
import { Student, StudentFormData, StudentPayload, getAvatarGradient } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';
import SearchInput from './ui/SearchInput';
import Badge from './ui/Badge';
import { Toolbar } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { EmptyState, SkeletonRows } from './ui/States';
import { tableCls, theadCls, thCls, tbodyCls, tdCls } from './ui/styles';
import { formatPhoneForWhatsApp, formatPhoneForCall } from '../lib/contactUtils';
import { formatDateLong, formatDateDMY } from '../lib/dateUtils';
import { buildStudentSearchFilters } from '../lib/searchUtils';

const PAGE_SIZE = 30;

function SkeletonRow() {
    return (
        <tr className="animate-pulse">
            <td className={tdCls}>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted/15" />
                    <div className="space-y-1.5">
                        <div className="h-3.5 w-32 rounded bg-muted/15" />
                        <div className="h-3 w-44 rounded bg-muted/10" />
                    </div>
                </div>
            </td>
            <td className={tdCls}><div className="h-3.5 w-28 rounded bg-muted/15" /></td>
            <td className={`${tdCls} hidden lg:table-cell`}><div className="h-5 w-16 rounded bg-muted/15" /></td>
            <td className={`${tdCls} hidden xl:table-cell`}><div className="h-3.5 w-20 rounded bg-muted/10" /></td>
            <td className={tdCls}><div className="h-3.5 w-16 rounded bg-muted/10 ml-auto" /></td>
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
        buildStudentSearchFilters(search).forEach(filter => {
            query = query.or(filter);
        });
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
        isFetchingNextPage,
        isFetching,
        isError,
        refetch,
    } = useInfiniteQuery({
        queryKey: ['students', debouncedSearch],
        queryFn: fetchStudentsPage,
        getNextPageParam: (lastPage) => lastPage.nextPage,
        initialPageParam: 0,
        // Keep the current list on screen while a new search runs instead of flashing skeletons
        placeholderData: keepPreviousData,
    });

    const displayedStudents = useMemo(() => {
        if (!data) return [];
        return data.pages.flatMap(page => page.data);
    }, [data]);

    const totalCount = data?.pages[0]?.count || 0;
    const searchPending = search.trim() !== debouncedSearch.trim() || (isFetching && !isFetchingNextPage && !!debouncedSearch);

    const [studentModalOpen, setStudentModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<StudentFormData | null>(null);
    const [detailStudent, setDetailStudent] = useState<Student | null>(null);
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const [enrollStudentId, setEnrollStudentId] = useState<string | undefined>();
    const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

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

    async function handleSaveStudent(formData: StudentPayload) {
        if (formData.id) {
            const { id, ...rest } = formData;
            const { data: updated, error } = await supabase.from('students').update(rest).eq('id', id).select().maybeSingle();
            if (error) {
                if (error.message.includes('duplicate') || error.message.includes('unique')) {
                    throw new Error('A student with this name and email already exists');
                }
                throw new Error(error.message);
            }
            const merged = (updated || { ...detailStudent, ...formData }) as Student;
            updateStudentInCache(merged);
            if (detailStudent?.id === id) {
                setDetailStudent(prev => (prev ? { ...prev, ...merged } : prev));
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

    async function handleDeleteStudent() {
        if (!deleteTarget) return;
        const { error } = await supabase.from('students').delete().eq('id', deleteTarget.id);
        if (error) {
            setToast({ message: 'Failed to delete student', type: 'error' });
        } else {
            removeStudentFromCache(deleteTarget.id);
            // Enrollments are cascade-deleted together with the student
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
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

    const initialsOf = (s: Student) => `${(s.first_name?.[0] || '').toUpperCase()}${(s.last_name?.[0] || '').toUpperCase()}`;
    const openCreate = () => { setEditingStudent(null); setStudentModalOpen(true); };
    const tableHead = (
        <thead className={theadCls}>
            <tr>
                <th className={thCls}>Student</th>
                <th className={thCls}>Phone</th>
                <th className={`${thCls} hidden lg:table-cell`}>Eircode</th>
                <th className={`${thCls} hidden xl:table-cell`}>Added</th>
                <th className={`${thCls} w-36`}><span className="sr-only">Actions</span></th>
            </tr>
        </thead>
    );

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <Toolbar>
                <div className="hidden md:flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex-shrink-0">
                        <Users size={16} />
                    </span>
                    <span className="text-sm font-semibold text-primary">All students</span>
                    <Badge tone="brand" shape="pill" className="tabular-nums">{totalCount}</Badge>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                    <SearchInput
                        wrapperClassName="flex-1 sm:w-80"
                        placeholder="Search by name, email, phone or eircode..."
                        value={search}
                        onChange={setSearch}
                        loading={searchPending}
                        aria-label="Search students"
                    />
                    <Button variant="primary" size="lg" onClick={openCreate}>
                        <Plus size={16} /> <span className="hidden xs:inline sm:inline">Add Student</span>
                    </Button>
                </div>
            </Toolbar>

            {/* Table & Mobile Cards */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden">
                {loading ? (
                    <div>
                        {/* Mobile Skeleton (< md) */}
                        <div className="md:hidden">
                            <SkeletonRows rows={5} bare />
                        </div>

                        {/* Desktop Skeleton (>= md) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className={tableCls}>
                                {tableHead}
                                <tbody className={tbodyCls}>
                                    {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : displayedStudents.length === 0 ? (
                    <EmptyState
                        bare
                        className="!py-16"
                        icon={<Users size={24} />}
                        title={isError ? 'Could not load students' : 'No students found'}
                        description={isError ? 'Check your connection and try again' : search ? `Nothing matches "${search.trim()}"` : 'Add your first student to get started'}
                        action={
                            isError ? (
                                <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
                            ) : search ? (
                                <Button variant="secondary" onClick={() => setSearch('')}><X size={14} /> Clear search</Button>
                            ) : (
                                <Button variant="primary" onClick={openCreate}><Plus size={16} /> Add Student</Button>
                            )
                        }
                    />
                ) : (
                    <div>
                        {/* Mobile Cards (< md) */}
                        <ul className="md:hidden divide-y divide-border-subtle">
                            {displayedStudents.map(student => (
                                <li
                                    key={student.id}
                                    onClick={() => setDetailStudent(student)}
                                    className="px-4 py-3.5 hover:bg-surface-elevated/50 active:bg-surface-elevated cursor-pointer transition-colors flex flex-col gap-2.5"
                                >
                                    <div className="flex items-start justify-between gap-2.5">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-10 h-10 bg-gradient-to-br ${getAvatarGradient(student.id)} rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                                                {initialsOf(student)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-primary text-sm leading-tight truncate">
                                                    {student.first_name} {student.last_name}
                                                </p>
                                                <p className="text-xs text-muted truncate mt-0.5">{student.email}</p>
                                                {student.created_at && (
                                                    <span className="text-[11px] text-muted block mt-0.5">
                                                        Joined {formatDateLong(student.created_at)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => { setEnrollStudentId(student.id); setEnrollModalOpen(true); }}
                                                className="h-8 px-2 text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/15 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1"
                                                title="Enroll student in course"
                                            >
                                                <Plus size={14} />
                                                <span className="hidden xs:inline">Enroll</span>
                                            </button>
                                            <IconButton size="sm" tone="brand" label="Edit student" onClick={() => openEdit(student)}>
                                                <Edit2 size={14} />
                                            </IconButton>
                                            <IconButton size="sm" tone="danger" label="Delete student" onClick={() => setDeleteTarget(student)}>
                                                <Trash2 size={14} />
                                            </IconButton>
                                        </div>
                                    </div>

                                    {(student.phone || student.dob || student.eircode) && (
                                        <div className="flex flex-wrap items-center gap-1.5 pl-[52px] text-xs" onClick={e => e.stopPropagation()}>
                                            {student.phone && (
                                                <>
                                                    <a
                                                        href={formatPhoneForCall(student.phone) || undefined}
                                                        className="inline-flex items-center gap-1 h-6 px-2 text-primary font-medium bg-surface-elevated hover:bg-border-subtle rounded-md border border-border-subtle transition-colors"
                                                    >
                                                        <Phone size={11} className="text-muted" />
                                                        <span className="tabular-nums">{student.phone}</span>
                                                    </a>
                                                    {formatPhoneForWhatsApp(student.phone) && (
                                                        <a
                                                            href={formatPhoneForWhatsApp(student.phone)!}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center justify-center w-6 h-6 text-status-confirmed bg-success/10 hover:bg-success/20 border border-success/25 rounded-md transition-colors"
                                                            title="Chat on WhatsApp"
                                                        >
                                                            <MessageSquare size={12} />
                                                        </a>
                                                    )}
                                                </>
                                            )}
                                            {student.eircode && <Badge className="font-mono">{student.eircode}</Badge>}
                                            {student.dob && <Badge>DOB: {formatDateDMY(student.dob)}</Badge>}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>

                        {/* Desktop Table (>= md) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className={tableCls}>
                                {tableHead}
                                <tbody className={tbodyCls}>
                                    {displayedStudents.map(student => (
                                        <tr
                                            key={student.id}
                                            className="cv-auto-row hover:bg-surface-elevated/50 focus-visible:bg-surface-elevated/60 cursor-pointer transition-colors group outline-none"
                                            onClick={() => setDetailStudent(student)}
                                            tabIndex={0}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && e.target === e.currentTarget) setDetailStudent(student);
                                            }}
                                        >
                                            <td className={tdCls}>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`table-avatar w-9 h-9 bg-gradient-to-br ${getAvatarGradient(student.id)} rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                                                        {initialsOf(student)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-primary truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                                                            {student.first_name} {student.last_name}
                                                        </p>
                                                        <p className="text-xs text-muted truncate max-w-[320px]">{student.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={tdCls}>
                                                {student.phone ? (
                                                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                        <a href={formatPhoneForCall(student.phone) || undefined} className="text-[13px] text-primary tabular-nums hover:text-brand-600 dark:hover:text-brand-400">
                                                            {student.phone}
                                                        </a>
                                                        {formatPhoneForWhatsApp(student.phone) && (
                                                            <a
                                                                href={formatPhoneForWhatsApp(student.phone)!}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center justify-center w-6 h-6 text-muted hover:text-status-confirmed hover:bg-success/10 rounded-md transition-colors"
                                                                title="Chat on WhatsApp"
                                                            >
                                                                <MessageSquare size={12} />
                                                            </a>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td className={`${tdCls} hidden lg:table-cell`}>
                                                {student.eircode ? <Badge className="font-mono">{student.eircode}</Badge> : <span className="text-muted">—</span>}
                                            </td>
                                            <td className={`${tdCls} hidden xl:table-cell text-xs text-muted tabular-nums whitespace-nowrap`}>
                                                {student.created_at ? formatDateDMY(student.created_at) : '—'}
                                            </td>
                                            <td className={tdCls}>
                                                <div className="flex items-center justify-end gap-0.5 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                    <IconButton size="sm" tone="brand" label="Enroll in a course" onClick={() => { setEnrollStudentId(student.id); setEnrollModalOpen(true); }}>
                                                        <Plus size={15} />
                                                    </IconButton>
                                                    <IconButton size="sm" tone="brand" label="Edit" onClick={() => openEdit(student)}>
                                                        <Edit2 size={14} />
                                                    </IconButton>
                                                    <IconButton size="sm" tone="danger" label="Delete" onClick={() => setDeleteTarget(student)}>
                                                        <Trash2 size={14} />
                                                    </IconButton>
                                                    <ChevronRight size={15} className="text-muted/60 ml-0.5" />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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
                <div className="text-xs text-muted text-center">
                    Showing <span className="font-semibold text-primary tabular-nums">{displayedStudents.length}</span> of <span className="font-semibold text-primary tabular-nums">{totalCount}</span> students
                    {search && (
                        <span className="text-muted/70"> (filtered)</span>
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

            {studentModalOpen && (
                <StudentModal
                    open={true}
                    student={editingStudent}
                    onSave={handleSaveStudent}
                    onClose={() => setStudentModalOpen(false)}
                />
            )}
            {enrollModalOpen && (
                <EnrollmentModal
                    open={true}
                    preselectedStudentId={enrollStudentId}
                    onSave={() => {
                        setToast({ message: 'Enrollment created', type: 'success' });
                        if (detailStudent) setDetailStudent({ ...detailStudent });
                    }}
                    onClose={() => setEnrollModalOpen(false)}
                />
            )}
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

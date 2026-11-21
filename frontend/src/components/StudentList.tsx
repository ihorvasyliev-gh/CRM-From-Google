import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, keepPreviousData, type InfiniteData } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, Users, Phone, MessageSquare, X } from 'lucide-react';
import StudentModal from './StudentModal';
import StudentDetail from './StudentDetail';
import { useDialogMount, useLastPresent } from '../hooks/usePresence';
import EnrollmentModal from './EnrollmentModal';
import ConfirmDialog from './ConfirmDialog';
import { notify } from '../lib/toast';
import { Student, StudentFormData, StudentPayload, fullName, getAvatarGradient } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';
import SearchInput from './ui/SearchInput';
import Badge from './ui/Badge';
import { Toolbar } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { EmptyState, SkeletonRows } from './ui/States';
import { tableCls, theadCls, thCls, tbodyCls, tdCls } from './ui/styles';
import { formatPhoneForWhatsApp, formatPhoneForCall, formatPhoneDisplay } from '../lib/contactUtils';
import { formatDisplayDate } from '../lib/dateUtils';
import { fetchCourses, type StudentsPage } from '../lib/queries';
import { useEnrollmentList, type EnrollmentRow } from '../hooks/useEnrollments';
import { STATUS_CONFIG } from '../lib/statusConfig';
import { CustomTooltip } from './ui/Tooltip';
import { createStudent, deleteStudent, fetchStudent, updateStudent } from '../lib/students';
import { removeCachedEnrollments } from '../lib/enrollmentCache';
import { applyStudentChange } from '../lib/studentCache';
import type { NavigateFn } from '../lib/navigation';
import { errorMessage } from '../lib/errors';
import { useProgressiveList } from '../hooks/useProgressiveList';
import MergeModal from './MergeModal';
import StudentFilterBar from './Students/StudentFilterBar';
import StudentBulkBar from './Students/StudentBulkBar';
import BulkEnrollModal from './Students/BulkEnrollModal';
import { exportStudentsToExcel } from './Students/studentExport';
import {
    DEFAULT_LIST_SORT, NO_FILTERS, fetchAllStudents, fetchStudentsListPage, firstDirection, hasFilters, matchesFilters,
    deleteStudentMessage, needsAllStudents, sortStudents, type ListSort, type StudentFilters,
} from './Students/studentListData';

function SkeletonRow() {
    return (
        <tr className="animate-pulse">
            <td className={`${tdCls} w-10 pr-0`}><div className="w-4 h-4 rounded-sm bg-muted/15" /></td>
            <td className={tdCls}>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted/15" />
                    <div className="space-y-1.5">
                        <div className="h-3.5 w-32 rounded-sm bg-muted/15" />
                        <div className="h-3 w-44 rounded-sm bg-muted/10" />
                    </div>
                </div>
            </td>
            <td className={tdCls}><div className="h-3.5 w-28 rounded-sm bg-muted/15" /></td>
            <td className={tdCls}><div className="h-3.5 w-32 rounded-sm bg-muted/10" /></td>
            <td className={`${tdCls} hidden lg:table-cell`}><div className="h-5 w-16 rounded-sm bg-muted/15" /></td>
            <td className={`${tdCls} hidden xl:table-cell`}><div className="h-3.5 w-20 rounded-sm bg-muted/10" /></td>
            <td className={tdCls}><div className="h-3.5 w-16 rounded-sm bg-muted/10 ml-auto" /></td>
        </tr>
    );
}

// A student's courses, the ones still going first
const STATUS_ORDER = ['confirmed', 'invited', 'requested', 'completed', 'withdrawn', 'rejected'];
const SHOWN_COURSES = 2;

/** The courses a student is in, each in its status colour with the status icon (so not by colour alone) */
function StudentCourses({ enrollments, loading }: { enrollments: EnrollmentRow[] | undefined; loading: boolean }) {
    if (!enrollments?.length) {
        return loading
            ? <div className="h-3.5 w-24 rounded-sm bg-muted/10 animate-pulse" />
            : <span className="text-xs text-muted">No courses</span>;
    }
    const sorted = [...enrollments].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    const more = sorted.length - SHOWN_COURSES;
    return (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
            {sorted.slice(0, SHOWN_COURSES).map(e => {
                const cfg = STATUS_CONFIG[e.status];
                return (
                    <CustomTooltip key={e.id} content={`${e.courses?.name ?? 'Course'}: ${cfg?.label ?? e.status}`}>
                        <span className={`inline-flex items-center gap-1 max-w-48 text-xs font-medium ${cfg?.color ?? 'text-muted'} [&_svg]:size-3 [&_svg]:shrink-0`}>
                            {cfg?.icon}
                            <span className="truncate">{e.courses?.name ?? 'Course'}</span>
                            <span className="sr-only">({cfg?.label ?? e.status})</span>
                        </span>
                    </CustomTooltip>
                );
            })}
            {more > 0 && (
                <CustomTooltip content={sorted.slice(SHOWN_COURSES).map(e => `${e.courses?.name ?? 'Course'}: ${STATUS_CONFIG[e.status]?.label ?? e.status}`).join('\n')}>
                    <span className="text-xs font-semibold text-muted">+{more}</span>
                </CustomTooltip>
            )}
        </div>
    );
}

/** A column header that sorts the list; aria-sort tells screen readers which one is in use */
function SortHeader({ label, column, sort, onSort, className = '' }: {
    label: string; column: ListSort['key']; sort: ListSort; onSort: (s: ListSort) => void; className?: string;
}) {
    const active = sort.key === column;
    const firstDir = firstDirection(column);
    const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
    return (
        <th className={`${thCls} ${className}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            <button
                type="button"
                onClick={() => onSort({ key: column, dir: active ? (sort.dir === 'asc' ? 'desc' : 'asc') : firstDir })}
                className={`group/sort inline-flex items-center gap-1 -mx-1 px-1 rounded-md uppercase tracking-wider transition-colors hover:text-primary ${active ? 'text-primary' : ''}`}
            >
                {label}
                <Icon size={13} className={active ? '' : 'opacity-40 group-hover/sort:opacity-100'} aria-hidden />
            </button>
        </th>
    );
}

/** Cache updater for the loaded student pages that rewrites each page's students. */
const mapStudentPages = (update: (students: Student[]) => Student[]) =>
    (oldData: InfiniteData<StudentsPage> | undefined) => oldData && {
        ...oldData,
        pages: oldData.pages.map(page => ({ ...page, data: update(page.data) })),
    };

interface StudentListProps {
    onNavigate?: NavigateFn;
}


/** A row's tick box; clicks on it never open the student */
function SelectBox({ checked, onToggle, label, indeterminate = false }: { checked: boolean; onToggle: () => void; label: string; indeterminate?: boolean }) {
    return (
        <input
            type="checkbox"
            checked={checked}
            ref={el => { if (el) el.indeterminate = indeterminate && !checked; }}
            onChange={onToggle}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            aria-label={label}
            className="w-4 h-4 rounded-sm border-border-strong accent-brand-500 cursor-pointer shrink-0"
        />
    );
}

export default function StudentList({ onNavigate }: StudentListProps) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [sort, setSort] = useState<ListSort>(DEFAULT_LIST_SORT);
    const [filters, setFilters] = useState<StudentFilters>(NO_FILTERS);
    const filtering = hasFilters(filters);
    // Filters and the Courses sort work on the whole list; otherwise it loads page by page
    const allMode = needsAllStudents(filters, sort);
    // The usual order keeps the plain key, which the sidebar prefetches
    const studentsKey = useMemo(() => sort.key === DEFAULT_LIST_SORT.key && sort.dir === DEFAULT_LIST_SORT.dir
        ? ['students', debouncedSearch]
        : ['students', debouncedSearch, sort.key, sort.dir], [debouncedSearch, sort]);
    // Each student's courses, from the enrollment list the board and dashboard share
    const { data: allEnrollments, isLoading: enrollmentsLoading, complete: enrollmentsComplete } = useEnrollmentList();
    const enrollmentsByStudent = useMemo(() => {
        const map = new Map<string, EnrollmentRow[]>();
        for (const e of allEnrollments ?? []) {
            const list = map.get(e.student_id);
            if (list) list.push(e);
            else map.set(e.student_id, [e]);
        }
        return map;
    }, [allEnrollments]);
    const enrollmentsOf = useCallback((id: string) => enrollmentsByStudent.get(id), [enrollmentsByStudent]);
    const { data: courses = [] } = useQuery({ queryKey: ['courses'], queryFn: fetchCourses });

    const {
        data,
        isLoading: pagesLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isFetching: pagesFetching,
        isError: pagesError,
        refetch: refetchPages,
    } = useInfiniteQuery({
        queryKey: studentsKey,
        queryFn: fetchStudentsListPage,
        getNextPageParam: (lastPage) => lastPage.nextPage,
        initialPageParam: 0,
        enabled: !allMode,
        // Keep the current list on screen while a new search runs instead of flashing skeletons
        placeholderData: keepPreviousData,
    });

    const allQuery = useQuery({
        queryKey: ['students', 'all_for_filters', debouncedSearch],
        queryFn: () => fetchAllStudents(debouncedSearch),
        enabled: allMode,
        placeholderData: keepPreviousData,
    });

    const filteredStudents = useMemo(() => {
        if (!allMode || !allQuery.data) return [];
        const matching = allQuery.data.filter(s => matchesFilters(enrollmentsByStudent.get(s.id), filters));
        return sortStudents(matching, sort, id => enrollmentsByStudent.get(id)?.length ?? 0);
    }, [allMode, allQuery.data, enrollmentsByStudent, filters, sort]);
    const { visible: progressiveRows, hasMore: progressiveHasMore, sentinelRef: progressiveSentinelRef } = useProgressiveList(filteredStudents, `${debouncedSearch}|${JSON.stringify(filters)}|${sort.key}|${sort.dir}`);

    const pagedStudents = useMemo(() => data ? data.pages.flatMap(page => page.data) : [], [data]);
    // Every student the list holds (the filtered list in full), and the rows rendered so far
    const shownStudents = allMode ? filteredStudents : pagedStudents;
    const displayedStudents = allMode ? progressiveRows : pagedStudents;

    const loading = allMode ? (allQuery.isLoading || (filtering && !enrollmentsComplete)) : pagesLoading;
    const isError = allMode ? allQuery.isError : pagesError;
    const refetch = allMode ? allQuery.refetch : refetchPages;
    const isFetching = allMode ? allQuery.isFetching : pagesFetching;
    const totalCount = allMode ? filteredStudents.length : data?.pages[0]?.count || 0;
    const searchPending = search.trim() !== debouncedSearch.trim() || (isFetching && !isFetchingNextPage && !!debouncedSearch);

    const [studentModalOpen, setStudentModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<StudentFormData | null>(null);
    const [detailStudent, setDetailStudent] = useState<Student | null>(null);
    // Dialogs stay mounted while they animate out; each opening starts fresh
    const shownDetail = useLastPresent(detailStudent);
    const studentModalMount = useDialogMount(studentModalOpen);
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const enrollModalMount = useDialogMount(enrollModalOpen);
    const [enrollStudentId, setEnrollStudentId] = useState<string | undefined>();
    const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
    const [mergePair, setMergePair] = useState<{ student: Student; target: Student } | null>(null);
    const shownMerge = useLastPresent(mergePair);

    // Ticked students, kept with their records so a new search or filter doesn't lose them
    const [selected, setSelected] = useState<Map<string, Student>>(() => new Map());
    const [bulkEnrollOpen, setBulkEnrollOpen] = useState(false);
    const bulkEnrollMount = useDialogMount(bulkEnrollOpen);
    const [exporting, setExporting] = useState(false);
    const selectedStudents = useMemo(() => [...selected.values()], [selected]);
    const toggleSelected = useCallback((student: Student) => {
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(student.id)) next.delete(student.id);
            else next.set(student.id, student);
            return next;
        });
    }, []);
    const allShownSelected = shownStudents.length > 0 && shownStudents.every(s => selected.has(s.id));
    const someShownSelected = shownStudents.some(s => selected.has(s.id));
    const toggleAllShown = () => {
        setSelected(prev => {
            const next = new Map(prev);
            if (allShownSelected) shownStudents.forEach(s => next.delete(s.id));
            else shownStudents.forEach(s => next.set(s.id, s));
            return next;
        });
    };
    const selectAllLabel = allShownSelected ? 'Unselect all shown students' : `Select all ${shownStudents.length} shown students`;

    async function handleExport() {
        if (exporting || selectedStudents.length === 0) return;
        setExporting(true);
        try {
            await exportStudentsToExcel(selectedStudents, enrollmentsOf);
            notify({ message: `Exported ${selectedStudents.length} student${selectedStudents.length === 1 ? '' : 's'} to Excel`, type: 'success' });
        } catch (err) {
            console.error('Student export failed:', err);
            notify({ message: 'Could not make the Excel file. Please try again.', type: 'error' });
        } finally {
            setExporting(false);
        }
    }

    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || allMode) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        }, { rootMargin: '200px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage, allMode]);

    // Optimistic cache updates: this page's row and the open card's starting copy
    const patchStudentRow = useCallback((updatedStudent: Student) => {
        queryClient.setQueryData(studentsKey, mapStudentPages(students =>
            students.map(s => s.id === updatedStudent.id ? updatedStudent : s)
        ));
        setDetailStudent(prev => (prev?.id === updatedStudent.id ? updatedStudent : prev));
        setSelected(prev => prev.has(updatedStudent.id) ? new Map(prev).set(updatedStudent.id, updatedStudent) : prev);
    }, [queryClient, studentsKey]);

    const updateStudentInCache = useCallback((updatedStudent: Student) => {
        patchStudentRow(updatedStudent);
        // The open card, the board's cards and every other list of students show the new values
        applyStudentChange(queryClient, updatedStudent);
    }, [queryClient, patchStudentRow]);

    const addStudentToCache = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['students'] });
    }, [queryClient]);

    const removeStudentFromCache = useCallback((id: string) => {
        queryClient.setQueryData(studentsKey, mapStudentPages(students =>
            students.filter(s => s.id !== id)
        ));
        queryClient.invalidateQueries({ queryKey: ['students'] });
    }, [queryClient, studentsKey]);

    async function handleSaveStudent(formData: StudentPayload) {
        const name = `${formData.first_name} ${formData.last_name}`.trim();
        if (formData.id) {
            const { id, ...rest } = formData;
            const updated = await updateStudent(id, rest);
            const merged = (updated || { ...detailStudent, ...formData }) as Student;
            updateStudentInCache(merged);
            notify({ message: `Saved changes to ${name}`, type: 'success' });
        } else {
            const created = await createStudent(formData);
            addStudentToCache();
            notify({ message: `Added ${name}`, type: 'success' });
            return created;
        }
    }

    async function handleDeleteStudent() {
        if (!deleteTarget) return;
        const target = deleteTarget;
        setDeleteTarget(null);
        try {
            await deleteStudent(target.id);
        } catch (err) {
            console.error('Failed to delete student:', err);
            notify({ message: `Could not delete ${fullName(target)}. Please try again.`, type: 'error' });
            return;
        }
        removeStudentFromCache(target.id);
        // Enrollments are cascade-deleted together with the student
        removeCachedEnrollments(queryClient, e => e.student_id === target.id);
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
        if (detailStudent?.id === target.id) setDetailStudent(null);
        setSelected(prev => {
            if (!prev.has(target.id)) return prev;
            const next = new Map(prev);
            next.delete(target.id);
            return next;
        });
        notify({ message: `Deleted ${fullName(target)}`, type: 'success' });
    }

    /** From the form's duplicate warning: show the student who is already there */
    async function openExistingStudent(id: string) {
        setStudentModalOpen(false);
        try {
            setDetailStudent(await fetchStudent(id));
        } catch (err) {
            notify({ message: errorMessage(err, 'Could not open that student'), type: 'error' });
        }
    }

    /** From the edit form's duplicate warning: merge the two records */
    async function mergeWithExisting(existingId: string) {
        const editingId = editingStudent?.id;
        if (!editingId) return;
        setStudentModalOpen(false);
        try {
            const [student, target] = await Promise.all([fetchStudent(editingId), fetchStudent(existingId)]);
            setMergePair({ student, target });
        } catch (err) {
            notify({ message: errorMessage(err, 'Could not open the merge'), type: 'error' });
        }
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
                <th className={`${thCls} w-10 pr-0`}>
                    <SelectBox checked={allShownSelected} indeterminate={someShownSelected} onToggle={toggleAllShown} label={selectAllLabel} />
                </th>
                <SortHeader label="Student" column="name" sort={sort} onSort={setSort} />
                <SortHeader label="Phone" column="phone" sort={sort} onSort={setSort} />
                <SortHeader label="Courses" column="courses" sort={sort} onSort={setSort} />
                <SortHeader label="Eircode" column="eircode" sort={sort} onSort={setSort} className="hidden lg:table-cell" />
                <SortHeader label="Added" column="created_at" sort={sort} onSort={setSort} className="hidden xl:table-cell" />
                <th className={`${thCls} w-36`}><span className="sr-only">Actions</span></th>
            </tr>
        </thead>
    );

    return (
        <div className={`space-y-4 ${selected.size > 0 ? 'pb-20' : ''}`}>
            {/* Toolbar */}
            <Toolbar className="sm:flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="hidden md:flex items-center justify-center w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0">
                        <Users size={16} />
                    </span>
                    <span className="text-sm font-semibold text-primary">{filtering ? 'Matching students' : 'All students'}</span>
                    <Badge tone="brand" shape="pill" className="tabular-nums">{loading ? '…' : totalCount}</Badge>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                    <SearchInput
                        wrapperClassName="flex-1 sm:w-80"
                        placeholder="Name, email, phone, eircode…"
                        value={search}
                        onChange={setSearch}
                        loading={searchPending}
                        aria-label="Search students"
                    />
                    <Button variant="primary" size="lg" onClick={openCreate} aria-label="Add Student">
                        <Plus size={16} /> <span className="hidden xs:inline sm:inline">Add Student</span>
                    </Button>
                </div>
                <div className="w-full sm:basis-full pt-3 border-t border-border-subtle">
                    <StudentFilterBar filters={filters} onChange={setFilters} courses={courses} sort={sort} onSort={setSort} />
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
                        className="py-16!"
                        icon={<Users size={24} />}
                        title={isError ? 'Could not load students' : filtering ? 'No students match these filters' : 'No students found'}
                        description={isError
                            ? 'Check your connection and try again'
                            : search ? `Nothing matches "${search.trim()}"${filtering ? ' with these filters' : ''}`
                                : filtering ? 'Try another course or status, or reset the filters'
                                    : 'Add your first student to get started'}
                        action={
                            isError ? (
                                <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
                            ) : search ? (
                                <Button variant="secondary" onClick={() => setSearch('')}><X size={14} /> Clear search</Button>
                            ) : filtering ? (
                                <Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}><X size={14} /> Reset filters</Button>
                            ) : (
                                <Button variant="primary" onClick={openCreate}><Plus size={16} /> Add Student</Button>
                            )
                        }
                    />
                ) : (
                    <div>
                        {/* Mobile Cards (< md) */}
                        <div className="md:hidden flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle bg-surface-elevated/40">
                            <SelectBox checked={allShownSelected} indeterminate={someShownSelected} onToggle={toggleAllShown} label={selectAllLabel} />
                            <span className="text-xs font-medium text-muted">
                                {allShownSelected ? 'All shown selected' : `Select all ${shownStudents.length} shown`}
                            </span>
                        </div>
                        <ul className="md:hidden divide-y divide-border-subtle">
                            {displayedStudents.map(student => {
                                const isSelected = selected.has(student.id);
                                return (
                                    <li
                                        key={student.id}
                                        onClick={() => setDetailStudent(student)}
                                        tabIndex={0}
                                        onKeyDown={e => {
                                            if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                                                e.preventDefault();
                                                setDetailStudent(student);
                                            }
                                        }}
                                        className={`px-4 py-3.5 cursor-pointer transition-colors flex gap-3 outline-hidden focus-visible:bg-surface-elevated/60 ${isSelected ? 'bg-brand-500/5' : 'hover:bg-surface-elevated/50 active:bg-surface-elevated'}`}
                                    >
                                        <div className="pt-3">
                                            <SelectBox checked={isSelected} onToggle={() => toggleSelected(student)} label={`Select ${fullName(student)}`} />
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                                            <div className="flex items-start justify-between gap-2.5">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-10 h-10 bg-linear-to-br ${getAvatarGradient(student.id)} rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0`}>
                                                        {initialsOf(student)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-primary text-sm leading-tight truncate">
                                                            {student.first_name} {student.last_name}
                                                        </p>
                                                        <p className="text-xs text-muted truncate mt-0.5">{student.email}</p>
                                                        {student.created_at && (
                                                            <span className="text-xs text-muted block mt-0.5">
                                                                Joined {formatDisplayDate(student.created_at)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setEnrollStudentId(student.id); setEnrollModalOpen(true); }}
                                                        className="h-8 px-2 text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/15 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1"
                                                        title="Enroll student in course"
                                                        aria-label={`Enroll ${fullName(student)} in a course`}
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

                                            <div className="pl-[52px]">
                                                <StudentCourses enrollments={enrollmentsByStudent.get(student.id)} loading={enrollmentsLoading} />
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
                                                                <span className="tabular-nums">{formatPhoneDisplay(student.phone)}</span>
                                                            </a>
                                                            {formatPhoneForWhatsApp(student.phone) && (
                                                                <CustomTooltip content="Chat on WhatsApp">
                                                                    <a
                                                                        href={formatPhoneForWhatsApp(student.phone)!}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="hit-area inline-flex items-center justify-center w-6 h-6 text-status-confirmed bg-success/10 hover:bg-success/20 border border-success/25 rounded-md transition-colors"
                                                                        title="Chat on WhatsApp"
                                                                    >
                                                                        <MessageSquare size={12} />
                                                                    </a>
                                                                </CustomTooltip>
                                                            )}
                                                        </>
                                                    )}
                                                    {student.eircode && <Badge className="font-mono">{student.eircode}</Badge>}
                                                    {student.dob && <Badge>DOB: {formatDisplayDate(student.dob)}</Badge>}
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>

                        {/* Desktop Table (>= md) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className={tableCls}>
                                {tableHead}
                                <tbody className={tbodyCls}>
                                    {displayedStudents.map(student => {
                                        const isSelected = selected.has(student.id);
                                        return (
                                            <tr
                                                key={student.id}
                                                className={`cv-auto-row focus-visible:bg-surface-elevated/60 cursor-pointer transition-colors group outline-hidden ${isSelected ? 'bg-brand-500/5' : 'hover:bg-surface-elevated/50'}`}
                                                onClick={() => setDetailStudent(student)}
                                                tabIndex={0}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && e.target === e.currentTarget) setDetailStudent(student);
                                                }}
                                            >
                                                <td className={`${tdCls} w-10 pr-0`} onClick={e => e.stopPropagation()}>
                                                    <SelectBox checked={isSelected} onToggle={() => toggleSelected(student)} label={`Select ${fullName(student)}`} />
                                                </td>
                                                <td className={tdCls}>
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={`table-avatar w-9 h-9 bg-linear-to-br ${getAvatarGradient(student.id)} rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0`}>
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
                                                            <a href={formatPhoneForCall(student.phone) || undefined} className="text-[13px] text-primary tabular-nums whitespace-nowrap hover:text-brand-600 dark:hover:text-brand-400">
                                                                {formatPhoneDisplay(student.phone)}
                                                            </a>
                                                            {formatPhoneForWhatsApp(student.phone) && (
                                                                <CustomTooltip content="Chat on WhatsApp">
                                                                    <a
                                                                        href={formatPhoneForWhatsApp(student.phone)!}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="hit-area inline-flex items-center justify-center w-6 h-6 text-muted hover:text-status-confirmed hover:bg-success/10 rounded-md transition-colors"
                                                                        title="Chat on WhatsApp"
                                                                    >
                                                                        <MessageSquare size={12} />
                                                                    </a>
                                                                </CustomTooltip>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted">—</span>
                                                    )}
                                                </td>
                                                <td className={`${tdCls} max-w-72`}>
                                                    <StudentCourses enrollments={enrollmentsByStudent.get(student.id)} loading={enrollmentsLoading} />
                                                </td>
                                                <td className={`${tdCls} hidden lg:table-cell`}>
                                                    {student.eircode ? <Badge className="font-mono">{student.eircode}</Badge> : <span className="text-muted">—</span>}
                                                </td>
                                                <td className={`${tdCls} hidden xl:table-cell text-xs text-muted tabular-nums whitespace-nowrap`}>
                                                    {student.created_at ? formatDisplayDate(student.created_at) : '—'}
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
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Infinite scroll sentinel + loading indicator */}
            {allMode && progressiveHasMore && <div key={displayedStudents.length} ref={progressiveSentinelRef} aria-hidden className="h-px" />}
            <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-2">
                {isFetchingNextPage && (
                    <div className="flex items-center gap-2 text-muted">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs font-medium">Loading more...</span>
                    </div>
                )}
                {!loading && (
                    <div className="text-xs text-muted text-center">
                        {allMode ? (
                            <><span className="font-semibold text-primary tabular-nums">{totalCount}</span> student{totalCount === 1 ? '' : 's'}{filtering ? ` ${totalCount === 1 ? 'matches' : 'match'} the filters${search ? ' and the search' : ''}` : search ? ' match the search' : ''}</>
                        ) : (
                            <>
                                Showing <span className="font-semibold text-primary tabular-nums">{displayedStudents.length}</span> of <span className="font-semibold text-primary tabular-nums">{totalCount}</span> students
                                {search && <span className="text-muted"> (filtered)</span>}
                            </>
                        )}
                    </div>
                )}
            </div>

            <StudentBulkBar
                count={selected.size}
                exporting={exporting}
                onEnroll={() => setBulkEnrollOpen(true)}
                onExport={handleExport}
                onClear={() => setSelected(new Map())}
            />

            {shownDetail && (
                <StudentDetail
                    open={!!detailStudent}
                    student={shownDetail}
                    onClose={() => setDetailStudent(null)}
                    onEdit={openEdit}
                    onDelete={() => setDeleteTarget(shownDetail)}
                    onEnroll={openEnrollFromDetail}
                    onStudentUpdated={patchStudentRow}
                    onNavigate={onNavigate}
                />
            )}

            {studentModalMount.mounted && (
                <StudentModal
                    key={studentModalMount.key}
                    open={studentModalOpen}
                    student={editingStudent}
                    onSave={handleSaveStudent}
                    onSaveAndEnroll={student => { setEnrollStudentId(student.id); setEnrollModalOpen(true); }}
                    onOpenExisting={openExistingStudent}
                    onMergeWith={editingStudent?.id ? mergeWithExisting : undefined}
                    onClose={() => setStudentModalOpen(false)}
                />
            )}
            {enrollModalMount.mounted && (
                <EnrollmentModal
                    key={enrollModalMount.key}
                    open={enrollModalOpen}
                    preselectedStudentId={enrollStudentId}
                    onSave={() => {
                        notify({ message: 'Enrollment created', type: 'success' });
                        if (detailStudent) setDetailStudent({ ...detailStudent });
                    }}
                    onClose={() => setEnrollModalOpen(false)}
                />
            )}
            {bulkEnrollMount.mounted && (
                <BulkEnrollModal
                    key={bulkEnrollMount.key}
                    open={bulkEnrollOpen}
                    students={selectedStudents}
                    enrollmentsOf={enrollmentsOf}
                    onDone={() => setSelected(new Map())}
                    onClose={() => setBulkEnrollOpen(false)}
                />
            )}
            {shownMerge && (
                <MergeModal
                    open={!!mergePair}
                    student={shownMerge.student}
                    initialTargetStudent={shownMerge.target}
                    onClose={() => setMergePair(null)}
                    onSuccess={() => notify({ message: 'Students merged', type: 'success' })}
                />
            )}
            <ConfirmDialog
                open={!!deleteTarget}
                title={`Delete ${fullName(deleteTarget) || 'student'}?`}
                message={deleteStudentMessage(deleteTarget, deleteTarget ? enrollmentsByStudent.get(deleteTarget.id) : undefined)}
                confirmLabel="Delete student"
                onConfirm={handleDeleteStudent}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
}

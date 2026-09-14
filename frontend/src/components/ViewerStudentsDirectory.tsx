import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../hooks/useDebounce';
import { ViewerCourse, getAvatarGradient, cleanVariant } from '../lib/types';
import { formatDateDMY } from '../lib/dateUtils';
import StudentDetailDrawer from './StudentDetailDrawer';
import {
    Search, X, Star, Clock, Send, CheckCircle, GraduationCap,
    XCircle, MessageSquare, ChevronRight, ChevronLeft, Calendar,
    Mail, Phone, RotateCcw, Users
} from 'lucide-react';

export interface ViewerStudentDirectoryItem {
    student_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    address: string | null;
    eircode: string | null;
    dob: string | null;
    created_at: string;
    primary_course_name: string | null;
    primary_course_id: string | null;
    primary_status: string | null;
    primary_course_variant: string | null;
    primary_queue_position: number | null;
    is_priority: boolean;
    total_enrollments: number;
    notes_count: number;
    total_count: number;
}

export type SortOption = 'date_desc' | 'date_asc' | 'queue' | 'name_asc';
export type StatusFilterOption = 'all' | 'requested' | 'invited' | 'confirmed' | 'completed';

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactElement; className: string }> = {
    requested: {
        label: 'Requested',
        icon: <Clock size={12} />,
        className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    },
    invited: {
        label: 'Invited',
        icon: <Send size={12} />,
        className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    },
    confirmed: {
        label: 'Confirmed',
        icon: <CheckCircle size={12} />,
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    },
    completed: {
        label: 'Completed',
        icon: <GraduationCap size={12} />,
        className: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20',
    },
    rejected: {
        label: 'Rejected',
        icon: <XCircle size={12} />,
        className: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
    },
    withdrawn: {
        label: 'Withdrawn',
        icon: <XCircle size={12} />,
        className: 'bg-muted/10 text-muted border-border-subtle',
    },
};

const STATUS_TABS: { key: StatusFilterOption; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'requested', label: 'Requested' },
    { key: 'invited', label: 'Invited' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'completed', label: 'Completed' },
];

const PAGE_SIZE = 50;

export default function ViewerStudentsDirectory() {
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 250);

    const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<StatusFilterOption>('all');
    const [priorityOnly, setPriorityOnly] = useState<boolean>(false);
    const [sortBy, setSortBy] = useState<SortOption>('date_desc');
    const [page, setPage] = useState<number>(1);

    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

    // Fetch active courses for the course filter dropdown
    const { data: courses = [] } = useQuery<ViewerCourse[]>({
        queryKey: ['viewer-courses'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_viewer_courses');
            if (error) throw error;
            return (data || []) as ViewerCourse[];
        },
    });

    // Fetch students directory based on active filters
    const {
        data: students = [],
        isLoading: isLoadingStudents,
        isFetching: isFetchingStudents,
    } = useQuery<ViewerStudentDirectoryItem[]>({
        queryKey: [
            'viewer-students-directory',
            debouncedSearch.trim(),
            selectedCourseId,
            selectedStatus,
            priorityOnly,
            sortBy,
            page,
        ],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_viewer_students_directory', {
                p_search: debouncedSearch.trim() || null,
                p_course_id: selectedCourseId === 'all' ? null : selectedCourseId,
                p_status: selectedStatus === 'all' ? null : selectedStatus,
                p_priority_only: priorityOnly,
                p_sort_by: sortBy,
                p_limit: PAGE_SIZE,
                p_offset: (page - 1) * PAGE_SIZE,
            });
            if (error) throw error;
            return (data || []) as ViewerStudentDirectoryItem[];
        },
    });

    const isFiltered = Boolean(
        search.trim() ||
        selectedCourseId !== 'all' ||
        selectedStatus !== 'all' ||
        priorityOnly ||
        sortBy !== 'date_desc'
    );

    const handleResetFilters = () => {
        setSearch('');
        setSelectedCourseId('all');
        setSelectedStatus('all');
        setPriorityOnly(false);
        setSortBy('date_desc');
        setPage(1);
    };

    const totalCount = students.length > 0 ? Number(students[0].total_count) : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-2xl border border-brand-200 dark:border-brand-500/20">
                            <Users size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                                Students Directory
                            </h1>
                            <p className="text-sm text-muted">
                                Search and inspect participant enrollments, queue positions and notes
                            </p>
                        </div>
                    </div>
                </div>

                {/* Results count pill */}
                <div className="flex items-center gap-2 self-start md:self-auto">
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-elevated border border-border-subtle text-muted shadow-sm">
                        {isLoadingStudents ? (
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                                Loading directory...
                            </span>
                        ) : (
                            <span>
                                Showing {totalCount} student{totalCount === 1 ? '' : 's'}
                            </span>
                        )}
                    </span>
                    {isFetchingStudents && !isLoadingStudents && (
                        <span className="w-2 h-2 rounded-full bg-brand-500 animate-ping" title="Updating..." />
                    )}
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-surface rounded-2xl border border-border-subtle p-4 shadow-card space-y-4">
                {/* Top row: Search input */}
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={18} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Search students by name, email, phone, eircode..."
                        className="w-full pl-10 pr-10 py-2.5 bg-surface-elevated border border-border-subtle rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                    />
                    {search && (
                        <button
                            type="button"
                            aria-label="Clear search"
                            onClick={() => {
                                setSearch('');
                                setPage(1);
                            }}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-foreground rounded-full hover:bg-surface transition-colors"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                {/* Bottom row: Filter Controls */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Course Filter Dropdown */}
                    <div className="min-w-[180px] flex-1 sm:flex-initial">
                        <select
                            aria-label="Course filter"
                            value={selectedCourseId}
                            onChange={(e) => {
                                setSelectedCourseId(e.target.value);
                                setPage(1);
                            }}
                            className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-xl text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all cursor-pointer"
                        >
                            <option value="all">All Courses</option>
                            {courses.map((course) => (
                                <option key={course.id} value={course.id}>
                                    {course.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter Tabs/Pills */}
                    <div className="flex items-center gap-1 p-1 bg-surface-elevated border border-border-subtle rounded-xl overflow-x-auto">
                        {STATUS_TABS.map((tab) => {
                            const active = selectedStatus === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => {
                                        setSelectedStatus(tab.key);
                                        setPage(1);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                                        active
                                            ? 'bg-brand-600 text-white shadow-sm'
                                            : 'text-muted hover:text-foreground hover:bg-surface'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Priority Toggle Button */}
                    <button
                        type="button"
                        onClick={() => {
                            setPriorityOnly((prev) => !prev);
                            setPage(1);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border whitespace-nowrap cursor-pointer ${
                            priorityOnly
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30'
                                : 'bg-surface-elevated text-muted hover:text-foreground border-border-subtle hover:bg-surface'
                        }`}
                    >
                        <Star size={13} className={priorityOnly ? 'fill-amber-400 text-amber-500' : ''} />
                        <span>⭐ Priority Only</span>
                    </button>

                    {/* Sort Dropdown */}
                    <div className="min-w-[150px] flex-1 sm:flex-initial">
                        <select
                            aria-label="Sort by"
                            value={sortBy}
                            onChange={(e) => {
                                setSortBy(e.target.value as SortOption);
                                setPage(1);
                            }}
                            className="w-full px-3 py-2 bg-surface-elevated border border-border-subtle rounded-xl text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all cursor-pointer"
                        >
                            <option value="date_desc">Newest First</option>
                            <option value="date_asc">Oldest First</option>
                            <option value="queue">Queue Position</option>
                            <option value="name_asc">Name A-Z</option>
                        </select>
                    </div>

                    {/* Reset Filters Button */}
                    {isFiltered && (
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            className="px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
                        >
                            <RotateCcw size={13} />
                            <span>Reset Filters</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            {isLoadingStudents ? (
                /* Loading Skeletons */
                <div className="space-y-3">
                    {/* Desktop Table Skeleton */}
                    <div className="hidden md:block bg-surface rounded-2xl border border-border-subtle overflow-hidden p-4 space-y-4">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center gap-4 animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-muted/20 shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-muted/20 rounded w-1/4" />
                                    <div className="h-3 bg-muted/20 rounded w-1/3" />
                                </div>
                                <div className="w-32 h-6 bg-muted/20 rounded-xl" />
                                <div className="w-24 h-6 bg-muted/20 rounded-xl" />
                                <div className="w-24 h-4 bg-muted/20 rounded" />
                            </div>
                        ))}
                    </div>

                    {/* Mobile Cards Skeleton */}
                    <div className="md:hidden space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-surface rounded-2xl border border-border-subtle p-4 space-y-3 animate-pulse">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-muted/20 shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-muted/20 rounded w-1/2" />
                                        <div className="h-3 bg-muted/20 rounded w-1/3" />
                                    </div>
                                </div>
                                <div className="h-4 bg-muted/20 rounded w-2/3" />
                                <div className="h-6 bg-muted/20 rounded w-1/4" />
                            </div>
                        ))}
                    </div>
                </div>
            ) : students.length === 0 ? (
                /* Empty State */
                <div className="bg-surface rounded-3xl border border-border-subtle p-12 text-center max-w-lg mx-auto space-y-4 shadow-card">
                    <div className="w-16 h-16 rounded-full bg-muted/10 text-muted mx-auto flex items-center justify-center">
                        <Users size={32} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-foreground">
                            {isFiltered ? 'No students match your selected filters' : 'No students found in the database'}
                        </h3>
                        <p className="text-sm text-muted mt-1">
                            {isFiltered
                                ? 'Try searching for something else or reset your filter criteria to see participants.'
                                : 'There are currently no participants registered in the system.'}
                        </p>
                    </div>
                    {isFiltered && (
                        <div>
                            <button
                                type="button"
                                onClick={handleResetFilters}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold shadow-sm transition-all cursor-pointer"
                            >
                                <RotateCcw size={15} />
                                <span>Reset Filters</span>
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <>
                    {/* Desktop Data Table */}
                    <div className="hidden md:block bg-surface rounded-2xl border border-border-subtle overflow-hidden shadow-card">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border-subtle bg-surface-elevated/50 text-xs font-semibold text-muted uppercase tracking-wider">
                                    <th scope="col" className="px-5 py-3.5">Student</th>
                                    <th scope="col" className="px-5 py-3.5">Primary Course & Status</th>
                                    <th scope="col" className="px-5 py-3.5">Queue & Priority</th>
                                    <th scope="col" className="px-5 py-3.5">Registration Date</th>
                                    <th scope="col" className="px-5 py-3.5 text-center">Notes</th>
                                    <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle text-sm">
                                {students.map((student) => {
                                    const gradient = getAvatarGradient(student.student_id);
                                    const initials = `${student.first_name?.[0] || ''}${student.last_name?.[0] || ''}`.toUpperCase();
                                    const statusConfig = student.primary_status ? STATUS_CONFIG[student.primary_status] : null;
                                    const variant = cleanVariant(student.primary_course_name || '', student.primary_course_variant);

                                    return (
                                        <tr
                                            key={student.student_id}
                                            data-testid="student-row"
                                            onClick={() => setSelectedStudentId(student.student_id)}
                                            className="hover:bg-surface-elevated/60 transition-colors cursor-pointer group"
                                        >
                                            {/* Student Column: Avatar + Name + Contact */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${gradient} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                                                        {initials}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors truncate">
                                                            {student.first_name} {student.last_name}
                                                        </div>
                                                        <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
                                                            {student.email && (
                                                                <span className="flex items-center gap-1 truncate" title={student.email}>
                                                                    <Mail size={12} className="shrink-0" />
                                                                    <span className="truncate">{student.email}</span>
                                                                </span>
                                                            )}
                                                            {student.phone && (
                                                                <span className="flex items-center gap-1 shrink-0">
                                                                    <Phone size={12} className="shrink-0" />
                                                                    <span>{student.phone}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Primary Course & Status Badge */}
                                            <td className="px-5 py-4">
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-medium text-foreground text-xs">
                                                            {student.primary_course_name || 'No course'}
                                                        </span>
                                                        {variant && (
                                                            <span className="text-[11px] text-muted bg-surface-elevated px-2 py-0.5 rounded-md border border-border-subtle">
                                                                {variant}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        {statusConfig ? (
                                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusConfig.className}`}>
                                                                {statusConfig.icon}
                                                                <span>{statusConfig.label}</span>
                                                            </span>
                                                        ) : student.primary_status ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-elevated border border-border-subtle text-muted capitalize">
                                                                {student.primary_status}
                                                            </span>
                                                        ) : null}

                                                        {student.total_enrollments > 1 && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-500/20">
                                                                +{student.total_enrollments - 1} more
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Queue & Priority */}
                                            <td className="px-5 py-4">
                                                <div className="flex flex-col gap-1 items-start">
                                                    {student.is_priority && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20">
                                                            <Star size={11} className="fill-amber-400 text-amber-500" />
                                                            <span>⭐ Priority</span>
                                                        </span>
                                                    )}
                                                    {student.primary_status === 'requested' && student.primary_queue_position != null ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
                                                            <Clock size={11} />
                                                            <span>#{student.primary_queue_position} in queue</span>
                                                        </span>
                                                    ) : !student.is_priority ? (
                                                        <span className="text-xs text-muted">—</span>
                                                    ) : null}
                                                </div>
                                            </td>

                                            {/* Registration Date */}
                                            <td className="px-5 py-4 whitespace-nowrap text-xs text-muted">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={13} className="text-muted shrink-0" />
                                                    <span>{formatDateDMY(student.created_at)}</span>
                                                </div>
                                            </td>

                                            {/* Notes Indicator */}
                                            <td className="px-5 py-4 text-center whitespace-nowrap">
                                                {student.notes_count > 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-surface-elevated border border-border-subtle text-foreground shadow-xs">
                                                        <MessageSquare size={12} className="text-brand-500" />
                                                        <span>{student.notes_count}</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted">—</span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-5 py-4 text-right whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 group-hover:translate-x-0.5 transition-transform">
                                                    <span>View Details</span>
                                                    <ChevronRight size={14} />
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards View */}
                    <div className="md:hidden space-y-3">
                        {students.map((student) => {
                            const gradient = getAvatarGradient(student.student_id);
                            const initials = `${student.first_name?.[0] || ''}${student.last_name?.[0] || ''}`.toUpperCase();
                            const statusConfig = student.primary_status ? STATUS_CONFIG[student.primary_status] : null;
                            const variant = cleanVariant(student.primary_course_name || '', student.primary_course_variant);

                            return (
                                <div
                                    key={student.student_id}
                                    data-testid="student-row"
                                    onClick={() => setSelectedStudentId(student.student_id)}
                                    className="bg-surface rounded-2xl border border-border-subtle p-4 shadow-card space-y-3 hover:bg-surface-elevated/50 transition-colors cursor-pointer active:scale-[0.99]"
                                >
                                    {/* Top row: Avatar, Name, Priority & Notes */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${gradient} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                                                {initials}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-foreground text-sm truncate">
                                                    {student.first_name} {student.last_name}
                                                </h3>
                                                <p className="text-xs text-muted truncate">
                                                    {student.email}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {student.is_priority && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20">
                                                    <Star size={10} className="fill-amber-400 text-amber-500" />
                                                </span>
                                            )}
                                            {student.notes_count > 0 && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-surface-elevated border border-border-subtle text-foreground">
                                                    <MessageSquare size={11} className="text-brand-500" />
                                                    <span>{student.notes_count}</span>
                                                </span>
                                            )}
                                            <ChevronRight size={16} className="text-muted" />
                                        </div>
                                    </div>

                                    {/* Course info */}
                                    <div className="bg-surface-elevated/60 rounded-xl p-2.5 border border-border-subtle space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-semibold text-foreground truncate">
                                                {student.primary_course_name || 'No course assigned'}
                                            </span>
                                            {variant && (
                                                <span className="text-[10px] text-muted shrink-0">
                                                    {variant}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {statusConfig && (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusConfig.className}`}>
                                                    {statusConfig.icon}
                                                    <span>{statusConfig.label}</span>
                                                </span>
                                            )}
                                            {student.total_enrollments > 1 && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-500/20">
                                                    +{student.total_enrollments - 1} more
                                                </span>
                                            )}
                                            {student.primary_status === 'requested' && student.primary_queue_position != null && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
                                                    <Clock size={10} />
                                                    <span>#{student.primary_queue_position} in queue</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer: Date & Phone */}
                                    <div className="flex items-center justify-between text-xs text-muted pt-1 border-t border-border-subtle/50">
                                        <span className="flex items-center gap-1">
                                            <Calendar size={12} />
                                            <span>Registered: {formatDateDMY(student.created_at)}</span>
                                        </span>
                                        {student.phone && (
                                            <span className="flex items-center gap-1">
                                                <Phone size={12} />
                                                <span>{student.phone}</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                            <button
                                type="button"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface border border-border-subtle text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                                <ChevronLeft size={14} />
                                <span>Previous</span>
                            </button>
                            <span className="text-xs font-medium text-muted">
                                Page <strong className="text-foreground">{page}</strong> of <strong className="text-foreground">{totalPages}</strong>
                            </span>
                            <button
                                type="button"
                                disabled={page >= totalPages}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface border border-border-subtle text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                                <span>Next</span>
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Slide-over Drawer Integration */}
            <StudentDetailDrawer
                studentId={selectedStudentId}
                onClose={() => setSelectedStudentId(null)}
            />
        </div>
    );
}

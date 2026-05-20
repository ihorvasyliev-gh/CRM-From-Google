import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Search, Plus, Edit2, Trash2, Users, BookOpen } from 'lucide-react';
import { Course, getAvatarGradient } from '../lib/types';
import CourseModal from './CourseModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';

interface EnrollmentCount {
    course_id: string;
    total: number;
    requested: number;
    invited: number;
    confirmed: number;
    rejected: number;
}

async function fetchCourses(): Promise<Course[]> {
    const { data } = await supabase.from('courses').select('*').order('name');
    return (data || []) as Course[];
}

async function fetchEnrollmentCounts(): Promise<Record<string, EnrollmentCount>> {
    const { data: enrollments } = await supabase.from('enrollments').select('course_id, status');
    if (!enrollments) return {};
    const counts: Record<string, EnrollmentCount> = {};
    for (const e of enrollments) {
        if (!counts[e.course_id]) {
            counts[e.course_id] = { course_id: e.course_id, total: 0, requested: 0, invited: 0, confirmed: 0, rejected: 0 };
        }
        counts[e.course_id].total++;
        const stat = e.status as keyof EnrollmentCount;
        if (stat in counts[e.course_id]) {
            (counts[e.course_id][stat] as number)++;
        }
    }
    return counts;
}


// ─── Status Bar (extracted to module-level) ────────────────
function StatusBar({ counts }: { counts: EnrollmentCount | undefined }) {
    if (!counts || counts.total === 0) return <span className="text-xs text-muted">No enrollments</span>;

    const segments = [
        { key: 'confirmed', color: '#10b981', count: counts.confirmed, label: 'Confirmed' },
        { key: 'invited', color: '#3b82f6', count: counts.invited, label: 'Invited' },
        { key: 'requested', color: '#f59e0b', count: counts.requested, label: 'Requested' },
        { key: 'rejected', color: '#f87171', count: counts.rejected, label: 'Rejected' },
    ];

    const visible = segments.filter(s => s.count > 0);
    // Use the sum of visible segments as the base so the bar always fills 100%
    const visibleTotal = visible.reduce((sum, s) => sum + s.count, 0);

    return (
        <div className="space-y-2">
            <div
                style={{
                    display: 'flex',
                    height: '8px',
                    borderRadius: '9999px',
                    overflow: 'hidden',
                    backgroundColor: 'var(--color-surface-elevated, #2a2a3a)',
                    width: '100%',
                }}
            >
                {visible.map((s, i) => {
                    const isLast = i === visible.length - 1;
                    return (
                        <div
                            key={s.key}
                            title={`${s.label}: ${s.count}`}
                            style={{
                                // Last segment uses flex:1 to absorb any sub-pixel rounding gaps
                                ...(isLast ? { flex: 1 } : { width: `${(s.count / visibleTotal) * 100}%`, flexShrink: 0 }),
                                backgroundColor: s.color,
                                transition: 'width 0.7s ease-out',
                            }}
                        />
                    );
                })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
                {segments.map(s => s.count > 0 ? (
                    <span key={s.key} className="flex items-center gap-1.5 text-[10px] text-muted font-medium">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.color, flexShrink: 0, display: 'inline-block' }} />
                        {s.count} {s.label}
                    </span>
                ) : null)}
            </div>
        </div>
    );
}

export default function CourseList() {
    const queryClient = useQueryClient();

    const { data: courses = [], isLoading: loading } = useQuery({
        queryKey: ['courses'],
        queryFn: fetchCourses,
    });

    const { data: enrollmentCounts = {} } = useQuery({
        queryKey: ['course_enrollment_counts'],
        queryFn: fetchEnrollmentCounts,
    });

    const [search, setSearch] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

    // Helper to update courses cache optimistically
    const setCourses = useCallback((updater: (prev: Course[]) => Course[]) => {
        queryClient.setQueryData<Course[]>(['courses'], (old = []) => updater(old));
    }, [queryClient]);

    async function handleSave(data: { id?: string; name: string }) {
        if (data.id) {
            const { error } = await supabase.from('courses').update({ name: data.name }).eq('id', data.id);
            if (error) throw new Error(error.message);
            setCourses(prev => prev.map(c => c.id === data.id ? { ...c, name: data.name } : c));
            setToast({ message: 'Course updated', type: 'success' });
        } else {
            const { data: inserted, error } = await supabase.from('courses').insert({ name: data.name }).select();
            if (error) throw new Error(error.message);
            if (inserted) setCourses(prev => [...prev, inserted[0]].sort((a, b) => a.name.localeCompare(b.name)));
            setToast({ message: 'Course created', type: 'success' });
        }
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        const { error } = await supabase.from('courses').delete().eq('id', deleteTarget.id);
        if (error) {
            setToast({ message: 'Failed to delete course', type: 'error' });
        } else {
            setCourses(prev => prev.filter(c => c.id !== deleteTarget.id));
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
            setToast({ message: 'Course deleted', type: 'success' });
        }
        setDeleteTarget(null);
    }

    const filtered = courses.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-50 rounded-xl text-violet-600">
                            <BookOpen size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-primary tracking-tight">Courses</h2>
                                <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-2.5 py-0.5 rounded-full">{courses.length}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                            <input
                                type="text"
                                placeholder="Search courses..."
                                className="w-full pl-9 pr-4 py-2.5 bg-surface-elevated border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 focus:bg-background transition-all placeholder:text-muted/60 text-primary"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => { setEditingCourse(null); setModalOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-sm hover:shadow-brand-500/25 active:scale-[0.98] whitespace-nowrap"
                        >
                            <Plus size={16} /> Add Course
                        </button>
                    </div>
                </div>
            </div>

            {/* Course Cards */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden animate-pulse">
                            <div className="h-1.5 bg-surface-elevated" />
                            <div className="p-5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-xl bg-surface-elevated" />
                                        <div>
                                            <div className="h-4 w-28 rounded bg-surface-elevated mb-2" />
                                            <div className="h-3 w-20 rounded bg-surface-elevated" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-2 rounded-full bg-surface-elevated" />
                                    <div className="flex gap-3">
                                        <div className="h-3 w-16 rounded bg-surface-elevated" />
                                        <div className="h-3 w-16 rounded bg-surface-elevated" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-surface-elevated border border-border-subtle shadow-sm rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookOpen size={28} className="text-muted" />
                    </div>
                    <p className="text-lg font-semibold text-primary">No courses found</p>
                    <p className="text-sm text-muted mt-1">Create your first course to get started</p>
                    <button
                        onClick={() => { setEditingCourse(null); setModalOpen(true); }}
                        className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all active:scale-[0.98] inline-flex items-center gap-2"
                    >
                        <Plus size={16} /> Add Course
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(course => {
                        const counts = enrollmentCounts[course.id];
                        const gradient = getAvatarGradient(course.id);
                        return (
                            <div key={course.id} className="bg-surface rounded-2xl shadow-card border border-border-subtle hover:shadow-float hover:-translate-y-1 transition-all duration-300 overflow-hidden group">
                                {/* Gradient top accent */}
                                <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />

                                <div className="p-5">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-11 h-11 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
                                                {course.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-primary">{course.name}</h3>
                                                <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                                                    <Users size={12} />
                                                    <span className="font-medium">{counts?.total || 0}</span> students enrolled
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                            <button
                                                onClick={() => { setEditingCourse(course); setModalOpen(true); }}
                                                className="p-2 text-muted hover:text-brand-500 hover:bg-surface-elevated rounded-lg transition-all"
                                                title="Edit"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteTarget(course)}
                                                className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <StatusBar counts={counts} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <CourseModal
                open={modalOpen}
                course={editingCourse}
                onSave={handleSave}
                onClose={() => setModalOpen(false)}
            />
            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Course"
                message={`Are you sure you want to delete "${deleteTarget?.name}"? All enrollments for this course will also be deleted.`}
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />
            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}

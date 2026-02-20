import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Plus, Edit2, Trash2, Users, BookOpen, Loader2 } from 'lucide-react';
import CourseModal from './CourseModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';

interface Course {
    id: string;
    name: string;
    created_at: string;
}

interface EnrollmentCount {
    course_id: string;
    total: number;
    requested: number;
    invited: number;
    confirmed: number;
    rejected: number;
}

const CARD_GRADIENTS = [
    'from-brand-500 to-brand-600',
    'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-blue-600',
    'from-fuchsia-500 to-pink-600',
    'from-lime-500 to-green-600',
];

function getGradient(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return CARD_GRADIENTS[Math.abs(hash) % CARD_GRADIENTS.length];
}

export default function CourseList() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, EnrollmentCount>>({});
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

    useEffect(() => { fetchAll(); }, []);

    async function fetchAll() {
        setLoading(true);
        const { data: coursesData } = await supabase.from('courses').select('*').order('name');
        if (coursesData) setCourses(coursesData);

        const { data: enrollments } = await supabase.from('enrollments').select('course_id, status');
        if (enrollments) {
            const counts: Record<string, EnrollmentCount> = {};
            for (const e of enrollments) {
                if (!counts[e.course_id]) {
                    counts[e.course_id] = { course_id: e.course_id, total: 0, requested: 0, invited: 0, confirmed: 0, rejected: 0 };
                }
                counts[e.course_id].total++;
                if (e.status in counts[e.course_id]) {
                    (counts[e.course_id] as any)[e.status]++;
                }
            }
            setEnrollmentCounts(counts);
        }
        setLoading(false);
    }

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
            setToast({ message: 'Course deleted', type: 'success' });
        }
        setDeleteTarget(null);
    }

    const filtered = courses.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    function StatusBar({ counts }: { counts: EnrollmentCount | undefined }) {
        if (!counts || counts.total === 0) return <span className="text-xs text-surface-400">No enrollments</span>;

        const segments = [
            { key: 'confirmed', color: 'bg-emerald-500', count: counts.confirmed, label: 'Confirmed' },
            { key: 'invited', color: 'bg-blue-500', count: counts.invited, label: 'Invited' },
            { key: 'requested', color: 'bg-amber-500', count: counts.requested, label: 'Requested' },
            { key: 'rejected', color: 'bg-red-400', count: counts.rejected, label: 'Rejected' },
        ];

        return (
            <div className="space-y-2">
                <div className="flex h-2 rounded-full overflow-hidden bg-surface-100">
                    {segments.map(s => s.count > 0 ? (
                        <div
                            key={s.key}
                            className={`${s.color} transition-all duration-700 ease-out`}
                            style={{ width: `${(s.count / counts.total) * 100}%` }}
                            title={`${s.label}: ${s.count}`}
                        />
                    ) : null)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {segments.map(s => s.count > 0 ? (
                        <span key={s.key} className="flex items-center gap-1.5 text-[10px] text-surface-500 font-medium">
                            <span className={`w-2 h-2 rounded-full ${s.color}`} />
                            {s.count} {s.label}
                        </span>
                    ) : null)}
                </div>
            </div>
        );
    }

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
                <div className="flex justify-center py-16">
                    <Loader2 size={24} className="animate-spin text-brand-500" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookOpen size={28} className="text-surface-300" />
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
                        const gradient = getGradient(course.id);
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

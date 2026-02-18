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

export default function CourseList() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, EnrollmentCount>>({});
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);

    // Toast
    const [toast, setToast] = useState<ToastData | null>(null);

    useEffect(() => {
        fetchAll();
    }, []);

    async function fetchAll() {
        setLoading(true);
        // Fetch courses
        const { data: coursesData } = await supabase.from('courses').select('*').order('name');
        if (coursesData) setCourses(coursesData);

        // Fetch enrollment counts
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
        if (!counts || counts.total === 0) return <span className="text-xs text-slate-400">No enrollments</span>;

        const segments = [
            { key: 'confirmed', color: 'bg-green-500', count: counts.confirmed },
            { key: 'invited', color: 'bg-blue-500', count: counts.invited },
            { key: 'requested', color: 'bg-yellow-500', count: counts.requested },
            { key: 'rejected', color: 'bg-red-400', count: counts.rejected },
        ];

        return (
            <div className="space-y-1.5">
                <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                    {segments.map(s => s.count > 0 ? (
                        <div
                            key={s.key}
                            className={`${s.color} transition-all`}
                            style={{ width: `${(s.count / counts.total) * 100}%` }}
                            title={`${s.key}: ${s.count}`}
                        />
                    ) : null)}
                </div>
                <div className="flex gap-3 text-[10px] text-slate-500">
                    {segments.map(s => s.count > 0 ? (
                        <span key={s.key} className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${s.color}`} />
                            {s.count} {s.key}
                        </span>
                    ) : null)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                            <BookOpen size={20} />
                        </div>
                        <h2 className="text-lg font-semibold text-slate-800">Courses</h2>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{courses.length}</span>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search courses..."
                                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => { setEditingCourse(null); setModalOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition whitespace-nowrap"
                        >
                            <Plus size={16} /> Add Course
                        </button>
                    </div>
                </div>
            </div>

            {/* Course Cards */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 size={24} className="animate-spin text-blue-500" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <BookOpen size={48} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-lg">No courses found</p>
                    <p className="text-sm mt-1">Create your first course to get started</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(course => {
                        const counts = enrollmentCounts[course.id];
                        return (
                            <div key={course.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition group">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                                            {course.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-slate-900">{course.name}</h3>
                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                <Users size={12} /> {counts?.total || 0} students
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                        <button
                                            onClick={() => { setEditingCourse(course); setModalOpen(true); }}
                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                            title="Edit"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => setDeleteTarget(course)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                <StatusBar counts={counts} />
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
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

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Users, BookOpen, Languages, Globe, ArrowRight, FileText } from 'lucide-react';
import SearchInput from './ui/SearchInput';
import Badge from './ui/Badge';
import { Toolbar } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { EmptyState } from './ui/States';
import { Course, CourseEmailInfo, getAvatarGradient } from '../lib/types';
import CourseModal from './CourseModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';
import { useDebounce } from '../hooks/useDebounce';
import { fetchAllEnrollments } from '../hooks/useEnrollments';
import { fetchDocumentTemplates } from '../lib/documentUtils';
import { fetchCourses } from '../lib/queries';

interface EnrollmentCount {
    course_id: string;
    total: number;
    requested: number;
    invited: number;
    confirmed: number;
    completed: number;
    withdrawn: number;
    rejected: number;
}



// ─── Status Bar (extracted to module-level) ────────────────
function StatusBar({ counts }: { counts: EnrollmentCount | undefined }) {
    // Always define all segments so the legend is always rendered (consistent card height)
    const segments = [
        // Same colour language as the enrollment board / status pills everywhere else
        { key: 'completed', color: 'var(--color-completed)', count: counts?.completed ?? 0, label: 'Completed' },
        { key: 'confirmed', color: 'var(--color-confirmed)', count: counts?.confirmed ?? 0, label: 'Confirmed' },
        { key: 'invited', color: 'var(--color-invited)', count: counts?.invited ?? 0, label: 'Invited' },
        { key: 'requested', color: 'var(--color-requested)', count: counts?.requested ?? 0, label: 'Requested' },
        { key: 'withdrawn', color: 'var(--chart-neutral)', count: counts?.withdrawn ?? 0, label: 'Withdrawn' },
        { key: 'rejected', color: 'var(--chart-rose)', count: counts?.rejected ?? 0, label: 'Rejected' },
    ];

    // Legend always shows Requested + Completed; other statuses shown only when non-zero
    const alwaysShow = new Set(['requested', 'completed']);

    const visible = segments.filter(s => s.count > 0);
    const barTotal = visible.reduce((sum, s) => sum + s.count, 0);

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-border-subtle gap-px">
                {barTotal > 0 && visible.map(s => (
                    <div
                        key={s.key}
                        title={`${s.label}: ${s.count}`}
                        className="h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full"
                        style={{ width: `${(s.count / barTotal) * 100}%`, backgroundColor: s.color }}
                    />
                ))}
            </div>
            {/* Legend — always shows Requested & Completed, plus any other non-zero statuses */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 min-h-4">
                {segments.map(s => {
                    if (!alwaysShow.has(s.key) && s.count === 0) return null;
                    return (
                        <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted font-medium tabular-nums">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            {s.count} {s.label}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

async function fetchCourseEnrollmentCounts(): Promise<Record<string, EnrollmentCount>> {
    try {
        if (typeof (supabase as any).rpc === 'function') {
            const { data, error } = await (supabase as any).rpc('get_course_enrollment_counts');
            if (!error && Array.isArray(data)) {
                const map: Record<string, EnrollmentCount> = {};
                for (const row of data) {
                    map[row.course_id] = {
                        course_id: row.course_id,
                        total: Number(row.total || 0),
                        requested: Number(row.requested || 0),
                        invited: Number(row.invited || 0),
                        confirmed: Number(row.confirmed || 0),
                        completed: Number(row.completed || 0),
                        withdrawn: Number(row.withdrawn || 0),
                        rejected: Number(row.rejected || 0),
                    };
                }
                return map;
            }
        }
    } catch {
        // Fallback to client-side aggregation if RPC is unavailable
    }

    const enrollments = await fetchAllEnrollments();
    const counts: Record<string, EnrollmentCount> = {};
    for (const e of enrollments) {
        if (!counts[e.course_id]) {
            counts[e.course_id] = {
                course_id: e.course_id,
                total: 0,
                requested: 0,
                invited: 0,
                confirmed: 0,
                completed: 0,
                withdrawn: 0,
                rejected: 0,
            };
        }
        const bucket = counts[e.course_id];
        bucket.total += 1;
        // Note: avoid `(x as number)++` — the dev-server Babel transform drops the parentheses
        // and esbuild then fails to compile the whole page.
        const byStatus = bucket as unknown as Record<string, number>;
        if (e.status !== 'course_id' && e.status !== 'total' && e.status in byStatus) {
            byStatus[e.status] += 1;
        }
    }
    return counts;
}

export default function CourseList() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: courses = [], isLoading: coursesLoading } = useQuery({
        queryKey: ['courses'],
        queryFn: fetchCourses,
    });

    const { data: enrollmentCounts = {}, isLoading: countsLoading } = useQuery({
        queryKey: ['course_enrollment_counts'],
        queryFn: fetchCourseEnrollmentCounts,
    });

    const loading = coursesLoading || countsLoading;

    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
    const [toast, setToast] = useState<ToastData | null>(null);

    // Dashboard "+ Course" quick action lands here with { openCreate: true }
    const location = useLocation();
    useEffect(() => {
        if ((location.state as { openCreate?: boolean } | null)?.openCreate) {
            setEditingCourse(null);
            setModalOpen(true);
            // Clear the flag so a refresh / back navigation doesn't reopen the modal
            navigate(location.pathname, { replace: true, state: null });
        }
    }, [location.state, location.pathname, navigate]);

    // Document templates switched on in settings — the ones a course can pick from
    const { data: allTemplates = [] } = useQuery({ queryKey: ['doc_templates'], queryFn: fetchDocumentTemplates });
    const activeTemplates = useMemo(() => allTemplates.filter(t => t.is_active), [allTemplates]);

    // Helper to update courses cache optimistically
    const setCourses = useCallback((updater: (prev: Course[]) => Course[]) => {
        queryClient.setQueryData<Course[]>(['courses'], (old = []) => updater(old));
    }, [queryClient]);

    async function handleSave(data: { id?: string; name: string; requires_english?: boolean; max_capacity?: number | null; template_ids: string[]; email_templates: CourseEmailInfo }) {
        const maxCapacity = data.max_capacity ?? null;
        if (data.id) {
            const { error } = await supabase
                .from('courses')
                .update({ name: data.name, requires_english: data.requires_english ?? false, max_capacity: maxCapacity, template_ids: data.template_ids, email_templates: data.email_templates })
                .eq('id', data.id);
            if (error) throw new Error(error.message);
            setCourses(prev => prev.map(c => c.id === data.id ? { ...c, name: data.name, requires_english: data.requires_english, max_capacity: maxCapacity, template_ids: data.template_ids, email_templates: data.email_templates } : c));
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
            setToast({ message: 'Course updated', type: 'success' });
        } else {
            const { data: inserted, error } = await supabase
                .from('courses')
                .insert({ name: data.name, requires_english: data.requires_english ?? false, max_capacity: maxCapacity, template_ids: data.template_ids, email_templates: data.email_templates })
                .select();
            if (error) throw new Error(error.message);
            if (inserted) setCourses(prev => [...prev, inserted[0]].sort((a, b) => a.name.localeCompare(b.name)));
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
            setToast({ message: 'Course created', type: 'success' });
        }
    }

    async function handleToggleEnglish(course: Course, e: React.MouseEvent) {
        e.stopPropagation();
        const newRequiresEnglish = !course.requires_english;
        // Optimistic update
        setCourses(prev => prev.map(c => c.id === course.id ? { ...c, requires_english: newRequiresEnglish } : c));
        try {
            const { error } = await supabase
                .from('courses')
                .update({ requires_english: newRequiresEnglish })
                .eq('id', course.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
            setToast({
                message: `${course.name}: ${newRequiresEnglish ? 'High English template enabled' : 'Standard template enabled'}`,
                type: 'success'
            });
        } catch {
            // Rollback on error
            setCourses(prev => prev.map(c => c.id === course.id ? { ...c, requires_english: !newRequiresEnglish } : c));
            setToast({ message: 'Failed to update course template', type: 'error' });
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
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
            setToast({ message: 'Course deleted', type: 'success' });
        }
        setDeleteTarget(null);
    }

    const filtered = useMemo(() => {
        return courses.filter(c =>
            c.name.toLowerCase().includes(debouncedSearch.toLowerCase())
        );
    }, [courses, debouncedSearch]);

    const openCreate = () => { setEditingCourse(null); setModalOpen(true); };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <Toolbar>
                <div className="hidden md:flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-completed/15 text-status-completed shrink-0">
                        <BookOpen size={16} />
                    </span>
                    <span className="text-sm font-semibold text-primary">Course catalog</span>
                    <Badge tone="completed" shape="pill" className="tabular-nums">{courses.length} courses</Badge>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                    <SearchInput
                        wrapperClassName="flex-1 sm:w-72"
                        placeholder="Search courses..."
                        value={search}
                        onChange={setSearch}
                        aria-label="Search courses"
                    />
                    <Button variant="primary" size="lg" onClick={openCreate}>
                        <Plus size={16} /> <span className="hidden sm:inline">Add Course</span>
                    </Button>
                </div>
            </Toolbar>

            {/* Course Cards */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5 animate-pulse space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-muted/15" />
                                <div className="space-y-2">
                                    <div className="h-3.5 w-32 rounded-sm bg-muted/15" />
                                    <div className="h-3 w-20 rounded-sm bg-muted/10" />
                                </div>
                            </div>
                            <div className="h-2 rounded-full bg-muted/10" />
                            <div className="flex gap-3">
                                <div className="h-3 w-16 rounded-sm bg-muted/10" />
                                <div className="h-3 w-16 rounded-sm bg-muted/10" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={<BookOpen size={24} />}
                    title="No courses found"
                    description={search.trim() ? `Nothing matches "${search.trim()}"` : 'Create your first course to get started'}
                    action={search.trim()
                        ? <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>
                        : <Button variant="primary" onClick={openCreate}><Plus size={16} /> Add Course</Button>}
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map(course => {
                        const counts = enrollmentCounts[course.id];
                        const gradient = getAvatarGradient(course.id);
                        const openBoard = () => navigate('/enrollments', { state: { courseId: course.id } });
                        return (
                            <div
                                key={course.id}
                                role="link"
                                tabIndex={0}
                                aria-label={`Open ${course.name} on the enrollment board`}
                                onClick={openBoard}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && e.target === e.currentTarget) openBoard();
                                }}
                                className="focus-visible:ring-2 focus-visible:ring-brand-500 outline-hidden bg-surface rounded-2xl shadow-card border border-border-subtle hover:shadow-card-hover hover:border-border-strong transition-all duration-200 group cursor-pointer flex flex-col"
                            >
                                <div className="course-card-body p-5 flex-1 flex flex-col gap-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`course-card-icon w-10 h-10 bg-linear-to-br ${gradient} rounded-xl flex items-center justify-center text-white font-semibold text-xs shrink-0`}>
                                                {course.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-[15px] font-semibold text-primary truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{course.name}</h3>
                                                <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                                                    <Users size={12} />
                                                    <span className="font-semibold text-primary tabular-nums">{counts?.total || 0}</span> students enrolled
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                            <IconButton size="sm" tone="brand" label="Edit Course" onClick={() => { setEditingCourse(course); setModalOpen(true); }}>
                                                <Edit2 size={14} />
                                            </IconButton>
                                            <IconButton size="sm" tone="danger" label="Delete Course" onClick={() => setDeleteTarget(course)}>
                                                <Trash2 size={14} />
                                            </IconButton>
                                        </div>
                                    </div>

                                    <StatusBar counts={counts} />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-border-subtle">
                                    <button
                                        type="button"
                                        onClick={(e) => handleToggleEnglish(course, e)}
                                        title={course.requires_english ? "Requires Good English (Click to switch to Standard)" : "Standard Course (Click to switch to High English)"}
                                        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors active:scale-95 ${
                                            course.requires_english
                                                ? 'bg-info/10 border-info/30 text-status-invited hover:bg-info/15'
                                                : 'bg-surface border-border-subtle text-muted hover:text-primary hover:border-border-strong'
                                        }`}
                                    >
                                        {course.requires_english ? <Languages size={13} /> : <Globe size={13} />}
                                        <span>{course.requires_english ? 'High English' : 'Standard'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setEditingCourse(course); setModalOpen(true); }}
                                        title={course.max_capacity ? `Max ${course.max_capacity} confirmed participants per date (click to edit)` : 'No participant limit (click to set one)'}
                                        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold border bg-surface border-border-subtle text-muted hover:text-primary hover:border-border-strong transition-colors active:scale-95"
                                    >
                                        <Users size={12} />
                                        <span>{course.max_capacity ? `Max ${course.max_capacity} / date` : 'No limit'}</span>
                                    </button>
                                    {(() => {
                                        const picked = activeTemplates.filter(t => course.template_ids?.includes(t.id));
                                        return (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setEditingCourse(course); setModalOpen(true); }}
                                                title={picked.length ? `Documents: ${picked.map(t => t.name).join(', ')} (click to edit)` : 'Documents use all active templates (click to pick)'}
                                                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold border bg-surface border-border-subtle text-muted hover:text-primary hover:border-border-strong transition-colors active:scale-95"
                                            >
                                                <FileText size={12} />
                                                <span>{picked.length ? `${picked.length} template${picked.length !== 1 ? 's' : ''}` : 'All templates'}</span>
                                            </button>
                                        );
                                    })()}
                                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                        Open board <ArrowRight size={13} />
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {modalOpen && (
                <CourseModal
                    open={true}
                    course={editingCourse}
                    templates={activeTemplates}
                    onSave={handleSave}
                    onClose={() => setModalOpen(false)}
                />
            )}
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

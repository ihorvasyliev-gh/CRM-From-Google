import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Info } from 'lucide-react';
import Modal, { FormError } from '../ui/Modal';
import { Button } from '../ui/Button';
import { calloutCls, fieldCls, labelCls } from '../ui/styles';
import { supabase } from '../../lib/supabase';
import { fetchCourses } from '../../lib/queries';
import { cleanVariant, fullName, type Student } from '../../lib/types';
import { refreshCachedEnrollments, removeCachedEnrollments } from '../../lib/enrollmentCache';
import { notify } from '../../lib/toast';
import { errorMessage } from '../../lib/errors';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

interface Props {
    open: boolean;
    students: Student[];
    enrollmentsOf: (studentId: string) => EnrollmentRow[] | undefined;
    onClose: () => void;
    /** After the enrollments were added (the selection can then be cleared) */
    onDone: () => void;
}

/** A student already on the course this way is skipped (the database would skip them too) */
const isActive = (e: EnrollmentRow) => e.status !== 'withdrawn' && e.status !== 'rejected';

/**
 * Puts the selected students on one course's waiting list (Requested) in one go. Students already
 * on that course are named and left out. The toast offers Undo, which removes what was added.
 */
export default function BulkEnrollModal({ open, students, enrollmentsOf, onClose, onDone }: Props) {
    const queryClient = useQueryClient();
    const { data: courses = [], isLoading: coursesLoading } = useQuery({ queryKey: ['courses'], queryFn: fetchCourses, enabled: open });
    const [courseId, setCourseId] = useState('');
    const [language, setLanguage] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const course = courses.find(c => c.id === courseId);

    const { toAdd, alreadyOn } = useMemo(() => {
        if (!courseId) return { toAdd: students, alreadyOn: [] as Student[] };
        const already = students.filter(s => (enrollmentsOf(s.id) ?? []).some(e => e.course_id === courseId && isActive(e)));
        const skip = new Set(already.map(s => s.id));
        return { toAdd: students.filter(s => !skip.has(s.id)), alreadyOn: already };
    }, [students, courseId, enrollmentsOf]);

    // Languages people already chose for this course
    const languages = useMemo(() => {
        const cached = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']) ?? [];
        const seen = new Map<string, string>();
        for (const e of cached) {
            if (e.course_id !== courseId) continue;
            const v = cleanVariant(course?.name ?? '', e.course_variant);
            if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
        }
        return [...seen.values()].sort((a, b) => a.localeCompare(b));
    }, [queryClient, courseId, course?.name]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (saving) return;
        if (!course) {
            setError('Choose a course first');
            document.getElementById('bulk-enroll-course')?.focus();
            return;
        }
        if (toAdd.length === 0) {
            setError('Everyone selected is already on this course');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const variant = cleanVariant(course.name, language);
            const rows = toAdd.map(s => ({ student_id: s.id, course_id: course.id, status: 'requested', course_variant: variant }));
            const { data, error: dbError } = await supabase.from('enrollments').insert(rows).select('id');
            if (dbError) throw dbError;
            const ids = (data ?? []).map(r => r.id as string);
            void refreshCachedEnrollments(queryClient, ids);
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
            const skipped = students.length - ids.length;
            notify({
                type: 'success',
                message: `Added ${ids.length} student${ids.length === 1 ? '' : 's'} to ${course.name}${skipped > 0 ? ` (${skipped} already on it)` : ''}`,
                duration: 8000,
                action: ids.length ? {
                    label: 'Undo',
                    onClick: async () => {
                        const { error: undoError } = await supabase.from('enrollments').delete().in('id', ids);
                        if (undoError) {
                            notify({ type: 'error', message: 'Could not undo: remove them on the Enrollment Board' });
                            return;
                        }
                        const removed = new Set(ids);
                        removeCachedEnrollments(queryClient, en => removed.has(en.id));
                        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
                        queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
                        notify({ type: 'info', message: `Removed them from ${course.name} again` });
                    },
                } : undefined,
            });
            onDone();
            onClose();
        } catch (err) {
            setError(errorMessage(err, 'Could not add them. Check your connection and try again.'));
        } finally {
            setSaving(false);
        }
    }

    const names = (list: Student[]) => {
        const shown = list.slice(0, 4).map(s => fullName(s)).join(', ');
        return list.length > 4 ? `${shown} and ${list.length - 4} more` : shown;
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            dismissible={!saving}
            title="Enroll on a course"
            subtitle={`${students.length} student${students.length === 1 ? '' : 's'} selected`}
            icon={GraduationCap}
            labelId="bulk-enroll-title"
            size="md"
            zIndex="z-60"
            sheetOnMobile
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="primary" type="submit" form="bulk-enroll-form" loading={saving} disabled={!!courseId && toAdd.length === 0}>
                        {courseId ? `Enroll ${toAdd.length}` : 'Enroll'}
                    </Button>
                </>
            }
        >
            <form id="bulk-enroll-form" onSubmit={handleSubmit} className="space-y-4">
                {error && <FormError>{error}</FormError>}
                <div>
                    <label htmlFor="bulk-enroll-course" className={labelCls}>Course</label>
                    <select
                        id="bulk-enroll-course"
                        className={fieldCls}
                        value={courseId}
                        onChange={e => { setCourseId(e.target.value); setLanguage(''); setError(''); }}
                        disabled={coursesLoading}
                    >
                        <option value="">{coursesLoading ? 'Loading courses…' : 'Choose a course'}</option>
                        {courses.filter(c => !c.archived_at).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="bulk-enroll-language" className={labelCls}>
                        Language <span className="font-normal">(optional, English if left empty)</span>
                    </label>
                    <input
                        id="bulk-enroll-language"
                        className={fieldCls}
                        list="bulk-enroll-languages"
                        value={language}
                        onChange={e => setLanguage(e.target.value)}
                        placeholder="e.g. English, Ukrainian"
                    />
                    <datalist id="bulk-enroll-languages">
                        {languages.map(l => <option key={l} value={l} />)}
                    </datalist>
                </div>
                <div className={`${calloutCls.info} text-xs px-3.5 py-2.5 flex gap-2.5`}>
                    <Info size={15} className="shrink-0 mt-px text-status-invited" />
                    <p>They join the course's waiting list as <strong>Requested</strong>. Invite them from the Enrollment Board when a date is set.</p>
                </div>
                {alreadyOn.length > 0 && (
                    <p className={`${calloutCls.warning} text-xs px-3.5 py-2.5`}>
                        <strong>{alreadyOn.length} already on this course</strong> and will be skipped: {names(alreadyOn)}.
                    </p>
                )}
            </form>
        </Modal>
    );
}

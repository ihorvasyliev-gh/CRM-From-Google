import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileArchive, Loader2, Search, Square, UserRound, Users, Wand2 } from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Tabs';
import { fieldCls, labelCls } from '../ui/styles';
import CoursePicker from '../DocumentGenerator/CoursePicker';
import { supabase } from '../../lib/supabase';
import { fetchCourses } from '../../lib/queries';
import { fetchAllEnrollments } from '../../hooks/useEnrollments';
import { buildStudentSearchFilters } from '../../lib/searchUtils';
import { formatDateLong } from '../../lib/dateUtils';
import { courseDateOf, groupSessions, sortBySurname, type EnrollmentWithRelations } from '../../lib/documentUtils';
import { recordFor } from '../../lib/pdfToDocx/crm';
import { fullName, type Student } from '../../lib/types';
import type { CrmRecord } from '../../lib/pdfToDocx/fields';

type BatchStatus = 'confirmed' | 'completed';

export interface CrmPerson {
    name: string;
    record: CrmRecord;
}

interface WordCrmPanelProps {
    /** How many fields take CRM data (nothing to fill when 0) */
    crmFields: number;
    onFill: (person: CrmPerson) => void;
    onBatch: (people: CrmPerson[], label: string) => void;
    /** A ZIP being made: files done / total */
    batchProgress: { done: number; total: number } | null;
    onCancelBatch: () => void;
}

async function searchStudents(search: string): Promise<Student[]> {
    let q = supabase.from('students').select('id, first_name, last_name, email, phone, address, eircode, dob, created_at').limit(12);
    buildStudentSearchFilters(search).forEach(filter => {
        q = q.or(filter);
    });
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Student[];
}

/** Fill the form from the CRM: one student, or everyone on a course date (a ZIP of Word files) */
export default function WordCrmPanel({ crmFields, onFill, onBatch, batchProgress, onCancelBatch }: WordCrmPanelProps) {
    const [mode, setMode] = useState<'one' | 'course'>('one');

    // ── One student ──
    const [typed, setTyped] = useState('');
    const [search, setSearch] = useState('');
    const [student, setStudent] = useState<Student | null>(null);
    const [enrollmentId, setEnrollmentId] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setSearch(typed.trim()), 250);
        return () => clearTimeout(t);
    }, [typed]);
    const studentsQuery = useQuery({
        queryKey: ['word_form_students', search],
        queryFn: () => searchStudents(search),
        enabled: mode === 'one' && search.length >= 2,
        staleTime: 30_000,
    });
    const enrollmentsQuery = useQuery({ queryKey: ['enrollments'], queryFn: fetchAllEnrollments });
    const enrollments = enrollmentsQuery.data as EnrollmentWithRelations[] | undefined;
    const theirCourses = useMemo(
        () =>
            (enrollments ?? [])
                .filter(e => student && e.student_id === student.id && e.courses)
                .sort((a, b) => (courseDateOf(b) ?? '').localeCompare(courseDateOf(a) ?? '')),
        [enrollments, student],
    );
    const pickStudent = (s: Student) => {
        setStudent(s);
        setTyped('');
        setSearch('');
        setEnrollmentId('');
    };
    const chosenEnrollment = theirCourses.find(e => e.id === enrollmentId) ?? theirCourses[0] ?? null;

    // ── Everyone on a course date ──
    const [status, setStatus] = useState<BatchStatus>('confirmed');
    const [courseId, setCourseId] = useState('');
    const [sessionKey, setSessionKey] = useState('');
    const coursesQuery = useQuery({ queryKey: ['doc_courses'], queryFn: fetchCourses, enabled: mode === 'course' });
    const withStatus = useMemo(() => (enrollments ?? []).filter(e => e.status === status && e.students), [enrollments, status]);
    const counts = useMemo(() => {
        const map = new Map<string, number>();
        for (const e of withStatus) map.set(e.course_id, (map.get(e.course_id) ?? 0) + 1);
        return map;
    }, [withStatus]);
    const courses = useMemo(() => (coursesQuery.data ?? []).filter(c => counts.has(c.id)), [coursesQuery.data, counts]);
    const sessions = useMemo(() => groupSessions(withStatus.filter(e => e.course_id === courseId)), [withStatus, courseId]);
    const session = sessions.find(s => s.key === sessionKey) ?? sessions[0];
    const people = useMemo(() => sortBySurname(session?.enrollments ?? []), [session]);

    const makeZip = () => {
        const course = courses.find(c => c.id === courseId);
        const list = people
            .filter(e => e.students)
            .map(e => ({ name: fullName(e.students), record: recordFor(e.students!, e) }));
        const when = session?.date ? formatDateLong(session.date) : 'no date';
        onBatch(list, `${course?.name ?? 'Course'} (${when})`);
    };

    return (
        <Card title="Fill in from the CRM" icon={Wand2} subtitle={crmFields ? `${crmFields} fields on this form take CRM data` : 'No field on this form asks for CRM data'}>
            <Segmented
                ariaLabel="Fill in for"
                value={mode}
                onChange={setMode}
                className="mb-3"
                options={[
                    { value: 'one', label: 'One student', icon: <UserRound size={12} /> },
                    { value: 'course', label: 'Whole course', icon: <Users size={12} /> },
                ]}
            />

            {mode === 'one' ? (
                <div className="space-y-3">
                    <div>
                        <label className={labelCls} htmlFor="word-student-search">Student</label>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                            <input
                                id="word-student-search"
                                className={`${fieldCls} pl-8`}
                                placeholder="Name, email, phone or Eircode"
                                value={typed}
                                onChange={e => setTyped(e.target.value)}
                                autoComplete="off"
                            />
                        </div>
                        {search.length >= 2 && (
                            <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border-subtle divide-y divide-border-subtle" aria-label="Matching students">
                                {studentsQuery.isLoading && <li className="px-3 py-2 text-xs text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Searching…</li>}
                                {studentsQuery.error && <li className="px-3 py-2 text-xs text-danger">Could not search the students</li>}
                                {studentsQuery.data?.length === 0 && <li className="px-3 py-2 text-xs text-muted">No student matches “{search}”</li>}
                                {studentsQuery.data?.map(s => (
                                    <li key={s.id}>
                                        <button type="button" onClick={() => pickStudent(s)} className="w-full text-left px-3 py-2 hover:bg-brand-500/5">
                                            <span className="block text-sm font-semibold text-primary">{fullName(s) || '(no name)'}</span>
                                            <span className="block text-[11px] text-muted truncate">{[s.email, s.phone, s.eircode].filter(Boolean).join(' · ')}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {student && (
                        <div className="rounded-xl border border-brand-500/25 bg-brand-500/5 p-3 space-y-2.5">
                            <div>
                                <p className="text-sm font-semibold text-primary">{fullName(student)}</p>
                                <p className="text-[11px] text-muted truncate">{[student.email, student.phone].filter(Boolean).join(' · ')}</p>
                            </div>
                            {theirCourses.length > 0 && (
                                <div>
                                    <label className={labelCls} htmlFor="word-student-course">Course (for course name and date)</label>
                                    <select id="word-student-course" className={fieldCls} value={chosenEnrollment?.id ?? ''} onChange={e => setEnrollmentId(e.target.value)}>
                                        {theirCourses.map(e => (
                                            <option key={e.id} value={e.id}>
                                                {e.courses?.name}
                                                {courseDateOf(e) ? ` · ${formatDateLong(courseDateOf(e))}` : ''} · {e.status}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <Button variant="primary" className="w-full" disabled={!crmFields} onClick={() => onFill({ name: fullName(student), record: recordFor(student, chosenEnrollment) })}>
                                <Wand2 size={15} /> Fill in for {student.first_name || 'this student'}
                            </Button>
                        </div>
                    )}
                    <p className="text-[11px] text-muted">Only the fields linked to the CRM change; everything else you typed stays.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <Segmented
                        ariaLabel="Who"
                        size="sm"
                        value={status}
                        onChange={v => {
                            setStatus(v);
                            setCourseId('');
                            setSessionKey('');
                        }}
                        options={[
                            { value: 'confirmed', label: 'Confirmed' },
                            { value: 'completed', label: 'Completed' },
                        ]}
                    />
                    <div>
                        <span className={labelCls}>Course</span>
                        {coursesQuery.isLoading || enrollmentsQuery.isLoading ? (
                            <p className="text-xs text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading courses…</p>
                        ) : (
                            <CoursePicker
                                courses={courses}
                                counts={counts}
                                countLabel={status}
                                value={courseId}
                                onChange={id => {
                                    setCourseId(id);
                                    setSessionKey('');
                                }}
                            />
                        )}
                    </div>
                    {courseId && sessions.length > 1 && (
                        <div>
                            <label className={labelCls} htmlFor="word-course-date">Course date</label>
                            <select id="word-course-date" className={fieldCls} value={session?.key ?? ''} onChange={e => setSessionKey(e.target.value)}>
                                {sessions.map(s => (
                                    <option key={s.key} value={s.key}>
                                        {s.date ? formatDateLong(s.date) : 'No date'} · {s.enrollments.length} {s.enrollments.length === 1 ? 'person' : 'people'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {batchProgress ? (
                        <div className="space-y-2">
                            <div className="h-2 rounded-full bg-surface-elevated overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={batchProgress.total} aria-valuenow={batchProgress.done}>
                                <div className="h-full bg-brand-500 transition-all" style={{ width: `${(batchProgress.done / Math.max(1, batchProgress.total)) * 100}%` }} />
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted">
                                <span>{batchProgress.done} of {batchProgress.total} Word files</span>
                                <Button size="sm" variant="ghost" onClick={onCancelBatch}><Square size={12} /> Stop</Button>
                            </div>
                        </div>
                    ) : (
                        <Button variant="primary" className="w-full" disabled={!courseId || people.length === 0} onClick={makeZip}>
                            <FileArchive size={15} /> {people.length ? `Make ${people.length} Word ${people.length === 1 ? 'file' : 'files'} (ZIP)` : 'Choose a course'}
                        </Button>
                    )}
                    <p className="text-[11px] text-muted">Each person’s form takes their CRM data; everything else is what you filled in on the page.</p>
                </div>
            )}
        </Card>
    );
}

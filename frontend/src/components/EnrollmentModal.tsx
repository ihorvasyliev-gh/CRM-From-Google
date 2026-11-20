import { useState, useEffect, FormEvent, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Search, UserPlus, AlertTriangle, Info, Calendar, Star, Plus, Phone } from 'lucide-react';
import { getAvatarGradient, cleanVariant, type Student as FullStudent, type StudentFormData, type StudentPayload } from '../lib/types';
import { buildStudentSearchFilters } from '../lib/searchUtils';
import { formatPhoneDisplay } from '../lib/contactUtils';
import { formatDayDateShort, todayISO } from '../lib/dateUtils';
import { createStudent } from '../lib/students';
import { useDebounce } from '../hooks/useDebounce';
import DialogLayer from './ui/DialogLayer';
import FieldError from './ui/FieldError';
import ConfirmDialog from './ConfirmDialog';
import StudentModal from './StudentModal';
import { DateInput } from './ui/DatePicker';
import type { EnrollmentRow } from '../hooks/useEnrollments';
import { refreshCachedEnrollments } from '../lib/enrollmentCache';
import { toast } from '../lib/toast';

interface StudentOption {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone?: string | null;
}

interface Course {
    id: string;
    name: string;
}

interface EnrollmentModalProps {
    open: boolean;
    preselectedStudentId?: string;
    preselectedCourseId?: string;
    /** The language the form starts with (the board's language filter) */
    preselectedVariant?: string;
    onSave: () => void;
    onClose: () => void;
}

const FIELD_CLASS = 'w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm text-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated transition-all placeholder:text-muted';
const LABEL_CLASS = 'text-xs font-semibold text-muted mb-1.5 block';

const NO_STUDENTS: StudentOption[] = [];
const NO_DATES: string[] = [];

function initials(s: StudentOption) {
    return `${s.first_name?.[0] || ''}${s.last_name?.[0] || ''}`.toUpperCase();
}

/** Pre-fills StudentModal from whatever the admin already typed into the student search box. */
function prefillStudentFromQuery(query: string): StudentFormData {
    const q = query.trim();
    const empty: StudentFormData = { first_name: '', last_name: '', email: '', phone: '', address: '', eircode: '', dob: '' };
    if (!q) return empty;
    if (q.includes('@')) return { ...empty, email: q };
    if (/^[\d\s+\-().]{4,}$/.test(q)) return { ...empty, phone: q };
    const parts = q.split(/\s+/);
    return { ...empty, first_name: parts[0] || '', last_name: parts.slice(1).join(' ') };
}

export default function EnrollmentModal({ open, preselectedStudentId, preselectedCourseId, preselectedVariant, onSave, onClose }: EnrollmentModalProps) {
    const queryClient = useQueryClient();
    const [studentSearch, setStudentSearch] = useState('');
    const debouncedSearch = useDebounce(studentSearch.trim(), 250);
    const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [variant, setVariant] = useState('');
    const [status, setStatus] = useState('requested');
    const [courseDate, setCourseDate] = useState(todayISO());
    const [dateTouched, setDateTouched] = useState(false);
    const [isPriority, setIsPriority] = useState(false);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    // A required field left empty: its message shows under it
    const [missing, setMissing] = useState<'student' | 'course' | null>(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [showStudentDropdown, setShowStudentDropdown] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [createStudentOpen, setCreateStudentOpen] = useState(false);
    const addAnotherRef = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);

    // Courses share the app-wide cache with the Courses page
    const { data: courses = [] } = useQuery<Course[]>({
        queryKey: ['courses'],
        queryFn: async () => {
            const { data, error } = await supabase.from('courses').select('*').order('name');
            if (error) throw error;
            return (data || []) as Course[];
        },
        enabled: open,
    });

    // Saved upcoming course dates for quick picking when enrolling directly as Invited or Confirmed
    const needsCourseDate = status === 'invited' || status === 'confirmed';
    const { data: savedCourseDates = NO_DATES } = useQuery<string[]>({
        queryKey: ['enrollment_modal_dates', selectedCourseId],
        queryFn: async () => {
            if (!selectedCourseId) return [];
            try {
                const { data, error } = await supabase
                    .from('invite_dates')
                    .select('invite_date')
                    .eq('course_id', selectedCourseId)
                    .gte('invite_date', todayISO())
                    .order('invite_date', { ascending: true });
                if (error) return [];
                return (data || []).map((d: { invite_date: string }) => d.invite_date);
            } catch {
                return [];
            }
        },
        enabled: open && needsCourseDate && !!selectedCourseId,
        staleTime: 30_000,
    });

    // Auto-select the next upcoming saved date unless the user already picked a date manually
    useEffect(() => {
        if (!needsCourseDate || dateTouched) return;
        if (savedCourseDates.length > 0) {
            setCourseDate(savedCourseDates[0]);
        } else {
            setCourseDate(todayISO());
        }
    }, [needsCourseDate, savedCourseDates, dateTouched]);

    // Server-side student search (includes phone so searching by phone confirms the right person)
    const { data: studentResults = NO_STUDENTS, isFetching: searchingStudents } = useQuery<StudentOption[]>({
        queryKey: ['enrollment_modal_students', debouncedSearch],
        queryFn: async () => {
            let query = supabase.from('students').select('id, first_name, last_name, email, phone').limit(20);
            if (debouncedSearch) {
                buildStudentSearchFilters(debouncedSearch).forEach(f => { query = query.or(f); });
                query = query.order('first_name');
            } else {
                query = query.order('created_at', { ascending: false });
            }
            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as StudentOption[];
        },
        enabled: open && !preselectedStudentId,
        staleTime: 30_000,
    });

    useEffect(() => {
        if (!open) return;
        setSelectedStudent(null);
        setSelectedCourseId(preselectedCourseId || '');
        setVariant(preselectedVariant || '');
        setStatus('requested');
        setCourseDate(todayISO());
        setDateTouched(false);
        setIsPriority(false);
        setNotes('');
        setError('');
        setMissing(null);
        setStudentSearch('');
        setShowStudentDropdown(false);
        setCreateStudentOpen(false);

        if (preselectedStudentId) {
            // Usually already loaded with the enrollments: shown at once, without a request
            const known = queryClient.getQueryData<EnrollmentRow[]>(['enrollments'])
                ?.find(e => e.student_id === preselectedStudentId && e.students)?.students;
            if (known) {
                setSelectedStudent({ id: known.id, first_name: known.first_name, last_name: known.last_name, email: known.email, phone: known.phone });
                return;
            }
            let active = true;
            (async () => {
                try {
                    const { data } = await supabase
                        .from('students')
                        .select('id, first_name, last_name, email, phone')
                        .eq('id', preselectedStudentId);
                    const found = Array.isArray(data) ? data[0] : null;
                    if (active && found) setSelectedStudent(found as StudentOption);
                } catch (err) {
                    console.error('Failed to load preselected student:', err);
                }
            })();
            return () => { active = false; };
        }
    }, [open, preselectedStudentId, preselectedCourseId, preselectedVariant, queryClient]);

    useEffect(() => {
        setHighlightIndex(0);
    }, [studentResults]);

    // Existing enrollments (from the shared cache) power variant suggestions and a duplicate warning
    const cachedEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
    const selectedCourseName = courses.find(c => c.id === selectedCourseId)?.name || '';

    const variantSuggestions = useMemo(() => {
        if (!selectedCourseId || !cachedEnrollments) return [];
        const seen = new Map<string, string>();
        for (const e of cachedEnrollments) {
            if (e.course_id !== selectedCourseId) continue;
            const v = cleanVariant(selectedCourseName, e.course_variant);
            if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
        }
        return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
    }, [cachedEnrollments, selectedCourseId, selectedCourseName]);

    // A student can queue in several languages of a course, one "requested" enrollment each with its
    // own registration date, until one of them moves on (the database trigger of migration 81 agrees)
    const activeInCourse = useMemo(() => {
        if (!selectedStudent || !selectedCourseId || !cachedEnrollments) return [];
        return cachedEnrollments.filter(e =>
            e.student_id === selectedStudent.id &&
            e.course_id === selectedCourseId &&
            e.status !== 'withdrawn' &&
            e.status !== 'rejected'
        );
    }, [cachedEnrollments, selectedStudent, selectedCourseId]);
    const chosenLanguage = cleanVariant(selectedCourseName, variant);
    const sameLanguage = (e: EnrollmentRow) =>
        cleanVariant(selectedCourseName, e.course_variant).toLowerCase() === chosenLanguage.toLowerCase();
    const existingEnrollment = activeInCourse.find(e => e.status !== 'requested' || status !== 'requested' || sameLanguage(e)) || null;
    const queuedLanguages = activeInCourse.map(e => cleanVariant(selectedCourseName, e.course_variant));

    const isDirty = !!(
        (!preselectedStudentId && selectedStudent) ||
        (selectedCourseId && selectedCourseId !== (preselectedCourseId || '')) ||
        variant.trim() !== (preselectedVariant || '') || notes.trim() || status !== 'requested' || isPriority
    );

    const requestClose = useCallback(() => {
        if (saving || createStudentOpen) return;
        if (isDirty) {
            setConfirmDiscard(true);
            return;
        }
        onClose();
    }, [saving, createStudentOpen, isDirty, onClose]);

    const selectStudent = (s: StudentOption) => {
        setSelectedStudent(s);
        setShowStudentDropdown(false);
        setStudentSearch('');
        setError('');
        setMissing(null);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showStudentDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setShowStudentDropdown(true);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i => Math.min(i + 1, Math.max(studentResults.length - 1, 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            // Don't submit the whole form while picking a student
            e.preventDefault();
            const s = studentResults[highlightIndex];
            if (s) selectStudent(s);
        } else if (e.key === 'Escape' && showStudentDropdown) {
            e.preventDefault();
            setShowStudentDropdown(false);
        }
    };

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${highlightIndex}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }, [highlightIndex]);

    const handleCreateStudent = async (formData: StudentPayload): Promise<FullStudent | null> => {
        const created = await createStudent(formData);
        queryClient.invalidateQueries({ queryKey: ['students'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
        queryClient.invalidateQueries({ queryKey: ['enrollment_modal_students'] });
        toast.success(`${formData.first_name} ${formData.last_name} added`);
        setCreateStudentOpen(false);
        if (created) {
            selectStudent({
                id: created.id,
                first_name: created.first_name,
                last_name: created.last_name,
                email: created.email,
                phone: created.phone,
            });
        }
        return created;
    };

    const createStudentInitial = useMemo(
        () => prefillStudentFromQuery(studentSearch),
        [studentSearch],
    );

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (saving) return;
        const keepOpenForNext = addAnotherRef.current;
        addAnotherRef.current = false;
        setError('');

        // Said under the field that is missing, which gets focus
        if (!selectedStudent || !selectedCourseId) {
            const field = !selectedStudent ? 'student' : 'course';
            setMissing(field);
            document.getElementById(field === 'student' ? 'enroll-student-search' : 'enroll-course')?.focus();
            return;
        }

        setSaving(true);
        try {
            const cleanedVariant = cleanVariant(selectedCourseName, variant);

            const nowIso = new Date().toISOString();
            const effectiveDate = courseDate || todayISO();
            const payload: {
                student_id: string;
                course_id: string;
                status: string;
                course_variant: string | null;
                is_priority?: boolean;
                notes?: string;
                invited_date?: string;
                invited_at?: string;
                response_days?: number;
                confirmed_date?: string;
                confirmed_at?: string;
                completed_date?: string;
                completed_at?: string;
            } = {
                student_id: selectedStudent.id,
                course_id: selectedCourseId,
                status,
                course_variant: cleanedVariant,
            };
            if (isPriority) payload.is_priority = true;
            if (status === 'invited') {
                payload.invited_date = effectiveDate;
                payload.invited_at = nowIso;
                payload.response_days = 7;
            } else if (status === 'confirmed') {
                payload.confirmed_date = effectiveDate;
                payload.confirmed_at = nowIso;
            } else if (status === 'completed') {
                payload.completed_date = effectiveDate;
                payload.completed_at = nowIso;
            }
            if (notes.trim()) payload.notes = notes.trim();

            const { data: inserted, error: dbError } = await supabase.from('enrollments').insert(payload).select('id');
            if (dbError) {
                if (dbError.message.includes('duplicate') || dbError.message.includes('unique')) {
                    throw new Error('This student is already enrolled in this course with this variant');
                }
                throw new Error(dbError.message);
            }
            // The duplicate-enrollment trigger skips the row instead of failing
            if (!inserted?.length) throw new Error('Not added: this student is already enrolled in this course');

            // Remember the picked course date non-critically so it appears in saved dates next time
            if ((status === 'invited' || status === 'confirmed') && effectiveDate) {
                try {
                    await supabase.from('invite_dates').upsert(
                        { course_id: selectedCourseId, invite_date: effectiveDate },
                        { onConflict: 'course_id,invite_date' },
                    );
                } catch { /* non-critical */ }
            }

            onSave();
            // Every page shows the new enrollment straight away: it is read into the cached list
            // (reloading the list downloaded every enrollment again)
            void refreshCachedEnrollments(queryClient, inserted.map(row => row.id));
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });

            if (keepOpenForNext && !preselectedStudentId) {
                setSelectedStudent(null);
                setStudentSearch('');
                setNotes('');
                setError('');
                setMissing(null);
                setShowStudentDropdown(false);
                setTimeout(() => document.getElementById('enroll-student-search')?.focus(), 0);
            } else {
                onClose();
            }
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Failed to create enrollment');
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <DialogLayer
                open={open}
                onClose={requestClose}
                labelledBy="enrollment-modal-title"
                className="z-60 flex items-end sm:items-center justify-center p-0 sm:p-4"
                panelClassName="bg-surface border border-border-subtle rounded-t-2xl sm:rounded-2xl shadow-float w-full max-w-lg max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden pb-[max(env(safe-area-inset-bottom),0.5rem)]"
                enter="animate-slideUp sm:animate-scaleIn"
                exit="animate-sheetSlideDown sm:animate-scaleOut"
            >
                {/* Mobile pull handle */}
                <div className="w-10 h-1 bg-border-strong rounded-full mx-auto my-2.5 sm:hidden" />

                {/* Header */}
                <div className="sticky top-0 bg-surface border-b border-border-subtle px-6 py-3.5 sm:py-4 z-10 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/10 rounded-xl text-status-confirmed">
                                <UserPlus size={18} />
                            </div>
                            <h2 id="enrollment-modal-title" className="text-lg font-bold text-primary">Add Enrollment</h2>
                        </div>
                        <button type="button" onClick={requestClose} aria-label="Close" className="p-2 text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
                    {error && (
                        <div role="alert" className="text-sm text-status-rejected bg-red-500/10 border border-red-500/30 px-4 py-2.5 rounded-xl animate-slideDown">
                            {error}
                        </div>
                    )}

                    {/* Student Selector */}
                    <div>
                        <label htmlFor="enroll-student-search" className={LABEL_CLASS}>Student *</label>
                        {selectedStudent ? (
                            <div className="flex items-center gap-3 px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm text-primary">
                                <div className={`w-7 h-7 bg-linear-to-br ${getAvatarGradient(selectedStudent.id)} rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                                    {initials(selectedStudent)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold truncate">{selectedStudent.first_name} {selectedStudent.last_name}</div>
                                    {(selectedStudent.email || selectedStudent.phone) && (
                                        <div className="text-muted text-xs truncate flex flex-wrap items-center gap-x-2">
                                            {selectedStudent.email && <span>{selectedStudent.email}</span>}
                                            {selectedStudent.phone && (
                                                <span className="inline-flex items-center gap-0.5 tabular-nums">
                                                    <Phone size={10} /> {formatPhoneDisplay(selectedStudent.phone)}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {!preselectedStudentId && (
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedStudent(null); setShowStudentDropdown(true); }}
                                        aria-label="Change student"
                                        className="hit-area p-1 rounded-md text-muted hover:text-primary hover:bg-surface-elevated transition-colors shrink-0"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        ) : preselectedStudentId ? (
                            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm text-muted">
                                <Loader2 size={14} className="animate-spin" /> Loading student…
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={16} />
                                <input
                                    id="enroll-student-search"
                                    type="text"
                                    autoFocus
                                    autoComplete="off"
                                    role="combobox"
                                    aria-expanded={showStudentDropdown}
                                    aria-controls="enroll-student-listbox"
                                    placeholder="Search by name, email or phone..."
                                    className={`${FIELD_CLASS} pl-9 pr-9`}
                                    aria-invalid={missing === 'student' || undefined}
                                    aria-describedby={missing === 'student' ? 'enroll-student-search-error' : undefined}
                                    value={studentSearch}
                                    onChange={e => {
                                        setStudentSearch(e.target.value);
                                        setShowStudentDropdown(true);
                                    }}
                                    onFocus={() => setShowStudentDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowStudentDropdown(false), 150)}
                                    onKeyDown={handleSearchKeyDown}
                                />
                                {searchingStudents && (
                                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-brand-500" />
                                )}
                                {showStudentDropdown && (
                                    <div
                                        id="enroll-student-listbox"
                                        role="listbox"
                                        ref={listRef}
                                        className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-border-subtle rounded-xl shadow-float max-h-60 overflow-y-auto z-20 animate-slideDown"
                                    >
                                        {studentResults.length === 0 ? (
                                            <div className="px-4 py-3 text-sm text-muted text-center space-y-2">
                                                <p>{searchingStudents ? 'Searching…' : 'No students found'}</p>
                                                {!searchingStudents && (
                                                    <button
                                                        type="button"
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => {
                                                            setShowStudentDropdown(false);
                                                            setCreateStudentOpen(true);
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-600 dark:text-brand-400 text-xs font-semibold transition-colors cursor-pointer"
                                                    >
                                                        <Plus size={13} />
                                                        Create student{studentSearch.trim() ? ` “${studentSearch.trim()}”` : ''}
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                {!debouncedSearch && (
                                                    <div className="px-3.5 pt-2 pb-1 text-xs font-bold uppercase tracking-wider text-muted">Recently added</div>
                                                )}
                                                {studentResults.map((s, idx) => (
                                                    <button
                                                        type="button"
                                                        role="option"
                                                        aria-selected={idx === highlightIndex}
                                                        data-index={idx}
                                                        key={s.id}
                                                        onMouseDown={e => e.preventDefault()}
                                                        onMouseEnter={() => setHighlightIndex(idx)}
                                                        onClick={() => selectStudent(s)}
                                                        className={`w-full text-left px-3.5 py-2.5 text-sm border-b border-border-subtle last:border-0 transition-all flex items-center gap-3 ${idx === highlightIndex ? 'bg-brand-500/10' : 'hover:bg-brand-500/5'}`}
                                                    >
                                                        <div className={`w-7 h-7 bg-linear-to-br ${getAvatarGradient(s.id)} rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                                                            {initials(s)}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-semibold text-primary truncate">{s.first_name} {s.last_name}</div>
                                                            <div className="text-muted text-xs truncate flex flex-wrap items-center gap-x-2">
                                                                {s.email && <span className="truncate">{s.email}</span>}
                                                                {s.phone && (
                                                                    <span className="inline-flex items-center gap-0.5 tabular-nums shrink-0">
                                                                        <Phone size={10} /> {formatPhoneDisplay(s.phone)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => {
                                                        setShowStudentDropdown(false);
                                                        setCreateStudentOpen(true);
                                                    }}
                                                    className="w-full px-3.5 py-2 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 border-t border-border-subtle flex items-center gap-1.5 transition-colors cursor-pointer"
                                                >
                                                    <Plus size={13} /> Add new student…
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        <FieldError id="enroll-student-search" message={missing === 'student' ? 'Choose a student' : undefined} />
                    </div>

                    {/* Course Selector */}
                    <div>
                        <label htmlFor="enroll-course" className={LABEL_CLASS}>Course *</label>
                        <select
                            id="enroll-course"
                            value={selectedCourseId}
                            onChange={e => {
                                setSelectedCourseId(e.target.value);
                                setDateTouched(false);
                                setMissing(null);
                            }}
                            autoFocus={!!preselectedStudentId}
                            className={FIELD_CLASS}
                            aria-invalid={missing === 'course' || undefined}
                            aria-describedby={missing === 'course' ? 'enroll-course-error' : undefined}
                        >
                            <option value="">Select a course...</option>
                            {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <FieldError id="enroll-course" message={missing === 'course' ? 'Choose a course' : undefined} />
                        {existingEnrollment ? (
                            <p className="mt-1.5 text-xs text-status-requested flex items-center gap-1.5">
                                <AlertTriangle size={12} className="shrink-0" />
                                {existingEnrollment.status !== 'requested'
                                    ? `Already enrolled in this course (${existingEnrollment.status}, ${cleanVariant(selectedCourseName, existingEnrollment.course_variant)})`
                                    : sameLanguage(existingEnrollment)
                                        ? `Already in the ${chosenLanguage} queue for this course`
                                        : `Already in the ${cleanVariant(selectedCourseName, existingEnrollment.course_variant)} queue: another language can only be added as Requested`}
                            </p>
                        ) : queuedLanguages.length > 0 && (
                            <p className="mt-1.5 text-xs text-muted flex items-center gap-1.5">
                                <Info size={12} className="shrink-0" />
                                Also in the {queuedLanguages.join(', ')} queue: this adds a place in the {chosenLanguage} queue
                            </p>
                        )}
                    </div>

                    {/* Variant with clickable language chips */}
                    <div>
                        <label htmlFor="enroll-variant" className={LABEL_CLASS}>
                            Variant <span className="text-muted font-normal normal-case">(optional)</span>
                        </label>
                        {variantSuggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Course languages">
                                {variantSuggestions.map(v => {
                                    const active = variant.trim().toLowerCase() === v.toLowerCase();
                                    return (
                                        <button
                                            key={v}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => setVariant(active ? '' : v)}
                                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                                                active
                                                    ? 'bg-violet-500 text-white border-violet-500 shadow-xs'
                                                    : 'bg-surface-elevated text-muted border-border-strong hover:border-violet-500 hover:text-violet-500'
                                            }`}
                                        >
                                            {v}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <input
                            id="enroll-variant"
                            type="text"
                            list="enroll-variant-suggestions"
                            value={variant}
                            onChange={e => setVariant(e.target.value)}
                            placeholder="e.g. English, Ukrainian"
                            className={FIELD_CLASS}
                        />
                        <datalist id="enroll-variant-suggestions">
                            {variantSuggestions.map(v => <option key={v} value={v} />)}
                        </datalist>
                    </div>

                    {/* Status & Priority row */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                        <div>
                            <label htmlFor="enroll-status" className={LABEL_CLASS}>Initial Status</label>
                            <select
                                id="enroll-status"
                                value={status}
                                onChange={e => setStatus(e.target.value)}
                                className={FIELD_CLASS}
                            >
                                <option value="requested">Requested</option>
                                <option value="invited">Invited</option>
                                <option value="confirmed">Confirmed</option>
                            </select>
                        </div>

                        <button
                            type="button"
                            aria-pressed={isPriority}
                            onClick={() => setIsPriority(prev => !prev)}
                            className={`h-[42px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                isPriority
                                    ? 'bg-warning/15 border-warning/40 text-status-requested'
                                    : 'bg-surface border-border-subtle text-muted hover:text-primary hover:border-border-strong'
                            }`}
                        >
                            <Star size={14} fill={isPriority ? 'currentColor' : 'none'} />
                            Priority
                        </button>
                    </div>

                    {/* Course Date picker when enrolling directly as Invited or Confirmed */}
                    {needsCourseDate && (
                        <div className="p-3.5 rounded-xl bg-surface-elevated/50 border border-border-subtle space-y-2.5">
                            <label htmlFor="enroll-course-date" className="text-xs font-semibold text-primary flex items-center gap-1.5">
                                <Calendar size={13} className="text-brand-500" />
                                {status === 'confirmed' ? 'Confirmed course date' : 'Invited course date'}
                            </label>
                            {savedCourseDates.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {savedCourseDates.map(d => (
                                        <button
                                            key={d}
                                            type="button"
                                            aria-pressed={courseDate === d}
                                            onClick={() => { setCourseDate(d); setDateTouched(true); }}
                                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                                                courseDate === d
                                                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                                                    : 'bg-surface text-muted border-border-strong hover:border-emerald-500 hover:text-primary'
                                            }`}
                                        >
                                            {formatDayDateShort(d)}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <DateInput
                                id="enroll-course-date"
                                value={courseDate}
                                onChange={d => { setCourseDate(d); setDateTouched(true); }}
                                className={FIELD_CLASS}
                            />
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label htmlFor="enroll-notes" className={LABEL_CLASS}>
                            Notes <span className="text-muted font-normal normal-case">(optional)</span>
                        </label>
                        <textarea
                            id="enroll-notes"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Any notes about this enrollment..."
                            rows={2}
                            className={`${FIELD_CLASS} resize-none`}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2.5 pt-2">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="px-4 py-2.5 text-sm font-semibold text-muted bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        {!preselectedStudentId && (
                            <button
                                type="submit"
                                onClick={() => { addAnotherRef.current = true; }}
                                disabled={saving || !!existingEnrollment}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/15 border border-brand-500/25 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                Save &amp; add another
                            </button>
                        )}
                        <button
                            type="submit"
                            onClick={() => { addAnotherRef.current = false; }}
                            disabled={saving || !!existingEnrollment}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {saving && <Loader2 size={16} className="animate-spin" />}
                            Enroll Student
                        </button>
                    </div>
                </form>
                <ConfirmDialog
                    open={confirmDiscard}
                    title="Discard this enrollment?"
                    message="The student, course and notes you chose will be lost."
                    confirmLabel="Discard"
                    variant="warning"
                    onConfirm={() => { setConfirmDiscard(false); onClose(); }}
                    onCancel={() => setConfirmDiscard(false)}
                />
            </DialogLayer>

            {createStudentOpen && (
                <StudentModal
                    open={createStudentOpen}
                    student={createStudentInitial}
                    onSave={handleCreateStudent}
                    onClose={() => setCreateStudentOpen(false)}
                />
            )}
        </>
    );
}

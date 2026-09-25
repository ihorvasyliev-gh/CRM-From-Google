import { useState, useEffect, FormEvent, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Search, UserPlus, AlertTriangle } from 'lucide-react';
import { getAvatarGradient, cleanVariant } from '../lib/types';
import { buildStudentSearchFilters } from '../lib/searchUtils';
import { useDebounce } from '../hooks/useDebounce';
import { useModalBehavior } from '../hooks/useModalBehavior';
import type { EnrollmentRow } from '../hooks/useEnrollments';

interface Student {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
}

interface Course {
    id: string;
    name: string;
}

interface EnrollmentModalProps {
    open: boolean;
    preselectedStudentId?: string;
    preselectedCourseId?: string;
    onSave: () => void;
    onClose: () => void;
}

const FIELD_CLASS = 'w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated transition-all placeholder:text-muted';
const LABEL_CLASS = 'text-xs font-semibold text-muted mb-1.5 block';

const NO_STUDENTS: Student[] = [];

function initials(s: Student) {
    return `${s.first_name?.[0] || ''}${s.last_name?.[0] || ''}`.toUpperCase();
}

export default function EnrollmentModal({ open, preselectedStudentId, preselectedCourseId, onSave, onClose }: EnrollmentModalProps) {
    const queryClient = useQueryClient();
    const [studentSearch, setStudentSearch] = useState('');
    const debouncedSearch = useDebounce(studentSearch.trim(), 250);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [variant, setVariant] = useState('');
    const [status, setStatus] = useState('requested');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showStudentDropdown, setShowStudentDropdown] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
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

    // Server-side student search (the old version downloaded every student and was capped at 1000 rows)
    const { data: studentResults = NO_STUDENTS, isFetching: searchingStudents } = useQuery<Student[]>({
        queryKey: ['enrollment_modal_students', debouncedSearch],
        queryFn: async () => {
            let query = supabase.from('students').select('id, first_name, last_name, email').limit(20);
            if (debouncedSearch) {
                buildStudentSearchFilters(debouncedSearch).forEach(f => { query = query.or(f); });
                query = query.order('first_name');
            } else {
                query = query.order('created_at', { ascending: false });
            }
            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as Student[];
        },
        enabled: open && !preselectedStudentId,
        staleTime: 30_000,
    });

    useEffect(() => {
        if (!open) return;
        setSelectedStudent(null);
        setSelectedCourseId(preselectedCourseId || '');
        setVariant('');
        setStatus('requested');
        setNotes('');
        setError('');
        setStudentSearch('');
        setShowStudentDropdown(false);

        if (preselectedStudentId) {
            let active = true;
            (async () => {
                try {
                    const { data } = await supabase
                        .from('students')
                        .select('id, first_name, last_name, email')
                        .eq('id', preselectedStudentId);
                    const found = Array.isArray(data) ? data[0] : null;
                    if (active && found) setSelectedStudent(found as Student);
                } catch (err) {
                    console.error('Failed to load preselected student:', err);
                }
            })();
            return () => { active = false; };
        }
    }, [open, preselectedStudentId, preselectedCourseId]);

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

    const existingEnrollment = useMemo(() => {
        if (!selectedStudent || !selectedCourseId || !cachedEnrollments) return null;
        return cachedEnrollments.find(e =>
            e.student_id === selectedStudent.id &&
            e.course_id === selectedCourseId &&
            e.status !== 'withdrawn' &&
            e.status !== 'rejected'
        ) || null;
    }, [cachedEnrollments, selectedStudent, selectedCourseId]);

    const isDirty = !!(
        (!preselectedStudentId && selectedStudent) ||
        (selectedCourseId && selectedCourseId !== (preselectedCourseId || '')) ||
        variant.trim() || notes.trim() || status !== 'requested'
    );

    const requestClose = useCallback(() => {
        if (saving) return;
        if (isDirty && !window.confirm('Discard this enrollment?')) return;
        onClose();
    }, [saving, isDirty, onClose]);

    useModalBehavior(open, requestClose);

    const selectStudent = (s: Student) => {
        setSelectedStudent(s);
        setShowStudentDropdown(false);
        setStudentSearch('');
        setError('');
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

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (saving) return;
        setError('');

        if (!selectedStudent) {
            setError('Please select a student');
            return;
        }
        if (!selectedCourseId) {
            setError('Please select a course');
            return;
        }

        setSaving(true);
        try {
            const cleanedVariant = cleanVariant(selectedCourseName, variant);

            const payload: {
                student_id: string;
                course_id: string;
                status: string;
                course_variant: string | null;
                notes?: string;
            } = {
                student_id: selectedStudent.id,
                course_id: selectedCourseId,
                status,
                course_variant: cleanedVariant,
            };
            if (notes.trim()) payload.notes = notes.trim();

            const { error: dbError } = await supabase.from('enrollments').insert(payload);
            if (dbError) {
                if (dbError.message.includes('duplicate') || dbError.message.includes('unique')) {
                    throw new Error('This student is already enrolled in this course with this variant');
                }
                throw new Error(dbError.message);
            }
            onSave();
            // Invalidate caches so all pages reflect the new enrollment immediately
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
            onClose();
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

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={requestClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="enrollment-modal-title"
                className="relative bg-surface border border-border-subtle rounded-t-2xl sm:rounded-2xl shadow-float w-full max-w-lg animate-slideUp sm:animate-scaleIn max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden pb-[max(env(safe-area-inset-bottom),0.5rem)]"
            >
                {/* Mobile pull handle */}
                <div className="w-10 h-1 bg-border-strong rounded-full mx-auto my-2.5 sm:hidden" />

                {/* Header */}
                <div className="sticky top-0 bg-surface border-b border-border-subtle px-6 py-3.5 sm:py-4 z-10 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/10 rounded-xl text-status-confirmed">
                                <UserPlus size={18} />
                            </div>
                            <h2 id="enrollment-modal-title" className="text-lg font-bold text-primary">Add Enrollment</h2>
                        </div>
                        <button type="button" onClick={requestClose} aria-label="Close" className="p-2 text-muted hover:text-primary hover:bg-surface rounded-lg transition-all">
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
                                <div className={`w-7 h-7 bg-gradient-to-br ${getAvatarGradient(selectedStudent.id)} rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                    {initials(selectedStudent)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="font-semibold">{selectedStudent.first_name} {selectedStudent.last_name}</span>
                                    {selectedStudent.email && <span className="text-muted ml-1.5 truncate">({selectedStudent.email})</span>}
                                </div>
                                {!preselectedStudentId && (
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedStudent(null); setShowStudentDropdown(true); }}
                                        aria-label="Change student"
                                        className="p-1 rounded-md text-muted hover:text-primary hover:bg-surface-elevated transition-colors flex-shrink-0"
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
                                        className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-border-subtle rounded-xl shadow-float max-h-56 overflow-y-auto z-20 animate-slideDown"
                                    >
                                        {studentResults.length === 0 ? (
                                            <div className="px-4 py-3 text-sm text-muted text-center">
                                                {searchingStudents ? 'Searching…' : 'No students found'}
                                            </div>
                                        ) : (
                                            <>
                                                {!debouncedSearch && (
                                                    <div className="px-3.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Recently added</div>
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
                                                        <div className={`w-7 h-7 bg-gradient-to-br ${getAvatarGradient(s.id)} rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                                            {initials(s)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="font-semibold text-primary">{s.first_name} {s.last_name}</span>
                                                            {s.email && <span className="text-muted text-xs ml-2 truncate">{s.email}</span>}
                                                        </div>
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Course Selector */}
                    <div>
                        <label htmlFor="enroll-course" className={LABEL_CLASS}>Course *</label>
                        <select
                            id="enroll-course"
                            value={selectedCourseId}
                            onChange={e => setSelectedCourseId(e.target.value)}
                            autoFocus={!!preselectedStudentId}
                            className={FIELD_CLASS}
                        >
                            <option value="">Select a course...</option>
                            {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        {existingEnrollment && (
                            <p className="mt-1.5 text-xs text-status-requested flex items-center gap-1.5">
                                <AlertTriangle size={12} className="flex-shrink-0" />
                                Already enrolled in this course ({existingEnrollment.status}
                                {existingEnrollment.course_variant ? `, ${cleanVariant(selectedCourseName, existingEnrollment.course_variant)}` : ''})
                            </p>
                        )}
                    </div>

                    {/* Variant */}
                    <div>
                        <label htmlFor="enroll-variant" className={LABEL_CLASS}>
                            Variant <span className="text-muted font-normal normal-case">(optional)</span>
                        </label>
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

                    {/* Status */}
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
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-muted bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !!existingEnrollment}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving && <Loader2 size={16} className="animate-spin" />}
                            Enroll Student
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

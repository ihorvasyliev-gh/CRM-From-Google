import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { buildStudentSearchFilters } from '../lib/searchUtils';
import { fullName, type Student } from '../lib/types';
import { Loader2, Search, GitMerge, Check, AlertCircle, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Modal, { FormError } from './ui/Modal';
import { Button } from './ui/Button';
import { calloutCls, fieldCls, labelCls } from './ui/styles';
import { formatDisplayDate } from '../lib/dateUtils';
import { formatPhoneDisplay } from '../lib/contactUtils';
import { errorMessage } from '../lib/errors';
import { refreshStudentEnrollments } from '../lib/enrollmentCache';
import { mergeStudents } from '../lib/mergeStudents';

/** The details compared side by side */
const MERGE_FIELDS: [label: string, field: keyof Student][] = [
    ['First name', 'first_name'],
    ['Last name', 'last_name'],
    ['Email', 'email'],
    ['Phone', 'phone'],
    ['Address', 'address'],
    ['Eircode', 'eircode'],
    ['Date of birth', 'dob'],
];

interface Props {
    open: boolean;
    student: Student;
    initialTargetStudent?: Student | null;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function MergeModal({ open, student: sourceStudent, initialTargetStudent = null, onClose, onSuccess }: Props) {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Student[]>([]);
    const [searching, setSearching] = useState(false);
    const [targetStudent, setTargetStudent] = useState<Student | null>(null);
    const [primaryId, setPrimaryId] = useState<string>('');
    const [merging, setMerging] = useState(false);
    const [error, setError] = useState('');
    const [markingNonDuplicate, setMarkingNonDuplicate] = useState(false);
    const [editedFields, setEditedFields] = useState<Partial<Student>>({});
    // Phones and short screens: only the details that differ, unless asked for all
    const [showAllFields, setShowAllFields] = useState(false);

    useEffect(() => {
        if (open) {
            setTargetStudent(initialTargetStudent);
            setPrimaryId(sourceStudent.id);
            setSearchQuery('');
            setSearchResults([]);
            setError('');
            setEditedFields({});
        }
    }, [open, sourceStudent, initialTargetStudent]);

    useEffect(() => {
        setEditedFields({});
    }, [primaryId]);

    // Search for students
    useEffect(() => {
        if (!searchQuery.trim() || targetStudent) {
            setSearchResults([]);
            return;
        }
        let active = true;
        const delayDebounce = setTimeout(async () => {
            setSearching(true);
            setError('');
            try {
                let query = supabase
                    .from('students')
                    .select('*')
                    .neq('id', sourceStudent.id)
                    .limit(5);

                buildStudentSearchFilters(searchQuery).forEach(filter => {
                    query = query.or(filter);
                });

                const { data, error: err } = await query;

                if (err) throw err;
                if (active) setSearchResults(data || []);
            } catch (e) {
                console.error('Student search failed:', e);
                if (active) setError(errorMessage(e, 'Search failed. Please try again.'));
            } finally {
                if (active) setSearching(false);
            }
        }, 300);

        return () => {
            active = false;
            clearTimeout(delayDebounce);
        };
    }, [searchQuery, sourceStudent.id, targetStudent]);

    const duplicateId = primaryId === sourceStudent.id ? targetStudent?.id : sourceStudent.id;
    const primaryStudent = primaryId === sourceStudent.id ? sourceStudent : targetStudent;
    const duplicateStudent = primaryId === sourceStudent.id ? targetStudent : sourceStudent;

    const getPrimaryValue = (field: keyof Student) => {
        if (editedFields[field] !== undefined) {
            return editedFields[field];
        }
        return primaryStudent ? primaryStudent[field] : '';
    };

    async function handleMerge() {
        if (!targetStudent || !duplicateId || !primaryStudent || !duplicateStudent) return;
        setMerging(true);
        setError('');
        try {
            // One transaction in the database: a failure leaves both students untouched
            await mergeStudents(primaryId, duplicateId, duplicateStudent.email ?? null, editedFields);

            // Invalidate React Query Cache
            queryClient.invalidateQueries({ queryKey: ['students'] });
            // Both students' enrollments, now all the primary's, re-read into the cached list
            void refreshStudentEnrollments(queryClient, [primaryId, duplicateId]);
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
            queryClient.invalidateQueries({ queryKey: ['analytics_enrollments_v2'] });
            queryClient.invalidateQueries({ queryKey: ['outcomes_graduates'] });

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            setError(errorMessage(err, 'Failed to merge students'));
        } finally {
            setMerging(false);
        }
    }

    async function handleMarkAsNonDuplicate() {
        if (!targetStudent) return;
        setMarkingNonDuplicate(true);
        setError('');
        try {
            const ids = [sourceStudent.id, targetStudent.id].sort();
            const { error: insertError } = await supabase
                .from('student_non_duplicates')
                .upsert({
                    student_a_id: ids[0],
                    student_b_id: ids[1]
                }, { onConflict: 'student_a_id,student_b_id' });

            if (insertError) throw insertError;

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            setError(errorMessage(err, 'Failed to mark profiles as non-duplicates'));
        } finally {
            setMarkingNonDuplicate(false);
        }
    }

    const busy = merging || markingNonDuplicate;
    const primaryName = fullName(primaryStudent) || 'this student';
    const duplicateName = fullName(duplicateStudent) || 'the other student';
    // The two records keep their places while the kept one is switched, so nothing jumps
    const pair = targetStudent ? [sourceStudent, targetStudent] : [];
    const contactLine = (s: Student) => [s.email, s.phone && formatPhoneDisplay(s.phone)].filter(Boolean).join(' · ') || 'No email or phone';
    const differs = (field: keyof Student) => ((sourceStudent[field] as string) || '') !== ((targetStudent?.[field] as string) || '');
    const shownFields = MERGE_FIELDS.filter(([, field]) => showAllFields || differs(field) || editedFields[field] !== undefined);

    return (
        <Modal
            open={open}
            onClose={onClose}
            dismissible={!busy}
            title="Merge duplicate students"
            subtitle={targetStudent ? 'Choose the record to keep' : `Find the duplicate of ${fullName(sourceStudent)}`}
            icon={GitMerge}
            labelId="merge-modal-title"
            size="xl"
            zIndex="z-60"
            sheetOnMobile
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
                    <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
                    {targetStudent && (
                        <Button variant="secondary" onClick={handleMarkAsNonDuplicate} disabled={busy} loading={markingNonDuplicate}>
                            {!markingNonDuplicate && <Check size={15} />} Not the same person
                        </Button>
                    )}
                    {targetStudent && (
                        <Button variant="primary" onClick={handleMerge} disabled={busy} loading={merging} className="whitespace-normal! h-auto! min-h-9 py-2 text-left">
                            {!merging && <GitMerge size={15} className="shrink-0" />}
                            {merging ? 'Merging…' : `Merge into ${primaryName}`}
                        </Button>
                    )}
                </div>
            }
        >
            <div className="space-y-4">
                {error && <FormError>{error}</FormError>}

                {/* Step 1: find the other record */}
                {!targetStudent && (
                    <div className="space-y-3">
                        <label htmlFor="merge-search" className={labelCls}>
                            Search for the other record of {fullName(sourceStudent)}
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} aria-hidden />
                            <input
                                id="merge-search"
                                type="text"
                                placeholder="Name, email or phone…"
                                className={`${fieldCls} pl-10`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                            {searching && (
                                <div className="flex items-center justify-center py-6 text-muted gap-2">
                                    <Loader2 size={16} className="animate-spin text-brand-500" />
                                    <span className="text-xs font-medium">Searching…</span>
                                </div>
                            )}
                            {!searching && searchQuery && searchResults.length === 0 && (
                                <p className="text-center py-6 text-xs text-muted">No other student matches that.</p>
                            )}
                            {searchResults.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setTargetStudent(s)}
                                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border-subtle hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors text-left text-sm"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold text-primary truncate">{fullName(s)}</p>
                                        <p className="text-xs text-muted truncate">{contactLine(s)}</p>
                                    </div>
                                    <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 shrink-0">Compare</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: choose the record to keep and the details it keeps */}
                {targetStudent && primaryStudent && duplicateStudent && (
                    <div className="space-y-4">
                        <fieldset>
                            <legend className={`${labelCls} mb-2`}>Which record do you want to keep?</legend>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {pair.map(s => {
                                    const keep = s.id === primaryId;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={keep}
                                            onClick={() => setPrimaryId(s.id)}
                                            className={`text-left p-3.5 rounded-xl border-2 transition-colors ${keep
                                                ? 'border-brand-500 bg-brand-500/5'
                                                : 'border-border-subtle hover:border-border-strong bg-surface'}`}
                                        >
                                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${keep
                                                ? 'bg-brand-500 text-white'
                                                : 'bg-danger/10 text-status-rejected'}`}>
                                                {keep ? <><Check size={12} /> Keep</> : <><Trash2 size={12} /> Will be deleted</>}
                                            </span>
                                            <p className="font-semibold text-primary truncate">{fullName(s) || 'No name'}</p>
                                            <p className="text-xs text-muted truncate">{contactLine(s)}</p>
                                            {s.created_at && <p className="text-xs text-muted mt-0.5">Added {formatDisplayDate(s.created_at)}</p>}
                                        </button>
                                    );
                                })}
                            </div>
                        </fieldset>

                        <div className={`${calloutCls.warning} text-sm px-3.5 py-3 flex items-start gap-2.5`}>
                            <AlertCircle size={16} className="shrink-0 mt-0.5 text-status-requested" />
                            <div className="space-y-1">
                                <p>
                                    <strong>{duplicateName}</strong>{duplicateStudent.email ? ` (${duplicateStudent.email})` : ''} will be deleted.
                                    Their courses, flags, comments and survey answers move to <strong>{primaryName}</strong>.
                                </p>
                                <p className="text-xs text-muted">This can't be undone.</p>
                            </div>
                        </div>

                        {/* Details: the kept record's, or the other's where "Use this" is picked */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className={labelCls + ' mb-0!'}>
                                    {MERGE_FIELDS.some(([, f]) => differs(f)) ? 'Details that differ' : 'The details are the same'}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setShowAllFields(v => !v)}
                                    aria-expanded={showAllFields}
                                    className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                                >
                                    {showAllFields ? 'Only what differs' : 'Show all details'}
                                </button>
                            </div>
                            {shownFields.length > 0 && (
                                <div className="rounded-xl border border-border-subtle divide-y divide-border-subtle text-sm">
                                    {/* Column names (wider screens) */}
                                    <div className="hidden sm:grid grid-cols-[8rem_1fr_1fr] gap-3 px-3 py-2 bg-surface-elevated/60 text-xs font-semibold text-muted rounded-t-xl">
                                        <span>Detail</span>
                                        {pair.map(s => <span key={s.id} className="truncate">{fullName(s)}{s.id === primaryId ? ' (keep)' : ''}</span>)}
                                    </div>
                                    {shownFields.map(([label, field]) => {
                                        const isModified = editedFields[field] !== undefined;
                                        const otherVal = (duplicateStudent[field] as string) || '';
                                        return (
                                            <div key={field} className={`grid grid-cols-1 sm:grid-cols-[8rem_1fr_1fr] gap-1.5 sm:gap-3 px-3 py-2.5 ${differs(field) ? 'bg-warning/5' : ''}`}>
                                                <span className="text-xs font-semibold text-muted sm:pt-0.5">{label}</span>
                                                {pair.map(s => {
                                                    const keep = s.id === primaryId;
                                                    const value = keep ? (getPrimaryValue(field) as string) : ((s[field] as string) || '');
                                                    const shown = field === 'dob' && value ? formatDisplayDate(value) : value;
                                                    return (
                                                        <div key={s.id} className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                            <span className="sm:hidden text-xs text-muted w-full">{fullName(s)}{keep ? ' (keep)' : ''}</span>
                                                            <span className={`break-words min-w-0 ${keep ? 'font-semibold text-primary' : 'text-muted'}`}>
                                                                {shown || <span className="italic text-muted">Not set</span>}
                                                            </span>
                                                            {keep && isModified && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditedFields(prev => {
                                                                        const next = { ...prev };
                                                                        delete next[field];
                                                                        return next;
                                                                    })}
                                                                    className="text-xs font-semibold text-muted hover:text-primary underline"
                                                                >
                                                                    Undo
                                                                </button>
                                                            )}
                                                            {!keep && differs(field) && otherVal && !isModified && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditedFields(prev => ({ ...prev, [field]: otherVal }))}
                                                                    title={`Keep "${shown}" on the merged record`}
                                                                    className="text-xs font-semibold px-2 py-0.5 rounded-md text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 transition-colors"
                                                                >
                                                                    Use this
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setTargetStudent(null)}
                            disabled={busy}
                            className="text-xs font-semibold text-muted hover:text-primary underline"
                        >
                            Not this one? Choose a different student
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
}

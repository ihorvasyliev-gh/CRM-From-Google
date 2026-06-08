import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Student } from '../lib/types';
import { X, Loader2, Search, GitMerge, Check, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

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
        const delayDebounce = setTimeout(async () => {
            setSearching(true);
            setError('');
            try {
                const { data, error: err } = await supabase
                    .from('students')
                    .select('*')
                    .or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
                    .neq('id', sourceStudent.id)
                    .limit(5);

                if (err) throw err;
                setSearchResults(data || []);
            } catch (e: any) {
                console.error(e);
            } finally {
                setSearching(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounce);
    }, [searchQuery, sourceStudent.id, targetStudent]);

    if (!open) return null;

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
            // 1. If any fields were edited/copied, save them to the primary profile first
            if (Object.keys(editedFields).length > 0) {
                // To prevent violating the UNIQUE constraint on (first_name, last_name, email)
                // when updating the primary student with fields (like name or email) that conflict with
                // the duplicate student, set the duplicate student's email to NULL first.
                // Since the duplicate is deleted in the merge RPC right after, this is completely safe.
                const { error: clearEmailError } = await supabase
                    .from('students')
                    .update({ email: null })
                    .eq('id', duplicateId);
                
                if (clearEmailError) throw clearEmailError;

                const { error: updateError } = await supabase
                    .from('students')
                    .update(editedFields)
                    .eq('id', primaryId);

                if (updateError) throw updateError;
            }

            // 2. Perform the merge RPC
            const { error: rpcError } = await supabase.rpc('merge_students', {
                p_primary_id: primaryId,
                p_duplicate_id: duplicateId
            });

            if (rpcError) throw new Error(rpcError.message);

            // Invalidate React Query Cache
            queryClient.invalidateQueries({ queryKey: ['students'] });
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });

            if (onSuccess) onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to merge students');
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
        } catch (err: any) {
            setError(err.message || 'Failed to mark profiles as non-duplicates');
        } finally {
            setMarkingNonDuplicate(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-surface-elevated rounded-2xl shadow-2xl animate-scaleIn overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border-subtle bg-surface-elevated flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-brand-50 rounded-xl text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                                <GitMerge size={18} />
                            </div>
                            <h2 className="text-lg font-bold text-primary">Merge Student Profiles</h2>
                        </div>
                        <button onClick={onClose} className="p-2 text-muted hover:text-primary hover:bg-surface rounded-lg transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl flex items-center gap-2 animate-slideDown dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                            <AlertCircle size={16} className="flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Step 1: Select Target Student */}
                    {!targetStudent && (
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">
                                Search for the duplicate student profile
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search by name, email, or phone number..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            {/* Search Results */}
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {searching && (
                                    <div className="flex items-center justify-center py-6 text-muted gap-2">
                                        <Loader2 size={16} className="animate-spin text-brand-500" />
                                        <span className="text-xs font-medium">Searching database...</span>
                                    </div>
                                )}
                                {!searching && searchQuery && searchResults.length === 0 && (
                                    <div className="text-center py-6 text-xs text-muted">
                                        No matching student profiles found.
                                    </div>
                                )}
                                {searchResults.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => setTargetStudent(s)}
                                        className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-brand-50/40 border border-transparent hover:border-brand-500/10 transition-all text-left text-sm"
                                    >
                                        <div>
                                            <p className="font-semibold text-primary">{s.first_name} {s.last_name}</p>
                                            <p className="text-xs text-muted">{s.email} • {s.phone || 'No phone'}</p>
                                        </div>
                                        <Check size={16} className="text-muted opacity-0 group-hover:opacity-100" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Compare and Configure Direction */}
                    {targetStudent && primaryStudent && duplicateStudent && (
                        <div className="space-y-4">
                            {/* Merge Policy Alert */}
                            <div className="bg-brand-50/50 border border-brand-100 rounded-xl p-3.5 text-xs text-brand-700 space-y-1 dark:bg-brand-500/5 dark:border-brand-500/10 dark:text-brand-300">
                                <p className="font-bold flex items-center gap-1.5">
                                    <AlertCircle size={14} /> Merge Actions:
                                </p>
                                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                    <li>All course enrollments will be merged (no progress lost).</li>
                                    <li>Student flags and comments will be combined.</li>
                                    <li>Employment outcomes data will be safely merged.</li>
                                    <li>The duplicate student profile will be deleted permanently.</li>
                                </ul>
                            </div>

                            {/* Profiles Table */}
                            <div className="border border-border-subtle rounded-xl overflow-hidden text-sm bg-surface">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-surface-elevated/50 border-b border-border-subtle text-xs font-bold uppercase text-muted tracking-wider">
                                            <th className="p-3 w-1/4">Field</th>
                                            <th className="p-3 w-3/8 text-center">Profile A</th>
                                            <th className="p-3 w-3/8 text-center">Profile B</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-subtle">
                                        {/* Merge Direction Selector */}
                                        <tr className="bg-brand-50/10 dark:bg-brand-500/5">
                                            <td className="p-3 font-semibold text-primary">Merge Status</td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => setPrimaryId(sourceStudent.id)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                                        primaryId === sourceStudent.id
                                                            ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                                                            : 'bg-surface border-border-subtle text-muted hover:text-primary'
                                                    }`}
                                                >
                                                    KEEP (Primary)
                                                </button>
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => setPrimaryId(targetStudent.id)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                                        primaryId === targetStudent.id
                                                            ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                                                            : 'bg-surface border-border-subtle text-muted hover:text-primary'
                                                    }`}
                                                >
                                                    KEEP (Primary)
                                                </button>
                                            </td>
                                        </tr>

                                        {/* Render comparing rows using helper */}
                                        {(() => {
                                            const renderRow = (label: string, field: keyof Student) => {
                                                if (!primaryStudent || !duplicateStudent) return null;
                                                
                                                const valA = sourceStudent[field] as string;
                                                const valB = targetStudent[field] as string;
                                                const isAPrimary = primaryId === sourceStudent.id;
                                                
                                                const primaryVal = getPrimaryValue(field) as string;
                                                const duplicateVal = (isAPrimary ? valB : valA) as string;
                                                
                                                const hasDiff = (valA || '') !== (valB || '');
                                                const isModified = editedFields[field] !== undefined;

                                                const renderCopyButton = () => {
                                                    if (!hasDiff || !duplicateVal) return null;
                                                    return (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditedFields(prev => ({
                                                                    ...prev,
                                                                    [field]: duplicateVal
                                                                }));
                                                            }}
                                                            title={`Copy "${duplicateVal}" to primary profile`}
                                                            className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-brand-500 text-white hover:bg-brand-600 rounded transition-all shadow-sm"
                                                        >
                                                            {isAPrimary ? '← Copy' : 'Copy →'}
                                                        </button>
                                                    );
                                                };

                                                return (
                                                    <tr key={field} className={hasDiff ? 'bg-amber-500/5 dark:bg-amber-500/2' : ''}>
                                                        <td className="p-3 font-medium text-muted flex items-center justify-between">
                                                            <span>{label}</span>
                                                            {hasDiff && !isModified && (
                                                                <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                                                                    Differs
                                                                </span>
                                                            )}
                                                            {isModified && (
                                                                <span className="text-[10px] bg-brand-500/10 text-brand-600 px-1.5 py-0.5 rounded font-semibold uppercase">
                                                                    Updated
                                                                </span>
                                                            )}
                                                        </td>
                                                        
                                                        {/* Profile A Cell */}
                                                        {isAPrimary ? (
                                                            <td className={`p-3 text-center ${isModified ? 'font-bold text-brand-500' : 'font-semibold text-primary'}`}>
                                                                {primaryVal || <span className="text-muted/40 italic">Not set</span>}
                                                            </td>
                                                        ) : (
                                                            <td className="p-3 text-center text-muted">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <span className="line-through text-muted/60">{valA || <span className="text-muted/20 italic">Not set</span>}</span>
                                                                    {renderCopyButton()}
                                                                </div>
                                                            </td>
                                                        )}
                                                        
                                                        {/* Profile B Cell */}
                                                        {!isAPrimary ? (
                                                            <td className={`p-3 text-center ${isModified ? 'font-bold text-brand-500' : 'font-semibold text-primary'}`}>
                                                                {primaryVal || <span className="text-muted/40 italic">Not set</span>}
                                                            </td>
                                                        ) : (
                                                            <td className="p-3 text-center text-muted">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <span className="line-through text-muted/60">{valB || <span className="text-muted/20 italic">Not set</span>}</span>
                                                                    {renderCopyButton()}
                                                                </div>
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            };

                                            return (
                                                <>
                                                    {renderRow('First Name', 'first_name')}
                                                    {renderRow('Last Name', 'last_name')}
                                                    {renderRow('Email', 'email')}
                                                    {renderRow('Phone', 'phone')}
                                                    {renderRow('Address', 'address')}
                                                    {renderRow('Eircode', 'eircode')}
                                                    {renderRow('Date of Birth', 'dob')}
                                                </>
                                            );
                                        })()}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setTargetStudent(null)}
                                    className="flex-1 px-4 py-2 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-xs font-semibold text-muted transition-all"
                                >
                                    Choose Different Student
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border-subtle bg-surface-elevated flex justify-between gap-3 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-sm font-semibold text-muted transition-all flex-1"
                    >
                        Cancel
                    </button>
                    {targetStudent && (
                        <button
                            onClick={handleMarkAsNonDuplicate}
                            disabled={markingNonDuplicate || merging}
                            className="px-4 py-2.5 bg-success/10 hover:bg-success/20 disabled:opacity-50 text-success rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 flex-1 border border-success/10 hover:border-success/20 shadow-sm"
                        >
                            {markingNonDuplicate ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            Not Duplicates
                        </button>
                    )}
                    {targetStudent && (
                        <button
                            onClick={handleMerge}
                            disabled={merging || markingNonDuplicate}
                            className="px-4 py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 flex-1 shadow-sm hover:shadow"
                        >
                            {merging ? <Loader2 size={16} className="animate-spin" /> : <GitMerge size={16} />}
                            {merging ? 'Merging...' : `Confirm Merge into ${primaryStudent?.first_name}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

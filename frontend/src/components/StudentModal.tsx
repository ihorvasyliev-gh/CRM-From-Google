import { useState, useEffect, useMemo, useCallback } from 'react';

import { X, Loader2, User, AlertTriangle } from 'lucide-react';
import { StudentFormData, StudentPayload, toStudentPayload } from '../lib/types';
import { supabase } from '../lib/supabase';
import { normalizePhone } from '../lib/contactUtils';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface Props {
    open: boolean;
    student: StudentFormData | null;
    onSave: (data: StudentPayload) => Promise<void>;
    onClose: () => void;
}

const EMPTY_FORM: StudentFormData = { first_name: '', last_name: '', email: '', phone: '', address: '', eircode: '', dob: '' };

const INPUT_CLASS = 'w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated placeholder:text-muted/60';
const LABEL_CLASS = 'text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block';

/** Strips characters that would break a quoted PostgREST filter value. */
function quoteFilterValue(value: string): string {
    return `"${value.replace(/["\\]/g, '')}"`;
}

export default function StudentModal({ open, student, onSave, onClose }: Props) {
    const [form, setForm] = useState<StudentFormData>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [duplicateWarning, setDuplicateWarning] = useState('');

    const initialForm = useMemo(() => student || EMPTY_FORM, [student]);

    useEffect(() => {
        if (open) {
            setForm(initialForm);
            setError('');
            setDuplicateWarning('');
        }
    }, [open, initialForm]);

    const isDirty = useMemo(
        () => (Object.keys(EMPTY_FORM) as (keyof StudentFormData)[]).some(k => (form[k] || '') !== (initialForm[k] || '')),
        [form, initialForm]
    );

    const requestClose = useCallback(() => {
        if (saving) return;
        if (isDirty && !window.confirm('Discard unsaved changes?')) return;
        onClose();
    }, [saving, isDirty, onClose]);

    useModalBehavior(open, requestClose);

    // Live duplicate detection (same email or same normalized phone)
    useEffect(() => {
        if (!open) {
            setDuplicateWarning('');
            return;
        }

        const checkEmail = form.email.trim().toLowerCase();
        const checkPhone = normalizePhone(form.phone);

        if (!checkEmail && !checkPhone) {
            setDuplicateWarning('');
            return;
        }

        let active = true;
        const delayCheck = setTimeout(async () => {
            try {
                const conditions: string[] = [];
                if (checkEmail) conditions.push(`email.eq.${quoteFilterValue(checkEmail)}`);
                if (checkPhone) conditions.push(`phone.eq.${quoteFilterValue(checkPhone)}`);

                let query = supabase
                    .from('students')
                    .select('id, first_name, last_name, email, phone')
                    .or(conditions.join(','));

                if (student?.id) {
                    query = query.neq('id', student.id);
                }

                const { data } = await query.limit(1);
                if (!active) return;

                if (data && data.length > 0) {
                    const match = data[0];
                    const matchedOnEmail = match.email && match.email.trim().toLowerCase() === checkEmail;
                    setDuplicateWarning(`A student named "${match.first_name} ${match.last_name}" already exists with this ${matchedOnEmail ? 'email' : 'phone'}.`);
                } else {
                    setDuplicateWarning('');
                }
            } catch (err) {
                console.error('Duplicate check failed:', err);
            }
        }, 500);

        return () => {
            active = false;
            clearTimeout(delayCheck);
        };
    }, [form.email, form.phone, student?.id, open]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (saving) return;
        if (!form.first_name.trim() || !form.last_name.trim()) {
            setError('First and last name are required');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await onSave(toStudentPayload(form));
            onClose();
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Save failed');
            }
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    const isEditing = !!student?.id;
    const update = (field: keyof StudentFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={requestClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="student-modal-title"
                className="relative w-full max-w-lg bg-surface-elevated rounded-t-3xl sm:rounded-2xl shadow-2xl animate-slideUp sm:animate-scaleIn max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden pb-[max(env(safe-area-inset-bottom),0.5rem)]"
            >
                {/* Mobile pull handle */}
                <div className="w-10 h-1 bg-border-strong rounded-full mx-auto my-2.5 sm:hidden" />

                {/* Header */}
                <div className="px-6 py-3.5 sm:py-4 border-b border-border-subtle bg-surface-elevated flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-brand-500/10 rounded-xl text-brand-600 dark:text-brand-400">
                                <User size={18} />
                            </div>
                            <h2 id="student-modal-title" className="text-lg font-bold text-primary">{isEditing ? 'Edit Student' : 'Add Student'}</h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            aria-label="Close"
                            className="p-2 text-muted hover:text-primary hover:bg-surface rounded-lg transition-all"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
                    {error && (
                        <div role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 px-4 py-2.5 rounded-xl animate-slideDown">
                            {error}
                        </div>
                    )}

                    {duplicateWarning && (
                        <div className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 rounded-xl flex items-center gap-2.5 animate-slideDown dark:text-amber-400">
                            <AlertTriangle size={16} className="flex-shrink-0 text-amber-500" />
                            <span>{duplicateWarning}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="student-first-name" className={LABEL_CLASS}>First Name *</label>
                            <input
                                id="student-first-name"
                                type="text"
                                autoFocus
                                autoComplete="off"
                                className={INPUT_CLASS}
                                value={form.first_name}
                                onChange={update('first_name')}
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="student-last-name" className={LABEL_CLASS}>Last Name *</label>
                            <input
                                id="student-last-name"
                                type="text"
                                autoComplete="off"
                                className={INPUT_CLASS}
                                value={form.last_name}
                                onChange={update('last_name')}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="student-email" className={LABEL_CLASS}>Email</label>
                        <input
                            id="student-email"
                            type="email"
                            inputMode="email"
                            autoComplete="off"
                            className={INPUT_CLASS}
                            value={form.email}
                            onChange={update('email')}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="student-phone" className={LABEL_CLASS}>Phone</label>
                            <input
                                id="student-phone"
                                type="tel"
                                inputMode="tel"
                                autoComplete="off"
                                placeholder="e.g. 087 123 4567"
                                className={INPUT_CLASS}
                                value={form.phone}
                                onChange={update('phone')}
                            />
                        </div>
                        <div>
                            <label htmlFor="student-dob" className={LABEL_CLASS}>Date of Birth</label>
                            <input
                                id="student-dob"
                                type="date"
                                max={new Date().toISOString().slice(0, 10)}
                                className={INPUT_CLASS}
                                value={form.dob}
                                onChange={update('dob')}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="student-address" className={LABEL_CLASS}>Address</label>
                        <input
                            id="student-address"
                            type="text"
                            className={INPUT_CLASS}
                            value={form.address}
                            onChange={update('address')}
                        />
                    </div>

                    <div>
                        <label htmlFor="student-eircode" className={LABEL_CLASS}>Eircode</label>
                        <input
                            id="student-eircode"
                            type="text"
                            autoCapitalize="characters"
                            className={`${INPUT_CLASS} uppercase`}
                            value={form.eircode}
                            onChange={update('eircode')}
                        />
                    </div>

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
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                            {saving ? 'Saving...' : isEditing ? 'Update Student' : 'Add Student'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

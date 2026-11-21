import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import { User, AlertTriangle, Info } from 'lucide-react';
import { fullName, Student, StudentFormData, StudentPayload, toStudentPayload } from '../lib/types';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/dateUtils';
import { normalizePhone } from '../lib/contactUtils';
import Modal, { FormError } from './ui/Modal';
import { Button } from './ui/Button';
import { calloutCls, fieldCls, labelCls } from './ui/styles';
import { DateInput } from './ui/DatePicker';
import FieldError from './ui/FieldError';
import ConfirmDialog from './ConfirmDialog';
import { useFieldErrors } from '../hooks/useFieldErrors';
import { formatEircode, looksLikeEircode, looksLikePhone } from './Students/studentListData';

interface Props {
    open: boolean;
    student: StudentFormData | null;
    /** Resolves to the saved student, when it can be read back */
    onSave: (data: StudentPayload) => Promise<Student | null | void>;
    onClose: () => void;
    /** When adding: a "Save and enroll" button, which hands the new student on to be enrolled */
    onSaveAndEnroll?: (student: Student) => void;
    /** The duplicate warning's "Open" button: shows the student who is already there instead */
    onOpenExisting?: (studentId: string) => void;
    /** When editing: the duplicate warning's "Merge" button, to merge this student with that one */
    onMergeWith?: (studentId: string) => void;
}

interface DuplicateMatch {
    id: string;
    name: string;
    field: 'email' | 'phone';
}

const hintCls = 'mt-1.5 text-xs text-muted';

const EMPTY_FORM: StudentFormData = { first_name: '', last_name: '', email: '', phone: '', address: '', eircode: '', dob: '' };

const INPUT_CLASS = fieldCls;
const LABEL_CLASS = labelCls;

/** Strips characters that would break a quoted PostgREST filter value. */
function quoteFilterValue(value: string): string {
    return `"${value.replace(/["\\]/g, '')}"`;
}

export default function StudentModal({ open, student, onSave, onClose, onSaveAndEnroll, onOpenExisting, onMergeWith }: Props) {
    const [form, setForm] = useState<StudentFormData>(EMPTY_FORM);
    const formRef = useRef<HTMLFormElement>(null);
    // Set by "Save and enroll" just before it submits the form
    const enrollAfterSaveRef = useRef(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
    // The duplicate check could not run (e.g. offline): said so, rather than looking like "no duplicates"
    const [duplicateCheckFailed, setDuplicateCheckFailed] = useState(false);
    const [phoneTouched, setPhoneTouched] = useState(false);
    const [eircodeTouched, setEircodeTouched] = useState(false);
    const { errors, check, formProps, fieldProps } = useFieldErrors();
    const [confirmDiscard, setConfirmDiscard] = useState(false);

    const initialForm = useMemo(() => student || EMPTY_FORM, [student]);

    useEffect(() => {
        if (open) {
            setForm(initialForm);
            setError('');
            setDuplicate(null);
            setDuplicateCheckFailed(false);
        }
    }, [open, initialForm]);

    const isDirty = useMemo(
        () => (Object.keys(EMPTY_FORM) as (keyof StudentFormData)[]).some(k => (form[k] || '') !== (initialForm[k] || '')),
        [form, initialForm]
    );

    const requestClose = useCallback(() => {
        if (saving) return;
        if (isDirty) {
            setConfirmDiscard(true);
            return;
        }
        onClose();
    }, [saving, isDirty, onClose]);


    // Live duplicate detection (same email or same normalized phone)
    useEffect(() => {
        if (!open) {
            setDuplicate(null);
            return;
        }

        const checkEmail = form.email.trim().toLowerCase();
        const checkPhone = normalizePhone(form.phone);

        if (!checkEmail && !checkPhone) {
            setDuplicate(null);
            setDuplicateCheckFailed(false);
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

                const { data, error: checkError } = await query.limit(1);
                if (!active) return;
                if (checkError) throw checkError;
                setDuplicateCheckFailed(false);

                if (data && data.length > 0) {
                    const match = data[0];
                    const matchedOnEmail = !!match.email && match.email.trim().toLowerCase() === checkEmail;
                    setDuplicate({ id: match.id, name: fullName(match) || 'A student', field: matchedOnEmail ? 'email' : 'phone' });
                } else {
                    setDuplicate(null);
                }
            } catch (err) {
                console.error('Duplicate check failed:', err);
                if (active) setDuplicateCheckFailed(true);
            }
        }, 500);

        return () => {
            active = false;
            clearTimeout(delayCheck);
        };
    }, [form.email, form.phone, student?.id, open]);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const thenEnroll = enrollAfterSaveRef.current;
        enrollAfterSaveRef.current = false;
        if (saving || !check(e.currentTarget)) return;
        if (!form.first_name.trim() || !form.last_name.trim()) {
            setError('First and last name are required');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const saved = await onSave(toStudentPayload(form));
            onClose();
            if (thenEnroll && saved) onSaveAndEnroll?.(saved);
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

    const isEditing = !!student?.id;
    const update = (field: keyof StudentFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));
    const phoneLooksOff = phoneTouched && !!form.phone.trim() && !looksLikePhone(form.phone);
    const eircodeLooksOff = eircodeTouched && !!form.eircode.trim() && !looksLikeEircode(form.eircode);

    return (
        <Modal
            open={open}
            onClose={requestClose}
            title={isEditing ? 'Edit Student' : 'Add Student'}
            icon={User}
            labelId="student-modal-title"
            size="lg"
            zIndex="z-60"
            sheetOnMobile
            dismissible={!saving}
            footer={
                <>
                    <Button variant="ghost" onClick={requestClose}>Cancel</Button>
                    {!isEditing && onSaveAndEnroll && (
                        <Button
                            variant="secondary"
                            disabled={saving}
                            title="Add the student, then choose a course for them"
                            onClick={() => {
                                enrollAfterSaveRef.current = true;
                                formRef.current?.requestSubmit();
                            }}
                        >
                            Save and enroll
                        </Button>
                    )}
                    <Button variant="primary" type="submit" form="student-form" loading={saving}>
                        {saving ? 'Saving...' : isEditing ? 'Update Student' : 'Add Student'}
                    </Button>
                </>
            }
        >
                <form id="student-form" ref={formRef} onSubmit={handleSubmit} {...formProps} className="space-y-4">
                    {error && <FormError>{error}</FormError>}

                    {duplicate && (
                        <div role="status" className={`${calloutCls.warning} text-sm px-3.5 py-2.5 flex items-start gap-2.5 animate-slideDown`}>
                            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-status-requested" />
                            <div className="min-w-0 space-y-2">
                                <p><strong>{duplicate.name}</strong> already has this {duplicate.field}. {isEditing ? 'If they are the same person, merge the two records.' : 'Open their record instead of adding them twice.'}</p>
                                {(onOpenExisting || (isEditing && onMergeWith)) && (
                                    <div className="flex flex-wrap gap-2">
                                        {onOpenExisting && (
                                            <Button size="sm" variant="secondary" onClick={() => onOpenExisting(duplicate.id)}>
                                                Open {duplicate.name}
                                            </Button>
                                        )}
                                        {isEditing && onMergeWith && (
                                            <Button size="sm" variant="brand-soft" onClick={() => onMergeWith(duplicate.id)}>
                                                Merge the two
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {!duplicate && duplicateCheckFailed && (
                        <p role="status" className="text-xs text-muted flex items-center gap-1.5">
                            <Info size={13} className="shrink-0" />
                            Couldn't check whether this student is already in the system. Search the list before saving if unsure.
                        </p>
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
                                {...fieldProps('student-first-name')}
                            />
                            <FieldError id="student-first-name" message={errors['student-first-name']} />
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
                                {...fieldProps('student-last-name')}
                            />
                            <FieldError id="student-last-name" message={errors['student-last-name']} />
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
                            {...fieldProps('student-email')}
                        />
                        <FieldError id="student-email" message={errors['student-email']} />
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
                                onBlur={() => setPhoneTouched(true)}
                                aria-describedby="student-phone-hint"
                            />
                            <p id="student-phone-hint" className={phoneLooksOff ? 'mt-1.5 text-xs text-status-requested' : hintCls}>
                                {phoneLooksOff
                                    ? 'This doesn\'t look like a phone number. Irish mobiles look like 087 123 4567; add +353 or another country code for others.'
                                    : 'Irish mobile or landline, or a number with its country code'}
                            </p>
                        </div>
                        <div>
                            <label htmlFor="student-dob" className={LABEL_CLASS}>Date of Birth</label>
                            <DateInput
                                id="student-dob"
                                max={todayISO()}
                                className={INPUT_CLASS}
                                value={form.dob}
                                onChange={v => setForm(prev => ({ ...prev, dob: v }))}
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
                            placeholder="e.g. T12 AB34"
                            className={`${INPUT_CLASS} uppercase`}
                            value={form.eircode}
                            onChange={e => setForm(prev => ({ ...prev, eircode: e.target.value.toUpperCase() }))}
                            onBlur={() => {
                                setEircodeTouched(true);
                                setForm(prev => ({ ...prev, eircode: formatEircode(prev.eircode.trim()) }));
                            }}
                            aria-describedby="student-eircode-hint"
                        />
                        <p id="student-eircode-hint" className={eircodeLooksOff ? 'mt-1.5 text-xs text-status-requested' : hintCls}>
                            {eircodeLooksOff ? 'Eircodes have 7 letters and numbers, like T12 AB34. Check it before saving.' : '7 letters and numbers, like T12 AB34'}
                        </p>
                    </div>

                    {!isEditing && onSaveAndEnroll && (
                        <p className="text-xs text-muted flex items-start gap-1.5">
                            <Info size={13} className="shrink-0 mt-px" />
                            <span><strong className="font-semibold text-primary">Save and enroll</strong> adds the student, then lets you choose their course straight away.</span>
                        </p>
                    )}
                </form>
            <ConfirmDialog
                open={confirmDiscard}
                title="Discard changes?"
                message="What you typed for this student will be lost."
                confirmLabel="Discard"
                variant="warning"
                onConfirm={() => { setConfirmDiscard(false); onClose(); }}
                onCancel={() => setConfirmDiscard(false)}
            />
        </Modal>
    );
}

import { useState, useEffect, useMemo, useCallback } from 'react';

import { User, AlertTriangle } from 'lucide-react';
import { StudentFormData, StudentPayload, toStudentPayload } from '../lib/types';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/dateUtils';
import { normalizePhone } from '../lib/contactUtils';
import Modal, { FormError } from './ui/Modal';
import { Button } from './ui/Button';
import { calloutCls, fieldCls, labelCls } from './ui/styles';
import { DateInput } from './ui/DatePicker';

interface Props {
    open: boolean;
    student: StudentFormData | null;
    onSave: (data: StudentPayload) => Promise<void>;
    onClose: () => void;
}

const EMPTY_FORM: StudentFormData = { first_name: '', last_name: '', email: '', phone: '', address: '', eircode: '', dob: '' };

const INPUT_CLASS = fieldCls;
const LABEL_CLASS = labelCls;

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

    const isEditing = !!student?.id;
    const update = (field: keyof StudentFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    return (
        <Modal
            open={open}
            onClose={requestClose}
            title={isEditing ? 'Edit Student' : 'Add Student'}
            icon={User}
            labelId="student-modal-title"
            size="lg"
            zIndex="z-[60]"
            sheetOnMobile
            dismissible={!saving}
            footer={
                <>
                    <Button variant="ghost" onClick={requestClose}>Cancel</Button>
                    <Button variant="primary" type="submit" form="student-form" loading={saving}>
                        {saving ? 'Saving...' : isEditing ? 'Update Student' : 'Add Student'}
                    </Button>
                </>
            }
        >
                <form id="student-form" onSubmit={handleSubmit} className="space-y-4">
                    {error && <FormError>{error}</FormError>}

                    {duplicateWarning && (
                        <div className={`${calloutCls.warning} text-sm px-3.5 py-2.5 flex items-center gap-2.5 animate-slideDown`}>
                            <AlertTriangle size={16} className="flex-shrink-0 text-status-requested" />
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
                            className={`${INPUT_CLASS} uppercase`}
                            value={form.eircode}
                            onChange={update('eircode')}
                        />
                    </div>

                </form>
        </Modal>
    );
}

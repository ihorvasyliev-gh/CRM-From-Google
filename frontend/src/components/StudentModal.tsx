import { useState, useEffect } from 'react';

import { X, Loader2, User } from 'lucide-react';
import { StudentFormData } from '../lib/types';

interface Props {
    open: boolean;
    student: StudentFormData | null;
    onSave: (data: StudentFormData) => Promise<void>;
    onClose: () => void;
}

export default function StudentModal({ open, student, onSave, onClose }: Props) {
    const [form, setForm] = useState<StudentFormData>({
        first_name: '', last_name: '', email: '', phone: '', address: '', eircode: '', dob: ''
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm(student || { first_name: '', last_name: '', email: '', phone: '', address: '', eircode: '', dob: '' });
            setError('');
        }
    }, [open, student]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.first_name.trim() || !form.last_name.trim()) {
            setError('First and last name are required');
            return;
        }
        setSaving(true);
        setError('');
        try {
            // Clean up exact formats before saving
            const formattedEmail = form.email.trim().toLowerCase();

            let formattedPhone = form.phone.replace(/[^\d+]/g, '');
            if (formattedPhone) {
                if (formattedPhone.startsWith('00')) {
                    formattedPhone = '+' + formattedPhone.substring(2);
                } else if (!formattedPhone.startsWith('+')) {
                    if (formattedPhone.startsWith('353') || formattedPhone.startsWith('380') || formattedPhone.startsWith('44')) {
                        formattedPhone = '+' + formattedPhone;
                    } else if (formattedPhone.startsWith('8') && formattedPhone.length === 9) {
                        formattedPhone = '+353' + formattedPhone;
                    } else if (formattedPhone.startsWith('08')) {
                        formattedPhone = '+353' + formattedPhone.substring(1);
                    } else if (formattedPhone.startsWith('07') && formattedPhone.length === 11) {
                        formattedPhone = '+44' + formattedPhone.substring(1);
                    } else {
                        const uaCodes = ['050', '066', '095', '099', '067', '068', '096', '097', '098', '063', '073', '093', '091', '092', '094'];
                        let isUa = false;
                        for (const code of uaCodes) {
                            if (formattedPhone.startsWith(code) && formattedPhone.length === 10) {
                                formattedPhone = '+38' + formattedPhone;
                                isUa = true;
                                break;
                            }
                        }
                        if (!isUa) {
                            if (formattedPhone.startsWith('0')) {
                                formattedPhone = '+353' + formattedPhone.substring(1);
                            } else if (formattedPhone.length >= 10) {
                                formattedPhone = '+' + formattedPhone;
                            }
                        }
                    }
                }
            }

            await onSave({
                ...form,
                email: formattedEmail,
                phone: formattedPhone
            });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    const isEditing = !!student?.id;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-surface-elevated rounded-2xl shadow-2xl animate-scaleIn overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border-subtle bg-surface-elevated">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-brand-50 rounded-xl text-brand-600">
                                <User size={18} />
                            </div>
                            <h2 className="text-lg font-bold text-primary">{isEditing ? 'Edit Student' : 'Add Student'}</h2>
                        </div>
                        <button onClick={onClose} className="p-2 text-muted hover:text-muted hover:bg-surface-elevated rounded-lg transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl animate-slideDown">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">First Name *</label>
                            <input
                                type="text"
                                className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated"
                                value={form.first_name}
                                onChange={e => setForm({ ...form, first_name: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Last Name *</label>
                            <input
                                type="text"
                                className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated"
                                value={form.last_name}
                                onChange={e => setForm({ ...form, last_name: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Email</label>
                        <input
                            type="email"
                            className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Phone</label>
                            <input
                                type="tel"
                                className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated"
                                value={form.phone}
                                onChange={e => setForm({ ...form, phone: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Date of Birth</label>
                            <input
                                type="date"
                                className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated"
                                value={form.dob}
                                onChange={e => setForm({ ...form, dob: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Address</label>
                        <input
                            type="text"
                            className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated"
                            value={form.address}
                            onChange={e => setForm({ ...form, address: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Eircode</label>
                        <input
                            type="text"
                            className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated"
                            value={form.eircode}
                            onChange={e => setForm({ ...form, eircode: e.target.value })}
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
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

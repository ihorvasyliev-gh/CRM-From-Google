import { useState, useEffect } from 'react';

import { X, Loader2, User } from 'lucide-react';

export interface StudentFormData {
    id?: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    eircode: string;
    dob: string;
}

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
            await onSave(form);
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
            <div className="absolute inset-0 bg-surface-950/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-scaleIn overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-surface-100 bg-gradient-to-r from-surface-50 to-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-brand-50 rounded-xl text-brand-600">
                                <User size={18} />
                            </div>
                            <h2 className="text-lg font-bold text-surface-900">{isEditing ? 'Edit Student' : 'Add Student'}</h2>
                        </div>
                        <button onClick={onClose} className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-all">
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
                            <label className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5 block">First Name *</label>
                            <input
                                type="text"
                                className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-white"
                                value={form.first_name}
                                onChange={e => setForm({ ...form, first_name: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5 block">Last Name *</label>
                            <input
                                type="text"
                                className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-white"
                                value={form.last_name}
                                onChange={e => setForm({ ...form, last_name: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5 block">Email</label>
                        <input
                            type="email"
                            className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-white"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5 block">Phone</label>
                            <input
                                type="tel"
                                className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-white"
                                value={form.phone}
                                onChange={e => setForm({ ...form, phone: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5 block">Date of Birth</label>
                            <input
                                type="date"
                                className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-white"
                                value={form.dob}
                                onChange={e => setForm({ ...form, dob: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5 block">Address</label>
                        <input
                            type="text"
                            className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-white"
                            value={form.address}
                            onChange={e => setForm({ ...form, address: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5 block">Eircode</label>
                        <input
                            type="text"
                            className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-white"
                            value={form.eircode}
                            onChange={e => setForm({ ...form, eircode: e.target.value })}
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
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

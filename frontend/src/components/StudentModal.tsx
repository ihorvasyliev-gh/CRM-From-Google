import { useState, useEffect, FormEvent } from 'react';
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

interface StudentModalProps {
    open: boolean;
    student: StudentFormData | null; // null = create mode
    onSave: (data: StudentFormData) => Promise<void>;
    onClose: () => void;
}

const EMPTY: StudentFormData = {
    first_name: '', last_name: '', email: '', phone: '', address: '', eircode: '', dob: ''
};

export default function StudentModal({ open, student, onSave, onClose }: StudentModalProps) {
    const [form, setForm] = useState<StudentFormData>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const isEdit = !!student?.id;

    useEffect(() => {
        if (open) {
            setForm(student || EMPTY);
            setError('');
        }
    }, [open, student]);

    if (!open) return null;

    function set(field: keyof StudentFormData, value: string) {
        setForm(prev => ({ ...prev, [field]: value }));
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');

        if (!form.email.trim()) {
            setError('Email is required');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
            setError('Invalid email format');
            return;
        }
        if (!form.first_name.trim()) {
            setError('First name is required');
            return;
        }

        setSaving(true);
        try {
            await onSave({ ...form, email: form.email.trim().toLowerCase() });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    }

    const fields: { key: keyof StudentFormData; label: string; type: string; required?: boolean; placeholder?: string }[] = [
        { key: 'first_name', label: 'First Name', type: 'text', required: true, placeholder: 'John' },
        { key: 'last_name', label: 'Last Name', type: 'text', placeholder: 'Doe' },
        { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'john@example.com' },
        { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+353 ...' },
        { key: 'address', label: 'Address', type: 'text', placeholder: '123 Main St, Cork' },
        { key: 'eircode', label: 'Eircode', type: 'text', placeholder: 'T12 AB34' },
        { key: 'dob', label: 'Date of Birth', type: 'date' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 animate-fadeIn" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-scaleIn max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 rounded-t-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                            <User size={20} />
                        </div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            {isEdit ? 'Edit Student' : 'Add Student'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {fields.map(f => (
                            <div key={f.key} className={f.key === 'address' ? 'sm:col-span-2' : ''}>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    {f.label} {f.required && <span className="text-red-400">*</span>}
                                </label>
                                <input
                                    type={f.type}
                                    value={form[f.key] || ''}
                                    onChange={e => set(f.key, e.target.value)}
                                    placeholder={f.placeholder}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                />
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving && <Loader2 size={16} className="animate-spin" />}
                            {isEdit ? 'Save Changes' : 'Add Student'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

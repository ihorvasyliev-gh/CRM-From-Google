import { useState, useEffect, FormEvent } from 'react';
import { X, Loader2, BookOpen } from 'lucide-react';

interface CourseFormData {
    id?: string;
    name: string;
}

interface CourseModalProps {
    open: boolean;
    course: CourseFormData | null;
    onSave: (data: CourseFormData) => Promise<void>;
    onClose: () => void;
}

export default function CourseModal({ open, course, onSave, onClose }: CourseModalProps) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const isEdit = !!course?.id;

    useEffect(() => {
        if (open) {
            setName(course?.name || '');
            setError('');
        }
    }, [open, course]);

    if (!open) return null;

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError('Course name is required');
            return;
        }

        setSaving(true);
        try {
            await onSave({ id: course?.id, name: name.trim() });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 animate-fadeIn" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-scaleIn">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                            <BookOpen size={20} />
                        </div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            {isEdit ? 'Edit Course' : 'Add Course'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Course Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Security, ESOL, Barista"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            autoFocus
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
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
                            {isEdit ? 'Save Changes' : 'Add Course'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

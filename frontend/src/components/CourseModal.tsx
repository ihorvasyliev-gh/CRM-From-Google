import { useState, useEffect } from 'react';
import { X, Loader2, BookOpen } from 'lucide-react';

interface Course {
    id: string;
    name: string;
}

interface Props {
    open: boolean;
    course: Course | null;
    onSave: (data: { id?: string; name: string }) => Promise<void>;
    onClose: () => void;
}

export default function CourseModal({ open, course, onSave, onClose }: Props) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setName(course?.name || '');
            setError('');
        }
    }, [open, course]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) {
            setError('Course name is required');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await onSave({ id: course?.id, name: name.trim() });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    const isEditing = !!course?.id;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-surface-elevated rounded-2xl shadow-2xl animate-scaleIn overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border-subtle bg-surface-elevated">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-50 rounded-xl text-violet-600">
                                <BookOpen size={18} />
                            </div>
                            <h2 className="text-lg font-bold text-primary">{isEditing ? 'Edit Course' : 'Add Course'}</h2>
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

                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Course Name *</label>
                        <input
                            type="text"
                            placeholder="e.g. Security, First Aid"
                            className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated placeholder:text-muted"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                            required
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
                            {saving ? 'Saving...' : isEditing ? 'Update Course' : 'Add Course'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

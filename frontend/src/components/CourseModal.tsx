import { useState, useEffect } from 'react';
import { X, Loader2, BookOpen, Users } from 'lucide-react';
import { Course } from '../lib/types';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface Props {
    open: boolean;
    course: Course | null;
    onSave: (data: { id?: string; name: string; requires_english?: boolean; max_capacity?: number | null }) => Promise<void>;
    onClose: () => void;
}

export default function CourseModal({ open, course, onSave, onClose }: Props) {
    const [name, setName] = useState('');
    const [requiresEnglish, setRequiresEnglish] = useState(false);
    const [maxCapacity, setMaxCapacity] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setName(course?.name || '');
            setRequiresEnglish(Boolean(course?.requires_english));
            setMaxCapacity(course?.max_capacity ? String(course.max_capacity) : '');
            setError('');
        }
    }, [open, course]);

    const requestClose = () => {
        if (saving) return;
        const dirty = name.trim() !== (course?.name || '').trim()
            || requiresEnglish !== Boolean(course?.requires_english)
            || maxCapacity.trim() !== (course?.max_capacity ? String(course.max_capacity) : '');
        if (dirty && !window.confirm('Discard unsaved changes?')) return;
        onClose();
    };

    useModalBehavior(open, requestClose);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (saving) return;
        if (!name.trim()) {
            setError('Course name is required');
            return;
        }
        const capacityStr = maxCapacity.trim();
        const capacity = capacityStr === '' ? null : Number(capacityStr);
        if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
            setError('Max participants must be a whole number of at least 1 (or leave empty for unlimited)');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await onSave({ id: course?.id, name: name.trim(), requires_english: requiresEnglish, max_capacity: capacity });
            onClose();
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Failed to save course');
            }
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    const isEditing = !!course?.id;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={requestClose} />
            <div role="dialog" aria-modal="true" aria-labelledby="course-modal-title" className="relative w-full max-w-md bg-surface-elevated rounded-2xl shadow-2xl animate-scaleIn overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border-subtle bg-surface-elevated">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-50 dark:bg-violet-500/10 rounded-xl text-violet-600 dark:text-violet-400">
                                <BookOpen size={18} />
                            </div>
                            <h2 id="course-modal-title" className="text-lg font-bold text-primary">{isEditing ? 'Edit Course' : 'Add Course'}</h2>
                        </div>
                        <button type="button" onClick={requestClose} aria-label="Close" className="p-2 text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-2.5 rounded-xl animate-slideDown">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Course Name *</label>
                        <input
                            type="text"
                            placeholder="e.g. Security, First Aid"
                            className="w-full px-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated placeholder:text-muted"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="course-max-capacity" className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Max Participants per Date</label>
                        <div className="relative">
                            <Users size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                            <input
                                id="course-max-capacity"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                step={1}
                                placeholder="Unlimited"
                                className="w-full pl-10 pr-3.5 py-2.5 bg-surface border border-border-subtle rounded-xl text-sm text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 focus:bg-surface-elevated placeholder:text-muted"
                                value={maxCapacity}
                                onChange={e => setMaxCapacity(e.target.value)}
                            />
                        </div>
                        <p className="text-[11px] text-muted mt-1.5">
                            Once this many people confirm for a date, the confirmation page closes and shows the course as fully booked. Leave empty for no limit.
                        </p>
                    </div>

                    {/* Email Template Type Selection */}
                    <div className="pt-1">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">
                            Invitation Email Template
                        </label>
                        <div className="grid grid-cols-1 gap-2.5">
                            <button
                                type="button"
                                onClick={() => setRequiresEnglish(false)}
                                aria-pressed={!requiresEnglish}
                                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                                    !requiresEnglish
                                        ? 'bg-emerald-500/10 border-emerald-500/40 text-primary'
                                        : 'bg-surface border-border-subtle text-muted hover:border-border-strong'
                                }`}
                            >
                                <span className="text-lg mt-0.5">🌐</span>
                                <div>
                                    <div className="text-xs font-bold flex items-center gap-1.5">
                                        Standard Course
                                        {!requiresEnglish && <span className="text-[10px] bg-emerald-500/20 text-emerald-500 font-semibold px-1.5 py-0.2 rounded">Selected</span>}
                                    </div>
                                    <div className="text-[11px] text-muted mt-0.5">
                                        Standard invitation letter with [Confirm My Place] button.
                                    </div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setRequiresEnglish(true)}
                                aria-pressed={requiresEnglish}
                                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                                    requiresEnglish
                                        ? 'bg-blue-500/10 border-blue-500/40 text-primary'
                                        : 'bg-surface border-border-subtle text-muted hover:border-border-strong'
                                }`}
                            >
                                <span className="text-lg mt-0.5">🇬🇧</span>
                                <div>
                                    <div className="text-xs font-bold flex items-center gap-1.5">
                                        High English Required
                                        {requiresEnglish && <span className="text-[10px] bg-blue-500/20 text-blue-400 font-semibold px-1.5 py-0.2 rounded">Selected</span>}
                                    </div>
                                    <div className="text-[11px] text-muted mt-0.5">
                                        Includes English warning notes &amp; [I Am Confident in English — Confirm My Place] button.
                                    </div>
                                </div>
                            </button>
                        </div>
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
                            {saving ? 'Saving...' : isEditing ? 'Update Course' : 'Add Course'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

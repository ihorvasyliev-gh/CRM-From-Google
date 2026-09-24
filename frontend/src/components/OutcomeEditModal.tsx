import { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';

/** Survey answer as stored for a graduate or an outreach list contact. */
export interface OutcomeValues {
    tracking_status: 'not_contacted' | 'pending' | 'responded';
    is_working: boolean | null;
    started_month: string | null;
    field_of_work: string | null;
    employment_type: string | null;
}

interface OutcomeEditModalProps {
    isOpen: boolean;
    person: (OutcomeValues & { first_name: string; last_name: string }) | null;
    onClose: () => void;
    onSaved: () => void;
    /** Persist the values. Answer fields are already null when not responded / not working. */
    onSave: (values: OutcomeValues) => Promise<void>;
    /** Optional "remove" action shown in the footer (e.g. remove a contact from a list). */
    onDelete?: () => Promise<void>;
    deleteLabel?: string;
}

export default function OutcomeEditModal({ isOpen, person: graduate, onClose, onSaved, onSave, onDelete, deleteLabel = 'Remove' }: OutcomeEditModalProps) {
    const [trackingStatus, setTrackingStatus] = useState<'not_contacted' | 'pending' | 'responded'>('not_contacted');
    const [isWorking, setIsWorking] = useState<boolean | null>(null);
    const [startedMonth, setStartedMonth] = useState('');
    const [fieldOfWork, setFieldOfWork] = useState('');
    const [employmentType, setEmploymentType] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Load initial data when graduate changes
    useEffect(() => {
        if (graduate) {
            setTrackingStatus(graduate.tracking_status);
            setIsWorking(graduate.is_working);
            setStartedMonth(graduate.started_month || '');
            setFieldOfWork(graduate.field_of_work || '');
            setEmploymentType(graduate.employment_type || '');
            setError('');
        }
    }, [graduate, isOpen]);

    useModalBehavior(isOpen && !!graduate, onClose, { closeOnEscape: !saving });

    if (!isOpen || !graduate) return null;

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError('');

        const responded = trackingStatus === 'responded';
        const working = responded && isWorking === true;
        try {
            await onSave({
                tracking_status: trackingStatus,
                is_working: responded ? isWorking : null,
                started_month: working ? (startedMonth || null) : null,
                field_of_work: working ? (fieldOfWork || null) : null,
                employment_type: working ? (employmentType || null) : null,
            });

            onSaved();
            onClose();
        } catch (err: any) {
            console.error('Save error:', err);
            setError(err.message || 'Failed to update outcomes.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!onDelete || !window.confirm(`${deleteLabel}: ${graduate!.first_name} ${graduate!.last_name}?`)) return;
        setSaving(true);
        setError('');
        try {
            await onDelete();
            onClose();
        } catch (err: any) {
            console.error('Delete error:', err);
            setError(err.message || 'Failed to remove.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
                onClick={!saving ? onClose : undefined}
            />
            
            <div className="bg-surface-elevated rounded-2xl shadow-2xl shadow-black/40 border border-border-strong w-full max-w-lg relative z-10 animate-scaleIn overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-primary">Edit Employment Status</h2>
                        <p className="text-xs text-muted mt-1">
                            Updating records for <span className="font-semibold text-brand-400">{graduate.first_name} {graduate.last_name}</span>
                        </p>
                    </div>
                    <button 
                        onClick={onClose}
                        disabled={saving}
                        className="text-muted hover:text-primary transition-colors p-2 rounded-xl hover:bg-surface disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-5 overflow-y-auto custom-scrollbar">
                    <form id="edit-outcome-form" onSubmit={handleSave} className="space-y-5">
                        {/* Tracking Status */}
                        <div>
                            <label className="block text-xs font-semibold text-muted mb-2 uppercase tracking-wider">
                                Tracking Status
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTrackingStatus('not_contacted')}
                                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                                        trackingStatus === 'not_contacted'
                                            ? 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40 shadow-sm'
                                            : 'bg-background text-muted border-border-strong hover:border-border-subtle hover:text-primary'
                                    }`}
                                >
                                    Not Contacted
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTrackingStatus('pending')}
                                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                                        trackingStatus === 'pending'
                                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-sm'
                                            : 'bg-background text-muted border-border-strong hover:border-border-subtle hover:text-primary'
                                    }`}
                                >
                                    Pending
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTrackingStatus('responded')}
                                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                                        trackingStatus === 'responded'
                                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                                            : 'bg-background text-muted border-border-strong hover:border-border-subtle hover:text-primary'
                                    }`}
                                >
                                    Responded
                                </button>
                            </div>
                        </div>

                        {/* Employment Details if Responded */}
                        {trackingStatus === 'responded' && (
                            <div className="space-y-4 pt-4 border-t border-border-subtle animate-fadeIn">
                                <div>
                                    <label className="block text-xs font-semibold text-muted mb-3 uppercase tracking-wider">
                                        Is the person working?
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsWorking(true)}
                                            className={`flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-sm font-semibold border transition-all ${
                                                isWorking === true
                                                    ? 'bg-brand-500/20 text-brand-400 border-brand-500/40 shadow-sm'
                                                    : 'bg-background text-muted border-border-strong hover:border-border-subtle'
                                    }`}
                                        >
                                            Yes
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsWorking(false)}
                                            className={`flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-sm font-semibold border transition-all ${
                                                isWorking === false
                                                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/40 shadow-sm'
                                                    : 'bg-background text-muted border-border-strong hover:border-border-subtle'
                                    }`}
                                        >
                                            No
                                        </button>
                                    </div>
                                </div>

                                {isWorking === true && (
                                    <div className="space-y-4 animate-fadeIn">
                                        <div>
                                            <label className="block text-xs font-semibold text-muted mb-2 uppercase tracking-wider">
                                                Started Month
                                            </label>
                                            <input
                                                type="month"
                                                value={startedMonth}
                                                onChange={(e) => setStartedMonth(e.target.value)}
                                                className="w-full bg-background text-primary text-sm rounded-xl border border-border-strong px-4 py-2.5 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 transition-all font-medium [color-scheme:dark]"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-muted mb-2 uppercase tracking-wider">
                                                Field / Sector
                                            </label>
                                            <input
                                                type="text"
                                                value={fieldOfWork}
                                                onChange={(e) => setFieldOfWork(e.target.value)}
                                                placeholder="e.g. IT, Hospitality, Healthcare..."
                                                className="w-full bg-background text-primary text-sm rounded-xl border border-border-strong px-4 py-2.5 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 transition-all font-medium placeholder:text-muted/40"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-muted mb-3 uppercase tracking-wider">
                                                Employment Type
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setEmploymentType('full_time')}
                                                    className={`py-2 px-4 rounded-xl text-sm font-semibold border transition-all ${
                                                        employmentType === 'full_time'
                                                            ? 'bg-violet-500/20 text-violet-400 border-violet-500/40 shadow-sm'
                                                            : 'bg-background text-muted border-border-strong hover:border-border-subtle'
                                                    }`}
                                                >
                                                    Full-time
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEmploymentType('part_time')}
                                                    className={`py-2 px-4 rounded-xl text-sm font-semibold border transition-all ${
                                                        employmentType === 'part_time'
                                                            ? 'bg-violet-500/20 text-violet-400 border-violet-500/40 shadow-sm'
                                                            : 'bg-background text-muted border-border-strong hover:border-border-subtle'
                                                    }`}
                                                >
                                                    Part-time
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-3 animate-fadeIn">
                                <AlertCircle size={16} className="shrink-0" />
                                <p>{error}</p>
                            </div>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-border-subtle bg-surface/50 flex justify-end gap-3 shrink-0">
                    {onDelete && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={saving}
                            className="mr-auto px-3 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-500/10 flex items-center gap-1.5 transition-all disabled:opacity-50"
                        >
                            <Trash2 size={15} /> {deleteLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-primary hover:bg-surface border border-transparent transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="edit-outcome-form"
                        disabled={saving || (trackingStatus === 'responded' && isWorking === null)}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 active:bg-brand-700 shadow-sm shadow-brand-500/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <><Loader2 size={16} className="animate-spin" /> Saving...</>
                        ) : (
                            <><Save size={16} /> Save Changes</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

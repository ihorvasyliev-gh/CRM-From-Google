import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, AlertCircle, Loader2 } from 'lucide-react';
import type { GraduateRow } from './OutcomesList';

interface OutcomeEditModalProps {
    isOpen: boolean;
    graduate: GraduateRow | null;
    onClose: () => void;
    onSaved: () => void;
}

export default function OutcomeEditModal({ isOpen, graduate, onClose, onSaved }: OutcomeEditModalProps) {
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

    if (!isOpen || !graduate) return null;

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            if (trackingStatus === 'not_contacted') {
                // Remove the employment_status record completely
                const { error: delErr } = await supabase
                    .from('employment_status')
                    .delete()
                    .eq('student_id', graduate!.student_id);
                if (delErr) throw delErr;
            } else {
                // Upsert with new values
                const updatePayload = {
                    student_id: graduate!.student_id,
                    email: graduate!.email,
                    status: trackingStatus === 'responded' ? 'responded' : 'pending',
                    is_working: trackingStatus === 'responded' ? isWorking : null,
                    started_month: (trackingStatus === 'responded' && isWorking) ? (startedMonth || null) : null,
                    field_of_work: (trackingStatus === 'responded' && isWorking) ? (fieldOfWork || null) : null,
                    employment_type: (trackingStatus === 'responded' && isWorking) ? (employmentType || null) : null,
                    // If marking as responded, set last_responded_at
                    ...(trackingStatus === 'responded' 
                        ? { last_responded_at: new Date().toISOString() } 
                        : {})
                };

                const { error: upsertErr } = await supabase
                    .from('employment_status')
                    .upsert(updatePayload, { onConflict: 'student_id' });
                
                if (upsertErr) throw upsertErr;
            }

            onSaved();
            onClose();
        } catch (err: any) {
            console.error('Save error:', err);
            setError(err.message || 'Failed to update outcomes.');
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
                                        Is the graduate working?
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

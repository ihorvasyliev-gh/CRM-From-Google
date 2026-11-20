import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { staffNameOf } from '../lib/documentUtils';
import { errorMessage } from '../lib/errors';
import { showToast } from '../lib/toast';
import { Button } from './ui/Button';
import { fieldCls } from './ui/styles';

export interface StaffNameFieldProps {
    /** When true, drops outer padding so the field embeds cleanly inside a parent Card body. */
    embedded?: boolean;
}

/**
 * The signed-in person's own name, kept on their account (user_metadata.full_name).
 * Documents print it as {staffName}, e.g. "LDC Staff Member" on the SICAP course form,
 * and PDF forms as {user}.
 */
export default function StaffNameField({ embedded = false }: StaffNameFieldProps) {
    const { user } = useAuth();
    const saved = staffNameOf(user);
    const [name, setName] = useState(saved);
    const [saving, setSaving] = useState(false);
    useEffect(() => setName(saved), [saved]);

    const trimmed = name.trim().replace(/\s+/g, ' ');
    const changed = trimmed !== saved;

    async function save() {
        if (!changed || saving) return;
        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
            if (error) throw error;
            showToast(trimmed ? `Saved — documents will show ${trimmed}` : 'Name cleared', 'success');
        } catch (err) {
            showToast(`Could not save your name: ${errorMessage(err, String(err))}`, 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form
            className={embedded ? 'space-y-3' : 'px-4 sm:px-5 py-4 space-y-3'}
            onSubmit={e => { e.preventDefault(); void save(); }}
        >
            <div>
                <label htmlFor="staff-name" className="block text-[13px] font-semibold text-primary">
                    Your name on documents
                </label>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">
                    Printed as <code className="font-mono text-primary">{'{staffName}'}</code> in Word documents (e.g. “LDC Staff Member” on the SICAP course form) and <code className="font-mono text-primary">{'{user}'}</code> on PDF forms.
                </p>
            </div>

            <div className="flex items-center gap-2 max-w-md">
                <input
                    id="staff-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={user?.email ? `e.g. your full name (${user.email})` : 'Your full name'}
                    maxLength={120}
                    autoComplete="name"
                    className={`${fieldCls} flex-1 min-w-0`}
                />
                <Button type="submit" variant="primary" size="sm" disabled={!changed} loading={saving}>
                    Save
                </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted pt-0.5">
                <span className="inline-flex items-center gap-1.5">
                    <FileText size={13} className="text-muted/80 shrink-0" aria-hidden="true" />
                    <span>Word &amp; PDF preview:</span>
                </span>
                {trimmed ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20 font-medium max-w-full">
                        <span className="truncate">{trimmed}</span>
                        {changed && (
                            <span className="text-[11px] font-normal text-muted shrink-0">(unsaved)</span>
                        )}
                    </span>
                ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-elevated text-muted border border-border-subtle italic">
                        Not set — left blank on forms
                    </span>
                )}
            </div>
        </form>
    );
}

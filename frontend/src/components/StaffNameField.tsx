import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { staffNameOf } from '../lib/documentUtils';
import { errorMessage } from '../lib/errors';
import { showToast } from '../lib/toast';
import { Button } from './ui/Button';
import { fieldCls } from './ui/styles';

/**
 * The signed-in person's own name, kept on their account (user_metadata.full_name).
 * Documents print it as {staffName}, e.g. "LDC Staff Member" on the SICAP course form,
 * and PDF forms as {user}.
 */
export default function StaffNameField() {
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
            className="px-4 sm:px-5 py-4"
            onSubmit={e => { e.preventDefault(); void save(); }}
        >
            <label htmlFor="staff-name" className="block text-[13px] font-semibold text-primary">Your name</label>
            <span className="block text-xs text-muted mt-0.5 mb-3">
                Printed as <code className="font-mono text-primary">{'{staffName}'}</code> in documents, e.g. “LDC Staff Member” on the SICAP course form. Saved to your sign-in, so it follows you to any device.
            </span>
            <div className="flex items-center gap-2 max-w-md">
                <input
                    id="staff-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={user?.email ? `e.g. your full name (signed in as ${user.email})` : 'Your full name'}
                    maxLength={120}
                    autoComplete="name"
                    className={`${fieldCls} flex-1 min-w-0`}
                />
                <Button type="submit" variant="primary" size="sm" disabled={!changed} loading={saving}>Save</Button>
            </div>
        </form>
    );
}

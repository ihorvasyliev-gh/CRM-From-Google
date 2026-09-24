import { useState, type ChangeEvent, type FormEvent } from 'react';
import { UserPlus, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { extractEmail } from '../lib/contactImport';
import Modal from './ui/Modal';
import { Button } from './ui/Button';
import { fieldCls, labelCls } from './ui/styles';

interface OutreachAddContactModalProps {
    listId: string;
    listName: string;
    /** Lower-cased emails already on the list */
    existingEmails: Set<string>;
    onClose: () => void;
    onAdded: (result: { name: string; alreadyOnList: boolean }) => void;
}

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', external_ref: '' };

/** Add one person to an external list by hand (same RPC as the file import, so no duplicates). */
export default function OutreachAddContactModal({ listId, listName, existingEmails, onClose, onAdded }: OutreachAddContactModalProps) {
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const set = (key: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value }));

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const email = extractEmail(form.email.trim());
        if (!email || email !== form.email.trim().toLowerCase()) {
            setError('Please enter a valid email address.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const { error: rpcError } = await supabase.rpc('import_outreach_contacts', {
                p_list_id: listId,
                p_rows: [{ ...form, email }],
            });
            if (rpcError) throw rpcError;
            onAdded({
                name: `${form.first_name} ${form.last_name}`.trim() || email,
                alreadyOnList: existingEmails.has(email),
            });
            onClose();
        } catch (err: any) {
            console.error('Add contact error:', err);
            setError(err.message || 'Could not add the person.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            dismissible={!saving}
            title="Add person"
            subtitle={<>To <span className="font-semibold text-brand-500">{listName}</span></>}
            icon={UserPlus}
            size="md"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="primary" type="submit" form="outreach-add-contact" loading={saving}>
                        {!saving && <UserPlus size={14} />} Add
                    </Button>
                </>
            }
        >
            <form id="outreach-add-contact" onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="oc-first" className={labelCls}>First name</label>
                        <input id="oc-first" autoFocus value={form.first_name} onChange={set('first_name')} className={fieldCls} />
                    </div>
                    <div>
                        <label htmlFor="oc-last" className={labelCls}>Last name</label>
                        <input id="oc-last" value={form.last_name} onChange={set('last_name')} className={fieldCls} />
                    </div>
                </div>
                <div>
                    <label htmlFor="oc-email" className={labelCls}>Email *</label>
                    <input id="oc-email" type="email" required value={form.email} onChange={set('email')} className={fieldCls} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="oc-phone" className={labelCls}>Phone</label>
                        <input id="oc-phone" value={form.phone} onChange={set('phone')} className={fieldCls} />
                    </div>
                    <div>
                        <label htmlFor="oc-ref" className={labelCls}>IRIS ID</label>
                        <input id="oc-ref" value={form.external_ref} onChange={set('external_ref')} className={fieldCls} />
                    </div>
                </div>
                <p className="text-[11px] text-muted">If this email is already on the list, only the name, phone and IRIS ID are refreshed — status and answers are kept.</p>
                {error && (
                    <div role="alert" className="bg-danger/10 border border-danger/25 text-status-rejected text-sm px-4 py-3 rounded-xl flex items-center gap-3">
                        <AlertCircle size={16} className="shrink-0" />
                        <p>{error}</p>
                    </div>
                )}
            </form>
        </Modal>
    );
}

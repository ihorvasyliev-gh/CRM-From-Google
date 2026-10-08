import { useState } from 'react';
import { useLastPresent } from '../../hooks/usePresence';
import { AlertTriangle, Eye, PencilLine, RotateCcw } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { calloutCls, fieldCls, labelCls } from '../ui/styles';
import type { FieldValue, RowValues } from '../../lib/pdfForms/fill';
import type { RowPlan } from '../../lib/pdfForms/plan';
import type { FormField } from '../../lib/pdfForms/types';

interface RowReviewModalProps {
    plan: RowPlan | null;
    /** Values before any manual edit, to show what changed */
    original: RowPlan | null;
    fields: FormField[];
    overrides: RowValues | undefined;
    onChange: (overrides: RowValues) => void;
    onClose: () => void;
    onPreview: (draft: RowValues) => void;
}

/** Check and correct what one form will contain before it is made */
export default function RowReviewModal({ plan: livePlan, original: liveOriginal, fields, overrides = {}, onChange, onClose, onPreview }: RowReviewModalProps) {
    const [draft, setDraft] = useState<RowValues>(overrides);
    const [forRow, setForRow] = useState<number | null>(livePlan?.index ?? null);
    if ((livePlan?.index ?? null) !== forRow) {
        setForRow(livePlan?.index ?? null);
        setDraft(overrides);
    }
    // While it animates out, the dialog keeps showing the row it was for
    const plan = useLastPresent(livePlan);
    const original = useLastPresent(liveOriginal);
    if (!plan || !original) return null;

    const valueOf = (f: FormField): FieldValue => draft[f.id] ?? original.values[f.id];
    const set = (id: string, value: FieldValue) => setDraft(prev => ({ ...prev, [id]: value }));
    const notesFor = (id: string) => (id in draft ? [] : original.notes.filter(n => n.fieldId === id));
    const commit = () => onChange(draft);

    return (
        <Modal
            open={!!livePlan && !!liveOriginal}
            onClose={() => { commit(); onClose(); }}
            title={plan.title}
            subtitle={`Row ${plan.rowNumber} · ${plan.fileName}`}
            icon={PencilLine}
            size="xl"
            footer={
                <>
                    <Button variant="ghost" onClick={() => setDraft({})} disabled={Object.keys(draft).length === 0}>
                        <RotateCcw size={14} /> Undo my changes
                    </Button>
                    <Button onClick={() => { commit(); onPreview(draft); }}>
                        <Eye size={14} /> Preview
                    </Button>
                    <Button variant="primary" onClick={() => { commit(); onClose(); }}>Done</Button>
                </>
            }
        >
            <div className="space-y-4">
                <p className="text-xs text-muted">Changes here apply to this form only and are not saved to the spreadsheet or the template.</p>
                {fields.map(f => {
                    const value = valueOf(f);
                    const notes = notesFor(f.id);
                    const edited = f.id in draft;
                    return (
                        <div key={f.id} className={`rounded-xl border p-3 ${notes.length ? 'border-warning/50 bg-warning/5' : 'border-border-subtle'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`${labelCls.replace('mb-1.5', 'mb-0')} flex-1 min-w-0 truncate`}>{f.name}</span>
                                {edited && (
                                    <button
                                        type="button"
                                        className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                                        onClick={() => setDraft(prev => {
                                            const next = { ...prev };
                                            delete next[f.id];
                                            return next;
                                        })}
                                    >
                                        Use the spreadsheet value
                                    </button>
                                )}
                            </div>
                            {f.kind === 'text' && value.kind === 'text' ? (
                                f.multiline ? (
                                    <textarea value={value.text} onChange={e => set(f.id, { kind: 'text', text: e.target.value })} rows={3} className={`${fieldCls} h-auto py-2 text-xs`} aria-label={f.name} />
                                ) : (
                                    <input value={value.text} onChange={e => set(f.id, { kind: 'text', text: e.target.value })} className={`${fieldCls} text-xs`} aria-label={f.name} />
                                )
                            ) : f.kind === 'choice' && value.kind === 'choice' ? (
                                <div className="grid sm:grid-cols-2 gap-x-3 gap-y-1">
                                    {f.options.map(o => {
                                        const on = value.ticked.includes(o.id);
                                        return (
                                            <label key={o.id} className="flex items-start gap-2 text-xs text-primary cursor-pointer py-0.5">
                                                <input
                                                    type={f.single ? 'radio' : 'checkbox'}
                                                    name={`choice-${f.id}`}
                                                    checked={on}
                                                    onChange={() => {
                                                        const ticked = f.single ? (on ? [] : [o.id]) : on ? value.ticked.filter(id => id !== o.id) : [...value.ticked, o.id];
                                                        set(f.id, { kind: 'choice', ticked });
                                                    }}
                                                    onClick={() => {
                                                        // Radios can't be unticked by clicking; let a second click clear a single choice
                                                        if (f.single && on) set(f.id, { kind: 'choice', ticked: [] });
                                                    }}
                                                    className="accent-brand-500 mt-0.5"
                                                />
                                                <span className="min-w-0 break-words">{o.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            ) : null}
                            {notes.map(n => (
                                <p key={n.message} className="mt-2 text-[11px] text-status-requested flex items-start gap-1.5">
                                    <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {n.message}
                                </p>
                            ))}
                        </div>
                    );
                })}
                {fields.length === 0 && <div className={`${calloutCls.info} text-sm p-3`}>This template has no fields yet.</div>}
            </div>
        </Modal>
    );
}

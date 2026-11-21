import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { fieldCls, labelCls, panelCls } from '../ui/styles';
import { toast } from '../../lib/toast';
import { readDefaults, saveDefaults, type ChequeReqDefaults } from '../../lib/chequeReq/draft';

export interface DefaultsModalProps {
    open: boolean;
    onClose: () => void;
    defaultsKey?: string;
    /** On admin page, shows note that Settings → Your name is used automatically if blank */
    staffName?: string;
    onSaved?: (defaults: ChequeReqDefaults) => void;
}

const STARTER_PRESETS = [
    '{item} course {date} for IP and TP Clients',
    '{item} training {date} for SICAP Clients',
    '{item} {date}',
];

const TOKENS = [
    { token: '{item}', hint: 'Invoice line item' },
    { token: '{date}', hint: 'Service / course date' },
] as const;

/** Renders a wording preset with {item} and {date} highlighted as pill tokens */
function PresetPreview({ text }: { text: string }) {
    const parts = text.split(/(\{item\}|\{date\})/g);
    return (
        <span className="text-sm text-primary leading-relaxed break-words">
            {parts.map((part, i): ReactNode =>
                part === '{item}' || part === '{date}' ? (
                    <code
                        key={i}
                        className="mx-0.5 px-1.5 py-0.5 rounded-md bg-brand-500/12 text-brand-600 dark:text-brand-400 font-mono text-xs font-semibold"
                    >
                        {part}
                    </code>
                ) : (
                    <span key={i}>{part}</span>
                ),
            )}
        </span>
    );
}

/** Coordinator defaults for new cheque requisitions: action number, names, and reusable wording presets */
export default function DefaultsModal({ open, onClose, defaultsKey, staffName, onSaved }: DefaultsModalProps) {
    const [actionNumber, setActionNumber] = useState('');
    const [requestedBy, setRequestedBy] = useState('');
    const [approvedBy, setApprovedBy] = useState('');
    const [descriptionPattern, setDescriptionPattern] = useState('');
    const [presets, setPresets] = useState<string[]>([]);
    const [draftPreset, setDraftPreset] = useState('');
    const presetInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        const stored = readDefaults(defaultsKey);
        setActionNumber(stored.actionNumber);
        setRequestedBy(stored.requestedBy);
        setApprovedBy(stored.approvedBy ?? '');
        setDescriptionPattern(stored.descriptionPattern);
        setPresets(stored.descriptionPresets ?? []);
        setDraftPreset('');
    }, [open, defaultsKey]);

    const addPreset = (raw: string) => {
        const cleaned = raw.trim();
        if (!cleaned) return;
        setPresets(prev => (prev.some(p => p.toLowerCase() === cleaned.toLowerCase()) ? prev : [...prev, cleaned]));
        setDraftPreset('');
    };

    const removePreset = (index: number) => {
        setPresets(prev => prev.filter((_, i) => i !== index));
    };

    const insertToken = (token: string) => {
        const input = presetInputRef.current;
        if (!input) {
            setDraftPreset(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`);
            return;
        }
        const start = input.selectionStart ?? draftPreset.length;
        const end = input.selectionEnd ?? draftPreset.length;
        const before = draftPreset.slice(0, start);
        const after = draftPreset.slice(end);
        const padLeft = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
        const padRight = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
        const next = `${before}${padLeft}${token}${padRight}${after}`;
        const cursor = before.length + padLeft.length + token.length + padRight.length;
        setDraftPreset(next);
        requestAnimationFrame(() => {
            input.focus();
            input.setSelectionRange(cursor, cursor);
        });
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmedDraft = draftPreset.trim();
        const finalPresets = trimmedDraft && !presets.some(p => p.toLowerCase() === trimmedDraft.toLowerCase())
            ? [...presets, trimmedDraft]
            : presets;

        const next: ChequeReqDefaults = {
            actionNumber: actionNumber.trim(),
            requestedBy: requestedBy.trim(),
            descriptionPattern: descriptionPattern.trim(),
            ...(approvedBy.trim() ? { approvedBy: approvedBy.trim() } : {}),
            ...(finalPresets.length ? { descriptionPresets: finalPresets } : {}),
        };
        saveDefaults(next, defaultsKey);
        const saved = readDefaults(defaultsKey);
        onSaved?.(saved);
        toast.success('Defaults saved');
        onClose();
    };

    const hasStaffHint = staffName !== undefined;
    const trimmedStaff = staffName?.trim() ?? '';
    const unusedStarters = STARTER_PRESETS.filter(s => !presets.some(p => p.toLowerCase() === s.toLowerCase()));

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Requisition defaults"
            subtitle="Prefill new requisitions on this device"
            icon={Settings2}
            size="lg"
            sheetOnMobile
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" form="cheque-req-defaults-form">
                        Save defaults
                    </Button>
                </>
            }
        >
            <form id="cheque-req-defaults-form" onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="cr-default-action" className={labelCls}>
                            Default SICAP action number
                        </label>
                        <input
                            id="cr-default-action"
                            type="text"
                            value={actionNumber}
                            onChange={e => setActionNumber(e.target.value)}
                            placeholder="e.g. 9."
                            className={fieldCls}
                        />
                        <p className="mt-1 text-xs text-muted">Used when a supplier doesn’t have a previous requisition.</p>
                    </div>

                    <div>
                        <label htmlFor="cr-default-requested-by" className={labelCls}>
                            Default Requested by
                        </label>
                        <input
                            id="cr-default-requested-by"
                            type="text"
                            value={requestedBy}
                            onChange={e => setRequestedBy(e.target.value)}
                            placeholder={trimmedStaff || (hasStaffHint ? 'Uses Settings → Your name' : 'Your name')}
                            className={fieldCls}
                        />
                        <p className="mt-1 text-xs text-muted">
                            {hasStaffHint
                                ? trimmedStaff
                                    ? `Leave blank to use “${trimmedStaff}” automatically from Settings → Your name.`
                                    : 'Leave blank to use Settings → Your name automatically.'
                                : 'Saved only in this browser for your next requisition.'}
                        </p>
                    </div>
                </div>

                <div>
                    <label htmlFor="cr-default-approved-by" className={labelCls}>
                        Default Approved by
                    </label>
                    <input
                        id="cr-default-approved-by"
                        type="text"
                        value={approvedBy}
                        onChange={e => setApprovedBy(e.target.value)}
                        placeholder="Optional — leave blank to sign by hand"
                        className={fieldCls}
                    />
                    <p className="mt-1 text-xs text-muted">Optional. Leave blank if approvers sign the printed form by hand.</p>
                </div>

                <div className="pt-4 border-t border-border-subtle space-y-3">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <label htmlFor="cr-default-preset-input" className={`${labelCls} mb-0.5`}>
                                Description wording presets
                            </label>
                            <p className="text-xs text-muted">
                                One-click templates shown under the description box. Use <code className="font-mono text-primary">{'{item}'}</code> and{' '}
                                <code className="font-mono text-primary">{'{date}'}</code> to insert the invoice line and date.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <input
                            ref={presetInputRef}
                            id="cr-default-preset-input"
                            type="text"
                            value={draftPreset}
                            onChange={e => setDraftPreset(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addPreset(draftPreset);
                                }
                            }}
                            placeholder="e.g. {item} course {date} for IP and TP Clients"
                            className={fieldCls}
                        />
                        <Button
                            variant="secondary"
                            onClick={() => addPreset(draftPreset)}
                            disabled={!draftPreset.trim()}
                            className="shrink-0"
                        >
                            <Plus size={14} /> Add
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted mr-0.5">Insert token:</span>
                        {TOKENS.map(({ token, hint }) => (
                            <button
                                key={token}
                                type="button"
                                onClick={() => insertToken(token)}
                                title={`Insert ${token} (${hint})`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-semibold bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20 hover:bg-brand-500/15 transition-colors"
                            >
                                <Plus size={11} />
                                {token}
                                <span className="font-sans font-normal text-muted ml-0.5">· {hint}</span>
                            </button>
                        ))}
                    </div>

                    {presets.length > 0 ? (
                        <ul className="space-y-1.5">
                            {presets.map((preset, index) => (
                                <li
                                    key={`${preset}-${index}`}
                                    className={`${panelCls} px-3 py-2 flex items-center justify-between gap-2`}
                                >
                                    <PresetPreview text={preset} />
                                    <button
                                        type="button"
                                        onClick={() => removePreset(index)}
                                        aria-label={`Remove preset: ${preset}`}
                                        className="p-1.5 rounded-lg text-muted hover:text-status-rejected hover:bg-danger/10 transition-colors shrink-0"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className={`${panelCls} p-3 text-xs text-muted`}>
                            No custom presets yet. Add one above or pick a starter below.
                        </div>
                    )}

                    {unusedStarters.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-xs text-muted flex items-center gap-1">
                                <Sparkles size={12} className="text-brand-500" /> Quick starters:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {unusedStarters.map(starter => (
                                    <button
                                        key={starter}
                                        type="button"
                                        onClick={() => addPreset(starter)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-primary bg-surface border border-border-subtle hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors text-left"
                                    >
                                        <Plus size={12} className="text-brand-500 shrink-0" />
                                        <span>{starter}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {descriptionPattern && (
                    <div className="pt-3 border-t border-border-subtle flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                            <span className="text-muted">Auto-learnt wording from your last download: </span>
                            <span className="font-medium text-primary break-words">{descriptionPattern}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setDescriptionPattern('')}
                            className="inline-flex items-center gap-1 text-muted hover:text-status-rejected shrink-0 font-semibold"
                        >
                            <X size={12} /> Clear
                        </button>
                    </div>
                )}
            </form>
        </Modal>
    );
}

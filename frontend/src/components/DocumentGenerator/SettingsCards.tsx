import { useState } from 'react';
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, Check, Info, Pencil, Plus, Table2, Trash2, Users, Variable, X } from 'lucide-react';
import Card from '../ui/Card';
import { Button, IconButton } from '../ui/Button';
import { calloutCls, fieldCls } from '../ui/styles';
import { errorText, type ConfirmDelete, type ShowToast } from './helpers';
import type { DocumentSetup } from './useDocumentSetup';
import { PLACEHOLDER_CATEGORIES, PLACEHOLDER_KEYS, validateVariableKey } from '../../lib/documentUtils';
import type { ExcelColumn } from '../../lib/appConfig';
import type { TemplateVariable } from '../../lib/types';

interface CardProps {
    setup: DocumentSetup;
    showToast: ShowToast;
    confirmDelete: ConfirmDelete;
}

export function CustomVariablesCard({ setup, showToast, confirmDelete }: CardProps) {
    const { customVars } = setup;
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');

    function add() {
        const key = newKey.trim().replace(/^\{+|\}+$/g, '');
        const invalid = validateVariableKey(key);
        if (invalid) { showToast(invalid, 'error'); return; }
        if (customVars.some(v => v.var_key === key)) { showToast(`{${key}} already exists — edit its value instead`, 'error'); return; }

        setup.addVariable.mutate({ key, value: newValue.trim() }, {
            onSuccess: () => {
                setNewKey('');
                setNewValue('');
                if (PLACEHOLDER_KEYS.has(key)) showToast(`{${key}} added — it replaces the built-in {${key}} in every document`, 'info');
                else showToast(`Variable {${key}} added`, 'success');
            },
            onError: err => showToast(`Failed to add variable: ${errorText(err)}`, 'error'),
        });
    }

    function save(variable: TemplateVariable) {
        setup.updateVariable.mutate({ variable, value: editingValue }, {
            onSuccess: () => { setEditingId(null); showToast(`Variable {${variable.var_key}} updated`, 'success'); },
            onError: err => showToast(`Update failed: ${errorText(err)}`, 'error'),
        });
    }

    const startEditing = (v: TemplateVariable) => { setEditingId(v.id); setEditingValue(v.var_value); };

    return (
        <Card title="Custom variables" subtitle={<>Values substituted into every template, e.g. {'{Tutor}'}, {'{venue}'}</>} icon={Variable} tone="success">
            <div className="space-y-3">
                {customVars.length > 0 ? (
                    <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                        {customVars.map(v => (
                            <li key={v.id} className="flex items-center gap-2.5 px-3 py-2">
                                <code className="text-status-confirmed bg-success/10 px-1.5 py-0.5 rounded-sm font-mono text-xs shrink-0">{`{${v.var_key}}`}</code>
                                {editingId === v.id ? (
                                    <div className="flex items-center gap-1 flex-1 min-w-0">
                                        <input
                                            type="text"
                                            value={editingValue}
                                            onChange={e => setEditingValue(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') save(v);
                                                if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                                            }}
                                            aria-label={`Value of ${v.var_key}`}
                                            className={`${fieldCls} h-8! flex-1 min-w-0`}
                                            autoFocus
                                        />
                                        <IconButton size="sm" tone="brand" label="Save" onClick={() => save(v)} disabled={setup.updateVariable.isPending}>
                                            <Check size={14} />
                                        </IconButton>
                                        <IconButton size="sm" label="Cancel" onClick={() => setEditingId(null)}>
                                            <X size={14} />
                                        </IconButton>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            className="flex-1 min-w-0 text-left text-[13px] text-primary truncate hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                            onClick={() => startEditing(v)}
                                            title="Click to edit"
                                        >
                                            {v.var_value || <em className="text-muted">empty — click to set</em>}
                                        </button>
                                        <IconButton size="sm" tone="brand" label="Edit value" onClick={() => startEditing(v)}>
                                            <Pencil size={13} />
                                        </IconButton>
                                        <IconButton
                                            size="sm"
                                            tone="danger"
                                            label="Delete variable"
                                            onClick={() => confirmDelete({
                                                title: 'Delete Variable',
                                                message: `Delete variable {${v.var_key}}? Templates using it will render it empty.`,
                                                run: () => setup.removeVariable.mutateAsync(v).then(
                                                    () => showToast(`Variable {${v.var_key}} deleted`, 'success'),
                                                    err => showToast(`Delete failed: ${errorText(err)}`, 'error'),
                                                ),
                                            })}
                                        >
                                            <Trash2 size={14} />
                                        </IconButton>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-xs text-muted flex items-center gap-1.5"><Info size={13} /> No custom variables defined yet</p>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="text"
                        value={newKey}
                        onChange={e => setNewKey(e.target.value)}
                        placeholder="Name, e.g. Tutor"
                        aria-label="Variable Name"
                        className={`${fieldCls} sm:flex-1`}
                    />
                    <input
                        type="text"
                        value={newValue}
                        onChange={e => setNewValue(e.target.value)}
                        placeholder="Value, e.g. John Smith"
                        aria-label="Value"
                        onKeyDown={e => { if (e.key === 'Enter') add(); }}
                        className={`${fieldCls} sm:flex-1`}
                    />
                    <Button variant="secondary" onClick={add} disabled={!newKey.trim()} loading={setup.addVariable.isPending}>
                        {!setup.addVariable.isPending && <Plus size={14} />}
                        Add
                    </Button>
                </div>
                <p className="text-[11px] text-muted">
                    Use <code className="text-status-confirmed bg-success/10 px-1 py-0.5 rounded-sm font-mono">{'{VariableName}'}</code> (single braces) in your Word templates. Names use letters, digits and _.
                </p>
            </div>
        </Card>
    );
}

const placeholderLabel = (key: string) =>
    PLACEHOLDER_CATEGORIES.flatMap(c => c.items).find(i => i.key === key)?.desc.replace(/\s*\(.*\)$/, '') ?? key;

export function ExcelColumnsCard({ setup, showToast }: Omit<CardProps, 'confirmDelete'>) {
    const { excelColumns, customVars, excelShared } = setup;
    const [header, setHeader] = useState('');
    const [placeholder, setPlaceholder] = useState('');

    const save = (columns: ExcelColumn[], after?: () => void) => setup.saveColumns.mutate(columns, {
        onSuccess: after,
        onError: err => showToast(`Could not save the Excel columns: ${errorText(err)}`, 'error'),
    });
    const add = () => {
        if (!header.trim() || !placeholder.trim()) return;
        save([...excelColumns, { header: header.trim(), placeholder: placeholder.trim() }], () => { setHeader(''); setPlaceholder(''); });
    };
    const move = (from: number, to: number) => {
        const next = [...excelColumns];
        next.splice(to, 0, ...next.splice(from, 1));
        save(next);
    };

    return (
        <Card
            title="Excel export columns"
            subtitle={<>Columns of <strong className="font-semibold">Participants.xlsx</strong> in the archive</>}
            icon={Table2}
            tone="success"
        >
            <div className="space-y-3">
                {excelColumns.length > 0 ? (
                    <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                        {excelColumns.map((col, idx) => (
                            <li key={`${col.placeholder}-${idx}`} className="flex items-center gap-2.5 px-3 py-2">
                                <span className="text-[11px] tabular-nums text-muted w-4 text-right shrink-0">{idx + 1}</span>
                                <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    <span className="text-[13px] font-medium text-primary truncate max-w-full">{col.header}</span>
                                    <span className="flex items-center gap-2 min-w-0 max-w-full">
                                        <ArrowRight size={12} className="text-muted shrink-0" />
                                        <code className="text-brand-600 dark:text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded-sm font-mono text-xs truncate">
                                            {`{${col.placeholder}}`}
                                        </code>
                                    </span>
                                </span>
                                <span className="flex items-center shrink-0">
                                    <IconButton size="sm" label={`Move ${col.header} up`} disabled={idx === 0} onClick={() => move(idx, idx - 1)}>
                                        <ArrowUp size={13} />
                                    </IconButton>
                                    <IconButton size="sm" label={`Move ${col.header} down`} disabled={idx === excelColumns.length - 1} onClick={() => move(idx, idx + 1)}>
                                        <ArrowDown size={13} />
                                    </IconButton>
                                    <IconButton size="sm" tone="danger" label="Remove column" onClick={() => save(excelColumns.filter((_, i) => i !== idx))}>
                                        <Trash2 size={14} />
                                    </IconButton>
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className={`${calloutCls.warning} flex items-center gap-2 px-3 py-2 text-xs font-medium`}>
                        <AlertCircle size={14} className="text-status-requested shrink-0" />
                        No columns configured — no Excel file will be generated
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="text"
                        value={header}
                        onChange={e => setHeader(e.target.value)}
                        placeholder="Header, e.g. Full Name"
                        aria-label="Column Header"
                        className={`${fieldCls} sm:flex-1`}
                    />
                    <select
                        value={placeholder}
                        onChange={e => {
                            const key = e.target.value;
                            setPlaceholder(key);
                            if (!header.trim()) setHeader(placeholderLabel(key));
                        }}
                        aria-label="Placeholder Key"
                        className={`${fieldCls} sm:flex-1`}
                    >
                        <option value="">Value…</option>
                        {PLACEHOLDER_CATEGORIES.map(cat => (
                            <optgroup key={cat.title} label={cat.title}>
                                {cat.items.map(item => <option key={item.key} value={item.key}>{item.desc} — {`{${item.key}}`}</option>)}
                            </optgroup>
                        ))}
                        {customVars.length > 0 && (
                            <optgroup label="Custom Variables">
                                {customVars.map(v => <option key={v.id} value={v.var_key}>{`{${v.var_key}}`}</option>)}
                            </optgroup>
                        )}
                    </select>
                    <Button variant="secondary" onClick={add} disabled={!header.trim() || !placeholder.trim()}>
                        <Plus size={14} />
                        Add
                    </Button>
                </div>
                <p className="text-[11px] text-muted flex items-start gap-1.5">
                    {excelShared ? <Users size={13} className="shrink-0 mt-px" /> : <Info size={13} className="shrink-0 mt-px" />}
                    <span>
                        Rows are sorted by surname. The header row is frozen and filterable.{' '}
                        {excelShared ? 'These columns are shared by every admin.' : 'Saved in this browser only — shared settings are not available yet.'}
                    </span>
                </p>
            </div>
        </Card>
    );
}

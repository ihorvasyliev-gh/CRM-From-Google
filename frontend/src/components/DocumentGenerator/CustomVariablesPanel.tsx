import { useMemo, useState } from 'react';
import { CalendarClock, Check, Info, Pencil, Plus, Trash2, Type, Variable, X } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { Segmented } from '../ui/Tabs';
import { CustomTooltip } from '../ui/Tooltip';
import { fieldCls, panelCls } from '../ui/styles';
import DateRuleFields from './DateRuleFields';
import { DEFAULT_DATE_RULE, errorText, plural, variableSummary, type ConfirmDelete, type ShowToast } from './helpers';
import type { DocumentSetup } from './useDocumentSetup';
import type { VariableKind } from './types';
import { PLACEHOLDER_KEYS, parseDateRule, validateVariableKey, type DateRule } from '../../lib/documentUtils';
import { templateLabel, type TemplateVariable } from '../../lib/types';

export interface CustomVariablesPanelProps {
    setup: DocumentSetup;
    showToast: ShowToast;
    confirmDelete: ConfirmDelete;
}

const cleanVarKey = (raw: string) => raw.trim().replace(/^\{+|\}+$/g, '');

const KIND_OPTIONS: { value: VariableKind; label: string; icon: React.ReactNode }[] = [
    { value: 'text', label: 'Text', icon: <Type size={12} /> },
    { value: 'date', label: 'Date from course', icon: <CalendarClock size={12} /> },
];

/** Manage custom `{Variable}` text and course-date rules, with inline editing and template usage hints. */
export default function CustomVariablesPanel({ setup, showToast, confirmDelete }: CustomVariablesPanelProps) {
    const { customVars, templates, attTemplate, labelTemplate, sicapTemplate } = setup;

    const [kind, setKind] = useState<VariableKind>('text');
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newRule, setNewRule] = useState<DateRule>(DEFAULT_DATE_RULE);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingKey, setEditingKey] = useState('');
    const [editingKind, setEditingKind] = useState<VariableKind>('text');
    const [editingValue, setEditingValue] = useState('');
    const [editingRule, setEditingRule] = useState<DateRule>(DEFAULT_DATE_RULE);

    const usageByKey = useMemo(() => {
        const map = new Map<string, string[]>();
        const record = (label: string, tags?: string[] | null) => {
            if (!tags?.length) return;
            for (const tag of tags) {
                const list = map.get(tag);
                if (list) {
                    if (!list.includes(label)) list.push(label);
                } else {
                    map.set(tag, [label]);
                }
            }
        };
        for (const tpl of templates) record(templateLabel(tpl), tpl.tags);
        if (attTemplate) record(`Attendance sheet (${templateLabel(attTemplate)})`, attTemplate.tags);
        if (labelTemplate) record(`Address labels (${templateLabel(labelTemplate)})`, labelTemplate.tags);
        if (sicapTemplate) record(`SICAP course form (${templateLabel(sicapTemplate)})`, sicapTemplate.tags);
        return map;
    }, [templates, attTemplate, labelTemplate, sicapTemplate]);

    function add() {
        const key = cleanVarKey(newKey);
        const invalid = validateVariableKey(key);
        if (invalid) {
            showToast(invalid, 'error');
            return;
        }
        if (customVars.some(v => v.var_key === key)) {
            showToast(`{${key}} already exists — edit its value instead`, 'error');
            return;
        }

        setup.addVariable.mutate(
            { key, value: newValue.trim(), rule: kind === 'date' ? newRule : undefined },
            {
                onSuccess: () => {
                    setNewKey('');
                    setNewValue('');
                    setNewRule(DEFAULT_DATE_RULE);
                    if (PLACEHOLDER_KEYS.has(key)) {
                        showToast(`{${key}} added — it replaces the built-in {${key}} in every document`, 'info');
                    } else {
                        showToast(`Variable {${key}} added`, 'success');
                    }
                },
                onError: err => showToast(`Failed to add variable: ${errorText(err)}`, 'error'),
            },
        );
    }

    function startEditing(v: TemplateVariable) {
        setEditingId(v.id);
        setEditingKey(v.var_key);
        setEditingKind(v.kind === 'date' ? 'date' : 'text');
        setEditingValue(v.var_value);
        setEditingRule(parseDateRule(v.date_rule) ?? DEFAULT_DATE_RULE);
    }

    function cancelEditing() {
        setEditingId(null);
    }

    function save(variable: TemplateVariable) {
        const key = cleanVarKey(editingKey);
        const invalid = validateVariableKey(key);
        if (invalid) {
            showToast(invalid, 'error');
            return;
        }
        if (customVars.some(other => other.id !== variable.id && other.var_key === key)) {
            showToast(`{${key}} already exists — choose another name`, 'error');
            return;
        }

        const payload = editingKind === 'date'
            ? { variable, var_key: key, kind: 'date' as const, rule: editingRule }
            : { variable, var_key: key, kind: 'text' as const, value: editingValue.trim() };

        setup.updateVariable.mutate(payload, {
            onSuccess: () => {
                setEditingId(null);
                if (key !== variable.var_key && PLACEHOLDER_KEYS.has(key)) {
                    showToast(`{${key}} updated — it replaces the built-in {${key}} in every document`, 'info');
                } else {
                    showToast(`Variable {${key}} updated`, 'success');
                }
            },
            onError: err => showToast(`Update failed: ${errorText(err)}`, 'error'),
        });
    }

    function requestDelete(v: TemplateVariable, usedIn: string[]) {
        const usageWarning = usedIn.length > 0
            ? ` It is currently used in ${usedIn.join(', ')} — those templates will print it blank.`
            : ' Any templates using it will print it blank.';
        confirmDelete({
            title: 'Delete variable',
            message: `Delete variable {${v.var_key}}?${usageWarning}`,
            confirmLabel: 'Delete',
            run: () => setup.removeVariable.mutateAsync(v).then(
                () => {
                    if (editingId === v.id) setEditingId(null);
                    showToast(`Variable {${v.var_key}} deleted`, 'success');
                },
                err => showToast(`Delete failed: ${errorText(err)}`, 'error'),
            ),
        });
    }

    const addButton = (
        <Button variant="secondary" onClick={add} disabled={!newKey.trim()} loading={setup.addVariable.isPending}>
            {!setup.addVariable.isPending && <Plus size={14} />}
            Add
        </Button>
    );

    return (
        <Card
            title="Custom variables"
            subtitle={<>Fixed text like {'{Tutor}'}, or dates worked out from the course like {'{expire}'}</>}
            icon={Variable}
            tone="success"
            action={customVars.length > 0 ? <Badge tone="neutral" shape="pill" className="tabular-nums">{customVars.length}</Badge> : undefined}
        >
            <div className="space-y-4">
                {customVars.length > 0 ? (
                    <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                        {customVars.map(v => {
                            const isDate = v.kind === 'date';
                            const editing = editingId === v.id;
                            const usedIn = usageByKey.get(v.var_key) ?? [];
                            const overridesBuiltIn = PLACEHOLDER_KEYS.has(v.var_key);
                            const cleanedDraftKey = cleanVarKey(editingKey);

                            if (editing) {
                                return (
                                    <li key={v.id} className="p-3 bg-surface-elevated/40 space-y-2.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <Segmented<VariableKind>
                                                size="sm"
                                                ariaLabel="Edit variable type"
                                                value={editingKind}
                                                onChange={setEditingKind}
                                                options={KIND_OPTIONS}
                                            />
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => save(v)}
                                                    disabled={!editingKey.trim()}
                                                    loading={setup.updateVariable.isPending}
                                                >
                                                    {!setup.updateVariable.isPending && <Check size={13} />}
                                                    Save
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={setup.updateVariable.isPending}>
                                                    <X size={13} />
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                                type="text"
                                                value={editingKey}
                                                onChange={e => setEditingKey(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') { e.preventDefault(); save(v); }
                                                    if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
                                                }}
                                                aria-label={`Rename ${v.var_key}`}
                                                placeholder="Variable name"
                                                className={`${fieldCls} font-mono text-xs sm:w-44 shrink-0`}
                                                autoFocus
                                            />
                                            {editingKind === 'text' && (
                                                <input
                                                    type="text"
                                                    value={editingValue}
                                                    onChange={e => setEditingValue(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') { e.preventDefault(); save(v); }
                                                        if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
                                                    }}
                                                    aria-label={`Value of ${v.var_key}`}
                                                    placeholder="Value, e.g. John Smith"
                                                    className={`${fieldCls} flex-1 min-w-0`}
                                                />
                                            )}
                                        </div>

                                        {editingKind === 'date' && (
                                            <DateRuleFields rule={editingRule} onChange={setEditingRule} />
                                        )}

                                        {usedIn.length > 0 && cleanedDraftKey && cleanedDraftKey !== v.var_key && (
                                            <p className="text-xs text-status-requested flex items-start gap-1.5">
                                                <Info size={13} className="shrink-0 mt-px" />
                                                <span>
                                                    Renaming will not update existing <code className="font-mono">{`{${v.var_key}}`}</code> tags inside {usedIn.join(', ')}.
                                                </span>
                                            </p>
                                        )}
                                    </li>
                                );
                            }

                            return (
                                <li key={v.id} className="px-3 py-2.5 hover:bg-surface-elevated/40 transition-colors">
                                    <div className="flex items-start sm:items-center gap-2.5">
                                        <button
                                            type="button"
                                            className="flex-1 min-w-0 text-left group space-y-1"
                                            onClick={() => startEditing(v)}
                                            title={`Edit {${v.var_key}}`}
                                        >
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <code className="text-status-confirmed bg-success/10 px-1.5 py-0.5 rounded-sm font-mono text-xs shrink-0">
                                                    {`{${v.var_key}}`}
                                                </code>
                                                {overridesBuiltIn && (
                                                    <Badge tone="warning" title={`Replaces the built-in {${v.var_key}} placeholder in every generated document`}>
                                                        Overrides built-in
                                                    </Badge>
                                                )}
                                                {usedIn.length > 0 && (
                                                    <CustomTooltip content={`Used in:\n${usedIn.join('\n')}`}>
                                                        <span className="inline-flex">
                                                            <Badge tone="neutral" shape="pill">
                                                                Used in {plural(usedIn.length, 'template')}
                                                            </Badge>
                                                        </span>
                                                    </CustomTooltip>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[13px] text-primary group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                                                {isDate && <CalendarClock size={13} className="text-muted shrink-0" />}
                                                <span className="truncate">
                                                    {variableSummary(v) || <em className="text-muted">empty — click to set</em>}
                                                </span>
                                            </div>
                                        </button>

                                        <span className="flex items-center shrink-0">
                                            <IconButton size="sm" tone="brand" label={`Edit ${v.var_key}`} onClick={() => startEditing(v)}>
                                                <Pencil size={13} />
                                            </IconButton>
                                            <IconButton size="sm" tone="danger" label={`Delete ${v.var_key}`} onClick={() => requestDelete(v, usedIn)}>
                                                <Trash2 size={14} />
                                            </IconButton>
                                        </span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="text-xs text-muted flex items-center gap-1.5">
                        <Info size={13} className="shrink-0" />
                        No custom variables defined yet.
                    </p>
                )}

                <div className={`${panelCls} p-3 space-y-2.5`}>
                    <Segmented<VariableKind>
                        size="sm"
                        ariaLabel="Variable type"
                        value={kind}
                        onChange={setKind}
                        className="w-fit"
                        options={KIND_OPTIONS}
                    />
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="text"
                            value={newKey}
                            onChange={e => setNewKey(e.target.value)}
                            placeholder={kind === 'date' ? 'Name, e.g. expire' : 'Name, e.g. Tutor'}
                            aria-label="Variable Name"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                            className={`${fieldCls} sm:flex-1`}
                        />
                        {kind === 'text' && (
                            <>
                                <input
                                    type="text"
                                    value={newValue}
                                    onChange={e => setNewValue(e.target.value)}
                                    placeholder="Value, e.g. John Smith"
                                    aria-label="Value"
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                                    className={`${fieldCls} sm:flex-1`}
                                />
                                {addButton}
                            </>
                        )}
                    </div>
                    {kind === 'date' && (
                        <>
                            <DateRuleFields rule={newRule} onChange={setNewRule} />
                            <div className="flex justify-end">{addButton}</div>
                        </>
                    )}
                </div>

                <p className="text-xs text-muted">
                    Use <code className="text-status-confirmed bg-success/10 px-1 py-0.5 rounded-sm font-mono">{'{VariableName}'}</code> (single braces) in your Word templates. Names use letters, digits and _.
                </p>
            </div>
        </Card>
    );
}

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, Check, Info, Pencil, Plus, Table2, Trash2, Users, X } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { calloutCls, fieldCls, panelCls } from '../ui/styles';
import { errorText, type ShowToast } from './helpers';
import type { DocumentSetup } from './useDocumentSetup';
import { PLACEHOLDER_CATEGORIES } from '../../lib/documentUtils';
import type { ExcelColumn } from '../../lib/appConfig';
import type { TemplateVariable } from '../../lib/types';

export interface ExcelColumnsPanelProps {
    setup: DocumentSetup;
    showToast: ShowToast;
}

const ALL_BUILTIN_ITEMS = PLACEHOLDER_CATEGORIES.flatMap(c => c.items);

const placeholderLabel = (key: string) =>
    ALL_BUILTIN_ITEMS.find(i => i.key === key)?.desc.replace(/\s*\(.*\)$/, '') ?? key;

/** Excel-style column letter: 0 -> A, 25 -> Z, 26 -> AA. */
function excelColLetter(index: number): string {
    let n = index;
    let out = '';
    do {
        out = String.fromCharCode(65 + (n % 26)) + out;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
}

function PlaceholderOptions({ customVars, currentValue }: { customVars: TemplateVariable[]; currentValue?: string }) {
    const known =
        !currentValue
        || ALL_BUILTIN_ITEMS.some(i => i.key === currentValue)
        || customVars.some(v => v.var_key === currentValue);

    return (
        <>
            {!known && currentValue && (
                <option value={currentValue}>{`{${currentValue}}`}</option>
            )}
            {PLACEHOLDER_CATEGORIES.map(cat => (
                <optgroup key={cat.title} label={cat.title}>
                    {cat.items.map(item => (
                        <option key={item.key} value={item.key}>
                            {item.desc} — {`{${item.key}}`}
                        </option>
                    ))}
                </optgroup>
            ))}
            {customVars.length > 0 && (
                <optgroup label="Custom Variables">
                    {customVars.map(v => (
                        <option key={v.id} value={v.var_key}>
                            {`{${v.var_key}}`}
                        </option>
                    ))}
                </optgroup>
            )}
        </>
    );
}

/** Configure ordered columns of Participants.xlsx with live spreadsheet header preview, inline edit and undoable remove. */
export default function ExcelColumnsPanel({ setup, showToast }: ExcelColumnsPanelProps) {
    const { excelColumns, customVars, excelShared } = setup;
    const columnsRef = useRef(excelColumns);
    useEffect(() => {
        columnsRef.current = excelColumns;
    }, [excelColumns]);

    const [header, setHeader] = useState('');
    const [placeholder, setPlaceholder] = useState('');

    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editHeader, setEditHeader] = useState('');
    const [editPlaceholder, setEditPlaceholder] = useState('');

    const saving = setup.saveColumns.isPending;

    const save = (columns: ExcelColumn[], after?: () => void) => setup.saveColumns.mutate(columns, {
        onSuccess: after,
        onError: err => showToast(`Could not save the Excel columns: ${errorText(err)}`, 'error'),
    });

    function add() {
        const cleanHeader = header.trim();
        const cleanPlaceholder = placeholder.trim();
        if (!cleanHeader || !cleanPlaceholder || saving) return;
        save([...excelColumns, { header: cleanHeader, placeholder: cleanPlaceholder }], () => {
            setHeader('');
            setPlaceholder('');
        });
    }

    function startEdit(idx: number) {
        const col = excelColumns[idx];
        if (!col) return;
        setEditingIdx(idx);
        setEditHeader(col.header);
        setEditPlaceholder(col.placeholder);
    }

    function commitEdit(idx: number) {
        const cleanHeader = editHeader.trim();
        const cleanPlaceholder = editPlaceholder.trim();
        if (!cleanHeader || !cleanPlaceholder || saving) return;
        const next = excelColumns.map((col, i) =>
            i === idx ? { header: cleanHeader, placeholder: cleanPlaceholder } : col,
        );
        save(next, () => {
            setEditingIdx(null);
            showToast(`Updated "${cleanHeader}" column`, 'success');
        });
    }

    function move(from: number, to: number) {
        if (saving || to < 0 || to >= excelColumns.length) return;
        if (editingIdx !== null) setEditingIdx(null);
        const next = [...excelColumns];
        next.splice(to, 0, ...next.splice(from, 1));
        save(next);
    }

    function remove(idx: number) {
        const removed = excelColumns[idx];
        if (!removed || saving) return;
        if (editingIdx === idx) setEditingIdx(null);
        else if (editingIdx !== null && editingIdx > idx) setEditingIdx(editingIdx - 1);

        const next = excelColumns.filter((_, i) => i !== idx);
        save(next, () => {
            let undone = false;
            showToast(`Removed "${removed.header}" column`, 'info', {
                duration: 6000,
                action: {
                    label: 'Undo',
                    onClick: () => {
                        if (undone) return;
                        undone = true;
                        const current = columnsRef.current;
                        const restored = [...current];
                        restored.splice(Math.min(idx, restored.length), 0, removed);
                        save(restored, () => showToast(`Restored "${removed.header}" column`, 'success'));
                    },
                },
            });
        });
    }

    return (
        <Card
            title="Excel export columns"
            subtitle={<>Customise the columns of <strong className="font-semibold">Participants.xlsx</strong> in each archive</>}
            icon={Table2}
            tone="success"
            action={excelColumns.length > 0 ? <Badge tone="neutral" shape="pill" className="tabular-nums">{excelColumns.length}</Badge> : undefined}
        >
            <div className="space-y-4">
                {/* Live mini spreadsheet header preview */}
                {excelColumns.length > 0 && (
                    <div
                        aria-label="Spreadsheet header preview"
                        className="rounded-xl border border-border-subtle bg-surface-elevated/60 overflow-x-auto"
                    >
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-border-subtle text-muted">
                                    {excelColumns.map((col, idx) => (
                                        <th
                                            key={`letter-${col.placeholder}-${idx}`}
                                            scope="col"
                                            className="px-2.5 py-1 text-center font-mono text-[10px] font-medium border-r last:border-r-0 border-border-subtle bg-surface-elevated"
                                        >
                                            {excelColLetter(idx)}
                                        </th>
                                    ))}
                                </tr>
                                <tr className="border-b border-border-subtle bg-brand-500/10 text-primary">
                                    {excelColumns.map((col, idx) => (
                                        <th
                                            key={`head-${col.placeholder}-${idx}`}
                                            scope="col"
                                            className="px-2.5 py-1.5 text-left font-semibold whitespace-nowrap border-r last:border-r-0 border-border-subtle"
                                        >
                                            {col.header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="bg-surface text-muted">
                                    {excelColumns.map((col, idx) => (
                                        <td
                                            key={`val-${col.placeholder}-${idx}`}
                                            className="px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap border-r last:border-r-0 border-border-subtle"
                                        >
                                            {`{${col.placeholder}}`}
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}

                {excelColumns.length > 0 ? (
                    <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                        {excelColumns.map((col, idx) => {
                            const editing = editingIdx === idx;
                            if (editing) {
                                return (
                                    <li key={`${col.placeholder}-${idx}`} className="p-2.5 bg-surface-elevated/40 space-y-2">
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                                type="text"
                                                value={editHeader}
                                                onChange={e => setEditHeader(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(idx); }
                                                    if (e.key === 'Escape') { e.preventDefault(); setEditingIdx(null); }
                                                }}
                                                placeholder="Column header"
                                                aria-label={`Header for column ${idx + 1}`}
                                                className={`${fieldCls} sm:flex-1`}
                                                autoFocus
                                            />
                                            <select
                                                value={editPlaceholder}
                                                onChange={e => {
                                                    const key = e.target.value;
                                                    setEditPlaceholder(key);
                                                    if (!editHeader.trim()) setEditHeader(placeholderLabel(key));
                                                }}
                                                aria-label={`Placeholder for column ${idx + 1}`}
                                                className={`${fieldCls} sm:flex-1`}
                                            >
                                                <PlaceholderOptions customVars={customVars} currentValue={editPlaceholder} />
                                            </select>
                                        </div>
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() => commitEdit(idx)}
                                                disabled={!editHeader.trim() || !editPlaceholder.trim() || saving}
                                            >
                                                <Check size={13} />
                                                Save
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => setEditingIdx(null)} disabled={saving}>
                                                <X size={13} />
                                                Cancel
                                            </Button>
                                        </div>
                                    </li>
                                );
                            }

                            return (
                                <li key={`${col.placeholder}-${idx}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-elevated/40 transition-colors">
                                    <span className="text-xs tabular-nums text-muted w-4 text-right shrink-0">{idx + 1}</span>
                                    <button
                                        type="button"
                                        onClick={() => startEdit(idx)}
                                        className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left group"
                                        title={`Edit column ${col.header}`}
                                    >
                                        <span className="text-[13px] font-medium text-primary group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors truncate max-w-full">
                                            {col.header}
                                        </span>
                                        <span className="flex items-center gap-1.5 min-w-0 max-w-full">
                                            <ArrowRight size={12} className="text-muted shrink-0" />
                                            <code className="text-brand-600 dark:text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded-sm font-mono text-xs truncate">
                                                {`{${col.placeholder}}`}
                                            </code>
                                        </span>
                                    </button>
                                    <span className="flex items-center shrink-0">
                                        <IconButton size="sm" tone="brand" label={`Edit column ${col.header}`} disabled={saving} onClick={() => startEdit(idx)}>
                                            <Pencil size={13} />
                                        </IconButton>
                                        <IconButton size="sm" label={`Move ${col.header} up`} disabled={saving || idx === 0} onClick={() => move(idx, idx - 1)}>
                                            <ArrowUp size={13} />
                                        </IconButton>
                                        <IconButton size="sm" label={`Move ${col.header} down`} disabled={saving || idx === excelColumns.length - 1} onClick={() => move(idx, idx + 1)}>
                                            <ArrowDown size={13} />
                                        </IconButton>
                                        <IconButton size="sm" tone="danger" label={`Remove column ${col.header}`} disabled={saving} onClick={() => remove(idx)}>
                                            <Trash2 size={14} />
                                        </IconButton>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className={`${calloutCls.warning} flex items-center gap-2 px-3 py-2 text-xs font-medium`}>
                        <AlertCircle size={14} className="text-status-requested shrink-0" />
                        No columns configured — no Excel file will be generated
                    </div>
                )}

                <div className={`${panelCls} p-3 flex flex-col sm:flex-row gap-2`}>
                    <input
                        type="text"
                        value={header}
                        onChange={e => setHeader(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
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
                        <PlaceholderOptions customVars={customVars} />
                    </select>
                    <Button variant="secondary" onClick={add} disabled={!header.trim() || !placeholder.trim() || saving}>
                        <Plus size={14} />
                        Add
                    </Button>
                </div>

                <p className="text-xs text-muted flex items-start gap-1.5">
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

import { useMemo, useState } from 'react';
import { CheckSquare, Grid2x2, ListPlus, Plus, Trash2, Type, X } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import Badge from '../ui/Badge';
import { fieldCls, labelCls, calloutCls } from '../ui/styles';
import { bestOption } from '../../lib/pdfForms/choice';
import { evaluateSource, FILTERS, placeholderFor, type ColumnMatch } from '../../lib/pdfForms/source';
import { splitAnswers } from '../../lib/pdfForms/text';
import type { ChoiceField, FormField, SheetData, TextField } from '../../lib/pdfForms/types';

interface SourceInputProps {
    value: string;
    onChange: (value: string) => void;
    columns: string[];
    id: string;
}

/** Where a value comes from: free text with {Column|filter} placeholders, plus pickers to insert them */
export function SourceInput({ value, onChange, columns, id }: SourceInputProps) {
    const [column, setColumn] = useState('');
    const [filter, setFilter] = useState('');
    const insert = () => {
        if (!column) return;
        const tag = placeholderFor(column, filter ? [filter] : []);
        onChange(value.trim() ? `${value} ${tag}` : tag);
        setFilter('');
    };
    return (
        <div className="space-y-2">
            <textarea
                id={id}
                value={value}
                onChange={e => onChange(e.target.value)}
                rows={2}
                placeholder="{Column name} or fixed text"
                className={`${fieldCls} h-auto py-2 font-mono text-xs leading-relaxed`}
            />
            <div className="flex flex-wrap gap-1.5">
                <select value={column} onChange={e => setColumn(e.target.value)} aria-label="Column to insert" className={`${fieldCls} h-8 text-xs min-w-0 flex-1 w-auto!`}>
                    <option value="">Column…</option>
                    {columns.map(c => <option key={c} value={c}>{c.length > 70 ? `${c.slice(0, 67)}…` : c}</option>)}
                    <option value="today">Today's date</option>
                    <option value="row">Row number</option>
                </select>
                <div className="w-[38%] shrink-0">
                    <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Change the value" className={`${fieldCls} h-8 text-xs`}>
                        <option value="">As is</option>
                        {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                </div>
                <Button size="sm" onClick={insert} disabled={!column}>
                    <Plus size={13} /> Insert
                </Button>
            </div>
        </div>
    );
}

interface InspectorProps {
    field: FormField;
    onChange: (field: FormField) => void;
    onDelete: () => void;
    onSnapToCell?: () => void;
    onAddSiblings?: () => void;
    columns: string[];
    sample: SheetData | null;
    sampleRow: number;
    columnMatches: Map<string, ColumnMatch>;
}

export default function FieldInspector(props: InspectorProps) {
    const { field, onChange, onDelete, columns, sample, sampleRow, columnMatches } = props;
    const sampleValue = sample
        ? evaluateSource(field.source, { row: sample.rows[sampleRow] ?? [], columns: columnMatches, rowNumber: sample.rowNumbers?.[sampleRow] ?? sampleRow + 2 })
        : null;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    {field.kind === 'text' ? <Type size={14} /> : <CheckSquare size={14} />}
                </span>
                <span className="text-xs font-semibold text-muted uppercase tracking-wider flex-1">{field.kind === 'text' ? 'Text field' : 'Checkboxes'}</span>
                <IconButton label="Delete field" tone="danger" size="sm" onClick={onDelete}>
                    <Trash2 size={14} />
                </IconButton>
            </div>

            <div>
                <label className={labelCls} htmlFor={`name-${field.id}`}>Name</label>
                <input id={`name-${field.id}`} value={field.name} onChange={e => onChange({ ...field, name: e.target.value })} className={fieldCls} />
            </div>

            <div>
                <label className={labelCls} htmlFor={`src-${field.id}`}>Value from the spreadsheet</label>
                <SourceInput id={`src-${field.id}`} value={field.source} onChange={source => onChange({ ...field, source })} columns={columns} />
                {sampleValue !== null && (
                    <p className="mt-1.5 text-[11px] text-muted">
                        Row {sample?.rowNumbers?.[sampleRow] ?? sampleRow + 2}: <span className="text-primary font-medium break-words">{sampleValue || '(empty)'}</span>
                    </p>
                )}
            </div>

            {field.kind === 'text' ? <TextOptions field={field} onChange={onChange} onSnapToCell={props.onSnapToCell} /> : <ChoiceOptions {...props} field={field} />}
        </div>
    );
}

function TextOptions({ field, onChange, onSnapToCell }: { field: TextField; onChange: (f: FormField) => void; onSnapToCell?: () => void }) {
    return (
        <>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={labelCls} htmlFor={`fs-${field.id}`}>Largest font size</label>
                    <input
                        id={`fs-${field.id}`}
                        type="number"
                        min={6}
                        max={24}
                        step={0.5}
                        value={field.fontSize}
                        onChange={e => onChange({ ...field, fontSize: Math.min(24, Math.max(6, Number(e.target.value) || 10)) })}
                        className={fieldCls}
                    />
                </div>
                <div>
                    <label className={labelCls} htmlFor={`al-${field.id}`}>Align</label>
                    <select id={`al-${field.id}`} value={field.align} onChange={e => onChange({ ...field, align: e.target.value as TextField['align'] })} className={fieldCls}>
                        <option value="left">Left</option>
                        <option value="center">Centre</option>
                    </select>
                </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
                <input type="checkbox" checked={field.multiline} onChange={e => onChange({ ...field, multiline: e.target.checked })} className="accent-brand-500" />
                Several lines (wrap long text)
            </label>
            <p className="text-[11px] text-muted">Long values shrink to fit, down to 6 pt. Drag the box on the page to move it; drag its corner to resize.</p>
            {onSnapToCell && (
                <Button size="sm" onClick={onSnapToCell}>
                    <Grid2x2 size={13} /> Fit to table cell
                </Button>
            )}
        </>
    );
}

function ChoiceOptions({ field, onChange, onAddSiblings, sample, columnMatches }: InspectorProps & { field: ChoiceField }) {
    // Distinct answers in the sample and the box each one ticks
    const answers = useMemo(() => {
        if (!sample) return [];
        const counts = new Map<string, number>();
        sample.rows.forEach((row, i) => {
            const value = evaluateSource(field.source, { row, columns: columnMatches, rowNumber: sample.rowNumbers?.[i] ?? i + 2 });
            splitAnswers(value).forEach(a => counts.set(a, (counts.get(a) ?? 0) + 1));
        });
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([answer, count]) => ({ answer, count, option: bestOption(answer, field.options) }));
    }, [sample, field.source, field.options, columnMatches]);

    const setAliases = (optionId: string, aliases: string[]) =>
        onChange({ ...field, options: field.options.map(o => (o.id === optionId ? { ...o, aliases } : o)) });

    const assign = (answer: string, optionId: string) => {
        // Move the answer to the chosen box (and off any other)
        onChange({
            ...field,
            options: field.options.map(o => {
                const without = o.aliases.filter(a => a !== answer);
                return o.id === optionId ? { ...o, aliases: [...without, answer] } : { ...o, aliases: without };
            }),
        });
    };

    return (
        <>
            <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
                <input type="checkbox" checked={field.single} onChange={e => onChange({ ...field, single: e.target.checked })} className="accent-brand-500" />
                One box only (“select one option”): tick the first answer, warn about the rest
            </label>

            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className={labelCls.replace('mb-1.5', 'mb-0')}>Boxes ({field.options.length})</span>
                    {onAddSiblings && field.options.length > 0 && (
                        <Button size="xs" variant="ghost" onClick={onAddSiblings}>
                            <ListPlus size={12} /> Add the rest of this question
                        </Button>
                    )}
                </div>
                <p className="text-[11px] text-muted mb-2">Click checkboxes on the page to add or remove them.</p>
                {field.options.length === 0 ? (
                    <div className={`${calloutCls.info} text-xs p-3`}>No boxes yet: click the checkboxes of this question on the page.</div>
                ) : (
                    <ul className="space-y-1.5">
                        {field.options.map(o => (
                            <li key={o.id} className="rounded-lg border border-border-subtle px-2.5 py-2">
                                <div className="flex items-start gap-2">
                                    <span className="text-xs font-medium text-primary flex-1 min-w-0 break-words">{o.label || <em className="text-muted">No label</em>}</span>
                                    <IconButton
                                        label={`Remove ${o.label}`}
                                        size="sm"
                                        onClick={() => onChange({ ...field, options: field.options.filter(x => x.id !== o.id) })}
                                    >
                                        <X size={13} />
                                    </IconButton>
                                </div>
                                {o.aliases.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {o.aliases.map(a => (
                                            <button
                                                key={a}
                                                type="button"
                                                title="Remove this answer"
                                                onClick={() => setAliases(o.id, o.aliases.filter(x => x !== a))}
                                                className="inline-flex items-center gap-1 px-1.5 h-5 rounded-md bg-surface-elevated border border-border-subtle text-[10px] text-muted hover:text-status-rejected max-w-full"
                                            >
                                                <span className="truncate">“{a}”</span>
                                                <X size={10} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {answers.length > 0 && (
                <div>
                    <span className={labelCls}>Answers in the sample</span>
                    <p className="text-[11px] text-muted mb-2">Answers are matched to boxes by their wording. Pick a box to fix a wrong or missing match.</p>
                    <ul className="space-y-1.5">
                        {answers.map(({ answer, count, option }) => (
                            <li key={answer} className="flex items-center gap-2">
                                <span className="text-[11px] text-primary flex-1 min-w-0 truncate" title={answer}>
                                    {answer} <span className="text-muted">×{count}</span>
                                </span>
                                <div className="w-1/2 shrink-0">
                                    <select
                                        value={option?.id ?? ''}
                                        onChange={e => e.target.value && assign(answer, e.target.value)}
                                        aria-label={`Box for “${answer}”`}
                                        className={`${fieldCls} h-7 text-[11px] ${option ? '' : 'border-warning/60'}`}
                                    >
                                        <option value="">No match</option>
                                        {field.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                    </select>
                                </div>
                            </li>
                        ))}
                    </ul>
                    {answers.some(a => !a.option) && (
                        <div className="mt-2">
                            <Badge tone="warning">{answers.filter(a => !a.option).length} answer(s) tick nothing</Badge>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

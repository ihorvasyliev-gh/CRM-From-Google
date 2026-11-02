import { useState, type ClipboardEvent } from 'react';
import { ClipboardPaste, Plus, Trash2, UserRound, Users } from 'lucide-react';
import Card from '../ui/Card';
import { Button, IconButton } from '../ui/Button';
import { fieldCls, inputCls } from '../ui/styles';
import { fieldLabel, isBlankRow, newRow, parsePeople, pasteInto, type PersonRow } from '../../lib/certificates/fields';

interface Props {
    columns: string[];
    rows: PersonRow[];
    onRowsChange: (rows: PersonRow[]) => void;
    /** Columns that were switched to "each person" and can go back to one value for everyone */
    movable: ReadonlySet<string>;
    onShare: (tag: string) => void;
}

/**
 * Everyone who gets a certificate: a row each, a column for each value that differs from person
 * to person. A list pasted into a cell (copied from Excel, or names one per line) fills the rows
 * from there down.
 */
export default function PeopleTable({ columns, rows, onRowsChange, movable, onShare }: Props) {
    const [pasting, setPasting] = useState(false);
    const [pasted, setPasted] = useState('');
    const count = rows.filter(r => !isBlankRow(r, columns)).length;

    const setValue = (id: string, tag: string, value: string) =>
        onRowsChange(rows.map(r => (r.id === id ? { ...r, values: { ...r.values, [tag]: value } } : r)));

    const onCellPaste = (e: ClipboardEvent<HTMLInputElement>, row: number, col: number) => {
        const text = e.clipboardData.getData('text/plain');
        if (!/[\t\n]/.test(text.trim())) return;
        e.preventDefault();
        onRowsChange(pasteInto(rows, columns, text, row, col));
    };

    const addPasted = () => {
        const people = parsePeople(pasted, columns);
        if (!people.length) return;
        const kept = rows.filter(r => !isBlankRow(r, columns));
        onRowsChange([...kept, ...people.map(v => newRow(v))]);
        setPasted('');
        setPasting(false);
    };

    const remove = (id: string) => {
        const next = rows.filter(r => r.id !== id);
        onRowsChange(next.length ? next : [newRow()]);
    };

    return (
        <Card
            title="People"
            icon={Users}
            subtitle={count === 1 ? '1 certificate' : `${count} certificates`}
            divided
            action={
                <Button size="sm" variant={pasting ? 'primary' : 'secondary'} onClick={() => setPasting(!pasting)} aria-expanded={pasting}>
                    <ClipboardPaste size={14} /> Paste a list
                </Button>
            }
        >
            {pasting && (
                <div className="mb-4 space-y-2">
                    <label htmlFor="cert-paste" className="block text-xs font-semibold text-muted">
                        One person per line. Copied from Excel, the columns go in this order: {columns.map(fieldLabel).join(', ')}.
                    </label>
                    <textarea
                        id="cert-paste"
                        value={pasted}
                        onChange={e => setPasted(e.target.value)}
                        rows={5}
                        placeholder={columns[0] === 'firstName' && columns[1] === 'lastName' ? 'Mary O\'Brien\nJohn Murphy' : ''}
                        className={`${inputCls} py-2 font-mono text-xs`}
                    />
                    <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={addPasted} disabled={!pasted.trim()}>
                            <Plus size={14} /> Add {parsePeople(pasted, columns).length || ''} to the list
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPasting(false)}>Cancel</Button>
                    </div>
                </div>
            )}

            <div className="-mx-1 overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-x-1 border-spacing-y-1.5">
                    <thead>
                        <tr>
                            <th className="w-6" aria-label="Number" />
                            {columns.map(c => (
                                <th key={c} scope="col" className="text-left text-xs font-semibold text-muted px-1 whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">
                                        {fieldLabel(c)}
                                        {movable.has(c) && (
                                            <IconButton size="sm" label={`${fieldLabel(c)}: the same for everyone`} onClick={() => onShare(c)}>
                                                <UserRound size={13} />
                                            </IconButton>
                                        )}
                                    </span>
                                </th>
                            ))}
                            <th className="w-8" aria-label="Remove" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, r) => (
                            <tr key={row.id}>
                                <td className="text-xs text-muted text-right tabular-nums pr-1">{r + 1}</td>
                                {columns.map((c, k) => (
                                    <td key={c} className="min-w-[8.5rem]">
                                        <input
                                            value={row.values[c] ?? ''}
                                            onChange={e => setValue(row.id, c, e.target.value)}
                                            onPaste={e => onCellPaste(e, r, k)}
                                            aria-label={`${fieldLabel(c)}, person ${r + 1}`}
                                            className={fieldCls}
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                    </td>
                                ))}
                                <td>
                                    <IconButton size="sm" tone="danger" label={`Remove person ${r + 1}`} onClick={() => remove(row.id)}>
                                        <Trash2 size={14} />
                                    </IconButton>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button size="sm" variant="ghost" onClick={() => onRowsChange([...rows, newRow()])}>
                    <Plus size={14} /> Add a person
                </Button>
                <p className="text-xs text-muted">Tip: paste a column of names from Excel straight into the first box.</p>
            </div>
        </Card>
    );
}

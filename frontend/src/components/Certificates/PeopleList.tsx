import { useState } from 'react';
import { ClipboardPaste, Table2, Users } from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import { inputCls } from '../ui/styles';
import { fieldLabel, isBlankRow, newRow, parsePeople, type PersonRow } from '../../lib/certificates/fields';
import { readClipboard } from '../../lib/certificates/clipboard';

interface Props {
    step: number;
    columns: string[];
    rows: PersonRow[];
    onRowsChange: (rows: PersonRow[]) => void;
    /** Edit the people in a table instead (to fix how a name was split) */
    onTable: () => void;
}

/** The people as lines of the box: a first name with a space in it keeps a tab before the surname */
function rowsToText(rows: PersonRow[], columns: string[]): string {
    return rows
        .filter(r => !isBlankRow(r, columns))
        .map(r => {
            const cells = columns.map(c => (r.values[c] ?? '').trim());
            return cells.join(cells[0]?.includes(' ') ? '\t' : ' ').trim();
        })
        .join('\n');
}

/**
 * The people as a plain box, one per line: typed, pasted with Ctrl+V or the right mouse button,
 * or with the button. Underneath, how each line is read (first name, surname).
 */
export default function PeopleList({ step, columns, rows, onRowsChange, onTable }: Props) {
    const [text, setText] = useState(() => rowsToText(rows, columns));
    const split = columns.length > 1;

    const change = (value: string) => {
        setText(value);
        const people = parsePeople(value, columns).map(v => newRow(v));
        onRowsChange(people.length ? people : [newRow()]);
    };

    const paste = async () => {
        const pasted = await readClipboard();
        if (pasted === null) return;
        change(text.trim() ? `${text.replace(/\s+$/, '')}\n${pasted}` : pasted);
    };

    const people = rows.filter(r => !isBlankRow(r, columns));

    return (
        <Card
            title={`${step}. Who gets a certificate`}
            icon={Users}
            subtitle={people.length === 1 ? '1 person' : `${people.length} people`}
            divided
            action={
                <Button size="sm" onClick={paste}>
                    <ClipboardPaste size={14} /> Paste
                </Button>
            }
        >
            <label htmlFor="cert-people" className="block text-sm text-primary mb-2">
                One name per line. Copy the names from Excel, an email or a list, and paste them here.
            </label>
            <textarea
                id="cert-people"
                value={text}
                onChange={e => change(e.target.value)}
                rows={7}
                placeholder={'Mary O\'Brien\nJohn Murphy\nOlena Kovalenko'}
                className={`${inputCls} py-2.5 text-[16px] sm:text-sm leading-relaxed`}
                spellCheck={false}
            />

            {split && people.length > 0 && (
                <div className="mt-3">
                    <p className="text-xs text-muted mb-1.5">How the names are read:</p>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-border-subtle">
                        <table className="w-full text-sm">
                            <thead className="bg-surface-elevated/60 text-xs text-muted">
                                <tr>
                                    {columns.map(c => <th key={c} scope="col" className="text-left font-semibold px-3 py-1.5">{fieldLabel(c)}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {people.map(r => (
                                    <tr key={r.id}>
                                        {columns.map(c => <td key={c} className="px-3 py-1.5 text-primary">{r.values[c] || <span className="text-muted">—</span>}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span>A surname of two words read wrong?</span>
                        <Button size="xs" variant="ghost" onClick={onTable}>
                            <Table2 size={13} /> Fix it in a table
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
}

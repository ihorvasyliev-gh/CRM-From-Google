import { useState } from 'react';
import { FileText } from 'lucide-react';
import { fieldCls, labelCls } from '../ui/styles';
import { placeholderFor, summarizeSource } from '../../lib/pdfForms/source';

interface NameSettingProps {
    /** The pattern saved with the form ("" = automatic) */
    value: string;
    onChange: (value: string) => void;
    /** Columns to choose from (the example spreadsheet's, and those the form already uses) */
    columns: string[];
    /** What "Automatic" names forms after, e.g. "{First Name} {Last Name}" */
    automatic: string;
    /** The name the example row would get, when there is an example spreadsheet */
    example: (pattern: string) => string | null;
}

const SIMPLE = /^\{([^{}|]+)\}(?:\s+\{([^{}|]+)\})?$/;

function shorten(text: string, max = 60): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * "Each form is named after: [First Name] + [Last Name]". The name is used for the
 * file of each form and in the list of people when filling in.
 */
export default function NameSetting({ value, onChange, columns, automatic, example }: NameSettingProps) {
    const simple = value.trim() ? value.trim().match(SIMPLE) : null;
    const [typing, setTyping] = useState(!!value.trim() && !simple);
    const first = simple?.[1]?.trim() ?? '';
    const second = simple?.[2]?.trim() ?? '';
    const known = new Set(columns);
    const set = (a: string, b: string) => onChange(a ? [placeholderFor(a), b ? placeholderFor(b) : ''].filter(Boolean).join(' ') : '');
    const shown = example(value.trim() || automatic);

    const options = (current: string) => (
        <>
            {current && !known.has(current) && <option value={current}>{shorten(current)} (not in the example)</option>}
            {columns.map(c => (
                <option key={c} value={c}>
                    {shorten(c)}
                </option>
            ))}
        </>
    );

    return (
        <div className="space-y-2">
            <span className={labelCls}>Each form is named after</span>
            {typing ? (
                <input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="{First Name} {Last Name}"
                    aria-label="Name pattern"
                    className={`${fieldCls} font-mono text-xs`}
                />
            ) : (
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                    <select value={first} onChange={e => set(e.target.value, second)} aria-label="Name: first part" className={`${fieldCls} text-xs`}>
                        <option value="" title={automatic ? summarizeSource(automatic) : undefined}>Automatic</option>
                        {options(first)}
                    </select>
                    <span className="text-xs text-muted">+</span>
                    <select value={second} onChange={e => set(first, e.target.value)} disabled={!first} aria-label="Name: second part" className={`${fieldCls} text-xs`}>
                        <option value="">(nothing more)</option>
                        {options(second)}
                    </select>
                </div>
            )}
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
                <FileText size={12} className="shrink-0" />
                {shown ? (
                    <span>
                        For example: <b className="text-primary">{shown}.pdf</b>
                    </span>
                ) : (
                    <span>Used for each file and in the list of people when filling in.</span>
                )}
            </p>
            <button
                type="button"
                className="text-[11px] text-muted underline"
                onClick={() => {
                    // Leaving the text box for a pattern the lists can't show starts again from "Automatic"
                    if (typing && value.trim() && !simple) onChange('');
                    setTyping(t => !t);
                }}
            >
                {typing ? 'Choose from the lists instead' : 'Type it yourself (advanced)'}
            </button>
        </div>
    );
}

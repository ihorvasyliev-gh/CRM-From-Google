import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { fieldCls } from '../ui/styles';
import { AUTO_NAMES, describeNames, type NameSource, type Workbook } from '../../lib/pdfForms/excel';
import type { SheetData } from '../../lib/pdfForms/types';

interface SheetPickerProps {
    workbook: Workbook;
    sheetIndex: number;
    names: NameSource;
    /** The sheet as read with the current choices */
    sheet: SheetData;
    onSheet: (index: number) => void;
    onNames: (names: NameSource) => void;
    /** Show the first rows, so the person can see what was understood */
    preview?: boolean;
}

const radioCls = 'flex items-start gap-2 text-sm text-primary cursor-pointer';

/**
 * Which sheet of the workbook to use, and where its column names are. Real files have several
 * sheets, titles above the names, or no names at all: the person can always say what is right.
 */
export default function SheetPicker({ workbook, sheetIndex, names, sheet, onSheet, onNames, preview }: SheetPickerProps) {
    const [open, setOpen] = useState(false);
    const others = workbook.sheets.map((s, i) => ({ s, i })).filter(({ i }) => i !== sheetIndex);
    const foundRow = sheet.namesFrom?.kind === 'row' ? sheet.namesFrom.row : 1;
    const [rowText, setRowText] = useState(String(names.kind === 'row' ? names.row : foundRow));

    return (
        <div className="space-y-2">
            {workbook.sheets.length > 1 && (
                <label className="flex flex-wrap items-center gap-2 text-sm text-primary">
                    <span>This file has {workbook.sheets.length} sheets. Using the sheet:</span>
                    <select
                        value={sheetIndex}
                        onChange={e => {
                            setOpen(false);
                            onSheet(Number(e.target.value));
                        }}
                        aria-label="Sheet"
                        className={`${fieldCls} h-9 text-sm w-auto! min-w-[200px]`}
                    >
                        {workbook.sheets.map((sh, i) => (
                            <option key={i} value={i}>
                                {sh.name}{sh.hidden ? ' (hidden in Excel)' : ''}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            {sheet.namesFrom && (
                <div className="text-xs text-muted">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Info size={13} className="shrink-0" />
                        <span data-testid="names-note">{describeNames(sheet.namesFrom)}</span>
                        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="inline-flex items-center gap-0.5 underline hover:text-primary">
                            {open ? 'Close' : 'Not right? Change'} {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                    </p>
                    {open && (
                        <fieldset className="mt-2 space-y-2 rounded-xl border border-border-subtle bg-surface-elevated/40 p-3">
                            <legend className="px-1 text-xs font-semibold text-primary">Where are the column names?</legend>
                            <label className={radioCls}>
                                <input type="radio" name="names" checked={names.kind === 'auto'} onChange={() => onNames(AUTO_NAMES)} className="mt-0.5 accent-brand-500" />
                                <span>Find them for me <span className="text-muted">(recommended)</span></span>
                            </label>
                            <div className={radioCls}>
                                <input
                                    id="names-row"
                                    type="radio"
                                    name="names"
                                    checked={names.kind === 'row'}
                                    onChange={() => onNames({ kind: 'row', row: Number(rowText) || 1 })}
                                    className="mt-0.5 accent-brand-500"
                                />
                                <label htmlFor="names-row" className="flex flex-wrap items-center gap-2 cursor-pointer">
                                    They are in row
                                    <input
                                        type="number"
                                        min={1}
                                        value={rowText}
                                        aria-label="Row with the column names"
                                        onChange={e => {
                                            setRowText(e.target.value);
                                            const row = Math.round(Number(e.target.value));
                                            if (row >= 1) onNames({ kind: 'row', row });
                                        }}
                                        className={`${fieldCls} h-8 w-20! text-sm`}
                                    />
                                    <span className="text-muted">(the number on the left of the row in Excel)</span>
                                </label>
                            </div>
                            {others.length > 0 && (
                                <div className={radioCls}>
                                    <input
                                        id="names-sheet"
                                        type="radio"
                                        name="names"
                                        checked={names.kind === 'sheet'}
                                        onChange={() => onNames({ kind: 'sheet', sheet: others[0].i })}
                                        className="mt-0.5 accent-brand-500"
                                    />
                                    <label htmlFor="names-sheet" className="flex flex-wrap items-center gap-2 cursor-pointer">
                                        This sheet has none: take them from the sheet
                                        <select
                                            aria-label="Sheet to take the column names from"
                                            value={names.kind === 'sheet' ? names.sheet : others[0].i}
                                            onChange={e => onNames({ kind: 'sheet', sheet: Number(e.target.value) })}
                                            className={`${fieldCls} h-8 text-sm w-auto! min-w-[160px]`}
                                        >
                                            {others.map(({ s, i }) => (
                                                <option key={i} value={i}>{s.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            )}
                            <label className={radioCls}>
                                <input type="radio" name="names" checked={names.kind === 'none'} onChange={() => onNames({ kind: 'none' })} className="mt-0.5 accent-brand-500" />
                                <span>There are no column names <span className="text-muted">(call the columns A, B, C… like Excel does)</span></span>
                            </label>
                        </fieldset>
                    )}
                </div>
            )}

            {preview && sheet.rows.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border-subtle">
                    <table className="w-full text-[11px] text-left">
                        <thead className="bg-surface-elevated/60">
                            <tr>
                                {sheet.headers.slice(0, 8).map((h, i) => (
                                    <th key={i} className="px-2.5 py-1.5 font-semibold text-muted whitespace-nowrap max-w-[160px] truncate" title={h}>{h}</th>
                                ))}
                                {sheet.headers.length > 8 && <th className="px-2.5 py-1.5 text-muted">+{sheet.headers.length - 8}</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {sheet.rows.slice(0, 3).map((r, ri) => (
                                <tr key={ri}>
                                    {r.slice(0, 8).map((c, ci) => (
                                        <td key={ci} className="px-2.5 py-1.5 text-primary whitespace-nowrap max-w-[160px] truncate" title={c}>{c}</td>
                                    ))}
                                    {sheet.headers.length > 8 && <td />}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

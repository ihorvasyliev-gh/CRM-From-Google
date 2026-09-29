import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
    AlertTriangle, ArrowLeft, CheckCircle2, Download, Eye, FileDown, FileSpreadsheet, Loader2, Pencil, PencilLine, Printer, Save, Search, Users, X,
} from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import FileDropzone from '../ui/FileDropzone';
import { DateInput } from '../ui/DatePicker';
import { calloutCls, fieldCls, tableCls, tableWrapCls, tbodyCls, tdCls, thCls, theadCls, trCls } from '../ui/styles';
import { toast } from '../../lib/toast';
import { downloadBlob } from '../../lib/download';
import { downloadTemplatePdf, useFormUserName, useSaveColumnAliases } from '../../hooks/usePdfForms';
import { AUTO_NAMES, bestSheet, readWorkbook, sheetFrom, SHEET_ACCEPT, type NameSource, type Workbook } from '../../lib/pdfForms/excel';
import { FormFiller, type RowValues } from '../../lib/pdfForms/fill';
import { generateForms, type GenerateResult } from '../../lib/pdfForms/generate';
import { applyOverrides, planRows, safeFileName, templateColumns, type RowPlan } from '../../lib/pdfForms/plan';
import { matchColumns, parseLooseDate, type ColumnMatch } from '../../lib/pdfForms/source';
import { similarity } from '../../lib/pdfForms/text';
import type { PdfFormTemplate, SheetData } from '../../lib/pdfForms/types';
import PreviewModal from './PreviewModal';
import SheetPicker from './SheetPicker';
import RowReviewModal from './RowReviewModal';

interface FillViewProps {
    template: PdfFormTemplate;
    /** A spreadsheet already dropped on the forms page, and the sheet that suits this form */
    initialWorkbook?: Workbook | null;
    initialSheetIndex?: number;
    canManage: boolean;
    onBack: () => void;
    onEdit: () => void;
}

/** Big files: draw this many rows at most (search narrows them down) */
const MAX_SHOWN = 300;
/** Above this many rows nobody is ticked at first: pick the people you need */
const SELECT_ALL_UP_TO = 50;
/** Columns that say when someone filled in the registration form */
const SUBMITTED_HEADER = /\b(timestamp|submitted|submission|completion time|start time|registered|registration date|date registered|created)\b/i;

type Output = 'combined' | 'separate' | 'both';

function shorten(text: string, max = 80): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "YYYY-MM-DD" (date picker) for a spreadsheet date, or null */
function isoDay(value: string): string | null {
    const d = parseLooseDate(value);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
}

/** Small files start with everyone ticked (except rows hidden in Excel) */
function allOf(sheet: SheetData | null): Set<number> {
    if (!sheet || sheet.rows.length > SELECT_ALL_UP_TO) return new Set();
    const hidden = new Set(sheet.hiddenRows ?? []);
    return new Set(sheet.rows.map((_, i) => i).filter(i => !hidden.has(i)));
}

export default function FillView({ template, initialWorkbook = null, initialSheetIndex, canManage, onBack, onEdit }: FillViewProps) {
    const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const wanted = useMemo(() => templateColumns(template.fields, template.settings), [template]);
    const [workbook, setWorkbook] = useState<Workbook | null>(initialWorkbook);
    const [sheetIndex, setSheetIndex] = useState(() => initialSheetIndex ?? (initialWorkbook ? bestSheet(initialWorkbook, wanted) : 0));
    const [names, setNames] = useState<NameSource>(AUTO_NAMES);
    const sheet = useMemo(() => (workbook ? sheetFrom(workbook, sheetIndex, wanted, names) : null), [workbook, sheetIndex, wanted, names]);
    const [chosen, setChosen] = useState<Record<string, number>>({});
    const [selected, setSelected] = useState<Set<number>>(() => allOf(sheet));
    const [includeHidden, setIncludeHidden] = useState(false);
    const [overrides, setOverrides] = useState<Record<number, RowValues>>({});
    const [search, setSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [onlyNotes, setOnlyNotes] = useState(false);
    const [showAllColumns, setShowAllColumns] = useState(false);
    const [reviewIndex, setReviewIndex] = useState<number | null>(null);
    const [output, setOutput] = useState<Output>('combined');
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [result, setResult] = useState<GenerateResult | null>(null);
    const [preview, setPreview] = useState<{ plan: RowPlan; bytes: Uint8Array | null; warnings: string[]; error: string | null } | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const doneRef = useRef<HTMLDivElement>(null);
    const stepThreeRef = useRef<HTMLDivElement>(null);
    const saveAliases = useSaveColumnAliases();
    const userName = useFormUserName();

    useEffect(() => {
        let cancelled = false;
        downloadTemplatePdf(template.pdf_path)
            .then(bytes => !cancelled && setPdfBytes(bytes))
            .catch((err: Error) => !cancelled && setPdfError(err.message));
        return () => {
            cancelled = true;
            abortRef.current?.abort();
        };
    }, [template.pdf_path]);

    const matches = useMemo(
        () => (sheet ? matchColumns(wanted, sheet.headers, template.column_aliases, chosen) : new Map<string, ColumnMatch>()),
        [sheet, wanted, template.column_aliases, chosen],
    );
    const basePlans = useMemo(
        () => (sheet ? planRows(template.fields, template.settings, sheet, matches, template.name, { user: userName }) : []),
        [sheet, template, matches, userName],
    );
    const plans = useMemo(() => basePlans.map(p => applyOverrides(p, overrides[p.index])), [basePlans, overrides]);
    const matchList = [...matches.values()];
    const missing = matchList.filter(m => m.index === null);
    // Worth a second look: not found, or found under a different name
    const doubtful = matchList.filter(m => m.index === null || m.how === 'similar');
    const learnable = matchList.filter(m => m.index !== null && (m.how === 'similar' || m.how === 'chosen'));

    // "Registered from … to …" when the spreadsheet says when each row was sent in
    const dateColumn = sheet ? sheet.headers.findIndex(h => SUBMITTED_HEADER.test(h)) : -1;
    const rowDays = useMemo(
        () => (sheet && dateColumn >= 0 ? sheet.rows.map(r => isoDay(r[dateColumn] ?? '')) : []),
        [sheet, dateColumn],
    );

    const hiddenSet = useMemo(() => new Set(sheet?.hiddenRows ?? []), [sheet]);
    const usable = includeHidden ? plans : plans.filter(p => !hiddenSet.has(p.index));
    const query = search.trim().toLowerCase();
    const visible = usable.filter(p => {
        if (onlyNotes && p.notes.length === 0) return false;
        if (from || to) {
            const day = rowDays[p.index];
            if (!day || (from && day < from) || (to && day > to)) return false;
        }
        if (!query) return true;
        // Search the whole spreadsheet row, not just the name shown
        return p.title.toLowerCase().includes(query) || String(p.rowNumber) === query || (sheet?.rows[p.index] ?? []).some(c => c.toLowerCase().includes(query));
    });
    const shown = visible.slice(0, MAX_SHOWN);
    const chosenPlans = usable.filter(p => selected.has(p.index));
    const chosenWithNotes = chosenPlans.filter(p => p.notes.length > 0).length;
    const filtering = !!(query || from || to || onlyNotes);
    // Each separate PDF carries the form and the font (≈ 190 KB compressed)
    const zipMb = pdfBytes ? Math.round((chosenPlans.length * (pdfBytes.length + 190_000)) / 1_000_000) : 0;

    const pickSheet = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const book = await readWorkbook(file);
            const index = bestSheet(book, wanted);
            setWorkbook(book);
            startSheet(book, index);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not read the spreadsheet');
        }
    };

    /** Use another sheet (or other column names): a fresh start for columns, edits and ticks */
    const startSheet = (book: Workbook, index: number, nextNames: NameSource = AUTO_NAMES) => {
        setSheetIndex(index);
        setNames(nextNames);
        setChosen({});
        setOverrides({});
        setResult(null);
        setSearch('');
        setFrom('');
        setTo('');
        setIncludeHidden(false);
        setSelected(allOf(sheetFrom(book, index, wanted, nextNames)));
    };

    const rememberMatches = () => {
        if (!sheet) return;
        const next = { ...template.column_aliases };
        for (const m of learnable) {
            const header = sheet.headers[m.index!];
            next[m.wanted] = [...new Set([...(next[m.wanted] ?? []), header])];
        }
        saveAliases.mutate(
            { id: template.id, column_aliases: next },
            {
                onSuccess: () => toast.success('Saved: spreadsheets like this one will match by themselves next time'),
                onError: err => toast.error(err.message),
            },
        );
    };

    const toggle = (index: number) =>
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    const allVisibleSelected = visible.length > 0 && visible.every(p => selected.has(p.index));
    const tickShown = () => setSelected(prev => new Set([...prev, ...visible.map(p => p.index)]));
    const toggleAllShown = () =>
        setSelected(prev => {
            const next = new Set(prev);
            visible.forEach(p => (allVisibleSelected ? next.delete(p.index) : next.add(p.index)));
            return next;
        });

    const openPreview = async (plan: RowPlan) => {
        if (!pdfBytes) return;
        setPreview({ plan, bytes: null, warnings: [], error: null });
        try {
            const filler = await FormFiller.create(pdfBytes);
            const filled = await filler.fill(template.fields, plan.values, template.settings);
            setPreview({ plan, bytes: filled.bytes, warnings: [...plan.notes.map(n => `${n.field}: ${n.message}`), ...filled.warnings], error: null });
        } catch (err) {
            setPreview({ plan, bytes: null, warnings: [], error: err instanceof Error ? err.message : String(err) });
        }
    };

    const generate = async () => {
        if (!pdfBytes || chosenPlans.length === 0) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setResult(null);
        setProgress({ done: 0, total: 1 });
        try {
            const baseName = safeFileName(`${template.name} ${new Date().toISOString().slice(0, 10)}`) || 'forms';
            const res = await generateForms(pdfBytes, template.fields, template.settings, chosenPlans, {
                separate: output !== 'combined',
                combined: output !== 'separate',
                baseName,
                signal: controller.signal,
                onProgress: (done, total) => setProgress({ done, total }),
            });
            res.files.forEach(f => downloadBlob(f.blob, f.name));
            setResult(res);
            setTimeout(() => doneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        } catch (err) {
            if ((err as Error).name === 'AbortError') toast.info('Stopped. Nothing was downloaded.');
            else toast.error(`Sorry, the forms could not be made: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setProgress(null);
            abortRef.current = null;
        }
    };

    const reviewPlan = reviewIndex === null ? null : plans.find(p => p.index === reviewIndex) ?? null;
    const reviewOriginal = reviewIndex === null ? null : basePlans.find(p => p.index === reviewIndex) ?? null;
    const count = chosenPlans.length;

    return (
        <div className="space-y-4 max-w-5xl">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={onBack}>
                    <ArrowLeft size={15} /> Back to all forms
                </Button>
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-primary tracking-tight truncate">Fill in: {template.name}</h2>
                </div>
                <Button onClick={() => pdfBytes && downloadBlob(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), template.pdf_name)} disabled={!pdfBytes}>
                    <FileDown size={15} /> Empty form
                </Button>
                {canManage && (
                    <Button onClick={onEdit}>
                        <Pencil size={15} /> Change the set-up
                    </Button>
                )}
            </div>

            {pdfError && <div className={`${calloutCls.danger} text-sm p-3`}>The form could not be loaded: {pdfError}. Check your internet connection and try again.</div>}
            {template.fields.length === 0 && (
                <div className={`${calloutCls.warning} text-sm p-3`}>
                    This form isn't set up yet{canManage ? ': click “Change the set-up”.' : '. Ask an admin to set it up.'}
                </div>
            )}

            {/* ── 1. The spreadsheet ───────────────────────────── */}
            <Card title="Step 1 · Your spreadsheet" icon={FileSpreadsheet} subtitle="The Excel (or CSV) file with the answers: one row per person or group">
                <div className="space-y-3">
                    <FileDropzone
                        accept={SHEET_ACCEPT}
                        onChange={pickSheet}
                        compact={!!sheet}
                        className={sheet ? '' : 'py-10'}
                        title={workbook && sheet ? `${workbook.fileName} · ${sheet.rows.length} rows` : 'Click here to choose your spreadsheet, or drag it onto this box'}
                        hint={sheet ? 'To use a different file, click here or drop it on this box' : 'It stays on this computer: nothing is sent anywhere'}
                    />
                    {workbook && sheet && (
                        <SheetPicker
                            key={`${workbook.fileName}-${sheetIndex}`}
                            workbook={workbook}
                            sheetIndex={sheetIndex}
                            names={names}
                            sheet={sheet}
                            onSheet={i => startSheet(workbook, i)}
                            onNames={n => startSheet(workbook, sheetIndex, n)}
                        />
                    )}
                    {sheet && sheet.rows.length === 0 && (
                        <p className={`${calloutCls.warning} text-sm p-3`}>
                            {workbook && workbook.sheets.length > 1
                                ? 'This sheet has no rows of answers. Choose another sheet above.'
                                : 'This spreadsheet has column names but no rows of answers under them.'}
                        </p>
                    )}
                    {sheet && (sheet.skippedRows ?? 0) > 0 && (
                        <p className="text-xs text-muted">
                            {sheet.skippedRows} row{sheet.skippedRows === 1 ? ' was' : 's were'} left out because {sheet.skippedRows === 1 ? 'it isn’t' : 'they aren’t'} answers (the column names repeated, or a note / total with a single cell).
                        </p>
                    )}
                    {sheet && sheet.rows.length > 0 && (doubtful.length === 0 ? (
                        <p className="flex items-center gap-2 text-sm text-status-confirmed">
                            <CheckCircle2 size={17} /> This spreadsheet has everything the form needs.
                            <button type="button" className="text-xs text-muted underline ml-1" onClick={() => setShowAllColumns(s => !s)}>
                                {showAllColumns ? 'Hide details' : 'Show details'}
                            </button>
                        </p>
                    ) : (
                        <div className={`${calloutCls.warning} p-3 space-y-2`}>
                            <p className="text-sm font-semibold flex items-center gap-2">
                                <AlertTriangle size={16} className="text-status-requested" />
                                {missing.length
                                    ? `${missing.length} piece${missing.length === 1 ? '' : 's'} of information couldn't be found in your spreadsheet.`
                                    : 'Please check that these columns are right.'}
                            </p>
                            <p className="text-xs text-muted">
                                Choose the column that has it, or leave it as “Leave blank” (that part of the form stays empty for you to fill in by hand).
                            </p>
                            <ColumnPicker list={showAllColumns ? matchList : doubtful} headers={sheet.headers} onPick={(w, i) => setChosen(prev => ({ ...prev, [w]: i }))} />
                            <button type="button" className="text-xs text-muted underline" onClick={() => setShowAllColumns(s => !s)}>
                                {showAllColumns ? 'Show only these' : 'Show all the information the form uses'}
                            </button>
                        </div>
                    ))}
                    {sheet && doubtful.length === 0 && showAllColumns && (
                        <ColumnPicker list={matchList} headers={sheet.headers} onPick={(w, i) => setChosen(prev => ({ ...prev, [w]: i }))} />
                    )}
                    {sheet && canManage && learnable.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span>Will you get spreadsheets like this again?</span>
                            <Button size="sm" onClick={rememberMatches} loading={saveAliases.isPending}>
                                <Save size={13} /> Remember these columns
                            </Button>
                        </div>
                    )}
                </div>
            </Card>

            {/* ── 2. Who needs a form ──────────────────────────── */}
            {sheet && (
                <Card
                    title="Step 2 · Who needs a form?"
                    icon={Users}
                    subtitle={`Tick the people (or groups) to make forms for. ${usable.length} in the spreadsheet${hiddenSet.size && !includeHidden ? ` (plus ${hiddenSet.size} hidden in Excel)` : ''}.`}
                    divided
                    flush
                >
                    <div className="px-4 sm:px-5 py-3 space-y-3 border-b border-border-subtle">
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="flex-1 min-w-[220px]">
                                <span className="block text-xs font-semibold text-muted mb-1">Find a person</span>
                                <span className="relative block">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                                    <input
                                        type="search"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="Type a name, email or phone…"
                                        aria-label="Search rows"
                                        className={`${fieldCls} h-10 pl-9 text-sm`}
                                    />
                                </span>
                            </label>
                            {dateColumn >= 0 && (
                                <div className="flex items-end gap-2">
                                    <label>
                                        <span className="block text-xs font-semibold text-muted mb-1">Sent in from</span>
                                        <DateInput value={from} onChange={setFrom} max={to || undefined} placeholder="Any day" className={`${fieldCls} h-10 text-sm w-40`} />
                                    </label>
                                    <label>
                                        <span className="block text-xs font-semibold text-muted mb-1">to</span>
                                        <DateInput value={to} onChange={setTo} min={from || undefined} placeholder="Any day" className={`${fieldCls} h-10 text-sm w-40`} />
                                    </label>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="brand-soft" onClick={tickShown} disabled={visible.length === 0}>
                                <CheckCircle2 size={14} /> Tick {filtering ? `these ${visible.length}` : `everyone (${visible.length})`}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
                                Untick everyone
                            </Button>
                            {filtering && (
                                <Button size="sm" variant="ghost" onClick={() => { setSearch(''); setFrom(''); setTo(''); setOnlyNotes(false); }}>
                                    <X size={13} /> Show everyone again
                                </Button>
                            )}
                            {hiddenSet.size > 0 && (
                                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                                    <input type="checkbox" checked={includeHidden} onChange={e => setIncludeHidden(e.target.checked)} className="accent-brand-500 w-4 h-4" />
                                    Include the {hiddenSet.size} row{hiddenSet.size === 1 ? '' : 's'} hidden in Excel
                                </label>
                            )}
                            <span className="ml-auto text-sm font-semibold text-primary">
                                {count === 0 ? 'Nobody ticked yet' : `${count} ticked`}
                            </span>
                        </div>
                        {usable.length > SELECT_ALL_UP_TO && count === 0 && !filtering && (
                            <p className="text-xs text-muted">
                                This spreadsheet is big. Find the people you need{dateColumn >= 0 ? ' (or choose the days they sent the form in)' : ''} and tick them, or click “Tick everyone”.
                            </p>
                        )}
                        {plans.some(p => p.notes.length > 0) && (
                            <p className="text-xs text-muted flex items-start gap-1.5">
                                <AlertTriangle size={13} className="text-status-requested shrink-0 mt-0.5" />
                                <span>
                                    Rows in orange have a note. They will still be filled in: the note just tells you what was left blank or which answer was used.
                                    <button type="button" className="underline ml-1" onClick={() => setOnlyNotes(o => !o)}>
                                        {onlyNotes ? 'Show all rows' : 'Show only these rows'}
                                    </button>
                                </span>
                            </p>
                        )}
                    </div>
                    <div className={`${tableWrapCls} max-h-[60vh] overflow-y-auto`}>
                        <table className={tableCls}>
                            <thead className={`${theadCls} sticky top-0 z-10`}>
                                <tr>
                                    <th className={`${thCls} w-12`}>
                                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllShown} aria-label="Tick all shown" className="accent-brand-500 w-4 h-4" />
                                    </th>
                                    <th className={thCls}>Name</th>
                                    <th className={thCls}>Notes</th>
                                    <th className={`${thCls} text-right`}>Check this form</th>
                                </tr>
                            </thead>
                            <tbody className={tbodyCls}>
                                {shown.map(p => {
                                    const on = selected.has(p.index);
                                    return (
                                        <tr key={p.index} className={`${trCls} ${on ? 'bg-brand-500/4' : ''} cursor-pointer`} onClick={() => toggle(p.index)}>
                                            <td className={tdCls} onClick={e => e.stopPropagation()}>
                                                <input type="checkbox" checked={on} onChange={() => toggle(p.index)} aria-label={`Tick ${p.title}`} className="accent-brand-500 w-4 h-4" />
                                            </td>
                                            <td className={`${tdCls} min-w-[200px]`}>
                                                <span className="block text-sm font-medium text-primary truncate max-w-[340px]">{p.title}</span>
                                                <span className="block text-[11px] text-muted">
                                                    {p.title === `Row ${p.rowNumber}` ? 'No name found for this row' : `Row ${p.rowNumber}`}
                                                    {rowDays[p.index] ? ` · sent in ${rowDays[p.index]!.split('-').reverse().join('/')}` : ''}
                                                </span>
                                            </td>
                                            <td className={`${tdCls} min-w-[220px]`}>
                                                {p.notes.length === 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-xs text-status-confirmed">
                                                        <CheckCircle2 size={13} /> {overrides[p.index] ? 'You changed it' : 'All good'}
                                                    </span>
                                                ) : (
                                                    <ul className="space-y-0.5">
                                                        {p.notes.slice(0, 2).map(n => (
                                                            <li key={n.fieldId + n.message} className="text-[11px] text-status-requested flex items-start gap-1">
                                                                <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                                                                <span className="line-clamp-2">
                                                                    <b>{n.field}:</b> {n.message}
                                                                </span>
                                                            </li>
                                                        ))}
                                                        {p.notes.length > 2 && <li className="text-[11px] text-muted">and {p.notes.length - 2} more</li>}
                                                    </ul>
                                                )}
                                            </td>
                                            <td className={`${tdCls} text-right whitespace-nowrap`} onClick={e => e.stopPropagation()}>
                                                <Button size="sm" variant="ghost" onClick={() => openPreview(p)} disabled={!pdfBytes} title="See this filled form">
                                                    <Eye size={14} /> Preview
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => setReviewIndex(p.index)} title="Change what is printed on this form">
                                                    <PencilLine size={14} /> Edit
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {visible.length > shown.length && (
                            <p className="px-4 py-3 text-xs text-muted border-t border-border-subtle">
                                Showing the first {shown.length} of {visible.length}. Type a name above to find someone else. “Tick” still ticks all {visible.length}.
                            </p>
                        )}
                        {visible.length === 0 && <p className="px-4 py-8 text-sm text-muted text-center">Nobody matches. Try another name or other days.</p>}
                    </div>
                </Card>
            )}

            {/* ── 3. Download ──────────────────────────────────── */}
            {sheet && count > 0 && usable.length > 8 && (
                <div className="sticky bottom-3 z-10 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-surface border border-brand-500/40 shadow-lg px-4 py-2.5">
                        <span className="text-sm font-semibold text-primary">{count} ticked</span>
                        <Button variant="primary" onClick={() => stepThreeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                            <Download size={15} /> Next: download
                        </Button>
                    </div>
                </div>
            )}

            {sheet && (
                <div ref={stepThreeRef}>
                <Card title="Step 3 · Download the forms" icon={Download}>
                    <div className="space-y-4">
                        <fieldset className="grid gap-2 sm:grid-cols-3">
                            <legend className="sr-only">How to download</legend>
                            {([
                                { value: 'combined', icon: Printer, title: 'One file with all the forms', text: 'Best for printing: open it and print once.' },
                                { value: 'separate', icon: FileDown, title: 'A file for each person', text: 'Packed in one .zip folder, e.g. to email or save.' },
                                { value: 'both', icon: Download, title: 'Both', text: 'The file for printing and the .zip folder.' },
                            ] as const).map(o => (
                                <label
                                    key={o.value}
                                    className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                                        output === o.value ? 'border-brand-500 bg-brand-500/6 ring-1 ring-brand-500/40' : 'border-border-subtle hover:border-brand-500/40'
                                    }`}
                                >
                                    <input type="radio" name="output" value={o.value} checked={output === o.value} onChange={() => setOutput(o.value)} className="mt-1 accent-brand-500 w-4 h-4" />
                                    <span>
                                        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                                            <o.icon size={15} /> {o.title}
                                        </span>
                                        <span className="block text-xs text-muted mt-0.5">{o.text}</span>
                                    </span>
                                </label>
                            ))}
                        </fieldset>
                        {output !== 'combined' && zipMb > 150 && (
                            <p className={`${calloutCls.warning} text-xs p-2.5`}>
                                The .zip folder will be big (about {zipMb} MB) and may take a while. For printing, “One file with all the forms” is much smaller.
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                size="lg"
                                variant="primary"
                                className="h-12 px-6 text-base"
                                onClick={generate}
                                disabled={!pdfBytes || count === 0 || !!progress || template.fields.length === 0}
                            >
                                {progress ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                {count === 0 ? 'Tick at least one person first' : `Download ${count} form${count === 1 ? '' : 's'}`}
                            </Button>
                            {progress && (
                                <>
                                    <div className="flex-1 min-w-[160px] max-w-xs">
                                        <div className="h-2.5 rounded-full bg-surface-elevated overflow-hidden" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
                                            <div className="h-full bg-brand-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                                        </div>
                                        <p className="text-xs text-muted mt-1">Making the forms… {Math.round((progress.done / Math.max(1, progress.total)) * 100)}%</p>
                                    </div>
                                    <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                                        <X size={14} /> Stop
                                    </Button>
                                </>
                            )}
                            {!progress && count > 0 && chosenWithNotes > 0 && (
                                <span className="text-xs text-muted">{chosenWithNotes} of them have a note; you can look at them afterwards too.</span>
                            )}
                        </div>
                    </div>
                </Card>
                </div>
            )}

            {result && (
                <div ref={doneRef}>
                    <Card title="Done!" icon={CheckCircle2} tone="success" subtitle="Your forms were saved in your Downloads folder.">
                        <div className="space-y-3">
                            {result.files.some(f => f.name.endsWith('.pdf') && f.name.includes('(all')) && (
                                <p className="text-sm text-primary flex items-center gap-2">
                                    <Printer size={16} className="text-brand-500" /> To print: open the file, then press <kbd className="px-1.5 py-0.5 rounded border border-border-subtle bg-surface-elevated text-xs">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded border border-border-subtle bg-surface-elevated text-xs">P</kbd>.
                                </p>
                            )}
                            <p className="text-sm text-primary">If you can't find them, download them again here:</p>
                            <div className="flex flex-wrap gap-2">
                                {result.files.map(f => (
                                    <Button key={f.name} onClick={() => downloadBlob(f.blob, f.name)}>
                                        {f.name.endsWith('.zip') ? <FileDown size={15} /> : <Printer size={15} />} {f.name}
                                    </Button>
                                ))}
                            </div>
                            {result.files.some(f => f.name.endsWith('.zip')) && (
                                <p className="text-xs text-muted">To open the .zip folder, double-click it (on Windows: right-click it, then “Extract All”).</p>
                            )}
                            {result.warnings.length > 0 && (
                                <div className={`${calloutCls.warning} p-3 text-xs space-y-1`}>
                                    <p className="font-semibold">Worth a look before printing:</p>
                                    {result.warnings.map(w => (
                                        <p key={w.fileName}>
                                            <b>{w.fileName}</b>: {w.messages.join('; ')}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            <RowReviewModal
                plan={reviewPlan}
                original={reviewOriginal}
                fields={template.fields}
                overrides={reviewIndex === null ? undefined : overrides[reviewIndex]}
                onChange={values => reviewIndex !== null && setOverrides(prev => ({ ...prev, [reviewIndex]: values }))}
                onClose={() => setReviewIndex(null)}
                onPreview={draft => {
                    // Preview with the edits just made (the state update lands on the next render)
                    if (reviewOriginal) void openPreview(applyOverrides(reviewOriginal, draft));
                }}
            />
            <PreviewModal
                open={!!preview}
                onClose={() => setPreview(null)}
                title={preview?.plan.title ?? ''}
                fileName={preview?.plan.fileName ?? ''}
                bytes={preview?.bytes ?? null}
                warnings={preview?.warnings}
                error={preview?.error}
            />
        </div>
    );
}

/** For a column the form needs but the spreadsheet doesn't name that way: the closest-looking columns */
function guesses(m: ColumnMatch, headers: string[]): number[] {
    if (m.index !== null) return [];
    return headers
        .map((h, i) => ({ i, score: similarity(m.wanted, h) }))
        .filter(g => g.score >= 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(g => g.i);
}

/** "The form needs … → this column": one row per piece of information */
function ColumnPicker({ list, headers, onPick }: { list: ColumnMatch[]; headers: string[]; onPick: (wanted: string, index: number) => void }) {
    return (
        <ul className="space-y-2">
            {list.map(m => (
                <li key={m.wanted} className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center rounded-lg bg-surface/70 border border-border-subtle p-2">
                    <span className="text-xs text-primary" title={m.wanted}>
                        {m.index === null ? <X size={12} className="inline text-status-rejected mr-1" /> : <CheckCircle2 size={12} className="inline text-status-confirmed mr-1" />}
                        The form needs: <b>{shorten(m.wanted, 70)}</b>
                    </span>
                    <select
                        value={m.index ?? -1}
                        onChange={e => onPick(m.wanted, Number(e.target.value))}
                        aria-label={`Column for ${m.wanted}`}
                        className={`${fieldCls} text-xs ${m.index === null ? 'border-warning/60' : ''}`}
                    >
                        <option value={-1}>Leave blank</option>
                        {guesses(m, headers).length > 0 && (
                            <optgroup label="Best guesses">
                                {guesses(m, headers).map(i => <option key={`g${i}`} value={i}>{shorten(headers[i], 90)}</option>)}
                            </optgroup>
                        )}
                        <optgroup label="All columns">
                            {headers.map((h, i) => <option key={i} value={i}>{shorten(h, 90)}</option>)}
                        </optgroup>
                    </select>
                </li>
            ))}
        </ul>
    );
}

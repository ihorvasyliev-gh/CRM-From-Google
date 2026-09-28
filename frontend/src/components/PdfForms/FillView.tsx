import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
    AlertTriangle, ArrowLeft, CheckCircle2, Columns3, Download, Eye, FileDown, FileSpreadsheet, Loader2, Pencil, PencilLine, Save, Wand2, X,
} from 'lucide-react';
import Card from '../ui/Card';
import { Button, IconButton } from '../ui/Button';
import Badge from '../ui/Badge';
import FileDropzone from '../ui/FileDropzone';
import { calloutCls, fieldCls, tableCls, tableWrapCls, tbodyCls, tdCls, thCls, theadCls, trCls } from '../ui/styles';
import { toast } from '../../lib/toast';
import { downloadBlob } from '../../lib/download';
import { downloadTemplatePdf, useSaveColumnAliases } from '../../hooks/usePdfForms';
import { readSheetFile } from '../../lib/pdfForms/excel';
import { FormFiller, type RowValues } from '../../lib/pdfForms/fill';
import { generateForms, type GenerateResult } from '../../lib/pdfForms/generate';
import { applyOverrides, planRows, safeFileName, templateColumns, type RowPlan } from '../../lib/pdfForms/plan';
import { matchColumns, type ColumnMatch } from '../../lib/pdfForms/source';
import type { PdfFormTemplate, SheetData } from '../../lib/pdfForms/types';
import PreviewModal from './PreviewModal';
import RowReviewModal from './RowReviewModal';

interface FillViewProps {
    template: PdfFormTemplate;
    canManage: boolean;
    onBack: () => void;
    onEdit: () => void;
}

const HOW_LABEL: Record<ColumnMatch['how'], { text: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }> = {
    exact: { text: 'Same name', tone: 'success' },
    saved: { text: 'Remembered', tone: 'success' },
    similar: { text: 'Similar name', tone: 'info' },
    chosen: { text: 'Chosen', tone: 'info' },
    missing: { text: 'Not found', tone: 'danger' },
};

function shorten(text: string, max = 80): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export default function FillView({ template, canManage, onBack, onEdit }: FillViewProps) {
    const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [sheet, setSheet] = useState<SheetData | null>(null);
    const [chosen, setChosen] = useState<Record<string, number>>({});
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [overrides, setOverrides] = useState<Record<number, RowValues>>({});
    const [onlyIssues, setOnlyIssues] = useState(false);
    const [showColumns, setShowColumns] = useState(false);
    const [reviewIndex, setReviewIndex] = useState<number | null>(null);
    const [separate, setSeparate] = useState(true);
    const [combined, setCombined] = useState(true);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [result, setResult] = useState<GenerateResult | null>(null);
    const [preview, setPreview] = useState<{ plan: RowPlan; bytes: Uint8Array | null; warnings: string[]; error: string | null } | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const saveAliases = useSaveColumnAliases();

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

    const wanted = useMemo(() => templateColumns(template.fields, template.settings), [template]);
    const matches = useMemo(
        () => (sheet ? matchColumns(wanted, sheet.headers, template.column_aliases, chosen) : new Map<string, ColumnMatch>()),
        [sheet, wanted, template.column_aliases, chosen],
    );
    const basePlans = useMemo(
        () => (sheet ? planRows(template.fields, template.settings, sheet, matches, template.name) : []),
        [sheet, template, matches],
    );
    const plans = useMemo(() => basePlans.map(p => applyOverrides(p, overrides[p.index])), [basePlans, overrides]);
    const matchList = [...matches.values()];
    const missing = matchList.filter(m => m.index === null);
    const learnable = matchList.filter(m => m.index !== null && (m.how === 'similar' || m.how === 'chosen'));
    const visible = onlyIssues ? plans.filter(p => p.notes.length > 0) : plans;
    const chosenPlans = plans.filter(p => selected.has(p.index));
    const withIssues = plans.filter(p => p.notes.length > 0).length;

    const pickSheet = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const data = await readSheetFile(file);
            setSheet(data);
            setChosen({});
            setOverrides({});
            setResult(null);
            setSelected(new Set(data.rows.map((_, i) => i)));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not read the spreadsheet');
        }
    };

    // A spreadsheet with other column names: show the matches straight away
    useEffect(() => {
        if (sheet && matchList.some(m => m.how === 'missing' || m.how === 'similar')) setShowColumns(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new file arrives
    }, [sheet]);

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
                onSuccess: () => toast.success('Column matches saved for this template'),
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
    const toggleAll = () =>
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
        if (!pdfBytes || chosenPlans.length === 0 || (!separate && !combined)) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setResult(null);
        setProgress({ done: 0, total: 1 });
        try {
            const baseName = safeFileName(`${template.name} ${new Date().toISOString().slice(0, 10)}`) || 'forms';
            const res = await generateForms(pdfBytes, template.fields, template.settings, chosenPlans, {
                separate,
                combined,
                baseName,
                signal: controller.signal,
                onProgress: (done, total) => setProgress({ done, total }),
            });
            res.files.forEach(f => downloadBlob(f.blob, f.name));
            setResult(res);
            toast.success(`${chosenPlans.length} form(s) filled`);
        } catch (err) {
            if ((err as Error).name === 'AbortError') toast.info('Stopped');
            else toast.error(`Could not fill the forms: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setProgress(null);
            abortRef.current = null;
        }
    };

    const reviewPlan = reviewIndex === null ? null : plans.find(p => p.index === reviewIndex) ?? null;
    const reviewOriginal = reviewIndex === null ? null : basePlans.find(p => p.index === reviewIndex) ?? null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={onBack}>
                    <ArrowLeft size={15} /> All templates
                </Button>
                <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-primary tracking-tight truncate">{template.name}</h2>
                    <p className="text-[11px] text-muted truncate">
                        {template.pdf_name} · revision {template.revision} · {template.fields.length} fields
                    </p>
                </div>
                <Button
                    onClick={() => pdfBytes && downloadBlob(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), template.pdf_name)}
                    disabled={!pdfBytes}
                >
                    <FileDown size={15} /> Blank form
                </Button>
                {canManage && (
                    <Button onClick={onEdit}>
                        <Pencil size={15} /> Edit template
                    </Button>
                )}
            </div>

            {pdfError && <div className={`${calloutCls.danger} text-sm p-3`}>Could not load the PDF: {pdfError}</div>}
            {template.fields.length === 0 && (
                <div className={`${calloutCls.warning} text-sm p-3`}>
                    This template has no fields yet{canManage ? ': open “Edit template” to set them up.' : '. Ask an admin to set it up.'}
                </div>
            )}

            <Card title="1. Spreadsheet" icon={FileSpreadsheet} subtitle="Excel or CSV with one row per form. It stays in your browser.">
                <FileDropzone
                    accept=".xlsx,.xlsm,.csv,.tsv"
                    onChange={pickSheet}
                    compact={!!sheet}
                    title={sheet ? sheet.fileName : 'Drop the spreadsheet here or click to browse'}
                    hint={sheet ? `${sheet.rows.length} rows · ${sheet.headers.length} columns — drop another file to replace it` : 'Column names may differ a little from the ones the template was set up with'}
                />
            </Card>

            {sheet && (
                <Card
                    title="2. Columns"
                    icon={Columns3}
                    subtitle={missing.length ? `${missing.length} of ${matchList.length} not found` : `All ${matchList.length} columns found`}
                    action={
                        <Button size="sm" variant="ghost" onClick={() => setShowColumns(s => !s)}>
                            {showColumns ? 'Hide' : 'Show'}
                        </Button>
                    }
                    divided={showColumns}
                    flush={showColumns}
                >
                    {showColumns && (
                        <>
                            <div className={tableWrapCls}>
                                <table className={tableCls}>
                                    <thead className={theadCls}>
                                        <tr>
                                            <th className={thCls}>Template expects</th>
                                            <th className={thCls}>Column in this file</th>
                                            <th className={thCls}>Match</th>
                                        </tr>
                                    </thead>
                                    <tbody className={tbodyCls}>
                                        {matchList.map(m => (
                                            <tr key={m.wanted} className={trCls}>
                                                <td className={`${tdCls} text-xs max-w-[320px]`} title={m.wanted}>{shorten(m.wanted)}</td>
                                                <td className={tdCls}>
                                                    <select
                                                        value={m.index ?? -1}
                                                        onChange={e => setChosen(prev => ({ ...prev, [m.wanted]: Number(e.target.value) }))}
                                                        aria-label={`Column for ${m.wanted}`}
                                                        className={`${fieldCls} h-8 text-xs min-w-[220px] ${m.index === null ? 'border-danger/50' : ''}`}
                                                    >
                                                        <option value={-1}>(leave empty)</option>
                                                        {sheet.headers.map((h, i) => <option key={i} value={i}>{shorten(h, 90)}</option>)}
                                                    </select>
                                                </td>
                                                <td className={tdCls}>
                                                    <Badge tone={HOW_LABEL[m.how].tone}>
                                                        {HOW_LABEL[m.how].text}
                                                        {m.how === 'similar' ? ` ${Math.round(m.score * 100)}%` : ''}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {canManage && learnable.length > 0 && (
                                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-border-subtle">
                                    <p className="text-xs text-muted">Remember these {learnable.length} match(es), so files like this one fill without checking.</p>
                                    <Button size="sm" onClick={rememberMatches} loading={saveAliases.isPending}>
                                        <Save size={13} /> Remember
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </Card>
            )}

            {sheet && (
                <Card
                    title="3. Forms"
                    icon={PencilLine}
                    subtitle={`${selected.size} of ${plans.length} selected${withIssues ? ` · ${withIssues} with warnings` : ''}`}
                    divided
                    flush
                    action={
                        withIssues > 0 && (
                            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                                <input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} className="accent-brand-500" />
                                Only with warnings
                            </label>
                        )
                    }
                >
                    <div className={`${tableWrapCls} max-h-[55vh] overflow-y-auto`}>
                        <table className={tableCls}>
                            <thead className={`${theadCls} sticky top-0 z-10`}>
                                <tr>
                                    <th className={`${thCls} w-10`}>
                                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all" className="accent-brand-500" />
                                    </th>
                                    <th className={`${thCls} w-16`}>Row</th>
                                    <th className={thCls}>Form</th>
                                    <th className={thCls}>Check</th>
                                    <th className={`${thCls} text-right`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className={tbodyCls}>
                                {visible.map(p => (
                                    <tr key={p.index} className={trCls}>
                                        <td className={tdCls}>
                                            <input type="checkbox" checked={selected.has(p.index)} onChange={() => toggle(p.index)} aria-label={`Select ${p.title}`} className="accent-brand-500" />
                                        </td>
                                        <td className={`${tdCls} text-xs text-muted tabular-nums`}>{p.rowNumber}</td>
                                        <td className={`${tdCls} min-w-[200px]`}>
                                            <span className="block text-sm font-medium text-primary truncate max-w-[340px]">{p.title}</span>
                                            <span className="block text-[11px] text-muted truncate max-w-[340px]">{p.fileName}</span>
                                        </td>
                                        <td className={`${tdCls} min-w-[220px]`}>
                                            {p.notes.length === 0 ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-status-confirmed">
                                                    <CheckCircle2 size={13} /> {overrides[p.index] ? 'Edited' : 'OK'}
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
                                                    {p.notes.length > 2 && <li className="text-[11px] text-muted">+{p.notes.length - 2} more</li>}
                                                </ul>
                                            )}
                                        </td>
                                        <td className={`${tdCls} text-right whitespace-nowrap`}>
                                            <IconButton label="Check and edit" onClick={() => setReviewIndex(p.index)}>
                                                <PencilLine size={15} />
                                            </IconButton>
                                            <IconButton label="Preview" onClick={() => openPreview(p)} disabled={!pdfBytes}>
                                                <Eye size={15} />
                                            </IconButton>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 border-t border-border-subtle">
                        <label className="flex items-center gap-1.5 text-xs text-primary cursor-pointer">
                            <input type="checkbox" checked={separate} onChange={e => setSeparate(e.target.checked)} className="accent-brand-500" />
                            A PDF per form (ZIP)
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-primary cursor-pointer">
                            <input type="checkbox" checked={combined} onChange={e => setCombined(e.target.checked)} className="accent-brand-500" />
                            One combined PDF for printing
                        </label>
                        <div className="ml-auto flex items-center gap-2">
                            {progress && (
                                <>
                                    <div className="w-40 h-2 rounded-full bg-surface-elevated overflow-hidden" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
                                        <div className="h-full bg-brand-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                                    </div>
                                    <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>
                                        <X size={13} /> Stop
                                    </Button>
                                </>
                            )}
                            <Button
                                variant="primary"
                                onClick={generate}
                                disabled={!pdfBytes || chosenPlans.length === 0 || (!separate && !combined) || !!progress || template.fields.length === 0}
                            >
                                {progress ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                                Fill {chosenPlans.length} form{chosenPlans.length === 1 ? '' : 's'}
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {result && (
                <Card title="Done" icon={CheckCircle2} tone="success" subtitle="The files were downloaded. Download them again here.">
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {result.files.map(f => (
                                <Button key={f.name} size="sm" onClick={() => downloadBlob(f.blob, f.name)}>
                                    <Download size={13} /> {f.name}
                                </Button>
                            ))}
                        </div>
                        {result.warnings.length > 0 && (
                            <div className={`${calloutCls.warning} p-3 text-xs space-y-1`}>
                                <p className="font-semibold">Check these forms:</p>
                                {result.warnings.map(w => (
                                    <p key={w.fileName}>
                                        <b>{w.fileName}</b>: {w.messages.join('; ')}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </Card>
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

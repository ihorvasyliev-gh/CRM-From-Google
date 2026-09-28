import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
    AlertTriangle, ArrowLeft, CheckSquare, Eye, FileSpreadsheet, FileUp, Loader2, MousePointer2, Save, Sparkles, Square, Type, Upload,
} from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import Badge from '../ui/Badge';
import FileDropzone from '../ui/FileDropzone';
import ConfirmDialog from '../ConfirmDialog';
import { calloutCls, fieldCls, labelCls } from '../ui/styles';
import { toast } from '../../lib/toast';
import { checkPdfFile, downloadTemplatePdf, useSavePdfFormTemplate } from '../../hooks/usePdfForms';
import { autoMapTemplate, newId, optionFromCheckbox, saysSelectOne } from '../../lib/pdfForms/autoMap';
import { withSiblings } from '../../lib/pdfForms/choice';
import { readSheetFile } from '../../lib/pdfForms/excel';
import { FormFiller } from '../../lib/pdfForms/fill';
import { cellAt, insetCell } from '../../lib/pdfForms/layout';
import { computeValue, templateColumns } from '../../lib/pdfForms/plan';
import { reanchorFields, type ReanchorResult } from '../../lib/pdfForms/reanchor';
import { matchColumns, sourceColumns } from '../../lib/pdfForms/source';
import {
    DEFAULT_FONT_SIZE, DEFAULT_SETTINGS, type Checkbox, type ChoiceField, type FormField, type PdfFormTemplate, type PdfLayout, type Rect, type SheetData, type TemplateSettings, type TextField,
} from '../../lib/pdfForms/types';
import FieldInspector from './FieldInspector';
import PreviewModal from './PreviewModal';
import RevisionModal from './RevisionModal';
import { loadPdf, rectStyle, useElementWidth, usePdfDocument } from './pdfHooks';
import { PdfPage } from './pdfView';

interface TemplateEditorProps {
    template: PdfFormTemplate | null;
    onBack: () => void;
    onSaved: (template: PdfFormTemplate) => void;
}

type Drag =
    | { kind: 'move'; id: string; dx: number; dy: number; moved: boolean }
    | { kind: 'resize'; id: string }
    | { kind: 'draw'; page: number; x0: number; y0: number; x1: number; y1: number };

const sameBox = (a: Rect, b: Rect) => a.page === b.page && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;

function textAt(layout: PdfLayout, rect: Rect): string {
    // Name a new field after the printed label on its left
    const midY = rect.y + rect.h / 2;
    const label = layout.phrases
        .filter(p => p.page === rect.page && p.x + p.w <= rect.x + 4 && Math.abs(p.y + p.h * 0.3 - midY) < Math.max(rect.h / 2, p.h))
        .sort((a, b) => b.x + b.w - (a.x + a.w))[0];
    return label?.text ?? 'New field';
}

export default function TemplateEditor({ template, onBack, onSaved }: TemplateEditorProps) {
    const [name, setName] = useState(template?.name ?? '');
    const [description, setDescription] = useState(template?.description ?? '');
    const [fields, setFields] = useState<FormField[]>(template?.fields ?? []);
    const [settings, setSettings] = useState<TemplateSettings>(template?.settings ?? DEFAULT_SETTINGS);
    const [aliases, setAliases] = useState<Record<string, string[]>>(template?.column_aliases ?? {});
    const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
    const [pendingPdf, setPendingPdf] = useState<File | null>(null);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [sample, setSample] = useState<SheetData | null>(null);
    const [sampleRow, setSampleRow] = useState(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<'select' | 'draw'>('select');
    const [page, setPage] = useState(0);
    const [showBoxes, setShowBoxes] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [drag, setDrag] = useState<Drag | null>(null);
    const [flagged, setFlagged] = useState<Set<string>>(new Set());
    const [revision, setRevision] = useState<{ result: ReanchorResult; bytes: Uint8Array; file: File } | null>(null);
    const [revisionBusy, setRevisionBusy] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [preview, setPreview] = useState<{ bytes: Uint8Array | null; warnings: string[]; error: string | null } | null>(null);
    const save = useSavePdfFormTemplate();

    // Existing template: fetch its PDF
    useEffect(() => {
        if (!template) return;
        let cancelled = false;
        downloadTemplatePdf(template.pdf_path)
            .then(bytes => !cancelled && setPdfBytes(bytes))
            .catch((err: Error) => !cancelled && setPdfError(err.message));
        return () => {
            cancelled = true;
        };
    }, [template]);

    const { pdf, loading: pdfLoading, error: openError } = usePdfDocument(pdfBytes);
    const layout = pdf?.layout ?? null;
    const pageCount = layout?.pages.length ?? 0;
    const currentPage = Math.min(page, Math.max(0, pageCount - 1));

    const [viewRef, measuredWidth] = useElementWidth<HTMLDivElement>();
    const viewWidth = Math.min(measuredWidth, 1000);

    const change = useCallback((next: FormField[] | ((prev: FormField[]) => FormField[])) => {
        setFields(next);
        setDirty(true);
    }, []);
    const updateField = useCallback((field: FormField) => change(prev => prev.map(f => (f.id === field.id ? field : f))), [change]);
    const selected = fields.find(f => f.id === selectedId) ?? null;

    const columns = useMemo(() => {
        const used = fields.flatMap(f => sourceColumns(f.source));
        return [...new Set([...(sample?.headers ?? []), ...used])];
    }, [fields, sample]);
    const columnMatches = useMemo(
        () => matchColumns(templateColumns(fields, settings), sample?.headers ?? [], aliases),
        [fields, settings, sample, aliases],
    );
    const missingColumns = useMemo(
        () => (sample ? [...columnMatches.values()].filter(m => m.index === null).map(m => m.wanted) : []),
        [columnMatches, sample],
    );

    // ─── Files ──────────────────────────────────────────────
    const pickPdf = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const problem = checkPdfFile(file);
        if (problem) return toast.error(problem);
        setPdfError(null);
        setPdfBytes(new Uint8Array(await file.arrayBuffer()));
        setPendingPdf(file);
        if (!name.trim()) setName(file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim());
        setDirty(true);
    };

    const pickRevision = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !layout) return;
        const problem = checkPdfFile(file);
        if (problem) return toast.error(problem);
        setRevisionBusy(true);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const next = await loadPdf(bytes);
            const result = reanchorFields(fields, layout, next.layout);
            void next.doc.loadingTask.destroy();
            setRevision({ result, bytes, file });
        } catch (err) {
            toast.error(`Could not read the new PDF: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setRevisionBusy(false);
        }
    };

    const applyRevision = () => {
        if (!revision) return;
        change(revision.result.fields);
        setFlagged(new Set(revision.result.items.filter(i => i.status === 'check' || i.status === 'missing').map(i => i.fieldId)));
        setPdfBytes(revision.bytes);
        setPendingPdf(revision.file);
        setRevision(null);
        toast.info('Fields moved to the new PDF. Check the flagged ones, then save.');
    };

    const pickSample = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const sheet = await readSheetFile(file);
            setSample(sheet);
            setSampleRow(0);
            toast.success(`${sheet.rows.length} rows, ${sheet.headers.length} columns`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not read the spreadsheet');
        }
    };

    const autoSetup = () => {
        if (!layout || !sample) return;
        const used = new Set(fields.flatMap(f => sourceColumns(f.source)));
        const suggestions = autoMapTemplate(layout, sample).filter(f => sourceColumns(f.source).every(c => !used.has(c)));
        if (suggestions.length === 0) return toast.info('No more columns could be matched automatically. Add fields by hand.');
        change(prev => [...prev, ...suggestions]);
        toast.success(`${suggestions.length} field(s) added. Check each one on the page.`);
    };

    // ─── Page interaction ───────────────────────────────────
    const boxOwner = useCallback(
        (c: Checkbox) => fields.find(f => f.kind === 'choice' && f.options.some(o => sameBox(o.rect, c.rect))) as ChoiceField | undefined,
        [fields],
    );

    const toggleBox = (field: ChoiceField, c: Checkbox) => {
        const has = field.options.some(o => sameBox(o.rect, c.rect));
        const options = has ? field.options.filter(o => !sameBox(o.rect, c.rect)) : [...field.options, optionFromCheckbox(c)];
        const single = field.options.length === 0 && layout ? saysSelectOne([c], layout) : field.single;
        updateField({ ...field, options, single });
    };

    const addChoiceField = () => {
        const field: ChoiceField = { id: newId('f'), kind: 'choice', name: 'New checkboxes', source: '', single: false, options: [] };
        change(prev => [...prev, field]);
        setSelectedId(field.id);
        setMode('select');
    };

    const createTextField = (rect: Rect) => {
        if (!layout) return;
        const field: TextField = {
            id: newId('f'),
            kind: 'text',
            name: textAt(layout, rect),
            source: '',
            rect,
            fontSize: DEFAULT_FONT_SIZE,
            multiline: rect.h >= DEFAULT_FONT_SIZE * 2.4,
            align: 'left',
        };
        change(prev => [...prev, field]);
        setSelectedId(field.id);
    };

    const pageHeight = layout?.pages[currentPage]?.h ?? 0;
    const pointFrom = (e: ReactPointerEvent<HTMLDivElement>, scale: number) => {
        const box = e.currentTarget.getBoundingClientRect();
        return { x: (e.clientX - box.left) / scale, y: pageHeight - (e.clientY - box.top) / scale };
    };

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, scale: number) => {
        if (!layout || e.button !== 0) return;
        const pt = pointFrom(e, scale);
        const handle = 8 / scale;
        e.currentTarget.setPointerCapture(e.pointerId);

        if (mode === 'draw') {
            setDrag({ kind: 'draw', page: currentPage, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
            return;
        }
        // Resize handle of the selected text field
        if (selected?.kind === 'text' && selected.rect.page === currentPage) {
            const r = selected.rect;
            if (Math.abs(pt.x - (r.x + r.w)) <= handle && Math.abs(pt.y - r.y) <= handle) {
                setDrag({ kind: 'resize', id: selected.id });
                return;
            }
        }
        // Checkboxes: add to / remove from the selected checkbox field, or select their field
        const box = showBoxes || selected?.kind === 'choice'
            ? layout.checkboxes.find(c => c.rect.page === currentPage && pt.x >= c.rect.x - 2 && pt.x <= c.rect.x + c.rect.w + 2 && pt.y >= c.rect.y - 2 && pt.y <= c.rect.y + c.rect.h + 2)
            : undefined;
        if (box) {
            if (selected?.kind === 'choice') toggleBox(selected, box);
            else {
                const owner = boxOwner(box);
                setSelectedId(owner?.id ?? null);
                if (!owner) toast.info('Select a checkbox field (or add one) to use this box.');
            }
            return;
        }
        // Text fields (the selected one wins when they overlap)
        const texts = fields.filter((f): f is TextField => f.kind === 'text' && f.rect.page === currentPage);
        const hit = [...texts].sort((a, b) => (a.id === selectedId ? -1 : b.id === selectedId ? 1 : 0))
            .find(f => pt.x >= f.rect.x && pt.x <= f.rect.x + f.rect.w && pt.y >= f.rect.y && pt.y <= f.rect.y + f.rect.h);
        if (hit) {
            setSelectedId(hit.id);
            setDrag({ kind: 'move', id: hit.id, dx: pt.x - hit.rect.x, dy: pt.y - hit.rect.y, moved: false });
            return;
        }
        setSelectedId(null);
    };

    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>, scale: number) => {
        if (!drag) return;
        const pt = pointFrom(e, scale);
        if (drag.kind === 'draw') {
            setDrag({ ...drag, x1: pt.x, y1: pt.y });
            return;
        }
        const field = fields.find(f => f.id === drag.id);
        if (field?.kind !== 'text') return;
        if (drag.kind === 'move') {
            if (!drag.moved) setDrag({ ...drag, moved: true });
            updateField({ ...field, rect: { ...field.rect, x: pt.x - drag.dx, y: pt.y - drag.dy } });
        } else {
            const top = field.rect.y + field.rect.h;
            const w = Math.max(10, pt.x - field.rect.x);
            const y = Math.min(pt.y, top - 6);
            updateField({ ...field, rect: { ...field.rect, w, y, h: top - y } });
        }
    };

    const onPointerUp = () => {
        if (drag?.kind === 'draw' && layout) {
            const w = Math.abs(drag.x1 - drag.x0);
            const h = Math.abs(drag.y1 - drag.y0);
            if (w < 4 && h < 4) {
                // A click: take the table cell under it
                const cell = cellAt(layout, drag.page, drag.x0, drag.y0);
                createTextField(cell ? insetCell(cell) : { page: drag.page, x: drag.x0, y: drag.y0 - 7, w: 150, h: 14 });
            } else {
                createTextField({ page: drag.page, x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.max(w, 10), h: Math.max(h, 6) });
            }
            setMode('select');
        }
        setDrag(null);
    };

    // Delete / arrow keys for the selected field
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (!selected || t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                change(prev => prev.filter(f => f.id !== selected.id));
                setSelectedId(null);
            } else if (selected.kind === 'text' && e.key.startsWith('Arrow')) {
                e.preventDefault();
                const step = e.shiftKey ? 5 : 1;
                const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key] ?? [0, 0];
                updateField({ ...selected, rect: { ...selected.rect, x: selected.rect.x + d[0], y: selected.rect.y + d[1] } });
            } else if (e.key === 'Escape') {
                setSelectedId(null);
                setMode('select');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selected, change, updateField]);

    // Jump to the page of a field picked from the list
    const selectField = (f: FormField) => {
        setSelectedId(f.id);
        const p = f.kind === 'text' ? f.rect.page : f.options[0]?.rect.page;
        if (p !== undefined) setPage(p);
    };

    // ─── Preview & save ─────────────────────────────────────
    const runPreview = async () => {
        if (!pdfBytes) return;
        setPreview({ bytes: null, warnings: [], error: null });
        try {
            const row = sample?.rows[sampleRow] ?? [];
            const values = Object.fromEntries(
                fields.map(f => {
                    if (!sample) {
                        // No sample: show each text field's name so boxes can be checked
                        return [f.id, f.kind === 'text' ? { kind: 'text' as const, text: f.name } : { kind: 'choice' as const, ticked: f.options.slice(0, 1).map(o => o.id) }];
                    }
                    return [f.id, computeValue(f, row, sample.rowNumbers?.[sampleRow] ?? sampleRow + 2, columnMatches).value];
                }),
            );
            const filler = await FormFiller.create(pdfBytes);
            const filled = await filler.fill(fields, values, settings);
            setPreview({ bytes: filled.bytes, warnings: filled.warnings, error: null });
        } catch (err) {
            setPreview({ bytes: null, warnings: [], error: err instanceof Error ? err.message : String(err) });
        }
    };

    const doSave = () => {
        if (!name.trim()) return toast.error('Give the template a name.');
        if (!template && !pendingPdf) return toast.error('Upload the PDF form first.');
        save.mutate(
            { id: template?.id, draft: { name, description, fields, column_aliases: aliases, settings }, pdf: pendingPdf ?? undefined },
            {
                onSuccess: saved => {
                    toast.success('Template saved');
                    setDirty(false);
                    setPendingPdf(null);
                    setFlagged(new Set());
                    onSaved(saved);
                },
                onError: err => toast.error(err.message),
            },
        );
    };

    // Remember column choices made for the sample (so the next spreadsheet matches too)
    const rememberColumn = (wanted: string, header: string) => {
        setAliases(prev => ({ ...prev, [wanted]: [...new Set([...(prev[wanted] ?? []), header])] }));
        setDirty(true);
    };

    const back = () => (dirty ? setConfirmLeave(true) : onBack());

    // ─── Render ─────────────────────────────────────────────
    const drawRect = drag?.kind === 'draw'
        ? { page: drag.page, x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }
        : null;

    const overlay = (scale: number) => {
        if (!layout) return null;
        const pageBoxes = layout.checkboxes.filter(c => c.rect.page === currentPage);
        const selectedChoice = selected?.kind === 'choice' ? selected : null;
        return (
            <div
                className={`absolute inset-0 ${mode === 'draw' ? 'cursor-crosshair' : 'cursor-default'} touch-none`}
                onPointerDown={e => onPointerDown(e, scale)}
                onPointerMove={e => onPointerMove(e, scale)}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                data-testid="pdf-overlay"
            >
                {(showBoxes || selectedChoice) && pageBoxes.map(c => {
                    const owner = boxOwner(c);
                    const inSelected = selectedChoice?.options.some(o => sameBox(o.rect, c.rect));
                    const cls = inSelected
                        ? 'bg-emerald-500/35 ring-2 ring-emerald-500'
                        : owner
                            ? 'bg-brand-500/20 ring-1 ring-brand-500/70'
                            : 'ring-1 ring-dashed ring-amber-500/70 hover:bg-amber-400/25';
                    return <div key={c.id} title={c.label} className={`absolute pointer-events-none rounded-[2px] ${cls}`} style={rectStyle(c.rect, scale, pageHeight)} />;
                })}
                {/* Options of the selected field that match no detected box (e.g. after a revision) */}
                {selectedChoice?.options
                    .filter(o => o.rect.page === currentPage && !pageBoxes.some(c => sameBox(o.rect, c.rect)))
                    .map(o => <div key={o.id} title={o.label} className="absolute pointer-events-none rounded-[2px] bg-red-500/30 ring-2 ring-red-500" style={rectStyle(o.rect, scale, pageHeight)} />)}
                {fields.filter((f): f is TextField => f.kind === 'text' && f.rect.page === currentPage).map(f => {
                    const isSel = f.id === selectedId;
                    return (
                        <div
                            key={f.id}
                            className={`absolute pointer-events-none rounded-[3px] ${isSel ? 'bg-brand-500/15 ring-2 ring-brand-500' : flagged.has(f.id) ? 'bg-amber-400/20 ring-2 ring-amber-500' : 'bg-sky-400/10 ring-1 ring-sky-500/70'}`}
                            style={rectStyle(f.rect, scale, pageHeight)}
                        >
                            <span className={`absolute -top-4 left-0 max-w-full truncate px-1 rounded-sm text-[9px] font-semibold leading-4 ${isSel ? 'bg-brand-500 text-white' : 'bg-sky-600/80 text-white'}`}>
                                {f.name}
                            </span>
                            {isSel && <span className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-brand-500 ring-2 ring-white cursor-nwse-resize" />}
                        </div>
                    );
                })}
                {drawRect && drawRect.page === currentPage && (
                    <div className="absolute pointer-events-none ring-2 ring-brand-500 bg-brand-500/10" style={rectStyle(drawRect, scale, pageHeight)} />
                )}
            </div>
        );
    };

    const flaggedCount = fields.filter(f => flagged.has(f.id)).length;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={back}>
                    <ArrowLeft size={15} /> All templates
                </Button>
                <h2 className="text-base font-semibold text-primary tracking-tight truncate flex-1 min-w-0">
                    {template ? `Edit “${template.name}”` : 'New PDF form template'}
                    {dirty && <span className="ml-2 text-xs font-medium text-status-requested">unsaved</span>}
                </h2>
                {layout && (
                    <label className={`inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-xl border border-border-subtle bg-surface hover:bg-surface-elevated cursor-pointer ${revisionBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                        {revisionBusy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} New revision of the PDF
                        <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={pickRevision} />
                    </label>
                )}
                <Button onClick={runPreview} disabled={!pdfBytes}>
                    <Eye size={15} /> Preview
                </Button>
                <Button variant="primary" onClick={doSave} loading={save.isPending} disabled={!pdfBytes}>
                    <Save size={15} /> Save
                </Button>
            </div>

            {!pdfBytes && !template ? (
                <Card title="1. The PDF form" icon={Upload} subtitle="The blank form exactly as you print it (a flat PDF is fine)">
                    <FileDropzone accept="application/pdf,.pdf" onChange={pickPdf} title="Drop the PDF form here or click to browse" hint="Up to 20 MB" />
                </Card>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
                    {/* Page */}
                    <Card flush className="overflow-hidden">
                        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
                            <div className="flex items-center gap-1" role="tablist" aria-label="Pages">
                                {Array.from({ length: pageCount }, (_, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        role="tab"
                                        aria-selected={i === currentPage}
                                        onClick={() => setPage(i)}
                                        className={`h-7 min-w-7 px-2 rounded-lg text-xs font-semibold ${i === currentPage ? 'bg-brand-500 text-white' : 'text-muted hover:text-primary hover:bg-surface-elevated'}`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>
                            <span className="w-px h-5 bg-border-subtle mx-1" />
                            <Button size="sm" variant={mode === 'select' ? 'brand-soft' : 'ghost'} onClick={() => setMode('select')}>
                                <MousePointer2 size={13} /> Select
                            </Button>
                            <Button size="sm" variant={mode === 'draw' ? 'brand-soft' : 'ghost'} onClick={() => { setMode('draw'); setSelectedId(null); }}>
                                <Type size={13} /> Text field
                            </Button>
                            <Button size="sm" variant="ghost" onClick={addChoiceField}>
                                <CheckSquare size={13} /> Checkboxes
                            </Button>
                            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                                <input type="checkbox" checked={showBoxes} onChange={e => setShowBoxes(e.target.checked)} className="accent-brand-500" />
                                Show found boxes
                            </label>
                        </div>
                        <div className="px-3 py-2 text-[11px] text-muted border-b border-border-subtle bg-surface-elevated/40">
                            {mode === 'draw'
                                ? 'Click a table cell to put a text field in it, or drag to draw the box.'
                                : selected?.kind === 'choice'
                                    ? `Click checkboxes to add them to “${selected.name}” (green) or take them out.`
                                    : 'Click a field to edit it. Dashed boxes are checkboxes found in the PDF; blue ones are already used.'}
                        </div>
                        <div ref={viewRef} className="p-3 sm:p-4 bg-surface-elevated/50 flex justify-center overflow-auto min-h-[300px]">
                            {pdfError || openError ? (
                                <div className={`${calloutCls.danger} text-sm p-3 self-start`}>{pdfError || openError}</div>
                            ) : pdfLoading || !pdf || !layout ? (
                                <div className="flex items-center gap-2 text-sm text-muted py-20">
                                    <Loader2 size={18} className="animate-spin" /> Reading the PDF…
                                </div>
                            ) : (
                                viewWidth > 0 && (
                                    <PdfPage doc={pdf.doc} page={currentPage} size={layout.pages[currentPage]} width={viewWidth - 32} overlay={overlay} />
                                )
                            )}
                        </div>
                        {layout && (
                            <p className="px-3 py-2 text-[11px] text-muted border-t border-border-subtle">
                                Found {layout.checkboxes.length} checkboxes and {layout.phrases.length} labels in {pageCount} page(s).
                                {layout.checkboxes.length === 0 && ' No checkboxes found: this PDF may be a scan; text fields still work.'}
                            </p>
                        )}
                    </Card>

                    {/* Sidebar */}
                    <div className="space-y-4 lg:sticky lg:top-20">
                        <Card title="Template" icon={FileUp}>
                            <div className="space-y-3">
                                <div>
                                    <label className={labelCls} htmlFor="tpl-name">Name</label>
                                    <input id="tpl-name" value={name} onChange={e => { setName(e.target.value); setDirty(true); }} className={fieldCls} placeholder="e.g. SICAP CO registration" />
                                </div>
                                <div>
                                    <label className={labelCls} htmlFor="tpl-desc">Description (optional)</label>
                                    <input id="tpl-desc" value={description} onChange={e => { setDescription(e.target.value); setDirty(true); }} className={fieldCls} placeholder="Which spreadsheet it is for" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className={labelCls} htmlFor="tpl-mark">Tick style</label>
                                        <select id="tpl-mark" value={settings.mark} onChange={e => { setSettings({ ...settings, mark: e.target.value as TemplateSettings['mark'] }); setDirty(true); }} className={fieldCls}>
                                            <option value="tick">✓ Tick</option>
                                            <option value="cross">✗ Cross</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls} htmlFor="tpl-file">File names</label>
                                        <input
                                            id="tpl-file"
                                            value={settings.fileName}
                                            onChange={e => { setSettings({ ...settings, fileName: e.target.value }); setDirty(true); }}
                                            className={`${fieldCls} font-mono text-xs`}
                                            placeholder="First text field"
                                            title="e.g. {Name of Group} – registration"
                                        />
                                    </div>
                                </div>
                                {pendingPdf && template && (
                                    <div className={`${calloutCls.info} text-xs p-2.5`}>New PDF: {pendingPdf.name}. It replaces revision {template.revision} when you save.</div>
                                )}
                            </div>
                        </Card>

                        <Card title="Sample spreadsheet" icon={FileSpreadsheet} subtitle="Optional: to set up fields and check values">
                            <div className="space-y-3">
                                <FileDropzone compact accept=".xlsx,.xlsm,.csv,.tsv" onChange={pickSample} title={sample ? sample.fileName : 'Drop an Excel or CSV file'} hint={sample ? `${sample.rows.length} rows · ${sample.headers.length} columns` : 'Stays in your browser'} />
                                {sample && (
                                    <>
                                        <Button variant="brand-soft" className="w-full" onClick={autoSetup} disabled={!layout}>
                                            <Sparkles size={14} /> Set up fields automatically
                                        </Button>
                                        <div>
                                            <label className={labelCls} htmlFor="sample-row">Example row</label>
                                            <select id="sample-row" value={sampleRow} onChange={e => setSampleRow(Number(e.target.value))} className={fieldCls}>
                                                {sample.rows.map((r, i) => (
                                                    <option key={i} value={i}>
                                                        Row {sample.rowNumbers?.[i] ?? i + 2}: {(r.find(v => /\p{L}{2}/u.test(v)) ?? r.find(v => v.trim()) ?? '').slice(0, 50)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {missingColumns.length > 0 && (
                                            <div className={`${calloutCls.warning} text-xs p-2.5 space-y-2`}>
                                                <p className="font-semibold">Columns not in this spreadsheet:</p>
                                                {missingColumns.map(w => (
                                                    <div key={w}>
                                                        <p className="truncate" title={w}>{w}</p>
                                                        <select defaultValue="" onChange={e => e.target.value && rememberColumn(w, e.target.value)} className={`${fieldCls} h-7 text-[11px] mt-1`} aria-label={`Column for ${w}`}>
                                                            <option value="">Use column…</option>
                                                            {sample.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </Card>

                        {selected ? (
                            <Card title="Field" action={<Button size="xs" variant="ghost" onClick={() => setSelectedId(null)}>All fields</Button>}>
                                <FieldInspector
                                    field={selected}
                                    onChange={updateField}
                                    onDelete={() => { change(prev => prev.filter(f => f.id !== selected.id)); setSelectedId(null); }}
                                    onSnapToCell={selected.kind === 'text' && layout ? () => {
                                        const r = selected.rect;
                                        const cell = cellAt(layout, r.page, r.x + r.w / 2, r.y + r.h / 2);
                                        if (cell) updateField({ ...selected, rect: insetCell(cell) });
                                        else toast.info('No table cell found under this box.');
                                    } : undefined}
                                    onAddSiblings={selected.kind === 'choice' && layout ? () => {
                                        const current = layout.checkboxes.filter(c => selected.options.some(o => sameBox(o.rect, c.rect)));
                                        const extra = withSiblings(current, layout).filter(c => !current.includes(c));
                                        if (extra.length === 0) return toast.info('No other boxes found next to these.');
                                        updateField({ ...selected, options: [...selected.options, ...extra.map(optionFromCheckbox)] });
                                    } : undefined}
                                    columns={columns}
                                    sample={sample}
                                    sampleRow={sampleRow}
                                    columnMatches={columnMatches}
                                />
                            </Card>
                        ) : (
                            <Card title={`Fields (${fields.length})`} subtitle={flaggedCount ? `${flaggedCount} to check after the new revision` : 'Click one to edit it'}>
                                {fields.length === 0 ? (
                                    <p className="text-xs text-muted">
                                        No fields yet. Load a sample spreadsheet and click “Set up fields automatically”, or use <b>Text field</b> and <b>Checkboxes</b> above the page.
                                    </p>
                                ) : (
                                    <ul className="space-y-1 max-h-[50vh] overflow-y-auto -mx-1 px-1">
                                        {fields.map(f => {
                                            const cols = sourceColumns(f.source);
                                            const missing = sample && cols.some(c => columnMatches.get(c)?.index === null);
                                            const page = f.kind === 'text' ? f.rect.page : f.options[0]?.rect.page;
                                            return (
                                                <li key={f.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => selectField(f)}
                                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-surface-elevated"
                                                    >
                                                        {f.kind === 'text' ? <Type size={13} className="text-sky-600 shrink-0" /> : <Square size={13} className="text-emerald-600 shrink-0" />}
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-xs font-medium text-primary truncate">{f.name}</span>
                                                            <span className="block text-[10px] text-muted font-mono truncate">{f.source || '(no value)'}</span>
                                                        </span>
                                                        {flagged.has(f.id) && <AlertTriangle size={13} className="text-status-requested shrink-0" aria-label="Check position" />}
                                                        {missing && <Badge tone="warning">column?</Badge>}
                                                        {f.kind === 'choice' && <Badge>{f.options.length}</Badge>}
                                                        {page !== undefined && <span className="text-[10px] text-muted tabular-nums">p{page + 1}</span>}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </Card>
                        )}
                    </div>
                </div>
            )}

            <RevisionModal revision={revision?.result ?? null} fileName={revision?.file.name ?? ''} onCancel={() => setRevision(null)} onApply={applyRevision} />
            <PreviewModal
                open={!!preview}
                onClose={() => setPreview(null)}
                title="Preview"
                fileName={`${name || 'form'} (preview).pdf`}
                bytes={preview?.bytes ?? null}
                warnings={preview?.warnings}
                error={preview?.error}
            />
            <ConfirmDialog
                open={confirmLeave}
                title="Leave without saving?"
                message="Your changes to this template will be lost."
                confirmLabel="Leave"
                onConfirm={() => { setConfirmLeave(false); onBack(); }}
                onCancel={() => setConfirmLeave(false)}
            />
        </div>
    );
}

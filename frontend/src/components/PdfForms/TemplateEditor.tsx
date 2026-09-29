import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
    AlertTriangle, ArrowLeft, CheckCircle2, CheckSquare, Eye, FileSpreadsheet, FileUp, Loader2, MousePointer2, Redo2, Save, Sparkles, Square, Type, Undo2, Upload, X,
} from 'lucide-react';
import Card from '../ui/Card';
import { Button } from '../ui/Button';
import Badge from '../ui/Badge';
import FileDropzone from '../ui/FileDropzone';
import { Segmented } from '../ui/Tabs';
import SheetPicker from './SheetPicker';
import ConfirmDialog from '../ConfirmDialog';
import { calloutCls, fieldCls, labelCls } from '../ui/styles';
import { toast } from '../../lib/toast';
import { checkPdfFile, downloadTemplatePdf, useFormUserName, useSavePdfFormTemplate } from '../../hooks/usePdfForms';
import { autoMapTemplate, newId, optionFromCheckbox, saysSelectOne } from '../../lib/pdfForms/autoMap';
import { withSiblings } from '../../lib/pdfForms/choice';
import { AUTO_NAMES, bestSheet, readWorkbook, sheetFrom, SHEET_ACCEPT, type NameSource, type Workbook } from '../../lib/pdfForms/excel';
import { FormFiller } from '../../lib/pdfForms/fill';
import { cellAt, guessTitle, insetCell } from '../../lib/pdfForms/layout';
import { computeValue, defaultNamePattern, safeFileName, templateColumns } from '../../lib/pdfForms/plan';
import { reanchorFields, type ReanchorResult } from '../../lib/pdfForms/reanchor';
import { evaluateSource, matchColumns, sourceColumns, summarizeSource } from '../../lib/pdfForms/source';
import {
    DEFAULT_FONT_SIZE, DEFAULT_SETTINGS, type Checkbox, type ChoiceField, type FormField, type PdfFormTemplate, type PdfLayout, type Rect, type SheetData, type TemplateSettings, type TextField,
} from '../../lib/pdfForms/types';
import FieldInspector from './FieldInspector';
import NameSetting from './NameSetting';
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
    // The example spreadsheet: a workbook, the sheet chosen in it and where its column names are
    const [sampleBook, setSampleBook] = useState<Workbook | null>(null);
    const [sampleSheet, setSampleSheet] = useState(0);
    const [sampleNames, setSampleNames] = useState<NameSource>(AUTO_NAMES);
    const sample = useMemo<SheetData | null>(
        () => (sampleBook ? sheetFrom(sampleBook, sampleSheet, [], sampleNames) : null),
        [sampleBook, sampleSheet, sampleNames],
    );
    const [sampleRow, setSampleRow] = useState(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [panel, setPanel] = useState<Panel>('fields');
    const [mode, setMode] = useState<'select' | 'draw'>('select');
    const [page, setPage] = useState(0);
    const [showBoxes, setShowBoxes] = useState(true);
    const [showValues, setShowValues] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [drag, setDrag] = useState<Drag | null>(null);
    const [flagged, setFlagged] = useState<Set<string>>(new Set());
    const [revision, setRevision] = useState<{ result: ReanchorResult; bytes: Uint8Array; file: File } | null>(null);
    const [revisionBusy, setRevisionBusy] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [preview, setPreview] = useState<{ bytes: Uint8Array | null; warnings: string[]; error: string | null } | null>(null);
    const save = useSavePdfFormTemplate();
    const userName = useFormUserName();
    // New templates go step by step: the PDF, an example spreadsheet (optional), then the editor
    const [step, setStep] = useState<'pdf' | 'sample' | 'edit'>(template ? 'edit' : 'pdf');
    const [fileBase, setFileBase] = useState('');
    const nameTouched = useRef(!!template);
    const [report, setReport] = useState<{ text: number; choice: number; dates: number; unused: string[] } | null>(null);
    // Undo / redo: snapshots of the field list; quick successive edits (a drag, typing) count as one
    const [past, setPast] = useState<FormField[][]>([]);
    const [future, setFuture] = useState<FormField[][]>([]);
    const lastEdit = useRef(0);

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
        const value = typeof next === 'function' ? next(fields) : next;
        if (value === fields) return;
        const now = Date.now();
        if (now - lastEdit.current > 700) setPast(p => [...p.slice(-99), fields]);
        lastEdit.current = now;
        setFuture([]);
        setFields(value);
        setDirty(true);
    }, [fields]);

    const undo = useCallback(() => {
        if (past.length === 0) return;
        setFuture(f => [fields, ...f]);
        setFields(past[past.length - 1]);
        setPast(p => p.slice(0, -1));
        lastEdit.current = 0;
        setDirty(true);
    }, [past, fields]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        setPast(p => [...p, fields]);
        setFields(future[0]);
        setFuture(f => f.slice(1));
        lastEdit.current = 0;
        setDirty(true);
    }, [future, fields]);

    // A new template is named after the form's own title ("Community Organisation Registration Form")
    useEffect(() => {
        if (!layout || nameTouched.current) return;
        setName(guessTitle(layout) || fileBase);
    }, [layout, fileBase]);

    // Closing the tab with unsaved changes asks first
    useEffect(() => {
        if (!dirty) return;
        const warn = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
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
    // What the example row would print in each box: the page shows it, so a wrong link is easy to see
    const example = useMemo(() => {
        const row = sample?.rows[sampleRow];
        if (!sample || !row) return null;
        const ctx = { row, rowNumber: sample.rowNumbers?.[sampleRow] ?? sampleRow + 2, columns: columnMatches, user: userName };
        const text = new Map<string, string>();
        const ticked = new Set<string>();
        for (const f of fields) {
            const { value } = computeValue(f, ctx);
            if (value.kind === 'text') text.set(f.id, value.text);
            else value.ticked.forEach(id => ticked.add(id));
        }
        return { text, ticked };
    }, [sample, sampleRow, fields, columnMatches, userName]);
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
        setFileBase(file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim());
        setDirty(true);
        if (step === 'pdf') setStep('sample');
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
            const book = await readWorkbook(file);
            const index = bestSheet(book);
            const sheet = sheetFrom(book, index);
            if (sheet.headers.length === 0) throw new Error('This spreadsheet looks empty.');
            if (sheet.rows.length === 0 && book.sheets.length === 1) throw new Error('This spreadsheet has column names but no rows of answers under them.');
            setSampleBook(book);
            setSampleSheet(index);
            setSampleNames(AUTO_NAMES);
            setSampleRow(0);
            if (step === 'sample') {
                // Wizard: one plain sheet is set up straight away; with several the person confirms which one
                if (book.sheets.length === 1) {
                    autoSetup(sheet);
                    setStep('edit');
                }
            } else toast.success(`${sheet.rows.length} rows, ${sheet.headers.length} columns`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not read the spreadsheet');
        }
    };

    const chooseSampleSheet = (index: number, names: NameSource = AUTO_NAMES) => {
        setSampleSheet(index);
        setSampleNames(names);
        setSampleRow(0);
    };

    const autoSetup = (sheet: SheetData | null = sample) => {
        if (!layout || !sheet) return;
        const used = new Set(fields.flatMap(f => sourceColumns(f.source)));
        const suggestions = autoMapTemplate(layout, sheet).filter(f => sourceColumns(f.source).every(c => !used.has(c)));
        if (suggestions.length === 0) return toast.info('No more columns could be matched automatically. Add fields by hand.');
        change(prev => [...prev, ...suggestions]);
        const all = [...fields, ...suggestions];
        const usedNow = new Set(all.flatMap(f => sourceColumns(f.source)));
        setReport({
            text: suggestions.filter(f => f.kind === 'text' && !/ \((day|month|year)\)$/.test(f.name)).length,
            choice: suggestions.filter(f => f.kind === 'choice').length,
            dates: suggestions.filter(f => f.kind === 'text' && / \(day\)$/.test(f.name)).length,
            unused: sheet.headers.filter((h, i) => !usedNow.has(h) && sheet.rows.some(r => r[i]?.trim())),
        });
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
            if (t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
                return;
            }
            if (!selected) return;
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
    }, [selected, change, updateField, undo, redo]);

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
                    return [f.id, computeValue(f, { row, rowNumber: sample.rowNumbers?.[sampleRow] ?? sampleRow + 2, columns: columnMatches, user: userName }).value];
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
        if (!name.trim()) return toast.error('Please give the form a name (top of the right-hand panel).');
        if (!template && !pendingPdf) return toast.error('Upload the PDF form first.');
        save.mutate(
            { id: template?.id, draft: { name, description, fields, column_aliases: aliases, settings }, pdf: pendingPdf ?? undefined },
            {
                onSuccess: saved => {
                    toast.success('Saved. The form is ready to fill in.');
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
                            {/* With example answers in the boxes, only the chosen box needs its name on top */}
                            {(isSel || !(showValues && example)) && (
                                <span className={`absolute -top-4 left-0 max-w-full truncate px-1 rounded-sm text-[9px] font-semibold leading-4 ${isSel ? 'bg-brand-500 text-white' : 'bg-sky-600/80 text-white'}`}>
                                    {f.name}
                                </span>
                            )}
                            {showValues && example?.text.get(f.id) && (
                                <span
                                    className={`absolute inset-0 px-0.5 overflow-hidden font-medium text-slate-900 ${f.multiline ? 'whitespace-normal leading-tight' : 'flex items-center whitespace-nowrap'}`}
                                    style={{ fontSize: Math.max(7, f.fontSize * scale * 0.9) }}
                                >
                                    {example.text.get(f.id)}
                                </span>
                            )}
                            {isSel && <span className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-brand-500 ring-2 ring-white cursor-nwse-resize" />}
                        </div>
                    );
                })}
                {showValues && example && fields.flatMap(f => (f.kind === 'choice' ? f.options : [])).filter(o => o.rect.page === currentPage && example.ticked.has(o.id)).map(o => (
                    <div key={`tick-${o.id}`} className="absolute pointer-events-none flex items-center justify-center font-bold text-emerald-700 bg-emerald-200/60 rounded-[2px]" style={{ ...rectStyle(o.rect, scale, pageHeight), fontSize: Math.max(8, o.rect.h * scale) }}>
                        ✓
                    </div>
                ))}
                {drawRect && drawRect.page === currentPage && (
                    <div className="absolute pointer-events-none ring-2 ring-brand-500 bg-brand-500/10" style={rectStyle(drawRect, scale, pageHeight)} />
                )}
            </div>
        );
    };

    const flaggedCount = fields.filter(f => flagged.has(f.id)).length;

    return (
        <div className="space-y-4">
            <div className="sm:sticky sm:top-14 z-10 -mx-2 px-2 py-2 flex flex-wrap items-center gap-2 bg-background/90 backdrop-blur-md">
                <Button variant="ghost" onClick={back}>
                    <ArrowLeft size={15} /> Back to all forms
                </Button>
                <h2 className="text-base font-semibold text-primary tracking-tight truncate flex-1 min-w-[10rem]">
                    {template ? `Set up “${template.name}”` : 'Add a new form'}
                    {dirty && <span className="ml-2 text-xs font-medium text-status-requested">unsaved</span>}
                </h2>
                {step === 'edit' && (
                    <>
                        <Button variant="ghost" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
                            <Undo2 size={15} /> Undo
                        </Button>
                        <Button variant="ghost" onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)">
                            <Redo2 size={15} /> Redo
                        </Button>
                        {layout && template && (
                            <label
                                title="The form was updated? Upload the new PDF: fields move with it"
                                className={`inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-xl border border-border-subtle bg-surface hover:bg-surface-elevated cursor-pointer ${revisionBusy ? 'opacity-60 pointer-events-none' : ''}`}
                            >
                                {revisionBusy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} New version of the PDF
                                <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={pickRevision} />
                            </label>
                        )}
                        <Button onClick={runPreview} disabled={!pdfBytes}>
                            <Eye size={15} /> Preview
                        </Button>
                        <Button variant="primary" onClick={doSave} loading={save.isPending} disabled={!pdfBytes}>
                            <Save size={15} /> Save
                        </Button>
                    </>
                )}
            </div>

            {!template && <SetupSteps step={step} />}

            {step === 'pdf' ? (
                <Card title="The blank form" icon={Upload} subtitle="The PDF exactly as you print it. Forms exported from Word are fine.">
                    <div className="space-y-3">
                        <FileDropzone accept="application/pdf,.pdf" onChange={pickPdf} title="Drop the PDF form here or click to browse" hint="Up to 20 MB" />
                        <p className="text-xs text-muted">
                            Works best with forms saved from Word: the boxes and table cells are found by themselves. A scanned form also works, but you place each box by hand.
                            Next you can add an example spreadsheet so the boxes are linked to its columns for you.
                        </p>
                    </div>
                </Card>
            ) : step === 'sample' ? (
                <Card title="An example spreadsheet" icon={FileSpreadsheet} subtitle="Optional, but it saves most of the work">
                    <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] items-start">
                        <div className="rounded-xl bg-surface-elevated/60 p-2 flex flex-col items-center gap-2">
                            {pdf && layout ? (
                                <>
                                    <PdfPage doc={pdf.doc} page={0} size={layout.pages[0]} width={200} />
                                    <p className="text-[11px] text-muted text-center">
                                        {layout.pages.length} page(s) · {layout.checkboxes.length} checkboxes found
                                    </p>
                                </>
                            ) : pdfError || openError ? (
                                <p className={`${calloutCls.danger} text-xs p-2`}>{pdfError || openError}</p>
                            ) : (
                                <p className="flex items-center gap-2 text-xs text-muted py-16"><Loader2 size={15} className="animate-spin" /> Reading the PDF…</p>
                            )}
                        </div>
                        <div className="space-y-3">
                            <p className="text-sm text-primary">
                                Choose a spreadsheet with the kind of answers this form will be filled with: one row per person, a title over each column
                                (for example the answers exported from Microsoft Forms or Google Forms).
                            </p>
                            <ul className="space-y-1 text-xs text-muted">
                                <li className="flex items-start gap-1.5"><CheckCircle2 size={13} className="text-status-confirmed shrink-0 mt-0.5" /> Each column goes into the box with the same label on the form</li>
                                <li className="flex items-start gap-1.5"><CheckCircle2 size={13} className="text-status-confirmed shrink-0 mt-0.5" /> Answers like “Female” or “Student” tick the matching checkboxes</li>
                                <li className="flex items-start gap-1.5"><CheckCircle2 size={13} className="text-status-confirmed shrink-0 mt-0.5" /> It stays in your browser: nothing is uploaded. You can change anything afterwards.</li>
                            </ul>
                            <FileDropzone
                                accept={SHEET_ACCEPT}
                                onChange={pickSample}
                                disabled={!layout}
                                title={layout ? 'Drop the spreadsheet here or click to browse' : 'Reading the PDF…'}
                                hint="It stays in your browser: nothing is uploaded"
                            />
                            {sampleBook && sample && (
                                <div className="space-y-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
                                    <p className="text-sm font-semibold text-primary">{sampleBook.fileName}: check that this is the sheet with the answers</p>
                                    <SheetPicker
                                        key={`${sampleBook.fileName}-${sampleSheet}`}
                                        workbook={sampleBook}
                                        sheetIndex={sampleSheet}
                                        names={sampleNames}
                                        sheet={sample}
                                        onSheet={i => chooseSampleSheet(i)}
                                        onNames={n => chooseSampleSheet(sampleSheet, n)}
                                        preview
                                    />
                                    <Button variant="primary" onClick={() => { autoSetup(sample); setStep('edit'); }} disabled={!layout || sample.rows.length === 0}>
                                        <Sparkles size={14} /> Set up the fields from this sheet
                                    </Button>
                                    {sample.rows.length === 0 && <p className="text-xs text-muted">This sheet has no rows of answers. Choose another sheet above.</p>}
                                </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="ghost" onClick={() => setStep('edit')} disabled={!layout}>
                                    I have no spreadsheet: skip, I'll place the fields myself
                                </Button>
                                <Button variant="ghost" onClick={() => { setStep('pdf'); setPdfBytes(null); setPendingPdf(null); }}>
                                    Choose another PDF
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            ) : (
                <>
                {report && (
                    <section className={`${calloutCls.success} relative p-4 pr-10`} aria-label="Set-up summary">
                        <button type="button" onClick={() => setReport(null)} aria-label="Hide" className="absolute top-2.5 right-2.5 p-1.5 text-muted hover:text-primary rounded-lg">
                            <X size={15} />
                        </button>
                        <p className="text-sm font-semibold text-primary flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-status-confirmed" />
                            Set up {report.text} text field{report.text === 1 ? '' : 's'}
                            {report.dates ? `, ${report.dates} date${report.dates === 1 ? '' : 's'}` : ''}
                            {report.choice ? ` and ${report.choice} checkbox question${report.choice === 1 ? '' : 's'}` : ''} for you.
                        </p>
                        <ol className="mt-2 ml-6 list-decimal text-xs text-primary space-y-1">
                            <li>Look over each page: <b>blue boxes</b> get text, <b>green boxes</b> are ticked (click a field to see its boxes).</li>
                            <li>Something wrong or missing? Click a field to change it, or add one with <b>Text field</b> / <b>Checkboxes</b>.</li>
                            <li>Click <b>Preview</b> to see a filled form, then <b>Save</b>.</li>
                        </ol>
                        {report.unused.length > 0 && (
                            <p className="mt-2 text-[11px] text-muted">
                                Not placed on the form (fine if the form has no room for them): {report.unused.slice(0, 8).join(' · ')}
                                {report.unused.length > 8 ? ` +${report.unused.length - 8} more` : ''}
                            </p>
                        )}
                    </section>
                )}
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
                            {example && (
                                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                                    <input type="checkbox" checked={showValues} onChange={e => setShowValues(e.target.checked)} className="accent-brand-500" />
                                    Show example answers
                                </label>
                            )}
                        </div>
                        <div className="px-3 py-2 text-[11px] text-muted border-b border-border-subtle bg-surface-elevated/40 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="text-primary font-medium">
                                {mode === 'draw'
                                    ? 'Click a table cell to put a text field in it, or drag to draw the box.'
                                    : selected?.kind === 'choice'
                                        ? `Click checkboxes to add them to “${selected.name}” or take them out.`
                                        : 'Click a field to edit it. Drag to move, pull the corner to resize.'}
                            </span>
                            <span className="flex flex-wrap items-center gap-3 ml-auto">
                                <Legend cls="bg-sky-400/20 ring-1 ring-sky-500" label="text" />
                                <Legend cls="bg-emerald-500/35 ring-2 ring-emerald-500" label="ticked by this question" />
                                <Legend cls="bg-brand-500/20 ring-1 ring-brand-500/70" label="used box" />
                                <Legend cls="ring-1 ring-dashed ring-amber-500" label="free box" />
                            </span>
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

                    {/* Sidebar: the form's name, then one thing at a time (a field's settings replace the tabs) */}
                    <div className="space-y-3 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1">
                        {selected ? (
                            <Card
                                title={selected.kind === 'text' ? 'Text box' : 'Checkboxes'}
                                subtitle={selected.kind === 'text' ? 'What is printed in the box you clicked' : 'Which answer ticks these boxes'}
                                icon={selected.kind === 'text' ? Type : CheckSquare}
                                action={<Button size="sm" variant="brand-soft" onClick={() => setSelectedId(null)}><ArrowLeft size={13} /> All fields</Button>}
                            >
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
                                    userName={userName}
                                />
                            </Card>
                        ) : (
                            <>
                                <Card>
                                    <label className={labelCls} htmlFor="tpl-name">Name of this form</label>
                                    <input id="tpl-name" value={name} onChange={e => { nameTouched.current = true; setName(e.target.value); setDirty(true); }} className={fieldCls} placeholder="e.g. SICAP CO registration" />
                                </Card>
                                <Segmented<Panel>
                                    ariaLabel="Editor sections"
                                    value={panel}
                                    onChange={setPanel}
                                    options={[
                                        { value: 'fields', label: 'Fields', count: fields.length },
                                        { value: 'sheet', label: 'Spreadsheet', dot: sample ? 'bg-emerald-500' : undefined },
                                        { value: 'about', label: 'More settings' },
                                    ]}
                                    className="w-full"
                                />
                                {panel === 'fields' && (
                                    <Card
                                        title="Fields on the form"
                                        subtitle={flaggedCount ? `${flaggedCount} to check after the new revision` : 'Click one here, or click its box on the page'}
                                    >
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
                                                                    <span className="block text-[10px] text-muted truncate">← {summarizeSource(f.source)}</span>
                                                                </span>
                                                                {flagged.has(f.id) && <AlertTriangle size={13} className="text-status-requested shrink-0" aria-label="Check position" />}
                                                                {!f.source.trim() && <Badge tone="warning">no column</Badge>}
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
                                {panel === 'sheet' && (
                                    <Card title="Example spreadsheet" icon={FileSpreadsheet} subtitle="Optional: fills the boxes with real answers so you can check them">
                                        <div className="space-y-3">
                                        <FileDropzone compact accept={SHEET_ACCEPT} onChange={pickSample} title={sample ? sample.fileName : 'Drop an Excel or CSV file'} hint={sample ? `${sample.rows.length} rows · ${sample.headers.length} columns` : 'Stays in your browser'} />
                                        {sample && sampleBook && (
                                            <>
                                                <SheetPicker
                                                    key={`${sampleBook.fileName}-${sampleSheet}`}
                                                    workbook={sampleBook}
                                                    sheetIndex={sampleSheet}
                                                    names={sampleNames}
                                                    sheet={sample}
                                                    onSheet={i => chooseSampleSheet(i)}
                                                    onNames={n => chooseSampleSheet(sampleSheet, n)}
                                                />
                                                <Button variant="brand-soft" className="w-full" onClick={() => { autoSetup(); setPanel('fields'); }} disabled={!layout}>
                                                    <Sparkles size={14} /> {fields.length ? 'Add fields for unused columns' : 'Set up fields automatically'}
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
                                )}
                                {panel === 'about' && (
                                    <Card title="More settings">
                                        <div className="space-y-3">
                                            <div>
                                                <label className={labelCls} htmlFor="tpl-desc">Description (optional)</label>
                                                <input id="tpl-desc" value={description} onChange={e => { setDescription(e.target.value); setDirty(true); }} className={fieldCls} placeholder="Which spreadsheet it is for" />
                                            </div>
                                        <NameSetting
                                            value={settings.fileName}
                                            onChange={fileName => { setSettings({ ...settings, fileName }); setDirty(true); }}
                                            columns={columns}
                                            automatic={defaultNamePattern(fields)}
                                            example={pattern => {
                                                if (!sample || !pattern) return null;
                                                const row = sample.rows[sampleRow] ?? [];
                                                const matches = matchColumns(templateColumns(fields, { ...settings, fileName: pattern }), sample.headers, aliases);
                                                return safeFileName(evaluateSource(pattern, { row, columns: matches, rowNumber: sample.rowNumbers?.[sampleRow] ?? sampleRow + 2, user: userName })) || null;
                                            }}
                                        />
                                        <div>
                                            <label className={labelCls} htmlFor="tpl-mark">How boxes are ticked</label>
                                            <select id="tpl-mark" value={settings.mark} onChange={e => { setSettings({ ...settings, mark: e.target.value as TemplateSettings['mark'] }); setDirty(true); }} className={fieldCls}>
                                                <option value="tick">✓ Tick</option>
                                                <option value="cross">✗ Cross</option>
                                            </select>
                                        </div>
                                        {pendingPdf && template && (
                                            <div className={`${calloutCls.info} text-xs p-2.5`}>New PDF: {pendingPdf.name}. It replaces revision {template.revision} when you save.</div>
                                        )}
                                        </div>
                                    </Card>
                                )}
                            </>
                        )}
                    </div>
                </div>
                </>
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
                message="Your changes to this form will be lost."
                confirmLabel="Leave"
                onConfirm={() => { setConfirmLeave(false); onBack(); }}
                onCancel={() => setConfirmLeave(false)}
            />
        </div>
    );
}

type Panel = 'fields' | 'sheet' | 'about';

function Legend({ cls, label }: { cls: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-[2px] ${cls}`} />
            {label}
        </span>
    );
}

const STEPS = [
    { key: 'pdf', label: 'The blank PDF' },
    { key: 'sample', label: 'An example spreadsheet' },
    { key: 'edit', label: 'Check and save' },
] as const;

/** 1 → 2 → 3 for a new template */
function SetupSteps({ step }: { step: 'pdf' | 'sample' | 'edit' }) {
    const at = STEPS.findIndex(s => s.key === step);
    return (
        <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Steps">
            {STEPS.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2" aria-current={i === at ? 'step' : undefined}>
                    <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                            i < at ? 'bg-emerald-500 text-white' : i === at ? 'bg-brand-500 text-white' : 'bg-surface-elevated text-muted border border-border-subtle'
                        }`}
                    >
                        {i < at ? '✓' : i + 1}
                    </span>
                    <span className={i === at ? 'font-semibold text-primary' : 'text-muted'}>{s.label}</span>
                    {i < STEPS.length - 1 && <span className="w-8 h-px bg-border-subtle" />}
                </li>
            ))}
        </ol>
    );
}

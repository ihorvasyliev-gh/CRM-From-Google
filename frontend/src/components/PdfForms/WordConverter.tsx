import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Braces, CheckSquare, Download, Eraser, Eye, EyeOff, FileText, FileUp, MousePointerClick, ShieldCheck, Type, X } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import FileDropzone from '../ui/FileDropzone';
import { Segmented } from '../ui/Tabs';
import { ErrorState } from '../ui/States';
import { toast } from '../../lib/toast';
import { downloadBlob } from '../../lib/download';
import { loadChunk } from '../../lib/deployRecovery';
import { usePersistentState } from '../../hooks/usePersistentState';
import { fetchTemplateVariables } from '../../lib/documentUtils';
import { PLACEHOLDER_KEYS } from '../../lib/documentRender';
import { checkPlaceholders, fieldAt, suggestedValues, type FieldDef, type FieldValues } from '../../lib/pdfToDocx/fields';
import type { ConvertedForm } from '../../lib/pdfToDocx/browser';
import WordFormPage from './WordFormPage';
import WordPlaceholderPanel from './WordPlaceholderPanel';
import { useElementWidth } from './pdfHooks';

/** The converter (pdf.js, the Word writer) loads only when a PDF is chosen */
const loadConverter = () => loadChunk(() => import('../../lib/pdfToDocx/browser'));

const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_PAGE_WIDTH = 920;
const NO_VARS: never[] = [];

interface WordConverterProps {
    /** Admins: the custom variables of Documents ({expire}…) are offered too */
    admin: boolean;
}

/**
 * PDF → Word: a flat PDF form becomes a Word template with every line, box and logo
 * where the PDF has it, and Documents placeholders ({firstName}, {dateOfBirth}…) in
 * its blanks. Everything happens in the browser; nothing is saved.
 */
export default function WordConverter({ admin }: WordConverterProps) {
    const [form, setForm] = useState<ConvertedForm | null>(null);
    const [fields, setFields] = useState<FieldDef[]>([]);
    const [values, setValues] = useState<FieldValues>({});
    const [progress, setProgress] = useState<{ name: string; done: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);
    const cursor = useRef<{ id: string; start: number; end: number } | null>(null);
    const [mark, setMark] = usePersistentState<'tick' | 'cross'>('word_form_mark', 'tick', { storage: 'local', validate: (v): v is 'tick' | 'cross' => v === 'tick' || v === 'cross' });
    const [outlines, setOutlines] = usePersistentState('word_form_outlines', true, { storage: 'local', validate: (v): v is boolean => typeof v === 'boolean' });
    const added = useRef(0);
    const [pagesRef, containerWidth] = useElementWidth<HTMLDivElement>();
    const pageWidth = Math.min(containerWidth, MAX_PAGE_WIDTH);
    const varsQuery = useQuery({ queryKey: ['doc_custom_vars'], queryFn: fetchTemplateVariables, enabled: admin });
    const customVars = varsQuery.data ?? NO_VARS;

    // Free pdf.js's copy of the PDF when it is replaced or the page closes
    useEffect(() => () => void form?.doc.loadingTask.destroy(), [form]);

    const pickPdf = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
            toast.error('Choose a PDF file');
            return;
        }
        if (file.size > MAX_PDF_BYTES) {
            toast.error('This PDF is over 30 MB: too big to convert in the browser');
            return;
        }
        setError(null);
        setProgress({ name: file.name, done: 0, total: 0 });
        try {
            const { convertForm } = await loadConverter();
            const bytes = new Uint8Array(await file.arrayBuffer());
            const converted = await convertForm(bytes, file.name, (done, total) => setProgress({ name: file.name, done, total }));
            setForm(converted);
            setFields(converted.fields);
            setValues(suggestedValues(converted.fields));
            setEditing(false);
            setActiveId(null);
            cursor.current = null;
            if (converted.pages.every(p => p.base.lines.length === 0)) {
                toast.info('This PDF has no text in it (a scan?): it is copied as pictures, and only blanks drawn as boxes are found');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read this PDF');
        } finally {
            setProgress(null);
        }
    };

    const reset = () => {
        setForm(null);
        setFields([]);
        setValues({});
        setError(null);
        setActiveId(null);
        cursor.current = null;
    };

    const setValue = useCallback((id: string, value: string | boolean) => setValues(v => ({ ...v, [id]: value })), []);
    const removeField = useCallback((id: string) => setFields(list => list.filter(f => f.id !== id)), []);
    const addField = useCallback(
        (page: number, x: number, y: number) => {
            if (!form) return;
            added.current += 1;
            setFields(list => [...list, fieldAt(form.layout, page, x, y, `added${added.current}`)]);
        },
        [form],
    );
    const onCursor = useCallback((id: string, start: number, end: number) => {
        cursor.current = { id, start, end };
        setActiveId(id);
    }, []);

    /** Put {tag} where the cursor is in the blank being typed into (replacing a selection) */
    const insert = (tag: string) => {
        const at = cursor.current;
        if (!at || !fields.some(f => f.id === at.id && f.kind === 'text')) {
            toast.info('Click a blank on the form first, then the placeholder');
            return;
        }
        const text = `{${tag}}`;
        setValues(v => {
            const current = typeof v[at.id] === 'string' ? (v[at.id] as string) : '';
            const start = Math.min(at.start, current.length);
            const end = Math.min(Math.max(at.end, start), current.length);
            return { ...v, [at.id]: current.slice(0, start) + text + current.slice(end) };
        });
        cursor.current = { id: at.id, start: at.start + text.length, end: at.start + text.length };
    };

    const download = async () => {
        if (!form) return;
        try {
            const { formDocx, docxFileName } = await loadConverter();
            downloadBlob(formDocx(form, fields, values, { mark }), docxFileName(form.title));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not make the Word file');
        }
    };

    const byPage = useMemo(() => {
        const map = new Map<number, FieldDef[]>();
        for (const f of fields) map.set(f.page, [...(map.get(f.page) ?? []), f]);
        return map;
    }, [fields]);
    const known = useMemo(() => new Set([...PLACEHOLDER_KEYS, ...customVars.map(v => v.var_key)]), [customVars]);
    const problems = useMemo(() => checkPlaceholders(fields, values, known), [fields, values, known]);
    const textCount = fields.filter(f => f.kind === 'text').length;
    const boxCount = fields.length - textCount;
    const suggestions = fields.filter(f => f.kind === 'text' && f.placeholder).length;
    const withPlaceholders = fields.filter(f => f.kind === 'text' && typeof values[f.id] === 'string' && /\{[^{}]+\}/.test(values[f.id] as string)).length;
    const active = fields.find(f => f.id === activeId) ?? null;

    if (!form) {
        return (
            <div className="space-y-4">
                <section aria-label="How it works" className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
                    <ol className="grid gap-3 sm:grid-cols-3">
                        {[
                            { icon: FileUp, title: 'Choose the PDF form', text: 'The one people send you. Every page is copied into Word exactly where it is on the PDF.' },
                            { icon: Braces, title: 'Put in placeholders', text: 'Blanks that say what they ask get one by themselves ({firstName}, {dateOfBirth}…); click a blank to change it.' },
                            { icon: Download, title: 'Download the Word template', text: 'Add it in Documents → Word templates: every student gets their own filled-in form.' },
                        ].map(({ icon: Icon, title, text }, i) => (
                            <li key={title} className="flex items-start gap-3">
                                <span className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                                    <Icon size={16} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-primary">{i + 1}. {title}</span>
                                    <span className="block text-xs text-muted mt-0.5">{text}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>
                <FileDropzone
                    accept="application/pdf,.pdf"
                    onChange={pickPdf}
                    uploading={!!progress}
                    icon={<FileUp size={18} />}
                    title={progress ? (progress.total ? `Copying page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : `Opening ${progress.name}…`) : 'Choose the PDF form: click here, or drag it onto this box'}
                    hint="The PDF is converted on this computer. Nothing is uploaded or saved."
                    className="py-10"
                />
                {error && <ErrorState title="This PDF could not be converted" error={error} onRetry={() => setError(null)} />}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-subtle bg-surface p-3 shadow-card">
                <span className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    <FileText size={17} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-primary truncate" title={form.title}>{form.title}</p>
                    <p className="text-[11px] text-muted truncate">
                        {form.fileName} · {form.pages.length} {form.pages.length === 1 ? 'page' : 'pages'} · {withPlaceholders} of {textCount} blanks with a placeholder
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setOutlines(!outlines)} aria-pressed={outlines} title="Show where every blank is">
                        {outlines ? <Eye size={14} /> : <EyeOff size={14} />} Blanks
                    </Button>
                    <Button size="sm" variant={editing ? 'brand-soft' : 'ghost'} onClick={() => setEditing(!editing)} aria-pressed={editing} title="Add or remove blanks">
                        <MousePointerClick size={14} /> {editing ? 'Done' : 'Edit blanks'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setValues({})} title="Empty every blank and untick every box">
                        <Eraser size={14} /> Clear
                    </Button>
                    <Button size="sm" variant="ghost" onClick={reset} title="Choose another PDF">
                        <X size={14} /> Close
                    </Button>
                    <Button size="sm" variant="primary" onClick={download}>
                        <Download size={14} /> Download Word
                    </Button>
                </div>
            </div>

            {editing && (
                <p className="rounded-xl border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-xs text-primary">
                    Click an empty spot on the page to add a blank there (inside a table it takes the whole cell); the red × removes one. Click <b>Done</b> to go back to the placeholders.
                </p>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
                <div ref={pagesRef} className="space-y-4 min-w-0">
                    {pageWidth > 0 &&
                        form.pages.map(p => (
                            <WordFormPage
                                key={p.index}
                                doc={form.doc}
                                page={p.index}
                                size={{ w: p.w, h: p.h }}
                                width={pageWidth}
                                fields={byPage.get(p.index) ?? []}
                                values={values}
                                mark={mark}
                                outlines={outlines}
                                editing={editing}
                                onChange={setValue}
                                onRemove={removeField}
                                onAddAt={addField}
                                onCursor={onCursor}
                            />
                        ))}
                </div>

                <aside className="space-y-4 lg:sticky lg:top-4">
                    <WordPlaceholderPanel
                        active={active && active.kind === 'text' ? active : null}
                        onInsert={insert}
                        customVars={customVars}
                        suggestions={suggestions}
                        onSuggest={() => setValues(v => ({ ...v, ...suggestedValues(fields) }))}
                        problems={problems}
                    />
                    <Card title="Word template" icon={Download}>
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            <Badge icon={<Type size={11} />}>{textCount} blanks</Badge>
                            <Badge icon={<CheckSquare size={11} />}>{boxCount} boxes</Badge>
                            {withPlaceholders > 0 && <Badge tone="brand" icon={<Braces size={11} />}>{withPlaceholders} placeholders</Badge>}
                        </div>
                        <span className="block text-xs font-semibold text-muted mb-1.5">Boxes ticked here (ticked on every form) show</span>
                        <Segmented
                            ariaLabel="Ticked boxes show"
                            size="sm"
                            value={mark}
                            onChange={setMark}
                            className="mb-3"
                            options={[
                                { value: 'tick', label: '✓ Tick' },
                                { value: 'cross', label: '✗ Cross' },
                            ]}
                        />
                        <Button variant="primary" className="w-full" onClick={download}>
                            <Download size={15} /> Download Word template (.docx)
                        </Button>
                        <p className="mt-3 text-[11px] text-muted">
                            Add it in <b>Documents → Word templates</b>: each student gets a copy with their details in place of the placeholders. Text typed without braces is the same on every form.
                        </p>
                        <p className="mt-2 text-[11px] text-muted flex gap-1.5">
                            <ShieldCheck size={13} className="shrink-0 mt-px text-success" />
                            Made on this computer: the PDF is not uploaded or kept.
                        </p>
                    </Card>
                </aside>
            </div>
        </div>
    );
}

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CheckSquare, Download, Eraser, Eye, EyeOff, FileText, FileUp, MousePointerClick, PencilLine, ShieldCheck, Type, Wand2, X } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import FileDropzone from '../ui/FileDropzone';
import { Segmented } from '../ui/Tabs';
import { ErrorState } from '../ui/States';
import { toast } from '../../lib/toast';
import { downloadBlob } from '../../lib/download';
import { todayISO } from '../../lib/dateUtils';
import { loadChunk } from '../../lib/deployRecovery';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useFormUserName } from '../../hooks/usePdfForms';
import { safeFileName } from '../../lib/pdfForms/plan';
import { applyCrm, fieldAt, type CrmRecord, type FieldDef, type FieldValues } from '../../lib/pdfToDocx/fields';
import type { ConvertedForm } from '../../lib/pdfToDocx/browser';
import WordFormPage from './WordFormPage';
import WordCrmPanel, { type CrmPerson } from './WordCrmPanel';
import { useElementWidth } from './pdfHooks';

/** The converter (pdf.js, the Word writer) loads only when a PDF is chosen */
const loadConverter = () => loadChunk(() => import('../../lib/pdfToDocx/browser'));

const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_PAGE_WIDTH = 920;

interface WordConverterProps {
    /** Admins: fill in from students and courses in the CRM */
    crm: boolean;
}

/**
 * PDF → Word: a flat PDF form becomes a Word document with every line, box and
 * logo where the PDF has it, and the form's blanks as fields to fill in here.
 * Everything happens in the browser; nothing is saved.
 */
export default function WordConverter({ crm }: WordConverterProps) {
    const userName = useFormUserName();
    const [form, setForm] = useState<ConvertedForm | null>(null);
    const [fields, setFields] = useState<FieldDef[]>([]);
    const [values, setValues] = useState<FieldValues>({});
    const [progress, setProgress] = useState<{ name: string; done: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filledFor, setFilledFor] = useState('');
    const [editing, setEditing] = useState(false);
    const [mark, setMark] = usePersistentState<'tick' | 'cross'>('word_form_mark', 'tick', { storage: 'local', validate: (v): v is 'tick' | 'cross' => v === 'tick' || v === 'cross' });
    const [outlines, setOutlines] = usePersistentState('word_form_outlines', true, { storage: 'local', validate: (v): v is boolean => typeof v === 'boolean' });
    const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
    const batchAbort = useRef<AbortController | null>(null);
    const added = useRef(0);
    const [pagesRef, containerWidth] = useElementWidth<HTMLDivElement>();
    const pageWidth = Math.min(containerWidth, MAX_PAGE_WIDTH);

    // Free pdf.js's copy of the PDF when it is replaced or the page closes
    useEffect(() => () => void form?.doc.loadingTask.destroy(), [form]);
    useEffect(() => () => batchAbort.current?.abort(), []);

    /** Today's date and your name go in straight away, as on the paper forms */
    const officeValues = useCallback((list: FieldDef[]): FieldValues => applyCrm(list, {}, { staff: userName, today: todayISO() }), [userName]);

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
            setValues(officeValues(converted.fields));
            setFilledFor('');
            setEditing(false);
            if (converted.pages.every(p => p.base.lines.length === 0)) {
                toast.info('This PDF has no text in it (a scan?): it is copied as pictures, and only blanks drawn as boxes can be filled in');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read this PDF');
        } finally {
            setProgress(null);
        }
    };

    const reset = () => {
        batchAbort.current?.abort();
        setForm(null);
        setFields([]);
        setValues({});
        setError(null);
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

    const record = (r: CrmRecord): CrmRecord => ({ staff: userName, today: todayISO(), ...r });

    const fillFrom = (person: CrmPerson) => {
        setValues(v => applyCrm(fields, v, record(person.record)));
        setFilledFor(person.name);
        toast.success(`Filled in for ${person.name}`);
    };

    const download = async () => {
        if (!form) return;
        try {
            const { formDocx, docxFileName } = await loadConverter();
            downloadBlob(formDocx(form, fields, values, { mark }), docxFileName(form.title, filledFor));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not make the Word file');
        }
    };

    const makeZip = async (people: CrmPerson[], label: string) => {
        if (!form || people.length === 0) return;
        batchAbort.current?.abort();
        const controller = new AbortController();
        batchAbort.current = controller;
        setBatch({ done: 0, total: people.length });
        try {
            const { formsZip } = await loadConverter();
            const zip = await formsZip(
                form,
                fields,
                people.map(p => ({ name: p.name, values: applyCrm(fields, values, record(p.record)) })),
                { mark, signal: controller.signal, onProgress: (done, total) => setBatch({ done, total }) },
            );
            downloadBlob(zip, `${safeFileName(`${form.title} - ${label}`) || 'Forms'}.zip`);
            toast.success(`${people.length} Word ${people.length === 1 ? 'file' : 'files'} ready`);
        } catch (err) {
            if (!(err instanceof DOMException && err.name === 'AbortError')) toast.error(err instanceof Error ? err.message : 'Could not make the ZIP');
        } finally {
            if (batchAbort.current === controller) batchAbort.current = null;
            setBatch(null);
        }
    };

    const byPage = useMemo(() => {
        const map = new Map<number, FieldDef[]>();
        for (const f of fields) map.set(f.page, [...(map.get(f.page) ?? []), f]);
        return map;
    }, [fields]);
    const textCount = fields.filter(f => f.kind === 'text').length;
    const boxCount = fields.length - textCount;
    const crmCount = fields.filter(f => f.kind === 'text' && f.crm).length;
    const filledCount = fields.filter(f => (f.kind === 'check' ? values[f.id] === true : typeof values[f.id] === 'string' && (values[f.id] as string).trim())).length;

    if (!form) {
        return (
            <div className="space-y-4">
                <section aria-label="How it works" className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
                    <ol className="grid gap-3 sm:grid-cols-3">
                        {[
                            { icon: FileUp, title: 'Choose the PDF form', text: 'The one people send you. Every page is copied into Word exactly where it is on the PDF.' },
                            { icon: PencilLine, title: 'Fill it in here', text: crm ? 'Type into the blanks and tick the boxes, or take a student’s details from the CRM.' : 'Type into the blanks and tick the boxes, right on the page.' },
                            { icon: Download, title: 'Download Word', text: 'A .docx you can still change in Word: the answers and boxes stay clickable.' },
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
                        {form.fileName} · {form.pages.length} {form.pages.length === 1 ? 'page' : 'pages'} · {filledCount} of {fields.length} filled
                        {filledFor ? ` · for ${filledFor}` : ''}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setOutlines(!outlines)} aria-pressed={outlines} title="Show where every blank is">
                        {outlines ? <Eye size={14} /> : <EyeOff size={14} />} Blanks
                    </Button>
                    <Button size="sm" variant={editing ? 'brand-soft' : 'ghost'} onClick={() => setEditing(!editing)} aria-pressed={editing} title="Add or remove blanks">
                        <MousePointerClick size={14} /> {editing ? 'Done' : 'Edit blanks'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setValues(officeValues(fields)); setFilledFor(''); }} title="Empty every blank">
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
                    Click an empty spot on the page to add a blank there (inside a table it takes the whole cell); the red × removes one. Click <b>Done</b> to go back to filling in.
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
                            />
                        ))}
                </div>

                <aside className="space-y-4 lg:sticky lg:top-4">
                    {crm && <WordCrmPanel crmFields={crmCount} onFill={fillFrom} onBatch={makeZip} batchProgress={batch} onCancelBatch={() => batchAbort.current?.abort()} />}
                    <Card title="Word file" icon={Download}>
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            <Badge icon={<Type size={11} />}>{textCount} blanks</Badge>
                            <Badge icon={<CheckSquare size={11} />}>{boxCount} boxes</Badge>
                            {crmCount > 0 && <Badge tone="brand" icon={<Wand2 size={11} />}>{crmCount} from the CRM</Badge>}
                        </div>
                        <span className="block text-xs font-semibold text-muted mb-1.5">Ticked boxes show</span>
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
                            <Download size={15} /> Download Word (.docx)
                        </Button>
                        <p className="mt-3 text-[11px] text-muted flex gap-1.5">
                            <ShieldCheck size={13} className="shrink-0 mt-px text-success" />
                            Made on this computer: the PDF and the answers are not uploaded or kept. Open the file in Word to print it, or to change anything later.
                        </p>
                    </Card>
                </aside>
            </div>
        </div>
    );
}

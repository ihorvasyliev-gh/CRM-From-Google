import { useState, type ChangeEvent } from 'react';
import { CheckSquare, Download, FileInput, FileSpreadsheet, FileText, HelpCircle, Pencil, Plus, Trash2, Type, Wand2, X } from 'lucide-react';
import Card, { SectionHeader } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import Badge from './ui/Badge';
import Modal from './ui/Modal';
import FileDropzone from './ui/FileDropzone';
import { Segmented } from './ui/Tabs';
import { EmptyState, ErrorState, SkeletonRows } from './ui/States';
import ConfirmDialog from './ConfirmDialog';
import { toast } from '../lib/toast';
import { formatDateDMY } from '../lib/dateUtils';
import { downloadBlob } from '../lib/download';
import { downloadTemplatePdf, useDeletePdfFormTemplate, usePdfFormTemplates } from '../hooks/usePdfForms';
import { readWorkbook, SHEET_ACCEPT, type Workbook } from '../lib/pdfForms/excel';
import { clearWinner, rankTemplatesForWorkbook, type TemplateFit } from '../lib/pdfForms/pick';
import { templateColumns } from '../lib/pdfForms/plan';
import type { PdfFormTemplate } from '../lib/pdfForms/types';
import FillView from './PdfForms/FillView';
import SavedScreen from './PdfForms/SavedScreen';
import TemplateEditor from './PdfForms/TemplateEditor';
import WordConverter from './PdfForms/WordConverter';
import { usePersistentState } from '../hooks/usePersistentState';

type View = { mode: 'list' } | { mode: 'fill'; id: string; workbook?: Workbook; sheetIndex?: number } | { mode: 'edit'; id: string | null } | { mode: 'saved'; id: string; first: boolean };

const GUIDE_KEY = 'pdf_forms_guide_hidden';

function readGuideHidden(): boolean {
    try {
        return localStorage.getItem(GUIDE_KEY) === '1';
    } catch {
        return false;
    }
}

interface PdfFormsProps {
    /** Admins and "PDF Forms" users set up templates; everyone else fills forms from them */
    canManage: boolean;
    /** Admins: PDF → Word can fill forms from students and courses in the CRM */
    crm?: boolean;
}

type Tab = 'sheet' | 'word';

/**
 * PDF Forms: fill flat PDF forms (e.g. SICAP registration forms) from a spreadsheet.
 * A template = the PDF + where each column goes. Filling happens in the browser.
 */
export default function PdfForms({ canManage, crm = false }: PdfFormsProps) {
    const { data: templates = [], isLoading, error, refetch } = usePdfFormTemplates();
    const [view, setView] = useState<View>({ mode: 'list' });
    const [tab, setTab] = usePersistentState<Tab>('pdf_forms_tab', 'sheet', { validate: (v): v is Tab => v === 'sheet' || v === 'word' });
    const [confirmDelete, setConfirmDelete] = useState<PdfFormTemplate | null>(null);
    const [choice, setChoice] = useState<{ workbook: Workbook; fits: TemplateFit[] } | null>(null);
    const [reading, setReading] = useState(false);
    const [guideHidden, setGuideHidden] = useState(readGuideHidden);
    const remove = useDeletePdfFormTemplate();

    const toggleGuide = (hidden: boolean) => {
        setGuideHidden(hidden);
        try {
            localStorage.setItem(GUIDE_KEY, hidden ? '1' : '0');
        } catch {
            // storage unavailable — the choice just isn't remembered
        }
    };

    // Drop a spreadsheet on the page: open the form whose columns it has
    const pickSheet = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setReading(true);
        try {
            const workbook = await readWorkbook(file);
            const fits = rankTemplatesForWorkbook(templates, workbook);
            const winner = clearWinner(fits);
            if (winner) {
                const fit = fits.find(f => f.template.id === winner.id)!;
                toast.success(`Opened “${winner.name}”: it matches this spreadsheet`);
                setView({ mode: 'fill', id: winner.id, workbook, sheetIndex: fit.sheetIndex });
            } else {
                setChoice({ workbook, fits });
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not read the spreadsheet');
        } finally {
            setReading(false);
        }
    };

    const downloadBlank = async (t: PdfFormTemplate) => {
        try {
            const bytes = await downloadTemplatePdf(t.pdf_path);
            downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), t.pdf_name);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not download the form');
        }
    };

    if (view.mode === 'edit' && canManage) {
        const template = view.id ? templates.find(t => t.id === view.id) ?? null : null;
        return (
            <TemplateEditor
                key={view.id ?? 'new'}
                template={template}
                onBack={() => setView({ mode: 'list' })}
                onSaved={saved => setView({ mode: 'saved', id: saved.id, first: !template })}
            />
        );
    }
    if (view.mode === 'saved') {
        const template = templates.find(t => t.id === view.id);
        if (template) {
            return (
                <SavedScreen
                    template={template}
                    first={view.first}
                    onFill={() => setView({ mode: 'fill', id: template.id })}
                    onEdit={canManage ? () => setView({ mode: 'edit', id: template.id }) : undefined}
                    onBack={() => setView({ mode: 'list' })}
                />
            );
        }
    }
    if (view.mode === 'fill') {
        const template = templates.find(t => t.id === view.id);
        if (template) {
            return (
                <FillView
                    key={template.id}
                    template={template}
                    initialWorkbook={view.workbook ?? null}
                    initialSheetIndex={view.sheetIndex}
                    canManage={canManage}
                    onBack={() => setView({ mode: 'list' })}
                    onEdit={() => setView({ mode: 'edit', id: template.id })}
                />
            );
        }
    }

    const steps = [
        ...(canManage ? [{ icon: FileInput, title: 'Add a form once', text: 'Choose the empty PDF form and an example spreadsheet: everything is set up for you.' }] : []),
        { icon: FileSpreadsheet, title: 'Choose your spreadsheet', text: 'Excel or CSV, one row per person or group. The right form opens by itself.' },
        { icon: CheckSquare, title: 'Tick who needs a form', text: 'Find people by name or by the day they registered. Anything odd is shown in orange.' },
        { icon: Download, title: 'Download and print', text: 'One file with all the forms, ready to print. Nothing is sent anywhere.' },
    ];

    return (
        <div className="space-y-5">
            <SectionHeader
                icon={FileInput}
                title="PDF Forms"
                description={tab === 'word' ? 'Turn a PDF form into a Word document, laid out exactly like the PDF, and fill it in.' : 'Fill PDF forms from an Excel or CSV file: one filled form per row.'}
                actions={
                    tab === 'sheet' ? (
                        <div className="flex items-center gap-2">
                            {guideHidden && (
                                <IconButton label="How it works" onClick={() => toggleGuide(false)}>
                                    <HelpCircle size={17} />
                                </IconButton>
                            )}
                            {canManage && (
                                <Button variant={templates.length ? 'secondary' : 'primary'} onClick={() => setView({ mode: 'edit', id: null })}>
                                    <Plus size={15} /> Add a new form
                                </Button>
                            )}
                        </div>
                    ) : undefined
                }
            />

            <Segmented
                ariaLabel="PDF Forms"
                value={tab}
                onChange={setTab}
                className="w-fit"
                options={[
                    { value: 'sheet', label: 'Fill from a spreadsheet', icon: <FileSpreadsheet size={13} /> },
                    { value: 'word', label: 'PDF → Word', icon: <FileText size={13} /> },
                ]}
            />

            {/* Both stay mounted, so a form being filled in survives a look at the other tab */}
            <div className={tab === 'word' ? '' : 'hidden'}>
                <WordConverter crm={crm} />
            </div>

            <div className={tab === 'sheet' ? 'space-y-5' : 'hidden'}>
            {!guideHidden && (
                <section aria-label="How it works" className="relative rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4 pr-10">
                    <button type="button" onClick={() => toggleGuide(true)} aria-label="Hide these tips" title="Hide these tips" className="absolute top-2.5 right-2.5 p-1.5 text-muted hover:text-primary rounded-lg">
                        <X size={15} />
                    </button>
                    <ol className={`grid gap-3 sm:grid-cols-2 ${steps.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                        {steps.map(({ icon: Icon, title, text }, i) => (
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
            )}

            {isLoading ? (
                <SkeletonRows rows={3} />
            ) : error ? (
                <ErrorState title="The forms couldn't be loaded. Check your internet connection (admins: is migration 75 applied?)" error={error} onRetry={() => refetch()} />
            ) : templates.length === 0 ? (
                <EmptyState
                    icon={<FileInput size={22} />}
                    title="No forms yet"
                    description={
                        canManage
                            ? 'Start with the blank PDF form. If you have an example spreadsheet, the fields are set up for you.'
                            : 'Ask an admin (or a “PDF Forms” user) to add the form you need.'
                    }
                    action={canManage ? <Button variant="primary" size="lg" onClick={() => setView({ mode: 'edit', id: null })}><Plus size={16} /> Add your first form</Button> : undefined}
                />
            ) : (
                <>
                    <FileDropzone
                        accept={SHEET_ACCEPT}
                        onChange={pickSheet}
                        uploading={reading}
                        icon={<FileSpreadsheet size={18} />}
                        title="Fill in forms: click here to choose your spreadsheet, or drag it onto this box"
                        hint="Excel or CSV file. The right form opens by itself, and the file stays on this computer."
                        className="py-8"
                    />
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {templates.map(t => {
                            const text = t.fields.filter(f => f.kind === 'text').length;
                            const boxes = t.fields.filter(f => f.kind === 'choice').length;
                            const cols = templateColumns(t.fields, t.settings);
                            return (
                                <Card
                                    key={t.id}
                                    title={t.name}
                                    icon={FileInput}
                                    subtitle={t.description || t.pdf_name}
                                    action={
                                        <>
                                            <IconButton label={`Download the blank ${t.name}`} size="sm" onClick={() => downloadBlank(t)}>
                                                <Download size={14} />
                                            </IconButton>
                                            {canManage && (
                                                <>
                                                    <IconButton label={`Edit ${t.name}`} size="sm" onClick={() => setView({ mode: 'edit', id: t.id })}>
                                                        <Pencil size={14} />
                                                    </IconButton>
                                                    <IconButton label={`Delete ${t.name}`} size="sm" tone="danger" onClick={() => setConfirmDelete(t)}>
                                                        <Trash2 size={14} />
                                                    </IconButton>
                                                </>
                                            )}
                                        </>
                                    }
                                >
                                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                        <Badge icon={<Type size={11} />}>{text} text</Badge>
                                        <Badge icon={<CheckSquare size={11} />}>{boxes} checkbox</Badge>
                                        <Badge tone="brand">version {t.revision}</Badge>
                                        <span className="text-[11px] text-muted ml-auto">updated {formatDateDMY(t.updated_at)}</span>
                                    </div>
                                    {cols.length > 0 && (
                                        <p className="text-[11px] text-muted mb-4 line-clamp-2" title={cols.join('\n')}>
                                            Uses: {cols.slice(0, 5).map(c => (c.length > 28 ? `${c.slice(0, 26)}…` : c)).join(' · ')}
                                            {cols.length > 5 ? ` +${cols.length - 5}` : ''}
                                        </p>
                                    )}
                                    {t.fields.length === 0 ? (
                                        <Button variant="brand-soft" className="w-full" onClick={() => setView({ mode: 'edit', id: t.id })} disabled={!canManage}>
                                            <Pencil size={15} /> {canManage ? 'Set up its fields' : 'Not set up yet'}
                                        </Button>
                                    ) : (
                                        <Button variant="primary" className="w-full" onClick={() => setView({ mode: 'fill', id: t.id })}>
                                            <Wand2 size={15} /> Fill in this form
                                        </Button>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </>
            )}
            </div>

            <Modal
                open={!!choice}
                onClose={() => setChoice(null)}
                title="Which form is this spreadsheet for?"
                subtitle={choice?.workbook.fileName ?? ''}
                icon={FileSpreadsheet}
                size="lg"
            >
                {choice && (
                    <ul className="space-y-2">
                        {choice.fits.map(fit => (
                            <li key={fit.template.id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setView({ mode: 'fill', id: fit.template.id, workbook: choice.workbook, sheetIndex: fit.sheetIndex });
                                        setChoice(null);
                                    }}
                                    className="w-full flex items-center gap-3 rounded-xl border border-border-subtle px-3.5 py-3 text-left hover:border-brand-500/50 hover:bg-brand-500/5 transition-colors"
                                >
                                    <FileInput size={18} className="text-brand-500 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold text-primary truncate">{fit.template.name}</span>
                                        <span className="block text-[11px] text-muted">
                                            {fit.total ? `${fit.found} of ${fit.total} columns found in this file` : 'This form has no fields yet'}
                                            {choice.workbook.sheets.length > 1 && fit.total ? ` (sheet “${choice.workbook.sheets[fit.sheetIndex].name}”)` : ''}
                                        </span>
                                    </span>
                                    <Badge tone={fit.score >= 0.8 ? 'success' : fit.score >= 0.5 ? 'warning' : 'neutral'}>{Math.round(fit.score * 100)}%</Badge>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </Modal>

            <ConfirmDialog
                open={!!confirmDelete}
                title="Delete this form?"
                message={`“${confirmDelete?.name ?? ''}” will be removed for everyone. Forms you already downloaded are not affected.`}
                onConfirm={async () => {
                    if (!confirmDelete) return;
                    try {
                        await remove.mutateAsync(confirmDelete);
                        toast.success('Form deleted');
                        setConfirmDelete(null);
                    } catch (err) {
                        toast.error((err as Error).message);
                    }
                }}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
}

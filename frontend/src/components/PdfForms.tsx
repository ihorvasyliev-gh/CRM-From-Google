import { useState } from 'react';
import { CheckSquare, FileInput, Pencil, Plus, Trash2, Type, Wand2 } from 'lucide-react';
import Card, { SectionHeader } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import Badge from './ui/Badge';
import { EmptyState, ErrorState, SkeletonRows } from './ui/States';
import ConfirmDialog from './ConfirmDialog';
import { toast } from '../lib/toast';
import { formatDateDMY } from '../lib/dateUtils';
import { useDeletePdfFormTemplate, usePdfFormTemplates } from '../hooks/usePdfForms';
import type { PdfFormTemplate } from '../lib/pdfForms/types';
import FillView from './PdfForms/FillView';
import TemplateEditor from './PdfForms/TemplateEditor';

type View = { mode: 'list' } | { mode: 'fill'; id: string } | { mode: 'edit'; id: string | null };

interface PdfFormsProps {
    /** Admins and "PDF Forms" users set up templates; everyone else fills forms from them */
    canManage: boolean;
}

/**
 * PDF Forms: fill flat PDF forms (e.g. SICAP registration forms) from a spreadsheet.
 * A template = the PDF + where each column goes. Filling happens in the browser.
 */
export default function PdfForms({ canManage }: PdfFormsProps) {
    const { data: templates = [], isLoading, error, refetch } = usePdfFormTemplates();
    const [view, setView] = useState<View>({ mode: 'list' });
    const [confirmDelete, setConfirmDelete] = useState<PdfFormTemplate | null>(null);
    const remove = useDeletePdfFormTemplate();

    if (view.mode === 'edit' && canManage) {
        const template = view.id ? templates.find(t => t.id === view.id) ?? null : null;
        return (
            <TemplateEditor
                key={view.id ?? 'new'}
                template={template}
                onBack={() => setView({ mode: 'list' })}
                onSaved={saved => setView({ mode: 'edit', id: saved.id })}
            />
        );
    }
    if (view.mode === 'fill') {
        const template = templates.find(t => t.id === view.id);
        if (template) {
            return <FillView key={template.id} template={template} canManage={canManage} onBack={() => setView({ mode: 'list' })} onEdit={() => setView({ mode: 'edit', id: template.id })} />;
        }
    }

    return (
        <div className="space-y-5">
            <SectionHeader
                icon={FileInput}
                title="PDF Forms"
                description="Fill PDF forms from an Excel or CSV file: one filled form per row. Your spreadsheet never leaves this browser."
                actions={
                    canManage && (
                        <Button variant="primary" onClick={() => setView({ mode: 'edit', id: null })}>
                            <Plus size={15} /> New template
                        </Button>
                    )
                }
            />

            {isLoading ? (
                <SkeletonRows rows={3} />
            ) : error ? (
                <ErrorState title="Couldn't load the templates (is migration 75 applied?)" error={error} onRetry={() => refetch()} />
            ) : templates.length === 0 ? (
                <EmptyState
                        icon={<FileInput size={22} />}
                        title="No form templates yet"
                        description={
                            canManage
                                ? 'Create one: upload the blank PDF form, then a sample spreadsheet to set up the fields automatically.'
                                : 'Ask an admin to set up a form template.'
                        }
                        action={canManage ? <Button variant="primary" onClick={() => setView({ mode: 'edit', id: null })}><Plus size={15} /> New template</Button> : undefined}
                    />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {templates.map(t => {
                        const text = t.fields.filter(f => f.kind === 'text').length;
                        const boxes = t.fields.filter(f => f.kind === 'choice').length;
                        return (
                            <Card
                                key={t.id}
                                title={t.name}
                                icon={FileInput}
                                subtitle={t.description || t.pdf_name}
                                action={
                                    canManage && (
                                        <>
                                            <IconButton label={`Edit ${t.name}`} size="sm" onClick={() => setView({ mode: 'edit', id: t.id })}>
                                                <Pencil size={14} />
                                            </IconButton>
                                            <IconButton label={`Delete ${t.name}`} size="sm" tone="danger" onClick={() => setConfirmDelete(t)}>
                                                <Trash2 size={14} />
                                            </IconButton>
                                        </>
                                    )
                                }
                            >
                                <div className="flex flex-wrap items-center gap-1.5 mb-4">
                                    <Badge icon={<Type size={11} />}>{text} text</Badge>
                                    <Badge icon={<CheckSquare size={11} />}>{boxes} checkbox</Badge>
                                    <Badge tone="brand">rev. {t.revision}</Badge>
                                    <span className="text-[11px] text-muted ml-auto">updated {formatDateDMY(t.updated_at)}</span>
                                </div>
                                <Button variant="primary" className="w-full" onClick={() => setView({ mode: 'fill', id: t.id })}>
                                    <Wand2 size={15} /> Fill from a spreadsheet
                                </Button>
                            </Card>
                        );
                    })}
                </div>
            )}

            <ConfirmDialog
                open={!!confirmDelete}
                title="Delete this template?"
                message={`“${confirmDelete?.name ?? ''}” and its PDF will be deleted for everyone. Forms already filled are not affected.`}
                onConfirm={async () => {
                    if (!confirmDelete) return;
                    try {
                        await remove.mutateAsync(confirmDelete);
                        toast.success('Template deleted');
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

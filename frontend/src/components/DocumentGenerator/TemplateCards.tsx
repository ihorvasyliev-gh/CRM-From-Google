import { useState } from 'react';
import { AlertCircle, ClipboardList, FileText, Info, Tag, Trash2 } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import FileDropzone from '../ui/FileDropzone';
import { IconButton } from '../ui/Button';
import { calloutCls } from '../ui/styles';
import { DownloadButton, ReplaceFileButton } from './shared';
import { errorText, fileInputHandler, type ConfirmDelete, type ShowToast } from './helpers';
import { vetTemplateFile, type DocumentSetup } from './useDocumentSetup';
import {
    ATTENDANCE_SLOTS, LABEL_SLOTS, SHEET_LOOP, SINGLE_TEMPLATES, downloadTemplate,
    type SingleKind, type TemplateKind,
} from '../../lib/documentUtils';
import type { DocumentTemplate } from '../../lib/types';

interface CardProps {
    setup: DocumentSetup;
    showToast: ShowToast;
    confirmDelete: ConfirmDelete;
}

/**
 * Vet a .docx, then store it with `save`. Returns while `busy` shows a spinner; reports
 * the outcome (and any placeholders that will print blank) as a toast.
 */
function useTemplateUpload(setup: DocumentSetup, showToast: ShowToast) {
    const [busy, setBusy] = useState<string | null>(null);
    async function upload(id: string, kind: TemplateKind, file: File, label: string, save: (file: File) => Promise<unknown>) {
        setBusy(id);
        try {
            const vet = await vetTemplateFile(file, kind, setup.customVarMap);
            if ('error' in vet) {
                showToast(vet.error, 'error', 12000);
                return;
            }
            await save(file);
            showToast(`${label}.${vet.note}`, vet.note ? 'info' : 'success', vet.note ? 12000 : undefined);
        } catch (err: unknown) {
            console.error('Upload error:', err);
            showToast(`Upload failed: ${errorText(err)}`, 'error');
        } finally {
            setBusy(null);
        }
    }
    return { busy, upload };
}

async function saveCopy(tpl: DocumentTemplate, showToast: ShowToast) {
    try {
        await downloadTemplate(tpl);
    } catch (err: unknown) {
        showToast(`Download failed: ${errorText(err)}`, 'error');
    }
}

export function WordTemplatesCard({ setup, showToast, confirmDelete }: CardProps) {
    const { templates } = setup;
    const { busy, upload } = useTemplateUpload(setup, showToast);

    const toggle = (tpl: DocumentTemplate) => setup.toggleActive.mutate(tpl, {
        onError: err => showToast(`Failed to toggle: ${errorText(err)}`, 'error'),
    });

    return (
        <Card
            title="Word document templates"
            subtitle="Toggle which .docx templates are used during generation"
            icon={FileText}
            tone="completed"
            action={<Badge tone="completed" shape="pill" className="tabular-nums">{templates.length}</Badge>}
        >
            <div className="space-y-2">
                {templates.length === 0 ? (
                    <div className={`${calloutCls.warning} flex items-center gap-2 px-3 py-2 text-xs font-medium`}>
                        <AlertCircle size={14} className="text-status-requested shrink-0" />
                        No templates uploaded yet
                    </div>
                ) : (
                    <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                        {templates.map(tpl => (
                            <li key={tpl.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${tpl.is_active ? '' : 'bg-surface-elevated/40'}`}>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={tpl.is_active}
                                    aria-label={`Use ${tpl.name}`}
                                    onClick={() => toggle(tpl)}
                                    title={tpl.is_active ? 'Deactivate template' : 'Activate template'}
                                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${tpl.is_active ? 'bg-brand-500' : 'bg-border-strong'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${tpl.is_active ? 'translate-x-4' : ''}`} />
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p className={`text-[13px] font-medium truncate ${tpl.is_active ? 'text-primary' : 'text-muted'}`} title={tpl.name}>{tpl.name}</p>
                                    <p className="text-[11px] text-muted">
                                        {busy === tpl.id ? 'Uploading…' : `Updated ${new Date(tpl.updated_at || tpl.created_at).toLocaleDateString()}`}
                                    </p>
                                </div>
                                <DownloadButton label={`Download ${tpl.name}`} onClick={() => saveCopy(tpl, showToast)} />
                                <ReplaceFileButton
                                    label={`Replace ${tpl.name} with a new file`}
                                    disabled={busy !== null}
                                    onFile={file => upload(tpl.id, 'document', file, `"${tpl.name}" replaced — courses using it keep it`, f => setup.replaceTemplate.mutateAsync({ tpl, file: f }))}
                                />
                                <IconButton
                                    size="sm"
                                    tone="danger"
                                    label={`Delete template ${tpl.name}`}
                                    title="Delete template"
                                    onClick={() => confirmDelete({
                                        title: 'Delete Template',
                                        message: `Delete "${tpl.name}"? The file will be removed permanently and courses that picked it will stop using it.`,
                                        run: () => setup.removeTemplate.mutateAsync(tpl).then(
                                            () => showToast('Template deleted', 'success'),
                                            err => showToast(`Delete failed: ${errorText(err)}`, 'error'),
                                        ),
                                    })}
                                >
                                    <Trash2 size={14} />
                                </IconButton>
                            </li>
                        ))}
                    </ul>
                )}
                <FileDropzone
                    accept=".docx"
                    onChange={fileInputHandler(file => upload('new', 'document', file, 'Template uploaded', f => setup.uploadTemplate.mutateAsync(f)))}
                    uploading={busy === 'new'}
                    title="Add new template"
                    hint="Drop a .docx here or click to browse · max 5MB · placeholders are checked on upload"
                />
            </div>
        </Card>
    );
}

const SINGLE_CARDS = {
    attendance: {
        title: 'Attendance sheet',
        name: 'Attendance',
        icon: ClipboardList,
        tone: 'info' as const,
        slots: ATTENDANCE_SLOTS,
        subtitle: <>Numbered placeholders up to {ATTENDANCE_SLOTS}, e.g. {'{firstName1}'}, {'{phone1}'}</>,
        empty: 'No attendance template uploaded yet',
        deleteTitle: 'Delete Attendance Template',
        deleteMessage: 'Delete the attendance sheet template? The file will be removed permanently.',
    },
    labels: {
        title: 'Address labels',
        name: 'Label',
        icon: Tag,
        tone: 'warning' as const,
        slots: LABEL_SLOTS,
        subtitle: <>Numbered placeholders up to {LABEL_SLOTS}, e.g. {'{address1}'}, {'{eircode1}'}</>,
        empty: 'No label template uploaded yet',
        deleteTitle: 'Delete Label Template',
        deleteMessage: 'Delete the label template? The file will be removed permanently.',
    },
};

/** The attendance sheet or the address labels: one current template, replaced by uploading a new one. */
export function SingleTemplateCard({ kind, setup, showToast, confirmDelete }: CardProps & { kind: SingleKind }) {
    const cfg = SINGLE_CARDS[kind];
    const { label } = SINGLE_TEMPLATES[kind];
    const tpl = kind === 'attendance' ? setup.attTemplate : setup.labelTemplate;
    const { busy, upload } = useTemplateUpload(setup, showToast);

    return (
        <Card title={cfg.title} subtitle={cfg.subtitle} icon={cfg.icon} tone={cfg.tone}>
            <div className="space-y-2">
                {tpl ? (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-elevated/40">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-8 h-8 rounded-lg bg-info/10 text-status-invited flex items-center justify-center shrink-0">
                                <FileText size={15} />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium text-primary truncate" title={tpl.name}>{tpl.name}</p>
                                <p className="text-[11px] text-muted">Current template</p>
                            </div>
                        </div>
                        <div className="flex items-center">
                            <DownloadButton label={`Download ${tpl.name}`} onClick={() => saveCopy(tpl, showToast)} />
                            <IconButton
                                size="sm"
                                tone="danger"
                                label="Delete template"
                                onClick={() => confirmDelete({
                                    title: cfg.deleteTitle,
                                    message: cfg.deleteMessage,
                                    run: () => setup.removeSingle.mutateAsync(kind).then(
                                        () => showToast(`${label} deleted`, 'success'),
                                        err => showToast(`Delete failed: ${errorText(err)}`, 'error'),
                                    ),
                                })}
                            >
                                <Trash2 size={14} />
                            </IconButton>
                        </div>
                    </div>
                ) : (
                    <div className={`${calloutCls.warning} flex items-center gap-2 px-3 py-2 text-xs font-medium`}>
                        <AlertCircle size={14} className="text-status-requested shrink-0" />
                        {cfg.empty}
                    </div>
                )}
                <FileDropzone
                    compact
                    accept=".docx"
                    onChange={fileInputHandler(file => upload(kind, kind, file, `${label} uploaded`, f => setup.saveSingle.mutateAsync({ kind, file: f })))}
                    uploading={busy === kind}
                    title={`${tpl ? 'Replace' : 'Upload'} ${cfg.name} Template`}
                    hint="Drop a .docx here or click to browse · max 5MB · see “Attendance sheet & labels” in Available variables"
                />
                <p className="text-[11px] text-muted flex items-start gap-1.5">
                    <Info size={13} className="shrink-0 mt-px" />
                    <span>
                        Groups over {cfg.slots} continue on extra pages. Or use one table row with <code className="font-mono text-primary">{`{#${SHEET_LOOP}}{n}. {fullName}{/${SHEET_LOOP}}`}</code> — it repeats for every participant on a single sheet.
                    </span>
                </p>
            </div>
        </Card>
    );
}

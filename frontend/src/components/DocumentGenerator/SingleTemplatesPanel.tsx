import { useMemo, useState, type ReactNode } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    ClipboardCheck,
    ClipboardList,
    Download,
    Eye,
    FileText,
    Info,
    Sparkles,
    Tag,
    Trash2,
    type LucideIcon,
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import FileDropzone from '../ui/FileDropzone';
import { CustomTooltip } from '../ui/Tooltip';
import { calloutCls, type Tone } from '../ui/styles';
import { DownloadButton } from './shared';
import { errorText, fileInputHandler, formatBytes, plural, type ConfirmDelete, type ShowToast } from './helpers';
import { vetTemplateFile, type DocumentSetup } from './useDocumentSetup';
import type { PreviewModalTarget, PreviewTarget } from './types';
import {
    ATTENDANCE_SLOTS,
    LABEL_SLOTS,
    SHEET_LOOP,
    SICAP_PAGE_LOOP,
    SICAP_SLOTS,
    SINGLE_TEMPLATES,
    downloadTemplate,
    unknownTagsForKind,
    type SingleKind,
} from '../../lib/documentUtils';
import type { DocumentTemplate } from '../../lib/types';
import { formatDisplayDate } from '../../lib/dateUtils';
import sicapStarterUrl from '../../assets/templates/sicap-course-form.docx?url';

export interface SingleTemplatesPanelProps {
    setup: DocumentSetup;
    showToast: ShowToast;
    confirmDelete: ConfirmDelete;
    onPreview: (preview: PreviewModalTarget) => void;
}

interface SingleCardConfig {
    title: string;
    shortName: string;
    dropName: string;
    icon: LucideIcon;
    tone: Tone;
    chipCls: string;
    slots: number;
    subtitle: ReactNode;
    empty: string;
    deleteTitle: string;
    deleteMessage: string;
}

const SINGLE_KINDS: readonly SingleKind[] = ['attendance', 'labels', 'sicap'] as const;

const SINGLE_CONFIG: Record<SingleKind, SingleCardConfig> = {
    attendance: {
        title: 'Attendance sheet',
        shortName: 'attendance',
        dropName: 'Attendance',
        icon: ClipboardList,
        tone: 'info',
        chipCls: 'bg-info/10 text-status-invited',
        slots: ATTENDANCE_SLOTS,
        subtitle: <>Numbered slots up to {ATTENDANCE_SLOTS}, e.g. {'{firstName1}'}, {'{phone1}'}</>,
        empty: 'No attendance template uploaded yet',
        deleteTitle: 'Delete Attendance Template',
        deleteMessage: 'Delete the attendance sheet template? The file will be removed permanently.',
    },
    labels: {
        title: 'Address labels',
        shortName: 'label',
        dropName: 'Label',
        icon: Tag,
        tone: 'warning',
        chipCls: 'bg-warning/15 text-status-requested',
        slots: LABEL_SLOTS,
        subtitle: <>Numbered slots up to {LABEL_SLOTS}, e.g. {'{address1}'}, {'{eircode1}'}</>,
        empty: 'No label template uploaded yet',
        deleteTitle: 'Delete Label Template',
        deleteMessage: 'Delete the label template? The file will be removed permanently.',
    },
    sicap: {
        title: 'SICAP course form',
        shortName: 'SICAP form',
        dropName: 'SICAP Form',
        icon: ClipboardCheck,
        tone: 'success',
        chipCls: 'bg-success/10 text-status-confirmed',
        slots: SICAP_SLOTS,
        subtitle: <>Page 1 from course, names on page 2: {'{fullName1}'} … {`{fullName${SICAP_SLOTS}}`}</>,
        empty: 'No SICAP form template uploaded yet',
        deleteTitle: 'Delete SICAP Form Template',
        deleteMessage: 'Delete the SICAP course form template? The file will be removed permanently.',
    },
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EMPTY_TAGS: readonly string[] = [];

function buildSinglePreviewTarget(kind: SingleKind, template: DocumentTemplate): PreviewTarget {
    if (kind === 'attendance') return { kind: 'attendance', template };
    if (kind === 'labels') return { kind: 'labels', template };
    return { kind: 'sicap', template };
}

async function saveTemplateCopy(tpl: DocumentTemplate, showToast: ShowToast) {
    try {
        await downloadTemplate(tpl);
    } catch (err: unknown) {
        showToast(`Download failed: ${errorText(err)}`, 'error');
    }
}

interface SingleCardItemProps {
    kind: SingleKind;
    tpl: DocumentTemplate | null;
    customVarKeys: string[];
    setup: DocumentSetup;
    showToast: ShowToast;
    confirmDelete: ConfirmDelete;
    onPreview: (preview: PreviewModalTarget) => void;
}

function SingleCardItem({
    kind,
    tpl,
    customVarKeys,
    setup,
    showToast,
    confirmDelete,
    onPreview,
}: SingleCardItemProps) {
    const cfg = SINGLE_CONFIG[kind];
    const { label } = SINGLE_TEMPLATES[kind];
    const needsMigration = kind === 'sicap' && !setup.sicapReady;
    const [busy, setBusy] = useState<'upload' | 'starter' | null>(null);
    const isBusy = busy !== null;

    const detectedTags = tpl?.tags ?? EMPTY_TAGS;
    const unknownTags = useMemo(
        () => (detectedTags.length > 0 ? unknownTagsForKind(detectedTags, kind, customVarKeys) : []),
        [detectedTags, kind, customVarKeys],
    );
    const sizeLabel = formatBytes(tpl?.size_bytes);

    const uploadFile = async (file: File, mode: 'upload' | 'starter', successMessage: string) => {
        setBusy(mode);
        try {
            const vet = await vetTemplateFile(file, kind, setup.customVarMap);
            if ('error' in vet) {
                showToast(vet.error, 'error', { duration: 12000 });
                return;
            }
            await setup.saveSingle.mutateAsync({ kind, file, tags: vet.tags });
            showToast(
                `${successMessage}.${vet.note}`,
                vet.note ? 'info' : 'success',
                vet.note ? { duration: 12000 } : undefined,
            );
        } catch (err: unknown) {
            console.error(`${label} upload error:`, err);
            showToast(`Upload failed: ${errorText(err)}`, 'error');
        } finally {
            setBusy(null);
        }
    };

    const handleUseSicapStarter = async () => {
        setBusy('starter');
        try {
            const res = await fetch(sicapStarterUrl);
            if (!res.ok) throw new Error(`Could not load starter form (HTTP ${res.status})`);
            const blob = await res.blob();
            const file = new File([blob], 'SICAP_Course_Form_template.docx', { type: DOCX_MIME });
            await uploadFile(file, 'starter', 'Built-in SICAP form installed');
        } catch (err: unknown) {
            console.error('SICAP starter install error:', err);
            showToast(`Could not install built-in form: ${errorText(err)}`, 'error');
            setBusy(null);
        }
    };

    return (
        <Card
            title={cfg.title}
            subtitle={cfg.subtitle}
            icon={cfg.icon}
            tone={cfg.tone}
            bodyClassName="flex flex-col gap-3"
        >
            {tpl ? (
                <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3 space-y-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.chipCls}`}>
                            <FileText size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-primary truncate" title={tpl.name}>
                                {tpl.name}
                            </p>
                            <p className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
                                <span>Updated {formatDisplayDate(tpl.updated_at || tpl.created_at)}</span>
                                {sizeLabel && (
                                    <>
                                        <span aria-hidden="true">·</span>
                                        <span className="tabular-nums">{sizeLabel}</span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border-subtle/70">
                        <div className="min-w-0">
                            {detectedTags.length > 0 ? (
                                unknownTags.length > 0 ? (
                                    <CustomTooltip
                                        content={`Will print blank unless added as custom variables:\n${unknownTags.map(t => `{${t}}`).join(', ')}`}
                                    >
                                        <span tabIndex={0} className="inline-flex">
                                            <Badge tone="warning" icon={<AlertTriangle size={11} aria-hidden="true" />}>
                                                {plural(unknownTags.length, 'unknown tag')}
                                            </Badge>
                                        </span>
                                    </CustomTooltip>
                                ) : (
                                    <CustomTooltip
                                        content={
                                            detectedTags.slice(0, 12).map(t => `{${t}}`).join(', ')
                                            + (detectedTags.length > 12 ? ` (+${detectedTags.length - 12} more)` : '')
                                        }
                                    >
                                        <span tabIndex={0} className="inline-flex">
                                            <Badge tone="success" icon={<CheckCircle2 size={11} aria-hidden="true" />}>
                                                {plural(detectedTags.length, 'tag')} OK
                                            </Badge>
                                        </span>
                                    </CustomTooltip>
                                )
                            ) : (
                                <span className="text-xs text-muted">Current template</span>
                            )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                            <IconButton
                                size="sm"
                                label={`Preview ${cfg.shortName} template`}
                                title="Preview with sample data"
                                disabled={isBusy}
                                onClick={() => onPreview({ target: buildSinglePreviewTarget(kind, tpl) })}
                            >
                                <Eye size={13} />
                            </IconButton>
                            <DownloadButton
                                label={`Download ${tpl.name}`}
                                onClick={() => void saveTemplateCopy(tpl, showToast)}
                            />
                            <span aria-hidden="true" className="w-px h-4 bg-border-subtle mx-1.5" />
                            <IconButton
                                size="sm"
                                tone="danger"
                                label={`Delete ${cfg.shortName} template`}
                                title={`Delete ${cfg.shortName} template`}
                                disabled={isBusy}
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
                </div>
            ) : needsMigration ? (
                <div className={`${calloutCls.warning} flex items-start gap-2 px-3 py-2.5 text-xs font-medium`}>
                    <AlertCircle size={14} className="text-status-requested shrink-0 mt-px" aria-hidden="true" />
                    <span>
                        Run <code className="font-mono">supabase/91_sicap_templates.sql</code> in the Supabase SQL editor once, then upload the form here.
                    </span>
                </div>
            ) : (
                <div className={`${calloutCls.warning} flex items-center gap-2 px-3 py-2.5 text-xs font-medium`}>
                    <AlertCircle size={14} className="text-status-requested shrink-0" aria-hidden="true" />
                    <span>{cfg.empty}</span>
                </div>
            )}

            <FileDropzone
                compact
                accept=".docx"
                disabled={needsMigration || isBusy}
                uploading={busy === 'upload'}
                onChange={fileInputHandler(file => void uploadFile(file, 'upload', `${label} uploaded`))}
                title={`${tpl ? 'Replace' : 'Upload'} ${cfg.dropName} Template`}
                hint={needsMigration
                    ? 'Run migration 91 first to enable SICAP uploads'
                    : 'Drop a .docx here or click to browse · max 5MB'}
            />

            {kind === 'sicap' && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <Button
                        variant="brand-soft"
                        size="sm"
                        loading={busy === 'starter'}
                        disabled={needsMigration || isBusy}
                        onClick={() => void handleUseSicapStarter()}
                    >
                        {busy !== 'starter' && <Sparkles size={13} aria-hidden="true" />}
                        Use built-in Jan 2026 form
                    </Button>
                    <a
                        href={sicapStarterUrl}
                        download="SICAP_Course_Form_template.docx"
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    >
                        <Download size={12} aria-hidden="true" />
                        Download to customise
                    </a>
                </div>
            )}

            <p className="text-xs text-muted flex items-start gap-1.5 mt-auto pt-1">
                <Info size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                {kind === 'sicap' ? (
                    <span>
                        One file per course date. Wrap the participant page in{' '}
                        <code className="font-mono text-primary">{`{#${SICAP_PAGE_LOOP}}…{/${SICAP_PAGE_LOOP}}`}</code>{' '}
                        to repeat for every {SICAP_SLOTS} people.
                    </span>
                ) : (
                    <span>
                        {kind === 'attendance'
                            ? <>Groups over {cfg.slots} continue on extra pages of one file.</>
                            : <>Groups over {cfg.slots} continue in extra files, one per page.</>}
                        {' '}Or repeat a single row with{' '}
                        <code className="font-mono text-primary">{`{#${SHEET_LOOP}}…{/${SHEET_LOOP}}`}</code>.
                    </span>
                )}
            </p>
        </Card>
    );
}

export function SingleTemplatesPanel({
    setup,
    showToast,
    confirmDelete,
    onPreview,
}: SingleTemplatesPanelProps) {
    const customVarKeys = useMemo(() => Object.keys(setup.customVarMap), [setup.customVarMap]);
    const templateByKind: Record<SingleKind, DocumentTemplate | null> = {
        attendance: setup.attTemplate,
        labels: setup.labelTemplate,
        sicap: setup.sicapTemplate,
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {SINGLE_KINDS.map(kind => (
                <SingleCardItem
                    key={kind}
                    kind={kind}
                    tpl={templateByKind[kind]}
                    customVarKeys={customVarKeys}
                    setup={setup}
                    showToast={showToast}
                    confirmDelete={confirmDelete}
                    onPreview={onPreview}
                />
            ))}
        </div>
    );
}

export default SingleTemplatesPanel;

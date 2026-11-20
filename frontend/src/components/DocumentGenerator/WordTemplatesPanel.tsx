import { useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Check,
    Eye,
    FileText,
    Layers,
    Pencil,
    Trash2,
    X,
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import Switch from '../ui/Switch';
import FileDropzone from '../ui/FileDropzone';
import { EmptyState } from '../ui/States';
import { CustomTooltip } from '../ui/Tooltip';
import { fieldCls } from '../ui/styles';
import { DownloadButton, ReplaceFileButton } from './shared';
import { errorText, fileInputHandler, formatBytes, plural, type ConfirmDelete, type ShowToast } from './helpers';
import { vetTemplateFile, type DocumentSetup } from './useDocumentSetup';
import type { PreviewModalTarget } from './types';
import { downloadTemplate, unknownTagsForKind } from '../../lib/documentUtils';
import { templateLabel, type Course, type DocumentTemplate } from '../../lib/types';
import { formatDisplayDate } from '../../lib/dateUtils';

export interface WordTemplatesPanelProps {
    courses: Course[];
    setup: DocumentSetup;
    showToast: ShowToast;
    confirmDelete: ConfirmDelete;
    onPreview: (preview: PreviewModalTarget) => void;
}

const MAX_VISIBLE_TAGS = 5;
const EMPTY_TAGS: readonly string[] = [];

async function saveTemplateCopy(tpl: DocumentTemplate, showToast: ShowToast) {
    try {
        await downloadTemplate(tpl);
    } catch (err: unknown) {
        showToast(`Download failed: ${errorText(err)}`, 'error');
    }
}

interface WordTemplateRowProps {
    tpl: DocumentTemplate;
    idx: number;
    total: number;
    usedByCourses: Course[];
    customVarKeys: string[];
    isBusy: boolean;
    anyBusy: boolean;
    toggling: boolean;
    reordering: boolean;
    onToggle: (tpl: DocumentTemplate) => void;
    onMove: (from: number, to: number) => void;
    onReplace: (tpl: DocumentTemplate, file: File) => void;
    onSaveMeta: (id: string, displayName: string | null, description: string) => Promise<void>;
    onDelete: (tpl: DocumentTemplate, usedByCourses: Course[]) => void;
    onPreview: (preview: PreviewModalTarget) => void;
    showToast: ShowToast;
}

function WordTemplateRow({
    tpl,
    idx,
    total,
    usedByCourses,
    customVarKeys,
    isBusy,
    anyBusy,
    toggling,
    reordering,
    onToggle,
    onMove,
    onReplace,
    onSaveMeta,
    onDelete,
    onPreview,
    showToast,
}: WordTemplateRowProps) {
    const label = templateLabel(tpl);
    const hasCustomName = Boolean(tpl.display_name?.trim() && tpl.display_name.trim() !== tpl.name);
    const sizeLabel = formatBytes(tpl.size_bytes);

    const [editing, setEditing] = useState(false);
    const [draftName, setDraftName] = useState('');
    const [draftDesc, setDraftDesc] = useState('');
    const [savingMeta, setSavingMeta] = useState(false);

    const detectedTags = tpl.tags ?? EMPTY_TAGS;
    const unknownTags = useMemo(
        () => (detectedTags.length > 0 ? unknownTagsForKind(detectedTags, 'document', customVarKeys) : []),
        [detectedTags, customVarKeys],
    );
    const unknownSet = useMemo(() => new Set(unknownTags), [unknownTags]);
    const visibleTags = detectedTags.slice(0, MAX_VISIBLE_TAGS);
    const extraTags = detectedTags.slice(MAX_VISIBLE_TAGS);

    const startEdit = () => {
        setDraftName(tpl.display_name ?? '');
        setDraftDesc(tpl.description ?? '');
        setEditing(true);
    };

    const cancelEdit = () => {
        setEditing(false);
    };

    const commitEdit = async () => {
        if (savingMeta) return;
        const cleanName = draftName.trim();
        const nextDisplayName = !cleanName || cleanName === tpl.name ? null : cleanName;
        const nextDesc = draftDesc.trim();
        const prevDisplayName = tpl.display_name?.trim() || null;
        const prevDesc = (tpl.description ?? '').trim();

        if (nextDisplayName === prevDisplayName && nextDesc === prevDesc) {
            setEditing(false);
            return;
        }

        setSavingMeta(true);
        try {
            await onSaveMeta(tpl.id, nextDisplayName, nextDesc);
            setEditing(false);
        } finally {
            setSavingMeta(false);
        }
    };

    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void commitEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelEdit();
        }
    };

    return (
        <li
            className={`px-4 sm:px-5 py-3.5 transition-colors ${
                tpl.is_active ? 'hover:bg-surface-elevated/30' : 'bg-surface-elevated/40'
            }`}
        >
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                {/* Leading order index + active switch + main metadata */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 pt-0.5 shrink-0">
                        <span className="text-xs font-medium tabular-nums text-muted w-4 text-right">
                            {idx + 1}
                        </span>
                        <Switch
                            size="sm"
                            checked={tpl.is_active}
                            disabled={isBusy || toggling}
                            onChange={() => onToggle(tpl)}
                            aria-label={`Use ${label}`}
                        />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                        {editing ? (
                            <div className="space-y-2 max-w-lg">
                                <input
                                    type="text"
                                    value={draftName}
                                    onChange={e => setDraftName(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    placeholder={tpl.name}
                                    aria-label="Template display name"
                                    maxLength={120}
                                    autoFocus
                                    disabled={savingMeta}
                                    className={`${fieldCls} font-semibold`}
                                />
                                <input
                                    type="text"
                                    value={draftDesc}
                                    onChange={e => setDraftDesc(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    placeholder="Optional short note (e.g. when this template is used)"
                                    aria-label="Template description"
                                    maxLength={240}
                                    disabled={savingMeta}
                                    className={`${fieldCls} text-xs`}
                                />
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="xs"
                                        variant="primary"
                                        loading={savingMeta}
                                        onClick={() => void commitEdit()}
                                    >
                                        {!savingMeta && <Check size={12} aria-hidden="true" />}
                                        Save
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        disabled={savingMeta}
                                        onClick={cancelEdit}
                                    >
                                        <X size={12} aria-hidden="true" />
                                        Cancel
                                    </Button>
                                    <span className="text-[11px] text-muted hidden sm:inline">
                                        Enter to save · Esc to cancel
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Title + original filename + status pill + edit trigger */}
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <p
                                        className={`text-[13px] font-semibold truncate max-w-full ${
                                            tpl.is_active ? 'text-primary' : 'text-muted'
                                        }`}
                                        title={label}
                                    >
                                        {label}
                                    </p>
                                    {hasCustomName && (
                                        <span
                                            className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-surface-elevated border border-border-subtle text-[11px] font-mono text-muted truncate max-w-48"
                                            title={`Original file: ${tpl.name}`}
                                        >
                                            {tpl.name}
                                        </span>
                                    )}
                                    <Badge
                                        tone={tpl.is_active ? 'success' : 'neutral'}
                                        shape="pill"
                                        icon={
                                            <span
                                                aria-hidden="true"
                                                className={`w-1.5 h-1.5 rounded-full ${
                                                    tpl.is_active ? 'bg-status-confirmed' : 'bg-muted/60'
                                                }`}
                                            />
                                        }
                                    >
                                        {tpl.is_active ? 'Active' : 'Off'}
                                    </Badge>
                                    {isBusy && (
                                        <Badge tone="brand" shape="pill">
                                            Uploading…
                                        </Badge>
                                    )}
                                    <IconButton
                                        size="sm"
                                        label={`Edit details for ${label}`}
                                        title="Rename or add a note"
                                        disabled={anyBusy}
                                        onClick={startEdit}
                                    >
                                        <Pencil size={12} />
                                    </IconButton>
                                </div>

                                {tpl.description?.trim() && (
                                    <p className="text-xs text-muted leading-relaxed">
                                        {tpl.description.trim()}
                                    </p>
                                )}
                            </>
                        )}

                        {/* Meta line: updated date · file size · course preset usage */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            <span>
                                {isBusy ? 'Uploading…' : `Updated ${formatDisplayDate(tpl.updated_at || tpl.created_at)}`}
                            </span>
                            {sizeLabel && (
                                <>
                                    <span aria-hidden="true">·</span>
                                    <span className="tabular-nums">{sizeLabel}</span>
                                </>
                            )}
                            {usedByCourses.length > 0 && (
                                <>
                                    <span aria-hidden="true">·</span>
                                    <CustomTooltip content={usedByCourses.map(c => c.name).join('\n')}>
                                        <span
                                            tabIndex={0}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium cursor-default"
                                        >
                                            <Layers size={11} aria-hidden="true" />
                                            Used in {plural(usedByCourses.length, 'course preset')}
                                        </span>
                                    </CustomTooltip>
                                </>
                            )}
                        </div>

                        {/* Detected {tags} row */}
                        {detectedTags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-0.5" aria-label="Detected placeholders">
                                {visibleTags.map(tag => {
                                    const isUnknown = unknownSet.has(tag);
                                    return (
                                        <code
                                            key={tag}
                                            className={`px-1.5 py-0.5 rounded-md border font-mono text-[11px] leading-tight ${
                                                isUnknown
                                                    ? 'bg-warning/15 border-warning/30 text-status-requested'
                                                    : 'bg-surface-elevated border-border-subtle text-muted'
                                            }`}
                                        >
                                            {`{${tag}}`}
                                        </code>
                                    );
                                })}
                                {extraTags.length > 0 && (
                                    <CustomTooltip content={extraTags.map(t => `{${t}}`).join(', ')}>
                                        <span
                                            tabIndex={0}
                                            className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-surface-elevated border border-border-subtle text-muted text-[11px] font-medium tabular-nums cursor-default"
                                        >
                                            +{extraTags.length}
                                        </span>
                                    </CustomTooltip>
                                )}
                                {unknownTags.length > 0 && (
                                    <CustomTooltip
                                        content={`Will print blank unless added as custom variables:\n${unknownTags.map(t => `{${t}}`).join(', ')}`}
                                    >
                                        <span tabIndex={0} className="inline-flex">
                                            <Badge tone="warning" icon={<AlertTriangle size={11} aria-hidden="true" />}>
                                                {plural(unknownTags.length, 'unknown tag')}
                                            </Badge>
                                        </span>
                                    </CustomTooltip>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Spaced action bar (separator keeps Delete touch target clear of Replace/Move) */}
                <div className="flex items-center gap-1 shrink-0 sm:ml-auto pl-11 sm:pl-0">
                    <IconButton
                        size="sm"
                        label={`Move ${label} up`}
                        title="Move up"
                        disabled={idx === 0 || reordering || anyBusy}
                        onClick={() => onMove(idx, idx - 1)}
                    >
                        <ArrowUp size={13} />
                    </IconButton>
                    <IconButton
                        size="sm"
                        label={`Move ${label} down`}
                        title="Move down"
                        disabled={idx === total - 1 || reordering || anyBusy}
                        onClick={() => onMove(idx, idx + 1)}
                    >
                        <ArrowDown size={13} />
                    </IconButton>
                    <span aria-hidden="true" className="w-px h-4 bg-border-subtle mx-1" />
                    <IconButton
                        size="sm"
                        label={`Preview ${label}`}
                        title="Preview with sample data"
                        disabled={anyBusy}
                        onClick={() => onPreview({ target: { kind: 'word', template: tpl } })}
                    >
                        <Eye size={13} />
                    </IconButton>
                    <DownloadButton
                        label={`Download ${label}`}
                        onClick={() => void saveTemplateCopy(tpl, showToast)}
                    />
                    <ReplaceFileButton
                        label={`Replace ${label} with a new file`}
                        disabled={anyBusy}
                        onFile={file => onReplace(tpl, file)}
                    />
                    <span aria-hidden="true" className="w-px h-4 bg-border-subtle mx-1.5" />
                    <IconButton
                        size="sm"
                        tone="danger"
                        label={`Delete template ${label}`}
                        title="Delete template"
                        disabled={anyBusy}
                        onClick={() => onDelete(tpl, usedByCourses)}
                    >
                        <Trash2 size={14} />
                    </IconButton>
                </div>
            </div>
        </li>
    );
}

export function WordTemplatesPanel({
    courses,
    setup,
    showToast,
    confirmDelete,
    onPreview,
}: WordTemplatesPanelProps) {
    const { templates } = setup;
    const [busy, setBusy] = useState<string | null>(null);

    const activeCount = useMemo(() => templates.filter(t => t.is_active).length, [templates]);
    const customVarKeys = useMemo(() => Object.keys(setup.customVarMap), [setup.customVarMap]);

    const courseUsageByTemplate = useMemo(() => {
        const map = new Map<string, Course[]>();
        for (const course of courses) {
            for (const tid of course.template_ids ?? []) {
                const list = map.get(tid);
                if (list) list.push(course);
                else map.set(tid, [course]);
            }
        }
        return map;
    }, [courses]);

    const togglingId = setup.toggleActive.isPending ? setup.toggleActive.variables?.id ?? null : null;

    const handleUploadNew = async (file: File) => {
        setBusy('new');
        try {
            const vet = await vetTemplateFile(file, 'document', setup.customVarMap);
            if ('error' in vet) {
                showToast(vet.error, 'error', { duration: 12000 });
                return;
            }
            await setup.uploadTemplate.mutateAsync({ file, tags: vet.tags });
            showToast(
                `Template uploaded.${vet.note}`,
                vet.note ? 'info' : 'success',
                vet.note ? { duration: 12000 } : undefined,
            );
        } catch (err: unknown) {
            console.error('Upload error:', err);
            showToast(`Upload failed: ${errorText(err)}`, 'error');
        } finally {
            setBusy(null);
        }
    };

    const handleReplace = async (tpl: DocumentTemplate, file: File) => {
        const label = templateLabel(tpl);
        setBusy(tpl.id);
        try {
            const vet = await vetTemplateFile(file, 'document', setup.customVarMap);
            if ('error' in vet) {
                showToast(vet.error, 'error', { duration: 12000 });
                return;
            }
            await setup.replaceTemplate.mutateAsync({ tpl, file, tags: vet.tags });
            showToast(
                `"${label}" replaced — courses using it keep it.${vet.note}`,
                vet.note ? 'info' : 'success',
                vet.note ? { duration: 12000 } : undefined,
            );
        } catch (err: unknown) {
            console.error('Replace error:', err);
            showToast(`Upload failed: ${errorText(err)}`, 'error');
        } finally {
            setBusy(null);
        }
    };

    const handleToggle = (tpl: DocumentTemplate) => {
        setup.toggleActive.mutate(tpl, {
            onError: err => showToast(`Failed to toggle: ${errorText(err)}`, 'error'),
        });
    };

    const handleMove = (from: number, to: number) => {
        const next = [...templates];
        next.splice(to, 0, ...next.splice(from, 1));
        setup.reorderTemplates.mutate(next, {
            onError: err => showToast(`Could not reorder templates: ${errorText(err)}`, 'error'),
        });
    };

    const handleSaveMeta = async (id: string, displayName: string | null, description: string) => {
        try {
            await setup.updateTemplateMeta.mutateAsync({
                id,
                display_name: displayName,
                description,
            });
            showToast('Template details saved', 'success');
        } catch (err: unknown) {
            showToast(`Could not save details: ${errorText(err)}`, 'error');
            throw err;
        }
    };

    const handleDelete = (tpl: DocumentTemplate, usedByCourses: Course[]) => {
        const label = templateLabel(tpl);
        const courseList = usedByCourses.map(c => c.name);
        const presetNote = courseList.length > 0
            ? ` It is used in the template preset for: ${courseList.join(', ')}. Deleting it will remove it from ${courseList.length === 1 ? 'that preset' : 'those presets'}.`
            : ' Courses that picked it will stop using it.';
        confirmDelete({
            title: 'Delete Template',
            message: `Delete "${label}"? The file will be removed permanently.${presetNote}`,
            run: () => setup.removeTemplate.mutateAsync(tpl).then(
                () => showToast('Template deleted', 'success'),
                err => showToast(`Delete failed: ${errorText(err)}`, 'error'),
            ),
        });
    };

    return (
        <Card
            title="Word document templates"
            subtitle="Toggle, rename and order which .docx templates are used during generation"
            icon={FileText}
            tone="completed"
            divided
            flush
            action={
                <Badge
                    tone={templates.length === 0 ? 'neutral' : activeCount > 0 ? 'completed' : 'warning'}
                    shape="pill"
                    className="tabular-nums"
                >
                    {activeCount} / {templates.length} active
                </Badge>
            }
        >
            <div className={`px-4 sm:px-5 py-3.5 ${templates.length > 0 ? 'border-b border-border-subtle bg-surface-elevated/25' : ''}`}>
                <FileDropzone
                    compact
                    accept=".docx"
                    onChange={fileInputHandler(file => void handleUploadNew(file))}
                    uploading={busy === 'new'}
                    disabled={busy !== null}
                    title="Add new template"
                    hint="Drop a .docx here or click to browse · max 5MB · placeholders are checked on upload"
                />
            </div>

            {templates.length === 0 ? (
                <EmptyState
                    bare
                    icon={<FileText size={20} />}
                    title="No Word templates yet"
                    description="Upload a .docx file above with placeholders like {fullName} or {courseDate} to generate personalised documents for each participant."
                />
            ) : (
                <ul className="divide-y divide-border-subtle">
                    {templates.map((tpl, idx) => (
                        <WordTemplateRow
                            key={tpl.id}
                            tpl={tpl}
                            idx={idx}
                            total={templates.length}
                            usedByCourses={courseUsageByTemplate.get(tpl.id) ?? []}
                            customVarKeys={customVarKeys}
                            isBusy={busy === tpl.id}
                            anyBusy={busy !== null}
                            toggling={togglingId === tpl.id}
                            reordering={setup.reorderTemplates.isPending}
                            onToggle={handleToggle}
                            onMove={handleMove}
                            onReplace={(t, file) => void handleReplace(t, file)}
                            onSaveMeta={handleSaveMeta}
                            onDelete={handleDelete}
                            onPreview={onPreview}
                            showToast={showToast}
                        />
                    ))}
                </ul>
            )}
        </Card>
    );
}

export default WordTemplatesPanel;

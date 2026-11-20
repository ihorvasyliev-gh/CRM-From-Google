import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Award,
    Download,
    ExternalLink,
    FileText,
    Info,
    Link2,
    Plus,
    RefreshCw,
    Trash2,
} from 'lucide-react';
import Card from './ui/Card';
import Badge from './ui/Badge';
import { Button, IconButton } from './ui/Button';
import Switch from './ui/Switch';
import FileDropzone from './ui/FileDropzone';
import { EmptyState, ErrorState } from './ui/States';
import { calloutCls, fieldCls, inputCls } from './ui/styles';
import ConfirmDialog from './ConfirmDialog';
import { copyText } from './Viewer/viewerUtils';
import { toast } from '../lib/toast';
import { downloadBlob } from '../lib/download';
import { describeDocxError } from '../lib/documentRender';
import { fieldLabel } from '../lib/certificates/fields';
import { isExpiryTag, validityLabel } from '../lib/certificates/dates';
import { certificateTemplateLink, type CertificateTemplate } from '../lib/certificates/library';
import { downloadCertificateTemplate, useCertificateTemplateMutations, useCertificateTemplates } from '../hooks/useCertificateTemplates';

const DOCX_ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** The lengths an admin can give a certificate: none, or 1 to 5 years */
const VALIDITY_OPTIONS = [12, 24, 36, 48, 60];

const errorText = (err: unknown) => describeDocxError(err);

function formatFileSize(bytes: number | null | undefined): string | null {
    if (!bytes || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One template: its name, how long it is valid, whether the page offers it */
function TemplateRow({
    template,
    first,
    last,
    isReplacing,
    onReplace,
    onDelete,
}: {
    template: CertificateTemplate;
    first: boolean;
    last: boolean;
    isReplacing: boolean;
    onReplace: (t: CertificateTemplate) => void;
    onDelete: (t: CertificateTemplate) => void;
}) {
    const { update, move } = useCertificateTemplateMutations();
    const [name, setName] = useState(template.name);
    const [downloading, setDownloading] = useState(false);

    // Keep local draft name synced when props refresh (e.g. after server update or realtime sync)
    useEffect(() => {
        setName(template.name);
    }, [template.name]);

    const labels = template.tags.map(fieldLabel).filter((l, i, all) => all.indexOf(l) === i);
    const hasExpiry = template.tags.some(isExpiryTag);
    const sizeLabel = formatFileSize(template.size_bytes);
    const options = [...new Set([...VALIDITY_OPTIONS, ...(template.validity_months ? [template.validity_months] : [])])].sort((a, b) => a - b);

    const save = (patch: Parameters<typeof update.mutate>[0]['patch'], done?: string) =>
        update.mutate({ id: template.id, patch }, {
            onSuccess: () => done && toast.success(done),
            onError: err => toast.error(`Not saved: ${errorText(err)}`),
        });

    const saveName = () => {
        const next = name.trim().replace(/\s+/g, ' ');
        if (!next) return setName(template.name);
        if (next !== template.name) save({ name: next }, 'Name saved');
    };

    const handleMove = (dir: -1 | 1) =>
        move.mutate(
            { id: template.id, dir },
            { onError: err => toast.error(`Could not reorder: ${errorText(err)}`) },
        );

    const download = async () => {
        setDownloading(true);
        try {
            downloadBlob(await downloadCertificateTemplate(template), template.file_name);
        } catch (err) {
            toast.error(`Could not download: ${errorText(err)}`);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <li
            className={`px-4 sm:px-5 py-4 transition-colors ${
                template.is_active ? 'hover:bg-surface-elevated/30' : 'bg-surface-elevated/40'
            }`}
        >
            {/* Top row: editable title + status pill + actions */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="min-w-0 flex-1 max-w-md">
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onBlur={saveName}
                            onKeyDown={e => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') setName(template.name);
                            }}
                            aria-label="Name on the certificates page"
                            maxLength={120}
                            className={`${fieldCls} font-semibold`}
                        />
                    </div>
                    <Badge
                        tone={template.is_active ? 'success' : 'neutral'}
                        shape="pill"
                        icon={
                            <span
                                aria-hidden="true"
                                className={`w-1.5 h-1.5 rounded-full ${template.is_active ? 'bg-status-confirmed' : 'bg-muted/60'}`}
                            />
                        }
                    >
                        {template.is_active ? 'Live' : 'Hidden'}
                    </Badge>
                    {isReplacing && (
                        <Badge tone="brand" shape="pill">
                            Replacing…
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-0.5 sm:ml-auto shrink-0">
                    <IconButton
                        size="sm"
                        label="Move up"
                        disabled={first || move.isPending || isReplacing}
                        onClick={() => handleMove(-1)}
                    >
                        <ArrowUp size={14} />
                    </IconButton>
                    <IconButton
                        size="sm"
                        label="Move down"
                        disabled={last || move.isPending || isReplacing}
                        onClick={() => handleMove(1)}
                    >
                        <ArrowDown size={14} />
                    </IconButton>
                    <span aria-hidden="true" className="w-px h-4 bg-border-subtle mx-1" />
                    <IconButton
                        size="sm"
                        tone="brand"
                        label="Copy the link that opens this certificate"
                        disabled={!template.is_active}
                        onClick={() => copyText(certificateTemplateLink(template.id), 'Link')}
                    >
                        <Link2 size={14} />
                    </IconButton>
                    <IconButton
                        size="sm"
                        label="Download the Word file"
                        disabled={downloading || isReplacing}
                        onClick={download}
                    >
                        <Download size={14} />
                    </IconButton>
                    <IconButton
                        size="sm"
                        label={isReplacing ? 'Replacing Word file…' : 'Replace the Word file'}
                        disabled={isReplacing}
                        onClick={() => onReplace(template)}
                    >
                        <RefreshCw size={14} className={isReplacing ? 'animate-spin text-brand-500' : ''} />
                    </IconButton>
                    <IconButton
                        size="sm"
                        tone="danger"
                        label="Delete"
                        disabled={isReplacing}
                        onClick={() => onDelete(template)}
                    >
                        <Trash2 size={14} />
                    </IconButton>
                </div>
            </div>

            {/* File metadata & detected placeholders */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs text-secondary font-medium">
                    <FileText size={13} className="text-muted shrink-0" aria-hidden="true" />
                    <span className="break-all">{template.file_name}</span>
                    {sizeLabel && <span className="text-muted font-normal tabular-nums">({sizeLabel})</span>}
                </span>

                {labels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1" aria-label="Detected placeholders">
                        {labels.map(label => (
                            <Badge key={label} tone="neutral" className="font-medium">
                                {label}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {labels.length === 0 && (
                <p className="mt-2 text-xs text-status-requested flex items-center gap-1.5">
                    <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
                    <span>No {'{placeholders}'} detected in this file — nothing will be filled in.</span>
                </p>
            )}

            {/* Controls strip: validity length & visibility toggle */}
            <div className="mt-3 pt-2.5 border-t border-border-subtle/70 flex flex-wrap items-center gap-x-5 gap-y-2.5">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-muted whitespace-nowrap">
                    Valid for
                    <select
                        value={template.validity_months ?? ''}
                        onChange={e => save({ validity_months: e.target.value ? Number(e.target.value) : null }, 'Saved')}
                        disabled={isReplacing}
                        className={`${inputCls} h-8 w-auto pr-8 text-xs`}
                    >
                        <option value="">No set length</option>
                        {options.map(m => (
                            <option key={m} value={m}>
                                {validityLabel(m)}
                            </option>
                        ))}
                    </select>
                </label>

                <Switch
                    size="sm"
                    label="On the page"
                    checked={template.is_active}
                    disabled={isReplacing}
                    onChange={checked =>
                        save(
                            { is_active: checked },
                            checked ? `“${template.name}” is on the page` : `“${template.name}” is hidden from the page`,
                        )
                    }
                />
            </div>

            {!hasExpiry && template.validity_months && (
                <p className="mt-2 text-xs text-muted flex items-start gap-1.5">
                    <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                        This file has no expiry date ({'{expire}'} or {'{expiryDate}'}), so the validity length is not printed.
                    </span>
                </p>
            )}
        </li>
    );
}

/**
 * Settings → Certificates: the Word templates offered on the public /certificates page. Admins
 * upload them, name them, give each one how long it is valid, and switch them on or off.
 */
export default function CertificateTemplatesSection({ id }: { id?: string }) {
    const { data, isLoading, error, refetch } = useCertificateTemplates();
    const { upload, replace, remove } = useCertificateTemplateMutations();
    const addRef = useRef<HTMLInputElement>(null);
    const replaceRef = useRef<HTMLInputElement>(null);
    const [replacing, setReplacing] = useState<CertificateTemplate | null>(null);
    const [deleting, setDeleting] = useState<CertificateTemplate | null>(null);

    const templates = data?.templates ?? [];
    const available = data?.available ?? true;
    const replacingId = replace.isPending ? replace.variables?.template.id ?? null : null;
    const activeCount = templates.filter(t => t.is_active).length;

    const onAdd = (e: ChangeEvent<HTMLInputElement>) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        for (const file of files) {
            upload.mutate(file, {
                onSuccess: t => toast.success(`“${t.name}” added${t.tags.length ? '' : ', but it has no {placeholders}'}`),
                onError: err => toast.error(`${file.name}: ${errorText(err)}`),
            });
        }
    };

    const onReplaceFile = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        const template = replacing;
        setReplacing(null);
        if (!file || !template) return;
        replace.mutate(
            { template, file },
            {
                onSuccess: t => toast.success(`“${t.name}” now uses ${file.name}`),
                onError: err => toast.error(`${file.name}: ${errorText(err)}`),
            },
        );
    };

    return (
        <Card
            id={id}
            className="scroll-mt-20"
            title={
                <span className="inline-flex items-center gap-2 flex-wrap">
                    <span>Certificate templates</span>
                    {available && !isLoading && !error && templates.length > 0 && (
                        <Badge tone={activeCount > 0 ? 'success' : 'neutral'} shape="pill" className="tabular-nums">
                            {activeCount}/{templates.length} live
                        </Badge>
                    )}
                </span>
            }
            subtitle="Word certificates offered on the public Certificates page"
            icon={Award}
            divided
            bodyClassName="p-0!"
            action={
                <div className="flex flex-col-reverse sm:flex-row items-end sm:items-center gap-1 sm:gap-2.5">
                    <a
                        href="/certificates"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap"
                    >
                        Open the page <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    <input
                        ref={addRef}
                        type="file"
                        accept={DOCX_ACCEPT}
                        multiple
                        onChange={onAdd}
                        className="hidden"
                        aria-label="Add certificate templates"
                    />
                    <Button
                        size="sm"
                        variant="primary"
                        onClick={() => addRef.current?.click()}
                        loading={upload.isPending}
                        disabled={!available}
                    >
                        {!upload.isPending && <Plus size={14} />} Add template
                    </Button>
                </div>
            }
        >
            <input
                ref={replaceRef}
                type="file"
                accept={DOCX_ACCEPT}
                onChange={onReplaceFile}
                className="hidden"
                aria-label="Choose the new Word file"
            />

            {!available ? (
                <div className={`${calloutCls.warning} m-4 sm:m-5 text-sm p-3.5 flex items-start gap-2.5`}>
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-status-requested" aria-hidden="true" />
                    <p className="leading-relaxed">
                        To keep certificates here, run <code className="font-mono">supabase/89_certificate_templates.sql</code> in the Supabase SQL Editor once.
                        Until then the Certificates page asks people for their own Word file.
                    </p>
                </div>
            ) : error ? (
                <div className="p-4 sm:p-5">
                    <ErrorState title="The templates could not be loaded" error={error} onRetry={() => refetch()} />
                </div>
            ) : isLoading ? (
                <div className="p-4 sm:p-5 space-y-3" aria-busy="true">
                    {[0, 1].map(i => (
                        <div key={i} className="h-20 rounded-xl bg-surface-elevated animate-pulse" />
                    ))}
                </div>
            ) : (
                <>
                    <div className={`px-4 sm:px-5 py-3.5 ${templates.length > 0 ? 'border-b border-border-subtle bg-surface-elevated/25' : ''}`}>
                        <FileDropzone
                            compact
                            accept={DOCX_ACCEPT}
                            multiple
                            onChange={onAdd}
                            uploading={upload.isPending}
                            disabled={!available}
                            title="Drop Word templates (.docx) here or click to browse"
                            hint="Supports {firstName}, {lastName}, {courseDate}, {expire}, {tutor} · Max 15 MB"
                        />
                    </div>

                    {templates.length === 0 ? (
                        <EmptyState
                            bare
                            icon={<Award size={20} />}
                            title="No certificates yet"
                            description="Add a Word file (.docx) with {firstName}, {lastName}, {courseDate}, {expire} or {tutor} where they go. It is then offered on the Certificates page."
                            action={
                                <Button variant="primary" onClick={() => addRef.current?.click()} loading={upload.isPending}>
                                    {!upload.isPending && <Plus size={14} />} Add template
                                </Button>
                            }
                        />
                    ) : (
                        <ul className="divide-y divide-border-subtle">
                            {templates.map((t, i) => (
                                <TemplateRow
                                    key={t.id}
                                    template={t}
                                    first={i === 0}
                                    last={i === templates.length - 1}
                                    isReplacing={replacingId === t.id}
                                    onReplace={tpl => {
                                        setReplacing(tpl);
                                        replaceRef.current?.click();
                                    }}
                                    onDelete={setDeleting}
                                />
                            ))}
                        </ul>
                    )}
                </>
            )}

            <ConfirmDialog
                open={!!deleting}
                title={`Delete “${deleting?.name ?? ''}”?`}
                message="It is taken off the Certificates page and its Word file is deleted. Certificates already made are not affected."
                confirmLabel="Delete"
                onConfirm={() =>
                    deleting
                        ? remove.mutateAsync(deleting).then(
                              () => {
                                  toast.success(`“${deleting.name}” deleted`);
                                  setDeleting(null);
                              },
                              err => {
                                  toast.error(`Not deleted: ${errorText(err)}`);
                                  setDeleting(null);
                              },
                          )
                        : undefined
                }
                onCancel={() => setDeleting(null)}
            />
        </Card>
    );
}

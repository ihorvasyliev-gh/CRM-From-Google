import { useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Award, Download, ExternalLink, Link2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Card from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { EmptyState } from './ui/States';
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

/** One template: its name, how long it is valid, whether the page offers it */
function TemplateRow({ template, first, last, onReplace, onDelete }: {
    template: CertificateTemplate;
    first: boolean;
    last: boolean;
    onReplace: (t: CertificateTemplate) => void;
    onDelete: (t: CertificateTemplate) => void;
}) {
    const { update, move } = useCertificateTemplateMutations();
    const [name, setName] = useState(template.name);
    const [downloading, setDownloading] = useState(false);
    const labels = template.tags.map(fieldLabel).filter((l, i, all) => all.indexOf(l) === i);
    const hasExpiry = template.tags.some(isExpiryTag);
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
        <li className={`px-4 sm:px-5 py-4 ${template.is_active ? '' : 'bg-surface-elevated/40'}`}>
            <div className="flex flex-col md:flex-row md:items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onBlur={saveName}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setName(template.name); }}
                        aria-label="Name on the certificates page"
                        maxLength={120}
                        className={`${fieldCls} font-semibold`}
                    />
                    <p className="text-xs text-muted leading-relaxed break-words">
                        <span className="text-secondary">{template.file_name}</span>
                        {labels.length > 0 ? <> · fills in {labels.join(', ')}</> : null}
                    </p>
                    {labels.length === 0 && (
                        <p className="text-xs text-status-requested flex items-center gap-1.5">
                            <AlertTriangle size={12} aria-hidden="true" /> No {'{placeholders}'} in this file: nothing to fill in.
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:pt-1">
                    <label className="flex items-center gap-2 text-xs text-muted">
                        Valid for
                        <select
                            value={template.validity_months ?? ''}
                            onChange={e => save({ validity_months: e.target.value ? Number(e.target.value) : null }, 'Saved')}
                            className={`${inputCls} h-8 w-auto pr-8 text-xs`}
                        >
                            <option value="">No set length</option>
                            {options.map(m => <option key={m} value={m}>{validityLabel(m)}</option>)}
                        </select>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-primary font-medium cursor-pointer select-none">
                        <span className="relative flex items-center shrink-0">
                            <input
                                type="checkbox"
                                checked={template.is_active}
                                onChange={e => save({ is_active: e.target.checked }, e.target.checked ? `“${template.name}” is on the page` : `“${template.name}” is hidden from the page`)}
                                className="peer sr-only"
                            />
                            <span className="w-9 h-5 bg-border-strong rounded-full peer-checked:bg-brand-500 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40" />
                            <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition-transform shadow-xs" />
                        </span>
                        On the page
                    </label>

                    <div className="flex items-center gap-0.5">
                        <IconButton size="sm" label="Move up" disabled={first || move.isPending} onClick={() => move.mutate({ id: template.id, dir: -1 })}><ArrowUp size={14} /></IconButton>
                        <IconButton size="sm" label="Move down" disabled={last || move.isPending} onClick={() => move.mutate({ id: template.id, dir: 1 })}><ArrowDown size={14} /></IconButton>
                        <IconButton size="sm" label="Copy the link that opens this certificate" disabled={!template.is_active} onClick={() => copyText(certificateTemplateLink(template.id), 'Link')}><Link2 size={14} /></IconButton>
                        <IconButton size="sm" label="Download the Word file" disabled={downloading} onClick={download}><Download size={14} /></IconButton>
                        <IconButton size="sm" label="Replace the Word file" onClick={() => onReplace(template)}><RefreshCw size={14} /></IconButton>
                        <IconButton size="sm" tone="danger" label="Delete" onClick={() => onDelete(template)}><Trash2 size={14} /></IconButton>
                    </div>
                </div>
            </div>
            {!hasExpiry && template.validity_months && (
                <p className="mt-2 text-xs text-muted">
                    This file has no expiry date ({'{expire}'} or {'{expiryDate}'}), so the length is not printed.
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
        replace.mutate({ template, file }, {
            onSuccess: t => toast.success(`“${t.name}” now uses ${file.name}`),
            onError: err => toast.error(`${file.name}: ${errorText(err)}`),
        });
    };

    return (
        <Card
            id={id}
            className="scroll-mt-20"
            title="Certificate templates"
            subtitle="Word certificates offered on the public Certificates page"
            icon={Award}
            divided
            bodyClassName="p-0!"
            action={
                <div className="flex items-center gap-2">
                    <a href="/certificates" target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                        Open the page <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    <input ref={addRef} type="file" accept={DOCX_ACCEPT} multiple onChange={onAdd} className="hidden" aria-label="Add certificate templates" />
                    <Button size="sm" variant="primary" onClick={() => addRef.current?.click()} loading={upload.isPending} disabled={!available}>
                        {!upload.isPending && <Plus size={14} />} Add template
                    </Button>
                </div>
            }
        >
            <input ref={replaceRef} type="file" accept={DOCX_ACCEPT} onChange={onReplaceFile} className="hidden" aria-label="Choose the new Word file" />
            {!available ? (
                <div className={`${calloutCls.warning} m-4 sm:m-5 text-sm p-3 flex items-start gap-2.5`}>
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-status-requested" aria-hidden="true" />
                    <p className="leading-relaxed">
                        To keep certificates here, run <code className="font-mono">supabase/89_certificate_templates.sql</code> in the Supabase SQL Editor once.
                        Until then the Certificates page asks people for their own Word file.
                    </p>
                </div>
            ) : error ? (
                <div className={`${calloutCls.danger} m-4 sm:m-5 text-sm p-3 flex items-center justify-between gap-3`}>
                    <span>The templates could not be loaded.</span>
                    <Button size="sm" onClick={() => refetch()}>Try again</Button>
                </div>
            ) : isLoading ? (
                <div className="p-5 space-y-3" aria-busy="true">
                    {[0, 1].map(i => <div key={i} className="h-14 rounded-xl bg-surface-elevated animate-pulse" />)}
                </div>
            ) : templates.length === 0 ? (
                <EmptyState
                    bare
                    icon={<Award size={20} />}
                    title="No certificates yet"
                    description="Add a Word file (.docx) with {firstName}, {lastName}, {courseDate}, {expire} or {tutor} where they go. It is then offered on the Certificates page."
                    action={<Button variant="primary" onClick={() => addRef.current?.click()} loading={upload.isPending}>{!upload.isPending && <Plus size={14} />} Add template</Button>}
                />
            ) : (
                <ul className="divide-y divide-border-subtle">
                    {templates.map((t, i) => (
                        <TemplateRow
                            key={t.id}
                            template={t}
                            first={i === 0}
                            last={i === templates.length - 1}
                            onReplace={tpl => { setReplacing(tpl); replaceRef.current?.click(); }}
                            onDelete={setDeleting}
                        />
                    ))}
                </ul>
            )}
            <ConfirmDialog
                open={!!deleting}
                title={`Delete “${deleting?.name ?? ''}”?`}
                message="It is taken off the Certificates page and its Word file is deleted. Certificates already made are not affected."
                confirmLabel="Delete"
                onConfirm={() => deleting ? remove.mutateAsync(deleting).then(
                    () => { toast.success(`“${deleting.name}” deleted`); setDeleting(null); },
                    err => { toast.error(`Not deleted: ${errorText(err)}`); setDeleting(null); },
                ) : undefined}
                onCancel={() => setDeleting(null)}
            />
        </Card>
    );
}

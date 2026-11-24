import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    Copy,
    ExternalLink,
    FileCode2,
    Mail,
    Type,
    Users,
    X,
} from 'lucide-react';
import {
    buildMailtoUrl,
    mailtoLauncher,
    MAX_SAFE_MAILTO_LENGTH,
    splitEmailBatches,
    subscribeBulkEmail,
    type BulkEmailPayload,
} from '../lib/mailtoHelper';
import { toast } from '../lib/toast';
import { useLastPresent } from '../hooks/usePresence';
import DialogLayer from './ui/DialogLayer';
import { Button } from './ui/Button';
import Badge from './ui/Badge';
import { calloutCls, eyebrowCls, panelCls, toneChipCls } from './ui/styles';

/**
 * Global bulk-email helper modal.
 *
 * Mount once near the root of the app shell. Opens automatically whenever a
 * `mailto:` link would exceed Windows/Outlook's safe URL length limit (or when
 * Webmail mode is requested), offering one-click Webmail copy and safe desktop batches.
 */
export default function BulkEmailModal() {
    const [payload, setPayload] = useState<BulkEmailPayload | null>(null);
    const [openedBatches, setOpenedBatches] = useState<Set<number>>(() => new Set());
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return subscribeBulkEmail(next => {
            setPayload(next);
            setOpenedBatches(new Set());
            setCopiedKey(null);
        });
    }, []);

    useEffect(() => {
        return () => {
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        };
    }, []);

    const shown = useLastPresent(payload);

    const batches = useMemo(
        () => (shown ? splitEmailBatches(shown.emails, shown.subject, MAX_SAFE_MAILTO_LENGTH) : []),
        [shown],
    );

    if (!shown) return null;

    const close = () => setPayload(null);

    const flashCopied = (key: string) => {
        setCopiedKey(key);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => {
            setCopiedKey(prev => (prev === key ? null : prev));
        }, 1800);
    };

    const handleCopyAllBcc = async () => {
        if (shown.emails.length === 0) {
            toast.error('No email addresses to copy');
            return;
        }
        try {
            await navigator.clipboard.writeText(shown.emails.join('; '));
            flashCopied('all-bcc');
            toast.success(`Copied ${shown.emails.length} BCC email${shown.emails.length === 1 ? '' : 's'}`);
        } catch (err) {
            console.error('Failed to copy BCC emails:', err);
            toast.error('Could not copy BCC emails');
        }
    };

    const handleCopySubject = async () => {
        try {
            await navigator.clipboard.writeText(shown.subject);
            flashCopied('subject');
            toast.success('Subject copied');
        } catch (err) {
            console.error('Failed to copy subject:', err);
            toast.error('Could not copy subject');
        }
    };

    const handleCopyHtmlBody = async () => {
        try {
            if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': new Blob([shown.html], { type: 'text/html' }),
                        'text/plain': new Blob(['Please view this email in an HTML-compatible client.'], { type: 'text/plain' }),
                    }),
                ]);
            } else {
                await navigator.clipboard.writeText(shown.html);
            }
            flashCopied('html-body');
            toast.success('HTML email body copied — press Ctrl+V to paste');
        } catch (err) {
            console.error('Failed to copy HTML body:', err);
            toast.error('Could not copy HTML email body');
        }
    };

    const handleOpenBatch = (index: number, batch: string[]) => {
        const url = buildMailtoUrl(batch, shown.subject);
        mailtoLauncher.open(url);
        setOpenedBatches(prev => {
            const next = new Set(prev);
            next.add(index);
            return next;
        });
    };

    const handleCopyBatchBcc = async (index: number, batch: string[]) => {
        try {
            await navigator.clipboard.writeText(batch.join('; '));
            flashCopied(`batch-${index}`);
            toast.success(`Copied Batch ${index + 1} (${batch.length} email${batch.length === 1 ? '' : 's'})`);
        } catch (err) {
            console.error('Failed to copy batch BCC:', err);
            toast.error('Could not copy batch emails');
        }
    };

    const totalRecipients = shown.emails.length;
    const batchCount = batches.length;

    return (
        <DialogLayer
            open={Boolean(payload)}
            onClose={close}
            labelledBy="bulk-email-modal-title"
            className="z-50 flex items-end sm:items-center justify-center sm:p-4"
            panelClassName="w-full max-w-2xl max-h-[90dvh] flex flex-col bg-surface border border-border-subtle shadow-float overflow-hidden rounded-t-2xl sm:rounded-2xl"
            enter="animate-sheetSlideUp sm:animate-scaleIn"
            exit="animate-sheetSlideDown sm:animate-scaleOut"
        >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-border-subtle shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${toneChipCls.brand}`}>
                        <Mail size={18} />
                    </span>
                    <div className="min-w-0">
                        <h2 id="bulk-email-modal-title" className="text-base font-semibold text-primary tracking-tight truncate">
                            {shown.title || 'Bulk Email Helper'}
                        </h2>
                        <p className="text-xs text-muted truncate mt-0.5 tabular-nums">
                            {totalRecipients} recipient{totalRecipients === 1 ? '' : 's'}
                            {batchCount > 0 ? ` · ${batchCount} safe batch${batchCount === 1 ? '' : 'es'}` : ''}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="p-2 text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-4">
                {/* Reason Callout */}
                <div className={`${calloutCls.warning} p-3.5 flex items-start gap-3`}>
                    <AlertTriangle size={17} className="text-status-requested shrink-0 mt-0.5" />
                    <p className="text-xs sm:text-sm text-primary leading-relaxed">
                        {batchCount > 1 ? (
                            <>
                                <span className="font-semibold tabular-nums">{totalRecipients} recipients</span> exceeds Outlook&apos;s{' '}
                                <code className="font-mono text-xs bg-surface px-1 py-0.5 rounded-sm border border-border-subtle">mailto:</code>{' '}
                                link limit — use <span className="font-semibold">Webmail quick-copy</span> below or send in{' '}
                                <span className="font-semibold tabular-nums">{batchCount} batches</span>.
                            </>
                        ) : (
                            <>
                                Ready for <span className="font-semibold tabular-nums">{totalRecipients} recipient{totalRecipients === 1 ? '' : 's'}</span>{' '}
                                — copy fields directly into Webmail (Outlook Web, Gmail) or open in your desktop email app below.
                            </>
                        )}
                    </p>
                </div>

                {/* Section 1: Webmail / One-Click Copy Mode */}
                <section className={`${panelCls} p-4 space-y-3`}>
                    <div className="space-y-0.5">
                        <p className={eyebrowCls}>Webmail / One-Click Copy</p>
                        <p className="text-xs text-muted">
                            Paste all recipients at once into Outlook Web, Gmail, or any browser email client.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleCopyAllBcc()}
                            className="justify-center"
                        >
                            {copiedKey === 'all-bcc' ? (
                                <Check size={14} className="text-success" />
                            ) : (
                                <Users size={14} />
                            )}
                            <span>Copy all BCC ({totalRecipients})</span>
                        </Button>

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleCopySubject()}
                            className="justify-center"
                        >
                            {copiedKey === 'subject' ? (
                                <Check size={14} className="text-success" />
                            ) : (
                                <Type size={14} />
                            )}
                            <span>Copy Subject</span>
                        </Button>

                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => void handleCopyHtmlBody()}
                            className="justify-center"
                        >
                            {copiedKey === 'html-body' ? (
                                <Check size={14} />
                            ) : (
                                <FileCode2 size={14} />
                            )}
                            <span>Copy HTML body</span>
                        </Button>
                    </div>

                    <div className="rounded-lg bg-surface border border-border-subtle px-3 py-2 text-xs text-muted flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-primary shrink-0">Subject:</span>
                        <span className="truncate">{shown.subject}</span>
                    </div>
                </section>

                {/* Section 2: Outlook Desktop Batches */}
                {batches.length > 0 && (
                    <section className={`${panelCls} p-4 space-y-3`}>
                        <div className="flex items-center justify-between gap-2">
                            <div className="space-y-0.5">
                                <p className={eyebrowCls}>Outlook Desktop Batches</p>
                                <p className="text-xs text-muted">
                                    Each batch stays within the safe {MAX_SAFE_MAILTO_LENGTH}-character link limit. Paste the HTML body with Ctrl+V in each draft.
                                </p>
                            </div>
                            <Badge
                                tone={openedBatches.size === batches.length ? 'success' : 'brand'}
                                shape="pill"
                                className="tabular-nums shrink-0"
                            >
                                {openedBatches.size} / {batches.length} opened
                            </Badge>
                        </div>

                        <ul className="space-y-2">
                            {batches.map((batch, index) => {
                                const opened = openedBatches.has(index);
                                const copiedBatch = copiedKey === `batch-${index}`;
                                return (
                                    <li
                                        key={`batch-${index}`}
                                        className={`flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border transition-colors ${
                                            opened
                                                ? 'bg-success/5 border-success/25'
                                                : 'bg-surface border-border-subtle'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            {opened ? (
                                                <CheckCircle2 size={16} className="text-success shrink-0" aria-label="Opened" />
                                            ) : (
                                                <span className="w-4 h-4 rounded-full border border-border-strong inline-flex items-center justify-center text-[10px] font-bold text-muted shrink-0 tabular-nums">
                                                    {index + 1}
                                                </span>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-xs sm:text-sm font-semibold text-primary tabular-nums">
                                                    Batch {index + 1} ({batch.length} recipient{batch.length === 1 ? '' : 's'})
                                                </p>
                                                <p className="text-[11px] text-muted truncate max-w-[260px] sm:max-w-[320px]">
                                                    {batch.slice(0, 3).join(', ')}
                                                    {batch.length > 3 ? ` +${batch.length - 3} more` : ''}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => void handleCopyBatchBcc(index, batch)}
                                            >
                                                {copiedBatch ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                                                <span>Copy batch BCC</span>
                                            </Button>
                                            <Button
                                                variant={opened ? 'secondary' : 'primary'}
                                                size="sm"
                                                onClick={() => handleOpenBatch(index, batch)}
                                            >
                                                {opened ? <Check size={13} className="text-success" /> : <ExternalLink size={13} />}
                                                <span>{opened ? 'Opened' : 'Open in Email App'}</span>
                                            </Button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-5 sm:px-6 py-3.5 border-t border-border-subtle bg-surface-elevated/40 shrink-0">
                <span className="text-xs text-muted">
                    HTML template is already on your clipboard — press Ctrl+V in each draft.
                </span>
                <Button variant="secondary" size="sm" onClick={close}>
                    Done
                </Button>
            </div>
        </DialogLayer>
    );
}

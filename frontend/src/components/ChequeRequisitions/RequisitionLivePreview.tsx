import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Download,
    FileDown,
    FileText,
    Loader2,
    Maximize2,
    Printer,
} from 'lucide-react';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import Modal from '../ui/Modal';
import { ErrorState } from '../ui/States';
import { Segmented, type SegmentOption } from '../ui/Tabs';
import { panelCls } from '../ui/styles';
import { useElementWidth } from '../PdfForms/pdfHooks';
import { chequeReqFileName, descriptionFit, renderChequeReqBytes } from '../../lib/chequeReq/docx';
import { docxForPreview, finishPages } from '../../lib/chequeReq/docxPreview';
import { loadChunk } from '../../lib/deployRecovery';
import type { ChequeReqForm, ChequeReqMeta } from '../../lib/chequeReq/types';

export interface RequisitionLivePreviewProps {
    form: ChequeReqForm;
    meta: ChequeReqMeta;
    onDownloadDocx?: () => void;
    onDownloadPdf?: () => void;
    onPrint?: () => void;
    downloading?: boolean;
}

type ZoomMode = 'fit' | '100';

const DEBOUNCE_MS = 350;
const PAGE_GAP = 14;

/**
 * docx-preview options matching DocumentGenerator/DocxLivePreview: full Word layout with inline
 * fonts & images (CSP-safe) and crisp pages sitting directly on our elevated surface.
 */
const DOCX_OPTIONS = {
    className: 'cheque-req-preview-page',
    inWrapper: false,
    experimental: true,
    useBase64URL: true,
    ignoreLastRenderedPageBreak: false,
    renderComments: false,
    renderChanges: false,
};

const ZOOM_OPTIONS: SegmentOption<ZoomMode>[] = [
    { value: 'fit', label: 'Fit' },
    { value: '100', label: '100%' },
];

interface LiveDocxCanvasProps {
    formKey: string;
    zoomMode: ZoomMode;
    expanded?: boolean;
    onStatusChange?: (status: { updating: boolean; hasRendered: boolean }) => void;
}

/** Debounced Word renderer that swaps pages in-place without flashing blank on edits */
function LiveDocxCanvas({ formKey, zoomMode, expanded = false, onStatusChange }: LiveDocxCanvasProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [measureRef, canvasWidth] = useElementWidth<HTMLDivElement>();
    const [pageWidth, setPageWidth] = useState<number | null>(null);
    const [hasRendered, setHasRendered] = useState(false);
    const [updating, setUpdating] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryVersion, setRetryVersion] = useState(0);

    const onStatusRef = useRef(onStatusChange);
    useEffect(() => {
        onStatusRef.current = onStatusChange;
    }, [onStatusChange]);

    useEffect(() => {
        onStatusRef.current?.({ updating, hasRendered });
    }, [updating, hasRendered]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        let live = true;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let settleTimer: ReturnType<typeof setTimeout> | null = null;

        setUpdating(true);
        setError(null);

        debounceTimer = setTimeout(() => {
            (async () => {
                const snapshot = JSON.parse(formKey) as ChequeReqForm;
                const [bytes, { renderAsync }] = await Promise.all([
                    renderChequeReqBytes(snapshot),
                    loadChunk(() => import('docx-preview')),
                ]);
                if (!live) return;

                const prepared = await docxForPreview(bytes);
                if (!live) return;

                const drawn = document.createElement('div');
                await renderAsync(prepared.bytes, drawn, undefined, DOCX_OPTIONS);
                if (!live) return;

                host.replaceChildren(...Array.from(drawn.childNodes));
                const pages = finishPages(host, DOCX_OPTIONS.className, prepared);

                // Tab stops settle 500 ms after layout while measuring the unscaled page width
                await new Promise<void>(resolve => {
                    settleTimer = setTimeout(resolve, 500);
                });
                if (!live) return;

                const widest = Math.max(
                    0,
                    ...pages
                        .map(s => (parseFloat(s.style.width) * 4) / 3)
                        .filter(w => Number.isFinite(w) && w > 0),
                );
                if (widest > 0) setPageWidth(widest);
                setHasRendered(true);
                setUpdating(false);
            })().catch((err: unknown) => {
                if (!live) return;
                setError(err instanceof Error ? err.message : 'Could not render the requisition preview');
                setUpdating(false);
            });
        }, DEBOUNCE_MS);

        return () => {
            live = false;
            if (debounceTimer !== null) clearTimeout(debounceTimer);
            if (settleTimer !== null) clearTimeout(settleTimer);
        };
    }, [formKey, retryVersion]);

    const scale =
        zoomMode === '100'
            ? 1
            : pageWidth && canvasWidth > 0
                ? Math.min(1, canvasWidth / pageWidth)
                : 1;

    if (error && !hasRendered) {
        return (
            <ErrorState
                title="Could not preview the requisition"
                error={error}
                onRetry={() => setRetryVersion(v => v + 1)}
            />
        );
    }

    return (
        <div
            className={`${panelCls} overflow-y-auto ${zoomMode === '100' ? 'overflow-x-auto' : 'overflow-x-hidden'} ${
                expanded ? 'max-h-[72vh] min-h-[420px]' : 'max-h-[75vh] lg:max-h-[calc(100vh-14.5rem)] min-h-[360px]'
            } p-3 sm:p-4`}
        >
            <div ref={measureRef} className="w-full min-w-0">
                {error && hasRendered && (
                    <div className="mb-3 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-status-rejected flex items-center justify-between gap-2">
                        <span className="truncate">Preview update failed: {error}</span>
                        <Button size="xs" variant="secondary" onClick={() => setRetryVersion(v => v + 1)}>
                            Retry
                        </Button>
                    </div>
                )}

                {/* Initial skeleton only before the first layout completes (never flashes on edits) */}
                {!hasRendered && !error && (
                    <div
                        aria-busy="true"
                        aria-label="Rendering requisition preview"
                        className="mx-auto max-w-[520px] rounded-lg bg-surface border border-border-subtle shadow-card p-6 sm:p-8 space-y-5"
                    >
                        <div className="flex items-center justify-between gap-4">
                            <div className="skeleton h-4 w-40 rounded-sm" />
                            <div className="skeleton h-3 w-20 rounded-sm" />
                        </div>
                        <div className="space-y-2.5 pt-2">
                            <div className="skeleton h-5 w-3/4 rounded-sm" />
                            <div className="skeleton h-3 w-full rounded-sm" />
                            <div className="skeleton h-3 w-11/12 rounded-sm" />
                            <div className="skeleton h-3 w-4/5 rounded-sm" />
                        </div>
                        <div className="space-y-2 pt-3">
                            <div className="skeleton h-3 w-full rounded-sm" />
                            <div className="skeleton h-3 w-5/6 rounded-sm" />
                            <div className="skeleton h-3 w-2/3 rounded-sm" />
                        </div>
                        <p className="text-xs text-muted text-center pt-2">Laying out the SICAP requisition…</p>
                    </div>
                )}

                {/* Kept mounted so docx-preview & finishPages can measure tab stops; stays visible during subsequent updates */}
                <div
                    className={`${zoomMode === 'fit' ? '[contain:inline-size]' : ''} ${
                        !hasRendered ? 'h-0 overflow-hidden invisible' : ''
                    } ${updating && hasRendered ? 'opacity-90 transition-opacity duration-150' : 'opacity-100 transition-opacity duration-150'}`}
                >
                    <div
                        ref={hostRef}
                        className="w-max mx-auto flex flex-col items-center text-neutral-900 [&_section.cheque-req-preview-page]:bg-white [&_section.cheque-req-preview-page]:rounded-sm [&_section.cheque-req-preview-page]:shadow-card [&_section.cheque-req-preview-page]:ring-1 [&_section.cheque-req-preview-page]:ring-black/5"
                        style={{ zoom: scale, gap: PAGE_GAP / scale }}
                    />
                </div>
            </div>
        </div>
    );
}

/**
 * Live visual preview of the filled SICAP Cheque Requisition .docx form, with zoom controls,
 * 2-line description overflow guard, fullscreen expand modal, and quick export actions.
 */
export default function RequisitionLivePreview({
    form,
    meta,
    onDownloadDocx,
    onDownloadPdf,
    onPrint,
    downloading = false,
}: RequisitionLivePreviewProps) {
    const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
    const [modalZoom, setModalZoom] = useState<ZoomMode>('fit');
    const [expanded, setExpanded] = useState(false);
    const [status, setStatus] = useState<{ updating: boolean; hasRendered: boolean }>({
        updating: true,
        hasRendered: false,
    });

    const formKey = useMemo(() => JSON.stringify(form), [form]);
    const fit = useMemo(() => descriptionFit(form.description), [form.description]);
    const fileName = useMemo(() => chequeReqFileName(meta, form), [meta, form]);

    const actions = (
        <div className="flex items-center gap-1.5 flex-wrap">
            {onPrint && (
                <Button size="xs" variant="ghost" disabled={downloading} onClick={onPrint}>
                    <Printer size={13} />
                    <span>Print</span>
                </Button>
            )}
            {onDownloadPdf && (
                <Button size="xs" variant="secondary" disabled={downloading} onClick={onDownloadPdf}>
                    <FileDown size={13} />
                    <span>PDF</span>
                </Button>
            )}
            {onDownloadDocx && (
                <Button size="xs" variant="secondary" loading={downloading} onClick={onDownloadDocx}>
                    {!downloading && <Download size={13} />}
                    <span>.docx</span>
                </Button>
            )}
        </div>
    );

    return (
        <>
            <div className="space-y-2.5 min-w-0">
                {/* Pinned Preview Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <Segmented
                            options={ZOOM_OPTIONS}
                            value={zoomMode}
                            onChange={setZoomMode}
                            ariaLabel="Requisition preview zoom"
                            size="sm"
                        />

                        {fit.overflowsLine2 && (
                            <Badge
                                tone="warning"
                                shape="pill"
                                icon={<AlertTriangle size={11} />}
                                title={`Description uses ${fit.line2Pct}% of the second ruled line and may wrap past the template lines`}
                            >
                                Overflows 2 lines
                            </Badge>
                        )}

                        {status.updating && status.hasRendered && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted px-1.5">
                                <Loader2 size={11} className="animate-spin text-brand-500" />
                                Updating…
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {actions}
                        <IconButton
                            size="sm"
                            label="Expand requisition preview"
                            onClick={() => setExpanded(true)}
                        >
                            <Maximize2 size={14} />
                        </IconButton>
                    </div>
                </div>

                {/* Live Word Page Canvas */}
                <LiveDocxCanvas
                    formKey={formKey}
                    zoomMode={zoomMode}
                    onStatusChange={setStatus}
                />
            </div>

            <Modal
                open={expanded}
                onClose={() => setExpanded(false)}
                title={fileName.replace(/\.docx$/i, '')}
                subtitle="Live SICAP cheque requisition preview"
                icon={FileText}
                size="3xl"
                headerAction={
                    <div className="flex items-center gap-2">
                        <Segmented
                            options={ZOOM_OPTIONS}
                            value={modalZoom}
                            onChange={setModalZoom}
                            ariaLabel="Expanded requisition zoom"
                            size="sm"
                        />
                        {actions}
                    </div>
                }
                bodyClassName="p-3 sm:p-4"
            >
                {expanded && (
                    <div className="space-y-2.5">
                        {fit.overflowsLine2 && (
                            <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-primary flex items-center gap-2">
                                <AlertTriangle size={14} className="shrink-0 text-status-requested" />
                                <span>
                                    The description exceeds the two ruled lines on the SICAP Word form ({fit.line2Pct}% of line 2). Shorten it slightly to keep the layout crisp.
                                </span>
                            </div>
                        )}
                        <LiveDocxCanvas formKey={formKey} zoomMode={modalZoom} expanded />
                    </div>
                )}
            </Modal>
        </>
    );
}

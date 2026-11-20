import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Download,
    FileText,
    Info,
    Maximize2,
    Users,
} from 'lucide-react';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { EmptyState, ErrorState } from '../ui/States';
import { panelCls } from '../ui/styles';
import { useElementWidth } from '../PdfForms/pdfHooks';
import { docxForPreview, finishPages } from '../../lib/chequeReq/docxPreview';
import { loadChunk } from '../../lib/deployRecovery';
import { downloadBlob } from '../../lib/download';
import {
    fetchTemplateBuffer,
    renderSinglePreview,
    type DateVariable,
    type DocContext,
    type EnrollmentWithRelations,
    type SinglePreviewResult,
} from '../../lib/documentUtils';
import { fullName, templateLabel } from '../../lib/types';
import { errorText, plural, type ShowToast } from './helpers';
import type { PreviewTarget } from './types';

export interface DocxLivePreviewProps {
    target: PreviewTarget | null;
    enrollments: EnrollmentWithRelations[];
    participantIndex?: number;
    onParticipantChange?: (index: number) => void;
    context?: DocContext;
    customVariables: Record<string, string>;
    dateVariables: DateVariable[];
    onExpand?: () => void;
    expanded?: boolean;
    showToast: ShowToast;
    isSampleData?: boolean;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PAGE_GAP = 14;

/**
 * docx-preview options: full Word layout with inline images/fonts (CSP-safe) and clean pages
 * matching our surface chrome rather than docx-preview's grey wrapper.
 */
const DOCX_OPTIONS = {
    className: 'doc-preview-page',
    inWrapper: false,
    experimental: true,
    useBase64URL: true,
    ignoreLastRenderedPageBreak: false,
    renderComments: false,
    renderChanges: false,
};

type ZoomMode = 'fit' | '100';
type LayoutState = 'idle' | 'laying-out' | 'ready' | 'error';

export default function DocxLivePreview({
    target,
    enrollments,
    participantIndex,
    onParticipantChange,
    context,
    customVariables,
    dateVariables,
    onExpand,
    expanded = false,
    showToast,
    isSampleData = false,
}: DocxLivePreviewProps) {
    const queryClient = useQueryClient();
    const [localIndex, setLocalIndex] = useState(0);
    const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
    const [rendered, setRendered] = useState<SinglePreviewResult | null>(null);
    const [rendering, setRendering] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [layoutState, setLayoutState] = useState<LayoutState>('idle');
    const [layoutError, setLayoutError] = useState<string | null>(null);
    const [pageWidth, setPageWidth] = useState<number | null>(null);
    const [pageCount, setPageCount] = useState(0);
    const [renderVersion, setRenderVersion] = useState(0);

    const hostRef = useRef<HTMLDivElement>(null);
    const [measureRef, canvasWidth] = useElementWidth<HTMLDivElement>();

    const isPerPerson = target?.kind === 'word' || target?.kind === 'combined';
    const rawIndex = participantIndex ?? localIndex;
    const clampedIndex = enrollments.length > 0 ? Math.min(Math.max(0, rawIndex), enrollments.length - 1) : 0;
    const activeEnrollment = enrollments[clampedIndex] ?? null;

    const setParticipant = (next: number) => {
        if (enrollments.length === 0) return;
        const safe = Math.min(Math.max(0, next), enrollments.length - 1);
        if (participantIndex === undefined) setLocalIndex(safe);
        onParticipantChange?.(safe);
    };

    const neededTemplates = useMemo(() => {
        if (!target) return [];
        if (target.kind === 'combined') return target.templates;
        return [target.template];
    }, [target]);

    const pathsKey = useMemo(
        () => neededTemplates.map(t => t.storage_path).join('|'),
        [neededTemplates],
    );

    // Cache every individual .docx under ['doc_tpl_bytes', path] so switching participants,
    // zoom level, or toggling between single and combined views never re-downloads files.
    const buffersQuery = useQuery({
        queryKey: ['doc_tpl_bytes_set', pathsKey],
        enabled: neededTemplates.length > 0 && enrollments.length > 0,
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const buffers = await Promise.all(
                neededTemplates.map(tpl =>
                    queryClient.fetchQuery({
                        queryKey: ['doc_tpl_bytes', tpl.storage_path],
                        queryFn: () => fetchTemplateBuffer(tpl.storage_path),
                        staleTime: 5 * 60_000,
                    }),
                ),
            );
            return { key: pathsKey, buffers };
        },
    });

    const loadedBuffers = buffersQuery.data?.key === pathsKey ? buffersQuery.data.buffers : null;

    // Step 1: Fill placeholders into a rendered .docx ArrayBuffer (pure in-memory)
    useEffect(() => {
        if (!target || !loadedBuffers || loadedBuffers.length !== neededTemplates.length || enrollments.length === 0) {
            setRendered(null);
            setRenderError(null);
            setRendering(false);
            return;
        }
        if (isPerPerson && !activeEnrollment) {
            setRendered(null);
            setRendering(false);
            return;
        }

        let cancelled = false;
        setRendering(true);
        setRenderError(null);

        const renderPromise = (() => {
            if (target.kind === 'word') {
                return renderSinglePreview({
                    kind: 'word',
                    templateName: templateLabel(target.template),
                    buffer: loadedBuffers[0],
                    enrollment: activeEnrollment!,
                    context,
                    customVariables,
                    dateVariables,
                });
            }
            if (target.kind === 'combined') {
                return renderSinglePreview({
                    kind: 'combined',
                    templates: target.templates.map((t, i) => ({
                        name: templateLabel(t),
                        buffer: loadedBuffers[i],
                    })),
                    enrollment: activeEnrollment!,
                    context,
                    customVariables,
                    dateVariables,
                });
            }
            return renderSinglePreview({
                kind: target.kind,
                buffer: loadedBuffers[0],
                enrollments,
                context,
                customVariables,
                dateVariables,
            });
        })();

        renderPromise
            .then(result => {
                if (cancelled) return;
                setRendered(result);
                setRendering(false);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setRendered(null);
                setRenderError(errorText(err));
                setRendering(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        target,
        loadedBuffers,
        neededTemplates.length,
        isPerPerson,
        activeEnrollment,
        enrollments,
        context,
        customVariables,
        dateVariables,
        renderVersion,
    ]);

    // Step 2: Paint the rendered .docx buffer into visual Word pages via docx-preview
    useEffect(() => {
        const host = hostRef.current;
        const buffer = rendered?.buffer;
        if (!host || !buffer) {
            setLayoutState('idle');
            setPageWidth(null);
            setPageCount(0);
            setLayoutError(null);
            return;
        }

        let live = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        setLayoutState('laying-out');
        setLayoutError(null);

        (async () => {
            const [{ renderAsync }, prepared] = await Promise.all([
                loadChunk(() => import('docx-preview')),
                docxForPreview(buffer),
            ]);
            if (!live) return;

            const drawn = document.createElement('div');
            await renderAsync(prepared.bytes, drawn, undefined, DOCX_OPTIONS);
            if (!live) return;

            host.replaceChildren(...Array.from(drawn.childNodes));
            const pages = finishPages(host, DOCX_OPTIONS.className, prepared);

            // Tab stops settle 500 ms after layout while measuring the unscaled page
            await new Promise<void>(resolve => {
                timer = setTimeout(resolve, 500);
            });
            if (!live) return;

            const widest = Math.max(
                0,
                ...pages
                    .map(s => (parseFloat(s.style.width) * 4) / 3)
                    .filter(w => Number.isFinite(w) && w > 0),
            );
            setPageWidth(widest || null);
            setPageCount(pages.length);
            setLayoutState('ready');
        })().catch((err: unknown) => {
            if (!live) return;
            setLayoutError(errorText(err));
            setLayoutState('error');
        });

        return () => {
            live = false;
            if (timer !== null) clearTimeout(timer);
        };
    }, [rendered?.buffer]);

    const handleDownload = () => {
        if (!rendered) return;
        downloadBlob(new Blob([rendered.buffer], { type: DOCX_MIME }), rendered.fileName);
        showToast(`Downloaded ${rendered.fileName}`, 'success');
    };

    const handleRetry = () => {
        setRenderError(null);
        setLayoutError(null);
        if (buffersQuery.error) {
            void buffersQuery.refetch();
        } else {
            setRenderVersion(v => v + 1);
        }
    };

    if (!target || neededTemplates.length === 0) {
        return (
            <EmptyState
                bare
                icon={<FileText size={22} />}
                title="No document selected"
                description="Choose an enabled Word template, sheet, or SICAP form to preview it here."
            />
        );
    }

    if (enrollments.length === 0) {
        return (
            <EmptyState
                bare
                icon={<Users size={22} />}
                title="No participants selected"
                description="Select at least one participant to preview their personalised document."
            />
        );
    }

    const busy = buffersQuery.isLoading || rendering || layoutState === 'laying-out';
    const hardError = buffersQuery.error ?? renderError;
    const scale = zoomMode === '100'
        ? 1
        : pageWidth && canvasWidth > 0
            ? Math.min(1, canvasWidth / pageWidth)
            : 1;

    return (
        <div className="space-y-3 min-w-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Participant switcher or scope badge */}
                <div className="flex items-center gap-1.5 min-w-0">
                    {isPerPerson ? (
                        isSampleData ? (
                            <Badge tone="info" shape="pill">Sample participant</Badge>
                        ) : (
                            <div className="flex items-center gap-1 min-w-0">
                                <IconButton
                                    size="sm"
                                    label="Previous participant"
                                    disabled={clampedIndex <= 0}
                                    onClick={() => setParticipant(clampedIndex - 1)}
                                >
                                    <ChevronLeft size={14} />
                                </IconButton>
                                <select
                                    aria-label="Preview participant"
                                    value={clampedIndex}
                                    onChange={e => setParticipant(Number(e.target.value))}
                                    className="h-7 max-w-[180px] sm:max-w-[220px] px-2 bg-surface border border-border-subtle rounded-lg text-xs font-medium text-primary focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 truncate"
                                >
                                    {enrollments.map((e, i) => {
                                        const label = fullName(e.students) || 'Unknown participant';
                                        return (
                                            <option key={e.id} value={i}>
                                                {label} ({i + 1}/{enrollments.length})
                                            </option>
                                        );
                                    })}
                                </select>
                                <IconButton
                                    size="sm"
                                    label="Next participant"
                                    disabled={clampedIndex >= enrollments.length - 1}
                                    onClick={() => setParticipant(clampedIndex + 1)}
                                >
                                    <ChevronRight size={14} />
                                </IconButton>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge tone={isSampleData ? 'info' : 'neutral'} shape="pill">
                                {isSampleData ? 'Sample participant' : plural(enrollments.length, 'participant')}
                            </Badge>
                            {pageCount > 1 && layoutState === 'ready' && (
                                <Badge tone="neutral" shape="pill" className="tabular-nums">
                                    {plural(pageCount, 'page')}
                                </Badge>
                            )}
                        </div>
                    )}
                </div>

                {/* Zoom + Download + Expand */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <div
                        role="group"
                        aria-label="Preview zoom"
                        className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-elevated border border-border-subtle"
                    >
                        <button
                            type="button"
                            aria-pressed={zoomMode === 'fit'}
                            onClick={() => setZoomMode('fit')}
                            className={`h-6 px-2 rounded-md text-xs font-semibold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                zoomMode === 'fit'
                                    ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle'
                                    : 'text-muted hover:text-primary'
                            }`}
                        >
                            Fit
                        </button>
                        <button
                            type="button"
                            aria-pressed={zoomMode === '100'}
                            onClick={() => setZoomMode('100')}
                            className={`h-6 px-2 rounded-md text-xs font-semibold transition-all tabular-nums focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                                zoomMode === '100'
                                    ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle'
                                    : 'text-muted hover:text-primary'
                            }`}
                        >
                            100%
                        </button>
                    </div>

                    <Button
                        variant="secondary"
                        size="xs"
                        disabled={!rendered || buffersQuery.isLoading || rendering}
                        onClick={handleDownload}
                    >
                        <Download size={13} />
                        <span>Download .docx</span>
                    </Button>

                    {onExpand && (
                        <IconButton
                            size="sm"
                            label="Expand preview"
                            onClick={onExpand}
                        >
                            <Maximize2 size={14} />
                        </IconButton>
                    )}
                </div>
            </div>

            {/* Tag Health Strip */}
            {rendered && !hardError && (
                rendered.unknownTags.length > 0 ? (
                    <div
                        role="status"
                        className="rounded-xl border border-warning/30 bg-warning/15 px-3 py-2 text-xs text-status-requested flex items-start gap-2"
                    >
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <div className="min-w-0 leading-relaxed">
                            <span className="font-semibold">Unknown placeholders (will print blank): </span>
                            {rendered.unknownTags.map((tag, i) => (
                                <span key={tag}>
                                    <code className="font-mono font-semibold">{`{${tag}}`}</code>
                                    {i < rendered.unknownTags.length - 1 ? ', ' : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                ) : rendered.blankFields.length > 0 ? (
                    <div
                        role="status"
                        className="rounded-xl border border-info/25 bg-info/10 px-3 py-2 text-xs text-status-invited flex items-start gap-2"
                    >
                        <Info size={14} className="shrink-0 mt-0.5" />
                        <div className="min-w-0 leading-relaxed">
                            <span className="font-semibold">Blank: </span>
                            {rendered.blankFields.map((field, i) => (
                                <span key={field}>
                                    <code className="font-mono">{`{${field}}`}</code>
                                    {i < rendered.blankFields.length - 1 ? ', ' : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                ) : rendered.tagCount > 0 ? (
                    <div
                        role="status"
                        className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-medium text-status-confirmed"
                    >
                        <CheckCircle2 size={13} className="shrink-0" />
                        <span>All {rendered.tagCount} placeholder{rendered.tagCount !== 1 ? 's' : ''} filled</span>
                    </div>
                ) : null
            )}

            {/* Visual Page Viewport */}
            {hardError ? (
                <ErrorState
                    title="Could not preview this document"
                    error={hardError}
                    onRetry={handleRetry}
                />
            ) : (
                <div
                    className={`${panelCls} overflow-y-auto ${zoomMode === '100' ? 'overflow-x-auto' : 'overflow-x-hidden'} ${
                        expanded ? 'max-h-[70vh] min-h-[420px]' : 'max-h-[68vh] min-h-[360px]'
                    } p-3 sm:p-4`}
                >
                    <div ref={measureRef} className="w-full min-w-0">
                        {busy && (
                            <div
                                aria-busy="true"
                                aria-label="Rendering document preview"
                                className="mx-auto max-w-[520px] rounded-lg bg-surface border border-border-subtle shadow-card p-6 sm:p-8 space-y-5"
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div className="skeleton h-4 w-36 rounded-sm" />
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
                                <p className="text-xs text-muted text-center pt-2">
                                    {buffersQuery.isLoading
                                        ? 'Loading template…'
                                        : rendering
                                            ? 'Filling placeholders…'
                                            : 'Laying out pages…'}
                                </p>
                            </div>
                        )}

                        {layoutState === 'error' && rendered ? (
                            <div className="rounded-xl bg-surface border border-border-subtle p-6 text-center space-y-3">
                                <div className="w-10 h-10 rounded-xl bg-warning/15 text-status-requested mx-auto flex items-center justify-center">
                                    <FileText size={20} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-primary">
                                        Visual page preview unavailable
                                    </p>
                                    <p className="text-xs text-muted max-w-sm mx-auto">
                                        {layoutError || 'This browser environment could not lay out the Word pages, but the document was filled cleanly.'}
                                    </p>
                                </div>
                                <div className="flex justify-center">
                                    <Button variant="primary" size="sm" onClick={handleDownload}>
                                        <Download size={14} />
                                        Download {rendered.fileName}
                                    </Button>
                                </div>
                            </div>
                        ) : null}

                        {/* Kept mounted (hidden while laying out) so docx-preview & finishPages can measure tab stops */}
                        <div
                            className={`${zoomMode === 'fit' ? '[contain:inline-size]' : ''} ${
                                layoutState !== 'ready' ? 'h-0 overflow-hidden invisible' : ''
                            }`}
                        >
                            <div
                                ref={hostRef}
                                className="w-max mx-auto flex flex-col items-center text-neutral-900 [&_section.doc-preview-page]:bg-white [&_section.doc-preview-page]:rounded-sm [&_section.doc-preview-page]:shadow-card [&_section.doc-preview-page]:ring-1 [&_section.doc-preview-page]:ring-black/5"
                                style={{ zoom: scale, gap: PAGE_GAP / scale }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

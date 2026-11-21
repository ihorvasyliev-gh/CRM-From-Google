import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    FileText,
    FileUp,
    Maximize2,
    MousePointerClick,
    RefreshCw,
    RotateCcw,
    RotateCw,
    Undo2,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import Modal from '../ui/Modal';
import { PdfPage } from '../PdfForms/pdfView';
import { rectStyle, useElementWidth, type LoadedPdf } from '../PdfForms/pdfHooks';
import PickLayer, { type PickMode } from './PickLayer';
import { toLines } from '../../lib/chequeReq/extract';
import { unlevelRect, type Rotation } from '../../lib/chequeReq/ocr';
import { phrasesOfTexts } from '../../lib/chequeReq/pick';
import { collapseSpaces } from '../../lib/chequeReq/parse';
import { INVOICE_ACCEPT } from '../../lib/chequeReq/read';
import { docxForPreview, finishPages } from '../../lib/chequeReq/docxPreview';
import { loadChunk } from '../../lib/deployRecovery';
import type { Phrase, Rect } from '../../lib/pdfForms/types';

export type { PickMode };

/**
 * `phrases`: the text read from it (by OCR from a scan), where values are picked. A scan or
 * photo was read levelled: `angles` (per page) / `angle` put a place back onto the picture.
 */
export type LoadedInvoice =
    | {
        kind: 'pdf';
        pdf: LoadedPdf;
        file?: Blob;
        fileName: string;
        phrases: Phrase[];
        angles?: number[];
        rotation?: Rotation;
        ocrPagesRead?: number;
        totalPages?: number;
        scanned?: boolean;
    }
    /** `file`: shown as Word lays it out; `phrases`: shown as text if that fails */
    | { kind: 'docx'; file: Blob; phrases: Phrase[]; fileName: string; rotation?: 0 }
    /** `size`: the photo's pixels, the units its words were read in */
    | {
        kind: 'image';
        url: string;
        file?: Blob;
        fileName: string;
        phrases: Phrase[];
        size: { w: number; h: number };
        angle: number;
        rotation?: Rotation;
    };

export interface InvoicePreviewProps {
    invoice: LoadedInvoice;
    /** Where the value of the field being edited was read: outlined and scrolled into view */
    highlight?: Rect[];
    /** Current value of the active field (used to highlight matches in Word invoices) */
    highlightText?: string;
    /** A field's value being picked: clicking the invoice's text fills it */
    pick?: PickMode;
    /** Re-run OCR at a new rotation or page count */
    onReRead?: (opts: { rotation?: Rotation; maxPages?: number }) => void;
    /** True while OCR re-read is in progress */
    reReading?: boolean;
    /** Replace the loaded invoice with another file */
    onReplaceFile?: (file: File) => void;
}

const GAP = 12;
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2] as const;
type ZoomLevel = 'fit' | (typeof ZOOM_STEPS)[number];

/**
 * docx-preview: pages as Word lays them out, tab stops included; pictures and fonts inline, as
 * the CSP allows. No grey wrapper: the pages sit in the panel like a PDF's.
 */
const DOCX_OPTIONS = {
    className: 'invoice-docx',
    inWrapper: false,
    experimental: true,
    useBase64URL: true,
    // Pages break at the document's breaks (Word's last ones are taken out: docxForPreview)
    ignoreLastRenderedPageBreak: false,
    renderComments: false,
    renderChanges: false,
};

/** Tabs (laid out as an em space), line breaks and wide gaps part the pieces of Word text */
const WORD_GAP = /\n|\u2003+|\t+| {3,}/;
const BLOCK_HL_CLASSES = ['bg-brand-500/15', 'ring-1', 'ring-brand-500/60', 'rounded-xs'];

/**
 * The piece of Word text (a paragraph's, between tabs) at a point on the screen. Measured on
 * the text itself: the browser's own caret lookup misses on a page scaled with CSS zoom.
 */
function wordTextAt(target: EventTarget, x: number, y: number, host: HTMLElement): string | null {
    const block = target instanceof Element ? target.closest('p, li, td') : null;
    if (!block || !host.contains(block)) return null;
    // The paragraph's text, and where each of its text nodes starts in it
    const nodes: { node: Text; start: number }[] = [];
    let text = '';
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n instanceof Text) {
            nodes.push({ node: n, start: text.length });
            text += n.data;
        } else if ((n as Element).tagName === 'BR') {
            text += '\n';
        }
    }
    if (!nodes.length) return null;
    const at = (offset: number): [Text, number] => {
        const s = nodes.filter(n => n.start <= offset).pop() ?? nodes[0];
        return [s.node, Math.max(0, Math.min(offset - s.start, s.node.length))];
    };
    let start = 0;
    for (const piece of text.split(new RegExp(`(${WORD_GAP.source})`))) {
        const end = start + piece.length;
        if (piece.trim() && !WORD_GAP.test(piece)) {
            const range = document.createRange();
            range.setStart(...at(start));
            range.setEnd(...at(end));
            if (Array.from(range.getClientRects()).some(r => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2)) {
                return collapseSpaces(piece);
            }
        }
        start = end;
    }
    return null;
}

/** Find a case-insensitive collapsed-space substring range in `raw`, skipping zero-width spaces */
function findNormalizedRange(raw: string, needleLower: string): { start: number; end: number } | null {
    const indexMap: number[] = [];
    let normalized = '';
    let prevSpace = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (/[\u200B-\u200D\u2060\uFEFF]/.test(ch)) continue;
        if (/\s/.test(ch)) {
            if (normalized.length > 0 && !prevSpace) {
                normalized += ' ';
                indexMap.push(i);
                prevSpace = true;
            }
        } else {
            normalized += ch.toLowerCase();
            indexMap.push(i);
            prevSpace = false;
        }
    }
    const idx = normalized.indexOf(needleLower);
    if (idx < 0) return null;
    const start = indexMap[idx];
    const endCharIdx = indexMap[idx + needleLower.length - 1];
    if (start === undefined || endCharIdx === undefined) return null;
    return { start, end: endCharIdx + 1 };
}

function scrollElementIntoContainer(container: HTMLElement | null, target: Element): void {
    if (!container) return;
    const targetRect = target.getBoundingClientRect();
    const boxRect = container.getBoundingClientRect();
    const top = targetRect.top - boxRect.top + container.scrollTop;
    const view = container.clientHeight;
    if (top < container.scrollTop + 24 || top > container.scrollTop + view - 48) {
        container.scrollTo?.({ top: Math.max(0, top - view / 3), behavior: 'smooth' });
    }
}

/** The Word invoice page by page, scaled to the panel; its text line by line if it can't be laid out */
function DocxPages({
    file,
    phrases,
    width,
    zoom,
    pick,
    highlightText,
    scrollRef,
}: {
    file: Blob;
    phrases: Phrase[];
    width: number;
    zoom: ZoomLevel;
    pick?: PickMode;
    highlightText?: string;
    scrollRef: RefObject<HTMLDivElement | null>;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    /** The widest page in CSS pixels, once laid out */
    const [pageWidth, setPageWidth] = useState<number | null>(null);
    const [failed, setFailed] = useState(false);
    const lines = useMemo(() => toLines(phrases), [phrases]);
    // Laid out once the panel shows (on a phone it is hidden until asked for): tab stops are measured
    const shown = width > 0;

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !shown) return;
        let live = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        setPageWidth(null);
        setFailed(false);
        (async () => {
            const [{ renderAsync }, prepared] = await Promise.all([loadChunk(() => import('docx-preview')), file.arrayBuffer().then(docxForPreview)]);
            // Drawn aside and put in only while this file is still the one shown
            const drawn = document.createElement('div');
            await renderAsync(prepared.bytes, drawn, undefined, DOCX_OPTIONS);
            if (!live) return;
            host.replaceChildren(...Array.from(drawn.childNodes));
            const pages = finishPages(host, DOCX_OPTIONS.className, prepared);
            // Tab stops are placed 500 ms after the layout, measuring the page: it is scaled after that
            await new Promise<void>(done => {
                timer = setTimeout(done, 500);
            });
            if (live) setPageWidth(Math.max(0, ...pages.map(s => (parseFloat(s.style.width) * 4) / 3).filter(w => w > 0)));
        })().catch(() => live && setFailed(true));
        return () => {
            live = false;
            if (timer !== null) clearTimeout(timer);
        };
    }, [file, shown]);

    // Subtle text/block highlight for the active form field in Word invoices
    useEffect(() => {
        const host = hostRef.current;
        if (!host || pageWidth === null || failed) return;

        const createdMarks: HTMLElement[] = [];
        const highlightedBlocks: Element[] = [];
        const trimmed = highlightText ? collapseSpaces(highlightText) : '';

        if (!pick && trimmed.length >= 2) {
            const needleLower = trimmed.toLowerCase();
            // First try wrapping matching text nodes directly for surgical highlighting
            const textNodes: Text[] = [];
            const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (n instanceof Text && n.parentElement && !['STYLE', 'SCRIPT'].includes(n.parentElement.tagName)) {
                    textNodes.push(n);
                }
            }
            for (const node of textNodes) {
                const match = findNormalizedRange(node.data, needleLower);
                if (!match) continue;
                const range = document.createRange();
                range.setStart(node, match.start);
                range.setEnd(node, match.end);
                const mark = document.createElement('mark');
                mark.dataset.crHl = '1';
                mark.className = 'bg-brand-500/15 ring-1 ring-brand-500/60 rounded-xs text-inherit';
                try {
                    range.surroundContents(mark);
                    createdMarks.push(mark);
                    if (createdMarks.length >= 3) break;
                } catch {
                    // Range cannot be wrapped cleanly; fallback below handles it
                }
            }

            // Fallback when Word splits a value across multiple inline runs in one block
            if (createdMarks.length === 0) {
                const candidates = Array.from(host.querySelectorAll('p, li, td'))
                    .map(el => ({
                        el,
                        text: collapseSpaces((el.textContent ?? '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')),
                    }))
                    .filter(c => c.text.toLowerCase().includes(needleLower))
                    .sort((a, b) => a.text.length - b.text.length);
                const best = candidates[0];
                if (best) {
                    best.el.classList.add(...BLOCK_HL_CLASSES);
                    highlightedBlocks.push(best.el);
                }
            }

            const firstTarget = createdMarks[0] ?? highlightedBlocks[0];
            if (firstTarget) scrollElementIntoContainer(scrollRef.current, firstTarget);
        }

        return () => {
            for (const mark of createdMarks) {
                const parent = mark.parentNode;
                if (!parent) continue;
                while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
                parent.removeChild(mark);
                parent.normalize();
            }
            for (const el of highlightedBlocks) {
                el.classList.remove(...BLOCK_HL_CLASSES);
            }
        };
    }, [highlightText, pick, pageWidth, failed, file, scrollRef]);

    if (failed) {
        return (
            <div className="bg-white text-neutral-900 rounded-sm shadow-card p-4 text-xs leading-relaxed space-y-0.5">
                {lines.map((line, i) => (
                    <p key={i} className="flex flex-wrap gap-x-6">
                        {line.phrases.map((p, k) => <span key={k}>{p.text}</span>)}
                    </p>
                ))}
            </div>
        );
    }

    // Picking: the text selected, or the piece clicked
    const pickText = (e: MouseEvent<HTMLDivElement>) => {
        const host = hostRef.current;
        if (!pick || !host) return;
        const selection = window.getSelection();
        const selected = selection && !selection.isCollapsed && selection.anchorNode && host.contains(selection.anchorNode) ? selection.toString() : '';
        const texts = selected
            ? selected.split(WORD_GAP).map(collapseSpaces).filter(Boolean)
            : [wordTextAt(e.target, e.clientX, e.clientY, host)].filter((t): t is string => !!t);
        selection?.removeAllRanges();
        if (!texts.length) return;
        const found = phrasesOfTexts(texts, phrases);
        pick.onPick(
            pick.multi
                ? { texts: [...pick.picked.texts, ...texts], phrases: [...pick.picked.phrases, ...found.filter(p => !pick.picked.phrases.includes(p))] }
                : { texts, phrases: found },
        );
    };

    const fitScale = pageWidth && width > 0 ? width / pageWidth : 1;
    const scale = zoom === 'fit' ? fitScale : fitScale * zoom;
    const contain = zoom === 'fit' || zoom <= 1;

    return (
        <>
            {pageWidth === null && <p className="text-xs text-muted p-2">Laying out the invoice…</p>}
            {/* Laid out unseen at full size first, for the tab stops; in Fit mode never widens the panel */}
            <div onClick={pickText} className={`${contain ? '[contain:inline-size]' : ''} ${pick ? 'cursor-text' : ''} ${pageWidth === null ? 'h-0 overflow-hidden invisible' : ''}`}>
                <div
                    ref={hostRef}
                    className="flex flex-col items-start [&_section.invoice-docx]:bg-white [&_section.invoice-docx]:rounded-sm [&_section.invoice-docx]:shadow-card"
                    style={{ zoom: scale, gap: GAP / scale }}
                />
            </div>
        </>
    );
}

/** Step zoom up or down cleanly through ZOOM_STEPS */
function stepZoom(current: ZoomLevel, direction: -1 | 1): ZoomLevel {
    const numeric = current === 'fit' ? 1 : current;
    const idx = ZOOM_STEPS.findIndex(z => z >= numeric);
    const safeIdx = idx === -1 ? ZOOM_STEPS.length - 1 : idx;
    const nextIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, safeIdx + direction));
    return ZOOM_STEPS[nextIdx];
}

function zoomLabel(zoom: ZoomLevel): string {
    return zoom === 'fit' ? '100%' : `${Math.round(zoom * 100)}%`;
}

/** Style for an element rotated clockwise inside an upright wrapper of `displayW × displayH` */
function rotatedInnerStyle(rotation: Rotation, displayW: number, displayH: number): CSSProperties {
    if (rotation === 0) return { width: displayW, height: displayH };
    const swapped = rotation === 90 || rotation === 270;
    return {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: swapped ? displayH : displayW,
        height: swapped ? displayW : displayH,
        maxWidth: 'none',
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    };
}

/** Natural (0°) dimensions of an image whose `size` was recorded at `baseRotation` */
function unrotatedImageSize(size: { w: number; h: number }, baseRotation: Rotation): { w: number; h: number } {
    return baseRotation === 90 || baseRotation === 270 ? { w: size.h, h: size.w } : size;
}

/** Compact zoom control cluster shared by the main reader toolbar and fullscreen modal */
function ZoomControls({ zoom, onChange }: { zoom: ZoomLevel; onChange: (next: ZoomLevel) => void }) {
    const canZoomOut = zoom === 'fit' || zoom > ZOOM_STEPS[0];
    const canZoomIn = zoom === 'fit' || zoom < ZOOM_STEPS[ZOOM_STEPS.length - 1];
    return (
        <div role="group" aria-label="Invoice zoom" className="inline-flex items-center gap-0.5 rounded-lg bg-surface-elevated border border-border-subtle p-0.5">
            <button
                type="button"
                aria-pressed={zoom === 'fit'}
                onClick={() => onChange('fit')}
                className={`h-6 px-2 rounded-md text-[11px] font-semibold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                    zoom === 'fit' ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle' : 'text-muted hover:text-primary'
                }`}
            >
                Fit
            </button>
            <IconButton
                size="sm"
                label="Zoom out"
                disabled={!canZoomOut}
                onClick={() => onChange(stepZoom(zoom, -1))}
                className="!w-6 !h-6 !rounded-md"
            >
                <ZoomOut size={13} />
            </IconButton>
            <button
                type="button"
                onClick={() => onChange(zoom === 1 ? 'fit' : 1)}
                title="Reset to 100%"
                className="h-6 min-w-[2.6rem] px-1 rounded-md text-[11px] font-semibold tabular-nums text-primary hover:bg-surface transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
                {zoomLabel(zoom)}
            </button>
            <IconButton
                size="sm"
                label="Zoom in"
                disabled={!canZoomIn}
                onClick={() => onChange(stepZoom(zoom, 1))}
                className="!w-6 !h-6 !rounded-md"
            >
                <ZoomIn size={13} />
            </IconButton>
        </div>
    );
}

/** Fullscreen modal reader showing the invoice cleanly with its own zoom controls */
function ExpandedInvoiceView({
    invoice,
    rotation,
    highlightText,
}: {
    invoice: LoadedInvoice;
    rotation: Rotation;
    highlightText?: string;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [measureRef, containerWidth] = useElementWidth<HTMLDivElement>();
    const [zoom, setZoom] = useState<ZoomLevel>('fit');
    const pages = useMemo(() => (invoice.kind === 'pdf' ? invoice.pdf.layout.pages : []), [invoice]);
    const effectiveWidth = containerWidth > 0 ? Math.round(containerWidth * (zoom === 'fit' ? 1 : zoom)) : 0;

    return (
        <div className="flex flex-col min-h-0 h-full">
            <div className="shrink-0 px-4 py-2 border-b border-border-subtle bg-surface flex items-center justify-between gap-2">
                <span className="text-xs text-muted truncate">
                    {invoice.kind === 'pdf'
                        ? `${pages.length} page${pages.length === 1 ? '' : 's'}${rotation ? ` · rotated ${rotation}°` : ''}`
                        : invoice.kind === 'docx'
                            ? 'Word invoice'
                            : `Image${rotation ? ` · rotated ${rotation}°` : ''}`}
                </span>
                <ZoomControls zoom={zoom} onChange={setZoom} />
            </div>
            <div ref={scrollRef} className={`flex-1 min-h-0 max-h-[74vh] overflow-y-auto ${zoom !== 'fit' && zoom > 1 ? 'overflow-x-auto' : 'overflow-x-hidden'} bg-surface-elevated/60 p-4`}>
                <div ref={measureRef} className="w-full min-w-0">
                    {invoice.kind === 'pdf' && effectiveWidth > 0 && (
                        <div className="flex flex-col items-center" style={{ gap: GAP }}>
                            {pages.map((size, i) => {
                                const swapped = rotation === 90 || rotation === 270;
                                const displayW = swapped ? size.h : size.w;
                                const displayH = swapped ? size.w : size.h;
                                const h = Math.round(effectiveWidth * (displayH / displayW));
                                if (rotation === 0) {
                                    return <PdfPage key={i} doc={invoice.pdf.doc} page={i} size={size} width={effectiveWidth} selectableText />;
                                }
                                return (
                                    <div key={i} className="relative overflow-hidden rounded-sm shadow-card bg-white" style={{ width: effectiveWidth, height: h }}>
                                        <div style={rotatedInnerStyle(rotation, effectiveWidth, h)}>
                                            <PdfPage doc={invoice.pdf.doc} page={i} size={size} width={swapped ? h : effectiveWidth} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {invoice.kind === 'docx' && (
                        <DocxPages file={invoice.file} phrases={invoice.phrases} width={containerWidth} zoom={zoom} highlightText={highlightText} scrollRef={scrollRef} />
                    )}
                    {invoice.kind === 'image' && effectiveWidth > 0 && (() => {
                        const baseRot: Rotation = invoice.rotation ?? 0;
                        const orig = unrotatedImageSize(invoice.size, baseRot);
                        const swapped = rotation === 90 || rotation === 270;
                        const displayW = swapped ? orig.h : orig.w;
                        const displayH = swapped ? orig.w : orig.h;
                        const h = Math.round(effectiveWidth * (displayH / displayW));
                        return (
                            <div className="mx-auto relative overflow-hidden rounded-sm shadow-card bg-white" style={{ width: effectiveWidth, height: h }}>
                                <img
                                    src={invoice.url}
                                    alt={`Invoice: ${invoice.fileName}`}
                                    className="block"
                                    style={rotatedInnerStyle(rotation, effectiveWidth, h)}
                                />
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}

/** The invoice workbench beside the requisition: zoom, pages, rotation/re-OCR, replace, fullscreen & pick overlays */
export default function InvoicePreview({
    invoice,
    highlight,
    highlightText,
    pick,
    onReRead,
    reReading = false,
    onReplaceFile,
}: InvoicePreviewProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [measureRef, containerWidth] = useElementWidth<HTMLDivElement>();
    const [zoom, setZoom] = useState<ZoomLevel>('fit');
    const [currentPage, setCurrentPage] = useState(0);
    const [expanded, setExpanded] = useState(false);

    // Local visual rotation override tied to the current invoice object (auto-resets when invoice updates)
    const [rotOverride, setRotOverride] = useState<{ invoice: LoadedInvoice; rotation: Rotation } | null>(null);
    const baseRotation: Rotation = invoice.rotation ?? 0;
    const localRotation: Rotation = rotOverride?.invoice === invoice ? rotOverride.rotation : baseRotation;
    const rotationDirty = localRotation !== baseRotation;

    const setLocalRotation = (next: Rotation) => setRotOverride({ invoice, rotation: next });
    const rotateBy = (delta: 90 | 270) => setLocalRotation(((localRotation + delta) % 360) as Rotation);

    const pages = useMemo(() => (invoice.kind === 'pdf' ? invoice.pdf.layout.pages : []), [invoice]);
    const displayPages = useMemo(
        () =>
            pages.map(p =>
                localRotation === 90 || localRotation === 270 ? { w: p.h, h: p.w } : p,
            ),
        [pages, localRotation],
    );

    const effectiveWidth = containerWidth > 0 ? Math.round(containerWidth * (zoom === 'fit' ? 1 : zoom)) : 0;

    // Where the outlined places show on the page or picture (aligned when rotation matches OCR)
    const shown = useMemo(() => {
        if (!highlight || invoice.kind === 'docx' || rotationDirty) return undefined;
        return highlight.map(r =>
            invoice.kind === 'image'
                ? unlevelRect(r, invoice.angle, invoice.size)
                : displayPages[r.page]
                    ? unlevelRect(r, invoice.angles?.[r.page] ?? 0, displayPages[r.page])
                    : r,
        );
    }, [highlight, invoice, displayPages, rotationDirty]);

    // Bring the outlined value into view
    useEffect(() => {
        const box = scrollRef.current;
        const first = shown?.[0];
        if (!box || !first || invoice.kind === 'docx' || effectiveWidth <= 0) return;
        let top = 0;
        const page = invoice.kind === 'image' ? invoice.size : displayPages[first.page];
        if (invoice.kind === 'pdf') {
            for (let i = 0; i < first.page; i++) top += displayPages[i].h * (effectiveWidth / displayPages[i].w) + GAP;
        }
        if (!page) return;
        const scale = effectiveWidth / page.w;
        top += (page.h - first.y - first.h) * scale;
        const view = box.clientHeight;
        if (top < box.scrollTop + 24 || top > box.scrollTop + view - 48) {
            box.scrollTo?.({ top: Math.max(0, top - view / 3), behavior: 'smooth' });
        }
    }, [shown, invoice, displayPages, effectiveWidth]);

    // On a phone the invoice is above the form: brought into view to pick from
    const picking = !!pick;
    useEffect(() => {
        const box = scrollRef.current;
        if (!picking || !box) return;
        const top = box.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight / 2) box.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }, [picking]);

    // Track current visible page on multi-page PDF scroll
    const handleScroll = useCallback(() => {
        if (invoice.kind !== 'pdf' || pages.length <= 1) return;
        const box = scrollRef.current;
        if (!box) return;
        const boxTop = box.getBoundingClientRect().top;
        const probeY = boxTop + Math.min(120, box.clientHeight * 0.25);
        let visible = 0;
        for (let i = 0; i < pages.length; i++) {
            const el = pageRefs.current[i];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (rect.top <= probeY) visible = i;
            else break;
        }
        setCurrentPage(prev => (prev === visible ? prev : visible));
    }, [invoice.kind, pages.length]);

    const goToPage = (index: number) => {
        const safe = Math.max(0, Math.min(pages.length - 1, index));
        setCurrentPage(safe);
        const box = scrollRef.current;
        const el = pageRefs.current[safe];
        if (!box || !el) return;
        const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
        box.scrollTo?.({ top: Math.max(0, top), behavior: 'smooth' });
    };

    const handleReplaceChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) onReplaceFile?.(file);
    };

    const canRotate = Boolean(onReRead && (invoice.kind === 'image' || invoice.kind === 'pdf'));
    const isScanOrImage = invoice.kind === 'image' || (invoice.kind === 'pdf' && Boolean(invoice.scanned));
    const truncatedScan =
        invoice.kind === 'pdf' &&
        typeof invoice.ocrPagesRead === 'number' &&
        typeof invoice.totalPages === 'number' &&
        invoice.ocrPagesRead < invoice.totalPages;

    const pickedCount = pick ? (pick.count ?? pick.picked.texts.length) : 0;
    const safePage = pages.length > 0 ? Math.min(currentPage, pages.length - 1) : 0;

    return (
        <>
            <div className={`rounded-xl bg-surface-elevated/60 border flex flex-col overflow-hidden ${pick ? 'border-brand-500/60 shadow-xs' : 'border-border-subtle'}`}>
                {/* Pinned Reader Toolbar */}
                <div className="shrink-0 px-2.5 py-1.5 bg-surface/95 backdrop-blur-sm border-b border-border-subtle flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <ZoomControls zoom={zoom} onChange={setZoom} />

                        {invoice.kind === 'pdf' && pages.length > 1 && (
                            <div className="inline-flex items-center gap-0.5 rounded-lg bg-surface-elevated border border-border-subtle p-0.5">
                                <IconButton
                                    size="sm"
                                    label="Previous page"
                                    disabled={safePage <= 0}
                                    onClick={() => goToPage(safePage - 1)}
                                    className="!w-6 !h-6 !rounded-md"
                                >
                                    <ChevronLeft size={13} />
                                </IconButton>
                                <span className="px-1.5 text-[11px] font-semibold tabular-nums text-primary select-none">
                                    {safePage + 1} / {pages.length}
                                </span>
                                <IconButton
                                    size="sm"
                                    label="Next page"
                                    disabled={safePage >= pages.length - 1}
                                    onClick={() => goToPage(safePage + 1)}
                                    className="!w-6 !h-6 !rounded-md"
                                >
                                    <ChevronRight size={13} />
                                </IconButton>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        {canRotate && (
                            <>
                                <IconButton
                                    size="sm"
                                    label="Rotate counter-clockwise 90°"
                                    disabled={reReading}
                                    onClick={() => rotateBy(270)}
                                >
                                    <RotateCcw size={14} />
                                </IconButton>
                                <IconButton
                                    size="sm"
                                    label="Rotate clockwise 90°"
                                    disabled={reReading}
                                    onClick={() => rotateBy(90)}
                                >
                                    <RotateCw size={14} />
                                </IconButton>
                                {rotationDirty ? (
                                    <Button
                                        size="xs"
                                        variant="primary"
                                        loading={reReading}
                                        onClick={() =>
                                            onReRead?.({
                                                rotation: localRotation,
                                                ...(invoice.kind === 'pdf' && invoice.ocrPagesRead ? { maxPages: invoice.ocrPagesRead } : {}),
                                            })
                                        }
                                    >
                                        {!reReading && <RefreshCw size={12} />}
                                        Re-run OCR
                                    </Button>
                                ) : isScanOrImage ? (
                                    <IconButton
                                        size="sm"
                                        label="Re-run OCR"
                                        disabled={reReading}
                                        onClick={() =>
                                            onReRead?.({
                                                rotation: localRotation,
                                                ...(invoice.kind === 'pdf' && invoice.ocrPagesRead ? { maxPages: invoice.ocrPagesRead } : {}),
                                            })
                                        }
                                    >
                                        <RefreshCw size={14} className={reReading ? 'animate-spin' : ''} />
                                    </IconButton>
                                ) : null}
                            </>
                        )}

                        {onReplaceFile && (
                            <>
                                <input
                                    ref={replaceInputRef}
                                    type="file"
                                    accept={INVOICE_ACCEPT}
                                    onChange={handleReplaceChange}
                                    className="hidden"
                                    aria-label="Replace invoice file"
                                />
                                <IconButton
                                    size="sm"
                                    label="Replace invoice file"
                                    disabled={reReading}
                                    onClick={() => replaceInputRef.current?.click()}
                                >
                                    <FileUp size={14} />
                                </IconButton>
                            </>
                        )}

                        <IconButton
                            size="sm"
                            label="Expand invoice preview"
                            onClick={() => setExpanded(true)}
                        >
                            <Maximize2 size={14} />
                        </IconButton>
                    </div>
                </div>

                {/* Multi-page scan truncation notice */}
                {truncatedScan && (
                    <div className="shrink-0 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs bg-warning/10 border-b border-warning/30 text-primary">
                        <div className="flex items-center gap-2 min-w-0">
                            <AlertTriangle size={14} className="shrink-0 text-status-requested" />
                            <span>
                                OCR read the first <strong className="tabular-nums">{invoice.ocrPagesRead}</strong> of{' '}
                                <strong className="tabular-nums">{invoice.totalPages}</strong> pages.
                            </span>
                        </div>
                        {onReRead && (
                            <Button
                                size="xs"
                                variant="secondary"
                                loading={reReading}
                                onClick={() => onReRead({ maxPages: invoice.totalPages, rotation: invoice.rotation ?? 0 })}
                            >
                                Read all {invoice.totalPages} pages
                            </Button>
                        )}
                    </div>
                )}

                {/* Active Pick Status Bar (sole role="status" inside InvoicePreview) */}
                {pick && (
                    <div
                        role="status"
                        className="shrink-0 px-3 py-2 flex flex-wrap items-center gap-2 text-xs text-primary bg-surface/95 backdrop-blur-sm border-b border-brand-500/30"
                    >
                        <MousePointerClick size={14} className="shrink-0 text-brand-600 dark:text-brand-400" />
                        <span className="flex-1 min-w-0">
                            <strong>{pick.label}</strong>:{' '}
                            {invoice.kind === 'docx' ? 'click it on the invoice, or select it with the mouse' : 'click it on the invoice, or draw a box round it'}
                            {pick.multi ? ', a piece at a time.' : '.'}
                        </span>
                        {pick.multi && pickedCount > 0 && (
                            <Badge tone="brand" shape="pill" className="tabular-nums">
                                {pickedCount} selected
                            </Badge>
                        )}
                        {pick.multi && pickedCount > 0 && pick.onUndo && (
                            <Button size="xs" variant="ghost" onClick={pick.onUndo}>
                                <Undo2 size={12} /> Undo
                            </Button>
                        )}
                        <Button size="xs" variant={pick.multi ? 'primary' : 'secondary'} onClick={pick.onDone}>
                            {pick.multi ? 'Done' : 'Cancel'}
                        </Button>
                    </div>
                )}

                {/* Scrollable Document Viewport */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className={`max-h-[75vh] lg:max-h-[calc(100vh-13.5rem)] overflow-y-auto ${zoom !== 'fit' && zoom > 1 ? 'overflow-x-auto' : 'overflow-x-hidden'} p-2 sm:p-3`}
                >
                    <div ref={measureRef} className="w-full">
                        {invoice.kind === 'pdf' && effectiveWidth > 0 && (
                            <div className="flex flex-col items-center" style={{ gap: GAP }}>
                                {pages.map((size, i) => {
                                    const disp = displayPages[i];
                                    const swapped = localRotation === 90 || localRotation === 270;
                                    const pageHeight = Math.round(effectiveWidth * (disp.h / disp.w));
                                    const overlayScale = effectiveWidth / disp.w;
                                    const renderOverlay = (scale: number) => (
                                        <>
                                            {pick && !rotationDirty && (
                                                <PickLayer
                                                    phrases={invoice.phrases}
                                                    page={i}
                                                    size={disp}
                                                    angle={invoice.angles?.[i] ?? 0}
                                                    scale={scale}
                                                    pick={pick}
                                                    rotation={localRotation}
                                                />
                                            )}
                                            {shown?.filter(r => r.page === i).map((r, k) => (
                                                <div
                                                    key={k}
                                                    className="absolute rounded-xs ring-2 ring-brand-500 bg-brand-500/15 pointer-events-none animate-fadeIn"
                                                    style={rectStyle(r, scale, disp.h)}
                                                />
                                            ))}
                                        </>
                                    );

                                    return (
                                        <div
                                            key={i}
                                            ref={el => {
                                                pageRefs.current[i] = el;
                                            }}
                                            className="relative"
                                            style={{ width: effectiveWidth }}
                                        >
                                            {localRotation === 0 ? (
                                                <PdfPage
                                                    doc={invoice.pdf.doc}
                                                    page={i}
                                                    size={size}
                                                    width={effectiveWidth}
                                                    selectableText
                                                    overlay={renderOverlay}
                                                />
                                            ) : (
                                                <div
                                                    className="relative overflow-hidden rounded-sm shadow-card bg-white"
                                                    style={{ width: effectiveWidth, height: pageHeight }}
                                                >
                                                    <div style={rotatedInnerStyle(localRotation, effectiveWidth, pageHeight)}>
                                                        <PdfPage
                                                            doc={invoice.pdf.doc}
                                                            page={i}
                                                            size={size}
                                                            width={swapped ? pageHeight : effectiveWidth}
                                                        />
                                                    </div>
                                                    {renderOverlay(overlayScale)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {invoice.kind === 'docx' && (
                            <DocxPages
                                file={invoice.file}
                                phrases={invoice.phrases}
                                width={containerWidth}
                                zoom={zoom}
                                pick={pick}
                                highlightText={highlightText}
                                scrollRef={scrollRef}
                            />
                        )}

                        {invoice.kind === 'image' && (() => {
                            const orig = unrotatedImageSize(invoice.size, baseRotation);
                            const swapped = localRotation === 90 || localRotation === 270;
                            const disp = { w: swapped ? orig.h : orig.w, h: swapped ? orig.w : orig.h };
                            const imgHeight = effectiveWidth > 0 ? Math.round(effectiveWidth * (disp.h / disp.w)) : 0;
                            const scale = effectiveWidth > 0 ? effectiveWidth / disp.w : 0;

                            return (
                                <div className="relative mx-auto" style={effectiveWidth > 0 ? { width: effectiveWidth } : undefined}>
                                    {localRotation === 0 ? (
                                        <img
                                            src={invoice.url}
                                            alt={`Invoice: ${invoice.fileName}`}
                                            className="w-full block rounded-sm shadow-card bg-white"
                                        />
                                    ) : (
                                        <div
                                            className="relative overflow-hidden rounded-sm shadow-card bg-white"
                                            style={effectiveWidth > 0 ? { width: effectiveWidth, height: imgHeight } : undefined}
                                        >
                                            <img
                                                src={invoice.url}
                                                alt={`Invoice: ${invoice.fileName}`}
                                                className="block"
                                                style={effectiveWidth > 0 ? rotatedInnerStyle(localRotation, effectiveWidth, imgHeight) : undefined}
                                            />
                                        </div>
                                    )}
                                    {pick && !rotationDirty && scale > 0 && (
                                        <PickLayer
                                            phrases={invoice.phrases}
                                            page={0}
                                            size={invoice.size}
                                            angle={invoice.angle}
                                            scale={scale}
                                            pick={pick}
                                            rotation={localRotation}
                                        />
                                    )}
                                    {scale > 0 &&
                                        shown?.map((r, k) => (
                                            <div
                                                key={k}
                                                className="absolute rounded-xs ring-2 ring-brand-500 bg-brand-500/15 pointer-events-none animate-fadeIn"
                                                style={rectStyle(r, scale, invoice.size.h)}
                                            />
                                        ))}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            <Modal
                open={expanded}
                onClose={() => setExpanded(false)}
                title={invoice.fileName}
                subtitle="Full-size invoice reader"
                icon={FileText}
                size="3xl"
                bodyClassName="p-0"
            >
                {expanded && <ExpandedInvoiceView invoice={invoice} rotation={localRotation} highlightText={highlightText} />}
            </Modal>
        </>
    );
}

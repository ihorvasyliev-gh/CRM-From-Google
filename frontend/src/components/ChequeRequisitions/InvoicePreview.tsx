import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { MousePointerClick } from 'lucide-react';
import { Button } from '../ui/Button';
import { PdfPage } from '../PdfForms/pdfView';
import { rectStyle, useElementWidth, type LoadedPdf } from '../PdfForms/pdfHooks';
import PickLayer, { type PickMode } from './PickLayer';
import { toLines } from '../../lib/chequeReq/extract';
import { unlevelRect } from '../../lib/chequeReq/ocr';
import { phrasesOfTexts } from '../../lib/chequeReq/pick';
import { collapseSpaces } from '../../lib/chequeReq/parse';
import { docxForPreview, finishPages } from '../../lib/chequeReq/docxPreview';
import { loadChunk } from '../../lib/deployRecovery';
import type { Phrase, Rect } from '../../lib/pdfForms/types';

export type { PickMode };

/**
 * `phrases`: the text read from it (by OCR from a scan), where values are picked. A scan or
 * photo was read levelled: `angles` (per page) / `angle` put a place back onto the picture.
 */
export type LoadedInvoice =
    | { kind: 'pdf'; pdf: LoadedPdf; fileName: string; phrases: Phrase[]; angles?: number[] }
    /** `file`: shown as Word lays it out; `phrases`: shown as text if that fails */
    | { kind: 'docx'; file: Blob; phrases: Phrase[]; fileName: string }
    /** `size`: the photo's pixels, the units its words were read in */
    | { kind: 'image'; url: string; fileName: string; phrases: Phrase[]; size: { w: number; h: number }; angle: number };

interface Props {
    invoice: LoadedInvoice;
    /** Where the value of the field being edited was read: outlined and scrolled into view */
    highlight?: Rect[];
    /** A field's value being picked: clicking the invoice's text fills it */
    pick?: PickMode;
}

const GAP = 12;

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
            if (Array.from(range.getClientRects()).some(r => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2)) return collapseSpaces(piece);
        }
        start = end;
    }
    return null;
}

/** The Word invoice page by page, scaled to the panel; its text line by line if it can't be laid out */
function DocxPages({ file, phrases, width, pick }: { file: Blob; phrases: Phrase[]; width: number; pick?: PickMode }) {
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
        (async () => {
            const [{ renderAsync }, prepared] = await Promise.all([loadChunk(() => import('docx-preview')), file.arrayBuffer().then(docxForPreview)]);
            // Drawn aside and put in only while this file is still the one shown
            const drawn = document.createElement('div');
            await renderAsync(prepared.bytes, drawn, undefined, DOCX_OPTIONS);
            if (!live) return;
            host.replaceChildren(...Array.from(drawn.childNodes));
            const pages = finishPages(host, DOCX_OPTIONS.className, prepared);
            // Tab stops are placed 500 ms after the layout, measuring the page: it is scaled after that
            await new Promise(done => setTimeout(done, 500));
            if (live) setPageWidth(Math.max(0, ...pages.map(s => (parseFloat(s.style.width) * 4) / 3).filter(w => w > 0)));
        })().catch(() => live && setFailed(true));
        return () => {
            live = false;
        };
    }, [file, shown]);

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
        const texts = selected ? selected.split(WORD_GAP).map(collapseSpaces).filter(Boolean) : [wordTextAt(e.target, e.clientX, e.clientY, host)].filter((t): t is string => !!t);
        selection?.removeAllRanges();
        if (!texts.length) return;
        const found = phrasesOfTexts(texts, phrases);
        pick.onPick(pick.multi ? { texts: [...pick.picked.texts, ...texts], phrases: [...pick.picked.phrases, ...found.filter(p => !pick.picked.phrases.includes(p))] } : { texts, phrases: found });
    };

    const scale = pageWidth && width > 0 ? width / pageWidth : 1;
    return (
        <>
            {pageWidth === null && <p className="text-xs text-muted p-2">Laying out the invoice…</p>}
            {/* Laid out unseen at full size first, for the tab stops; the pages never widen the panel */}
            <div onClick={pickText} className={`[contain:inline-size] ${pick ? 'cursor-text' : ''} ${pageWidth === null ? 'h-0 overflow-hidden invisible' : ''}`}>
                <div
                    ref={hostRef}
                    className="flex flex-col items-start [&_section.invoice-docx]:bg-white [&_section.invoice-docx]:rounded-sm [&_section.invoice-docx]:shadow-card"
                    style={{ zoom: scale, gap: GAP / scale }}
                />
            </div>
        </>
    );
}

/** The invoice beside the requisition, with the source of the current field outlined */
export default function InvoicePreview({ invoice, highlight, pick }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [measureRef, width] = useElementWidth<HTMLDivElement>();
    const pages = useMemo(() => (invoice.kind === 'pdf' ? invoice.pdf.layout.pages : []), [invoice]);
    // Where the outlined places show on the page or picture
    const shown = useMemo(() => {
        if (!highlight || invoice.kind === 'docx') return highlight;
        return highlight.map(r =>
            invoice.kind === 'image' ? unlevelRect(r, invoice.angle, invoice.size) : pages[r.page] ? unlevelRect(r, invoice.angles?.[r.page] ?? 0, pages[r.page]) : r,
        );
    }, [highlight, invoice, pages]);

    // Bring the outlined value into view
    useEffect(() => {
        const box = scrollRef.current;
        const first = shown?.[0];
        if (!box || !first || invoice.kind === 'docx' || width <= 0) return;
        let top = 0;
        const page = invoice.kind === 'image' ? invoice.size : pages[first.page];
        if (invoice.kind === 'pdf') for (let i = 0; i < first.page; i++) top += pages[i].h * (width / pages[i].w) + GAP;
        if (!page) return;
        const scale = width / page.w;
        top += (page.h - first.y - first.h) * scale;
        const view = box.clientHeight;
        if (top < box.scrollTop + 24 || top > box.scrollTop + view - 48) box.scrollTo({ top: Math.max(0, top - view / 3), behavior: 'smooth' });
    }, [shown, invoice, pages, width]);

    // On a phone the invoice is above the form: brought into view to pick from
    const picking = !!pick;
    useEffect(() => {
        const box = scrollRef.current;
        if (!picking || !box) return;
        const top = box.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight / 2) box.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }, [picking]);

    return (
        <div ref={scrollRef} className={`max-h-[75vh] lg:max-h-[calc(100vh-11rem)] overflow-y-auto rounded-xl bg-surface-elevated/60 border p-2 sm:p-3 ${pick ? 'border-brand-500/60' : 'border-border-subtle'}`}>
            {pick && (
                <div role="status" className="sticky top-0 z-20 -mx-2 -mt-2 sm:-mx-3 sm:-mt-3 mb-2 px-3 py-2 flex items-center gap-2 text-xs text-primary bg-surface/95 backdrop-blur-sm border-b border-brand-500/30 rounded-t-xl">
                    <MousePointerClick size={14} className="shrink-0 text-brand-600 dark:text-brand-400" />
                    <span className="flex-1 min-w-0">
                        <strong>{pick.label}</strong>:{' '}
                        {invoice.kind === 'docx' ? 'click it on the invoice, or select it with the mouse' : 'click it on the invoice, or draw a box round it'}
                        {pick.multi ? ', a piece at a time.' : '.'}
                    </span>
                    <Button size="xs" variant={pick.multi ? 'primary' : 'secondary'} onClick={pick.onDone}>{pick.multi ? 'Done' : 'Cancel'}</Button>
                </div>
            )}
            <div ref={measureRef} className="w-full">
                {invoice.kind === 'pdf' && width > 0 && (
                    <div className="flex flex-col" style={{ gap: GAP }}>
                        {pages.map((size, i) => (
                            <PdfPage
                                key={i}
                                doc={invoice.pdf.doc}
                                page={i}
                                size={size}
                                width={width}
                                selectableText
                                overlay={scale => (
                                    <>
                                        {pick && <PickLayer phrases={invoice.phrases} page={i} size={size} angle={invoice.angles?.[i] ?? 0} scale={scale} pick={pick} />}
                                        {shown?.filter(r => r.page === i).map((r, k) => (
                                            <div
                                                key={k}
                                                className="absolute rounded-xs ring-2 ring-brand-500 bg-brand-500/15 pointer-events-none animate-fadeIn"
                                                style={rectStyle(r, scale, size.h)}
                                            />
                                        ))}
                                    </>
                                )}
                            />
                        ))}
                    </div>
                )}
                {invoice.kind === 'docx' && <DocxPages file={invoice.file} phrases={invoice.phrases} width={width} pick={pick} />}
                {invoice.kind === 'image' && (
                    <div className="relative">
                        <img src={invoice.url} alt={`Invoice: ${invoice.fileName}`} className="w-full rounded-sm shadow-card bg-white" />
                        {pick && width > 0 && <PickLayer phrases={invoice.phrases} page={0} size={invoice.size} angle={invoice.angle} scale={width / invoice.size.w} pick={pick} />}
                        {width > 0 &&
                            shown?.map((r, k) => (
                                <div
                                    key={k}
                                    className="absolute rounded-xs ring-2 ring-brand-500 bg-brand-500/15 pointer-events-none animate-fadeIn"
                                    style={rectStyle(r, width / invoice.size.w, invoice.size.h)}
                                />
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
}

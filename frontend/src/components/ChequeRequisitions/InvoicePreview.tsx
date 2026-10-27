import { useEffect, useMemo, useRef, useState } from 'react';
import { PdfPage } from '../PdfForms/pdfView';
import { rectStyle, useElementWidth, type LoadedPdf } from '../PdfForms/pdfHooks';
import { toLines } from '../../lib/chequeReq/extract';
import { unlevelRect } from '../../lib/chequeReq/ocr';
import { docxForPreview, finishPages } from '../../lib/chequeReq/docxPreview';
import { loadChunk } from '../../lib/deployRecovery';
import type { Phrase, Rect } from '../../lib/pdfForms/types';

/** A scan or photo was read levelled: `angles` (per page) / `angle` put a place back onto the picture */
export type LoadedInvoice =
    | { kind: 'pdf'; pdf: LoadedPdf; fileName: string; angles?: number[] }
    /** `file`: shown as Word lays it out; `phrases`: what was read, shown as text if that fails */
    | { kind: 'docx'; file: Blob; phrases: Phrase[]; fileName: string }
    /** `size`: the photo's pixels, the units its words were read in */
    | { kind: 'image'; url: string; fileName: string; size: { w: number; h: number }; angle: number };

interface Props {
    invoice: LoadedInvoice;
    /** Where the value of the field being edited was read: outlined and scrolled into view */
    highlight?: Rect[];
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

/** The Word invoice page by page, scaled to the panel; its text line by line if it can't be laid out */
function DocxPages({ file, phrases, width }: { file: Blob; phrases: Phrase[]; width: number }) {
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
    const scale = pageWidth && width > 0 ? width / pageWidth : 1;
    return (
        <>
            {pageWidth === null && <p className="text-xs text-muted p-2">Laying out the invoice…</p>}
            {/* Laid out unseen at full size first, for the tab stops; the pages never widen the panel */}
            <div className={`[contain:inline-size] ${pageWidth === null ? 'h-0 overflow-hidden invisible' : ''}`}>
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
export default function InvoicePreview({ invoice, highlight }: Props) {
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

    return (
        <div ref={scrollRef} className="max-h-[75vh] lg:max-h-[calc(100vh-11rem)] overflow-y-auto rounded-xl bg-surface-elevated/60 border border-border-subtle p-2 sm:p-3">
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
                {invoice.kind === 'docx' && <DocxPages file={invoice.file} phrases={invoice.phrases} width={width} />}
                {invoice.kind === 'image' && (
                    <div className="relative">
                        <img src={invoice.url} alt={`Invoice: ${invoice.fileName}`} className="w-full rounded-sm shadow-card bg-white" />
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

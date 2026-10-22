import { useEffect, useMemo, useRef } from 'react';
import { PdfPage } from '../PdfForms/pdfView';
import { rectStyle, useElementWidth, type LoadedPdf } from '../PdfForms/pdfHooks';
import { toLines } from '../../lib/chequeReq/extract';
import type { Phrase, Rect } from '../../lib/pdfForms/types';

export type LoadedInvoice =
    | { kind: 'pdf'; pdf: LoadedPdf; fileName: string }
    | { kind: 'docx'; phrases: Phrase[]; fileName: string }
    | { kind: 'image'; url: string; fileName: string };

interface Props {
    invoice: LoadedInvoice;
    /** Where the value of the field being edited was read: outlined and scrolled into view */
    highlight?: Rect[];
}

const GAP = 12;

/** The invoice beside the requisition, with the source of the current field outlined */
export default function InvoicePreview({ invoice, highlight }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [measureRef, width] = useElementWidth<HTMLDivElement>();
    const pages = useMemo(() => (invoice.kind === 'pdf' ? invoice.pdf.layout.pages : []), [invoice]);

    // Bring the outlined value into view
    useEffect(() => {
        const box = scrollRef.current;
        const first = highlight?.[0];
        if (!box || !first || invoice.kind !== 'pdf' || width <= 0) return;
        let top = 0;
        for (let i = 0; i < first.page; i++) top += pages[i].h * (width / pages[i].w) + GAP;
        const page = pages[first.page];
        if (!page) return;
        const scale = width / page.w;
        top += (page.h - first.y - first.h) * scale;
        const view = box.clientHeight;
        if (top < box.scrollTop + 24 || top > box.scrollTop + view - 48) box.scrollTo({ top: Math.max(0, top - view / 3), behavior: 'smooth' });
    }, [highlight, invoice.kind, pages, width]);

    const docxLines = useMemo(() => (invoice.kind === 'docx' ? toLines(invoice.phrases) : []), [invoice]);

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
                                overlay={scale => (
                                    <>
                                        {highlight?.filter(r => r.page === i).map((r, k) => (
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
                {invoice.kind === 'docx' && (
                    <div className="bg-white text-neutral-900 rounded-sm shadow-card p-4 text-xs leading-relaxed space-y-0.5">
                        {docxLines.map((line, i) => (
                            <p key={i} className="flex flex-wrap gap-x-6">
                                {line.phrases.map((p, k) => <span key={k}>{p.text}</span>)}
                            </p>
                        ))}
                    </div>
                )}
                {invoice.kind === 'image' && <img src={invoice.url} alt={`Invoice: ${invoice.fileName}`} className="w-full rounded-sm shadow-card bg-white" />}
            </div>
        </div>
    );
}

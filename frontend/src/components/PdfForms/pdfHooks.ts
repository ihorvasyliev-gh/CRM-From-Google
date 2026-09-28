import { useEffect, useState, type CSSProperties } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractLayout, openPdf } from '../../lib/pdfForms/pdfjs';
import type { PdfLayout, Rect } from '../../lib/pdfForms/types';

export interface LoadedPdf {
    doc: PDFDocumentProxy;
    layout: PdfLayout;
}

const EMPTY_LAYOUT: PdfLayout = { pages: [], phrases: [], checkboxes: [], edges: [] };

/** Open a PDF with pdf.js and (optionally) read its layout: checkboxes, labels, table cells. */
export async function loadPdf(bytes: Uint8Array, withLayout = true): Promise<LoadedPdf> {
    const doc = await openPdf(bytes);
    try {
        if (!withLayout) {
            const pages: PdfLayout['pages'] = [];
            for (let i = 1; i <= doc.numPages; i++) {
                const [x0, y0, x1, y1] = (await doc.getPage(i)).view;
                pages.push({ w: x1 - x0, h: y1 - y0 });
            }
            return { doc, layout: { ...EMPTY_LAYOUT, pages } };
        }
        return { doc, layout: await extractLayout(doc) };
    } catch (err) {
        void doc.loadingTask.destroy();
        throw err;
    }
}

export function usePdfDocument(bytes: Uint8Array | null, withLayout = true): { pdf: LoadedPdf | null; loading: boolean; error: string | null } {
    const [state, setState] = useState<{ pdf: LoadedPdf | null; loading: boolean; error: string | null; bytes: Uint8Array | null }>({
        pdf: null,
        loading: !!bytes,
        error: null,
        bytes,
    });
    // Reset synchronously when the input changes (no effect-driven setState flash)
    if (state.bytes !== bytes) setState({ pdf: null, loading: !!bytes, error: null, bytes });

    useEffect(() => {
        if (!bytes) return;
        let cancelled = false;
        let loaded: LoadedPdf | null = null;
        loadPdf(bytes, withLayout)
            .then(pdf => {
                loaded = pdf;
                if (cancelled) void pdf.doc.loadingTask.destroy();
                else setState(s => (s.bytes === bytes ? { ...s, pdf, loading: false } : s));
            })
            .catch((err: unknown) => {
                if (!cancelled) setState(s => (s.bytes === bytes ? { ...s, loading: false, error: err instanceof Error ? err.message : 'Could not open the PDF' } : s));
            });
        return () => {
            cancelled = true;
            if (loaded) void loaded.doc.loadingTask.destroy();
        };
    }, [bytes, withLayout]);
    return { pdf: state.pdf, loading: state.loading, error: state.error };
}

/**
 * Width of an element that may mount later (e.g. inside a dialog or after an upload step):
 * attach the returned callback as its `ref`.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
    const [el, setEl] = useState<T | null>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        if (!el) return;
        const update = () => setWidth(el.clientWidth);
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [el]);
    return [setEl, width];
}

/** CSS box for a PDF rect (PDF origin is bottom-left, CSS top-left) */
export function rectStyle(r: Rect, scale: number, pageHeight: number): CSSProperties {
    return { left: r.x * scale, top: (pageHeight - r.y - r.h) * scale, width: r.w * scale, height: r.h * scale };
}


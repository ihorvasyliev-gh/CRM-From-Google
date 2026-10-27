import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';
import { loadPdfJs } from '../../lib/pdfForms/pdfjs';

interface PdfPageProps {
    doc: PDFDocumentProxy;
    page: number;
    size: { w: number; h: number };
    /** CSS width to draw at */
    width: number;
    /** Overlay drawn on top, in CSS pixels (`scale` = CSS px per PDF point) */
    overlay?: (scale: number) => ReactNode;
    /** Lay the page's text over the canvas, invisible, so it can be selected and copied */
    selectableText?: boolean;
    className?: string;
}

/** One PDF page on a canvas, sharp on high-DPI screens, with an overlay on top */
export function PdfPage({ doc, page, size, width, overlay, selectableText = false, className = '' }: PdfPageProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const [rendering, setRendering] = useState(true);
    const scale = width > 0 ? width / size.w : 0;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || scale <= 0) return;
        let cancelled = false;
        let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
        setRendering(true);
        doc.getPage(page + 1)
            .then(p => {
                if (cancelled) return;
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const viewport = p.getViewport({ scale: scale * dpr });
                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                task = p.render({ canvasContext: ctx, viewport, canvas });
                return task.promise;
            })
            .then(() => {
                if (!cancelled) setRendering(false);
            })
            .catch(() => {
                // Cancelled renders reject; a real failure just leaves the page blank
                if (!cancelled) setRendering(false);
            });
        return () => {
            cancelled = true;
            task?.cancel();
        };
    }, [doc, page, scale]);

    // pdf.js's text layer: a transparent span over each run of text, sized to match the canvas
    useEffect(() => {
        const box = textRef.current;
        if (!selectableText || !box || scale <= 0) return;
        let cancelled = false;
        let layer: { cancel: () => void } | null = null;
        Promise.all([doc.getPage(page + 1), loadPdfJs()])
            .then(([p, pdfjs]) => {
                if (cancelled) return;
                box.replaceChildren();
                box.style.setProperty('--total-scale-factor', String(scale));
                const textLayer = new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: box, viewport: p.getViewport({ scale }) });
                layer = textLayer;
                return textLayer.render().then(() => {
                    // Dragging past the last line keeps selecting to the end instead of jumping back
                    const end = document.createElement('div');
                    end.className = 'endOfContent';
                    box.append(end);
                });
            })
            .catch(() => {
                // Cancelled layers reject; a real failure just leaves the text unselectable
            });
        const selecting = () => box.classList.add('selecting');
        const done = () => box.classList.remove('selecting');
        box.addEventListener('pointerdown', selecting);
        document.addEventListener('pointerup', done);
        return () => {
            cancelled = true;
            layer?.cancel();
            box.removeEventListener('pointerdown', selecting);
            document.removeEventListener('pointerup', done);
        };
    }, [doc, page, scale, selectableText]);

    return (
        <div className={`relative bg-white shadow-card rounded-sm ${selectableText ? '' : 'select-none'} ${className}`} style={{ width, height: size.h * scale }}>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-label={`Page ${page + 1}`} />
            {selectableText && <div ref={textRef} className="textLayer" />}
            {rendering && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-brand-500/60" />
                </div>
            )}
            {scale > 0 && overlay?.(scale)}
        </div>
    );
}

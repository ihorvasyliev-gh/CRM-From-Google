import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';

interface PdfPageProps {
    doc: PDFDocumentProxy;
    page: number;
    size: { w: number; h: number };
    /** CSS width to draw at */
    width: number;
    /** Overlay drawn on top, in CSS pixels (`scale` = CSS px per PDF point) */
    overlay?: (scale: number) => ReactNode;
    className?: string;
}

/** One PDF page on a canvas, sharp on high-DPI screens, with an overlay on top */
export function PdfPage({ doc, page, size, width, overlay, className = '' }: PdfPageProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
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

    return (
        <div className={`relative bg-white shadow-card rounded-sm select-none ${className}`} style={{ width, height: size.h * scale }}>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-label={`Page ${page + 1}`} />
            {rendering && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-brand-500/60" />
                </div>
            )}
            {scale > 0 && overlay?.(scale)}
        </div>
    );
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { drawDocxPages } from '../../lib/certificates/pages';
import { chequeReqFileName, renderChequeReqBytes } from '../../lib/chequeReq/docx';
import { toast } from '../../lib/toast';
import type { ChequeReqForm, ChequeReqMeta } from '../../lib/chequeReq/types';

interface PrintJob {
    title: string;
    pages: string[];
}

export interface UsePrintChequeReqResult {
    printing: boolean;
    print: (form: ChequeReqForm, meta: ChequeReqMeta) => Promise<void>;
    printNode: ReactNode;
}

/**
 * Renders the filled SICAP cheque requisition as crisp 200 DPI A4 pages into a
 * body-portaled `.cheque-print-root`, scopes print CSS via `body.cheque-printing`,
 * swaps the document title for clean print-to-PDF filenames, and cleans up after print
 * or on unmount.
 */
export function usePrintChequeReq(): UsePrintChequeReqResult {
    const [job, setJob] = useState<PrintJob | null>(null);
    const [printing, setPrinting] = useState(false);
    const busyRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!job) return;
        const prevTitle = document.title;
        let finished = false;
        let raf1 = 0;
        let raf2 = 0;

        document.title = job.title;
        document.body.classList.add('cheque-printing');

        const cleanupDom = () => {
            if (finished) return;
            finished = true;
            window.cancelAnimationFrame(raf1);
            window.cancelAnimationFrame(raf2);
            window.removeEventListener('afterprint', onAfterPrint);
            document.body.classList.remove('cheque-printing');
            document.title = prevTitle;
            busyRef.current = false;
        };

        const onAfterPrint = () => {
            cleanupDom();
            if (mountedRef.current) {
                setJob(null);
                setPrinting(false);
            }
        };

        window.addEventListener('afterprint', onAfterPrint);

        // Wait two frames so the portaled <img> elements commit and paint before opening the print dialog
        raf1 = window.requestAnimationFrame(() => {
            raf2 = window.requestAnimationFrame(() => {
                if (finished) return;
                try {
                    window.print();
                } catch {
                    onAfterPrint();
                }
            });
        });

        return () => {
            cleanupDom();
        };
    }, [job]);

    const print = useCallback(async (form: ChequeReqForm, meta: ChequeReqMeta) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setPrinting(true);
        try {
            const bytes = await renderChequeReqBytes(form);
            const rendered = await drawDocxPages(bytes, 200);
            let pages: string[];
            try {
                pages = rendered.map(p => p.canvas.toDataURL('image/png'));
            } finally {
                for (const page of rendered) {
                    page.canvas.width = 0;
                    page.canvas.height = 0;
                }
            }
            if (!mountedRef.current) {
                busyRef.current = false;
                return;
            }
            if (pages.length === 0) {
                throw new Error('No pages were generated for printing');
            }
            const title = chequeReqFileName(meta, form).replace(/\.docx$/i, '');
            setJob({ title, pages });
        } catch (err) {
            busyRef.current = false;
            if (mountedRef.current) setPrinting(false);
            toast.error(
                err instanceof Error
                    ? `Could not prepare the requisition for printing: ${err.message}`
                    : 'Could not prepare the requisition for printing',
            );
        }
    }, []);

    const printNode: ReactNode = job && typeof document !== 'undefined'
        ? createPortal(
            <div className="cheque-print-root" aria-hidden="true">
                {job.pages.map((src, index) => (
                    <div key={index} className="cheque-print-page">
                        <img src={src} alt="" className="block w-full h-auto" />
                    </div>
                ))}
            </div>,
            document.body,
        )
        : null;

    return { printing, print, printNode };
}

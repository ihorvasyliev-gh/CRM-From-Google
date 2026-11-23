import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chequeReqFileName } from '../../lib/chequeReq/docx';
import type { ChequeReqForm, ChequeReqMeta } from '../../lib/chequeReq/types';
import RequisitionSheet from './RequisitionSheet';

interface PrintJob {
    title: string;
    form: ChequeReqForm;
}

export interface UsePrintChequeReqResult {
    printing: boolean;
    print: (form: ChequeReqForm, meta: ChequeReqMeta) => Promise<void>;
    printNode: ReactNode;
}

/**
 * Prints the filled SICAP cheque requisition directly as crisp vector HTML via a
 * body-portaled `.cheque-print-root` (scoped with `body.cheque-printing`), swapping
 * `document.title` for clean print-to-PDF filenames and restoring everything on `afterprint`.
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

        // Wait two frames so the portaled sheet commits and paints before opening the print dialog
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
        const title = chequeReqFileName(meta, form).replace(/\.docx$/i, '');
        setJob({ title, form: structuredClone(form) });
    }, []);

    const printNode: ReactNode = job && typeof document !== 'undefined'
        ? createPortal(
            <div className="cheque-print-root" aria-hidden="true">
                <div className="cheque-print-page">
                    <RequisitionSheet form={job.form} printMode />
                </div>
            </div>,
            document.body,
        )
        : null;

    return { printing, print, printNode };
}

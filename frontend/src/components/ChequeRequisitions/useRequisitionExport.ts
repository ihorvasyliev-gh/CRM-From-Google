import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
} from 'react';
import { usePrintChequeReq } from './PrintPortal';
import { toast } from '../../lib/toast';
import { downloadBlob } from '../../lib/download';
import type { SaveChequeReqInput } from '../../hooks/useChequeRequisitions';
import { rememberDefaults } from '../../lib/chequeReq/draft';
import { chequeReqFileName, chequeReqPdfFileName, renderChequeReq } from '../../lib/chequeReq/docx';
import { renderChequeReqBatchZip, renderChequeReqPdf } from '../../lib/chequeReq/export';
import type { ChequeReqForm, ChequeReqMeta, ChequeReqStatus } from '../../lib/chequeReq/types';

export type ExportFormat = 'docx' | 'pdf';
export type ExportBusyAction = 'docx' | 'pdf' | 'save' | 'batch' | null;

export interface ExportableRequisition {
    key: string;
    form: ChequeReqForm;
    meta: ChequeReqMeta;
    savedId?: string;
    status: ChequeReqStatus;
    chequeNumber: string;
    notes: string;
    downloaded: boolean;
    touched: boolean;
}

export interface UseRequisitionExportOptions<T extends ExportableRequisition> {
    items: T[];
    activeIndex: number;
    setItems: Dispatch<SetStateAction<T[]>>;
    /** Number of flagged fields still needing review on the active requisition */
    toCheckCount: number;
    keep?: (input: SaveChequeReqInput) => Promise<string | null>;
    defaultsKey?: string;
}

export interface UseRequisitionExportResult {
    busyAction: ExportBusyAction;
    isBusy: boolean;
    batchProgress: string | null;
    pendingDownload: ExportFormat | null;
    printing: boolean;
    printNode: ReactNode;
    saveOnly: () => Promise<void>;
    requestDownload: (format: ExportFormat) => void;
    confirmDownload: () => void;
    cancelDownload: () => void;
    downloadBatchZip: (format: ExportFormat) => Promise<void>;
    printActive: () => void;
}

/**
 * Orchestrates saving, printing, single-item DOCX/PDF downloads, and batch ZIP exports
 * for the active cheque requisition queue.
 */
export function useRequisitionExport<T extends ExportableRequisition>({
    items,
    activeIndex,
    setItems,
    toCheckCount,
    keep,
    defaultsKey,
}: UseRequisitionExportOptions<T>): UseRequisitionExportResult {
    const [pendingDownload, setPendingDownload] = useState<ExportFormat | null>(null);
    const [busyAction, setBusyAction] = useState<ExportBusyAction>(null);
    const [batchProgress, setBatchProgress] = useState<string | null>(null);
    const { printing, print, printNode } = usePrintChequeReq();

    const itemsRef = useRef(items);
    const activeIndexRef = useRef(activeIndex);
    useLayoutEffect(() => {
        itemsRef.current = items;
        activeIndexRef.current = activeIndex;
    });

    // Save draft / tracking fields without downloading
    const saveOnly = useCallback(async () => {
        if (!keep) return;
        const item = itemsRef.current[activeIndexRef.current];
        if (!item) return;
        const targetKey = item.key;
        setBusyAction('save');
        try {
            const id = await keep({
                id: item.savedId,
                form: item.form,
                meta: item.meta,
                status: item.status,
                chequeNumber: item.chequeNumber,
                notes: item.notes,
            });
            setItems(prev =>
                prev.map(cur =>
                    cur.key === targetKey
                        ? { ...cur, savedId: id ?? cur.savedId, touched: false }
                        : cur,
                ),
            );
            toast.success(id ? 'Requisition saved' : 'Changes kept on this page (apply migration 88 to save to history)');
        } catch (err) {
            toast.error(err instanceof Error ? `Could not save: ${err.message}` : 'Could not save');
        } finally {
            setBusyAction(null);
        }
    }, [keep, setItems]);

    // Download (.docx or .pdf)
    const executeDownload = useCallback(
        async (format: ExportFormat) => {
            const item = itemsRef.current[activeIndexRef.current];
            if (!item) return;
            const targetKey = item.key;
            setPendingDownload(null);
            setBusyAction(format);
            try {
                if (format === 'pdf') {
                    const blob = await renderChequeReqPdf(item.form, item.meta);
                    downloadBlob(blob, chequeReqPdfFileName(item.meta, item.form));
                } else {
                    const blob = await renderChequeReq(item.form);
                    downloadBlob(blob, chequeReqFileName(item.meta, item.form));
                }
            } catch (err) {
                toast.error(
                    err instanceof Error
                        ? `The requisition could not be made: ${err.message}`
                        : 'The requisition could not be made',
                );
                setBusyAction(null);
                return;
            }
            rememberDefaults(item.form, item.meta, defaultsKey);
            try {
                const id = keep
                    ? await keep({
                        id: item.savedId,
                        form: item.form,
                        meta: item.meta,
                        status: item.status,
                        chequeNumber: item.chequeNumber,
                        notes: item.notes,
                    })
                    : null;
                setItems(prev =>
                    prev.map(cur =>
                        cur.key === targetKey
                            ? { ...cur, savedId: id ?? cur.savedId, downloaded: true, touched: false }
                            : cur,
                    ),
                );
                const label = format === 'pdf' ? 'PDF downloaded' : 'Downloaded';
                toast.success(id ? `${label}, and kept in the history` : label);
            } catch (err) {
                toast.error(`Downloaded, but not kept in the history: ${(err as Error).message}`);
            } finally {
                setBusyAction(null);
            }
        },
        [defaultsKey, keep, setItems],
    );

    const requestDownload = useCallback(
        (format: ExportFormat) => {
            if (toCheckCount > 0) setPendingDownload(format);
            else void executeDownload(format);
        },
        [toCheckCount, executeDownload],
    );

    const confirmDownload = useCallback(() => {
        if (pendingDownload) void executeDownload(pendingDownload);
    }, [pendingDownload, executeDownload]);

    const cancelDownload = useCallback(() => {
        setPendingDownload(null);
    }, []);

    // Batch ZIP download
    const downloadBatchZip = useCallback(
        async (format: ExportFormat) => {
            const snapshot = itemsRef.current;
            if (snapshot.length === 0) return;
            setBusyAction('batch');
            setBatchProgress(`Building ZIP… 0/${snapshot.length}`);
            try {
                const { blob, fileName } = await renderChequeReqBatchZip(
                    snapshot.map(i => ({ form: i.form, meta: i.meta })),
                    format,
                    (done, total) => setBatchProgress(`Building ZIP… ${done}/${total}`),
                );
                downloadBlob(blob, fileName);
                const cur = snapshot[activeIndexRef.current];
                if (cur) rememberDefaults(cur.form, cur.meta, defaultsKey);

                if (keep) {
                    const savedIds: (string | null)[] = [];
                    for (const item of snapshot) {
                        const id = await keep({
                            id: item.savedId,
                            form: item.form,
                            meta: item.meta,
                            status: item.status,
                            chequeNumber: item.chequeNumber,
                            notes: item.notes,
                        });
                        savedIds.push(id);
                    }
                    setItems(prev =>
                        prev.map((item, idx) => ({
                            ...item,
                            savedId: savedIds[idx] ?? item.savedId,
                            downloaded: true,
                            touched: false,
                        })),
                    );
                    toast.success(`Downloaded ${snapshot.length} requisitions (.zip) and kept in history`);
                } else {
                    setItems(prev => prev.map(item => ({ ...item, downloaded: true, touched: false })));
                    toast.success(`Downloaded ${snapshot.length} requisitions (.zip)`);
                }
            } catch (err) {
                toast.error(err instanceof Error ? `Batch download failed: ${err.message}` : 'Batch download failed');
            } finally {
                setBusyAction(null);
                setBatchProgress(null);
            }
        },
        [defaultsKey, keep, setItems],
    );

    const printActive = useCallback(() => {
        const item = itemsRef.current[activeIndexRef.current];
        if (item) void print(item.form, item.meta);
    }, [print]);

    return {
        busyAction,
        isBusy: busyAction !== null,
        batchProgress,
        pendingDownload,
        printing,
        printNode,
        saveOnly,
        requestDownload,
        confirmDownload,
        cancelDownload,
        downloadBatchZip,
        printActive,
    };
}

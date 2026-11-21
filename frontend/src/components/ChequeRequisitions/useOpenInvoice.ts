import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { loadPdf } from '../PdfForms/pdfHooks';
import { toast } from '../../lib/toast';
import { extractInvoice } from '../../lib/chequeReq/extract';
import { invoiceKind, MAX_INVOICE_BYTES, readDocxInvoice, unsupportedFileReason } from '../../lib/chequeReq/read';
import {
    DEFAULT_OCR_MAX_PAGES,
    ocrPhrases,
    photoPage,
    readScan,
    scannedPdfPages,
    type OcrPage,
    type Rotation,
} from '../../lib/chequeReq/ocr';
import { draftFromSupplier, type ChequeReqDefaults } from '../../lib/chequeReq/draft';
import { EMPTY_FORM, EMPTY_META, type InvoiceFacts, type SavedChequeReq } from '../../lib/chequeReq/types';
import type { Phrase } from '../../lib/pdfForms/types';
import type { EditorSession } from './Editor';
import type { LoadedInvoice } from './InvoicePreview';

// Shared by the admin page and the public one (/cheque): nothing here talks to the database.

export const NO_FACTS: InvoiceFacts = { hasText: false, supplier: {}, items: [], people: [], mentionsSicap: false };

export interface ReadProgress {
    stage: 'opening' | 'ocr' | 'extracting';
    label: string;
    progress?: number;
    fileIndex?: number;
    fileCount?: number;
    canCancel?: boolean;
}

export interface OpenedInvoice {
    invoice: LoadedInvoice;
    facts: InvoiceFacts;
    fileName: string;
}

/** A PDF with hardly any text is a scan (perhaps with a scanner's stamp): its pages are pictures to read */
function looksScanned(phrases: Phrase[]): boolean {
    return phrases.map(p => p.text).join('').replace(/[^\p{L}\p{N}]/gu, '').length < 100;
}

function abortError(): DOMException {
    return new DOMException('Reading cancelled', 'AbortError');
}

function isAbortError(err: unknown): boolean {
    return err instanceof DOMException ? err.name === 'AbortError' : err instanceof Error && err.name === 'AbortError';
}

function releasePages(pages: OcrPage[]): void {
    for (const page of pages) {
        page.canvas.width = 0;
        page.canvas.height = 0;
    }
}

/**
 * Open and extract a single invoice file (PDF, Word .docx, or photo/scan) entirely in the browser.
 * Supports rotation, custom OCR page cap, progress callbacks, and AbortSignal cancellation.
 */
export async function openInvoiceFile(
    file: File,
    opts?: { rotation?: Rotation; maxPages?: number; onProgress?: (p: ReadProgress) => void; signal?: AbortSignal },
): Promise<OpenedInvoice> {
    const rotation: Rotation = opts?.rotation ?? 0;
    const maxPages = opts?.maxPages ?? DEFAULT_OCR_MAX_PAGES;
    const onProgress = opts?.onProgress;
    const signal = opts?.signal;
    const canCancel = Boolean(signal);

    if (signal?.aborted) throw abortError();

    const kind = invoiceKind(file);
    if (!kind) {
        throw new Error(unsupportedFileReason(file));
    }
    if (file.size > MAX_INVOICE_BYTES) {
        throw new Error('The file is larger than 25 MB');
    }

    onProgress?.({ stage: 'opening', label: 'Reading the invoice…', canCancel });

    let invoice: LoadedInvoice;
    let phrases: Phrase[];
    let scanned = false;
    let ocrPagesRead: number | undefined;
    let totalPages: number | undefined;

    if (kind === 'pdf') {
        const buffer = await file.arrayBuffer();
        if (signal?.aborted) throw abortError();
        const pdf = await loadPdf(new Uint8Array(buffer));
        if (signal?.aborted) {
            void pdf.doc.loadingTask.destroy();
            throw abortError();
        }
        phrases = pdf.layout.phrases;
        totalPages = pdf.doc.numPages;
        let angles: number[] = [];

        if (looksScanned(phrases)) {
            scanned = true;
            ocrPagesRead = Math.min(totalPages, maxPages);
            onProgress?.({ stage: 'ocr', label: 'Reading the scan…', progress: 0, canCancel });
            let pages: OcrPage[] = [];
            try {
                pages = await scannedPdfPages(pdf.doc, { maxPages, rotation });
                if (signal?.aborted) throw abortError();
                const scan = await readScan(
                    pages,
                    done => onProgress?.({
                        stage: 'ocr',
                        label: `Reading the scan… ${Math.round(done * 100)}%`,
                        progress: done,
                        canCancel,
                    }),
                    signal,
                );
                angles = scan.angles;
                phrases = ocrPhrases(scan.pageSizes, scan.items);
            } catch (err) {
                if (signal?.aborted || isAbortError(err)) {
                    void pdf.doc.loadingTask.destroy();
                    throw isAbortError(err) ? err : abortError();
                }
                toast.error(err instanceof Error ? `The scan could not be read: ${err.message}` : 'The scan could not be read');
                phrases = [];
            } finally {
                releasePages(pages);
            }
        }

        invoice = {
            kind: 'pdf',
            pdf,
            file,
            fileName: file.name,
            phrases,
            angles,
            rotation,
            ...(ocrPagesRead !== undefined ? { ocrPagesRead } : {}),
            totalPages,
            scanned,
        };
    } else if (kind === 'docx') {
        const buffer = await file.arrayBuffer();
        if (signal?.aborted) throw abortError();
        phrases = await readDocxInvoice(buffer);
        if (signal?.aborted) throw abortError();
        invoice = { kind: 'docx', file, phrases, fileName: file.name, rotation: 0 };
    } else {
        scanned = true;
        onProgress?.({ stage: 'ocr', label: 'Reading the photo…', progress: 0, canCancel });
        const page = await photoPage(file, rotation);
        let angles: number[] = [];
        try {
            if (signal?.aborted) throw abortError();
            const scan = await readScan(
                [page],
                done => onProgress?.({
                    stage: 'ocr',
                    label: `Reading the photo… ${Math.round(done * 100)}%`,
                    progress: done,
                    canCancel,
                }),
                signal,
            );
            angles = scan.angles;
            phrases = ocrPhrases(scan.pageSizes, scan.items);
        } catch (err) {
            if (signal?.aborted || isAbortError(err)) {
                throw isAbortError(err) ? err : abortError();
            }
            toast.error(err instanceof Error ? `The scan could not be read: ${err.message}` : 'The scan could not be read');
            phrases = [];
        } finally {
            releasePages([page]);
        }

        invoice = {
            kind: 'image',
            url: URL.createObjectURL(file),
            file,
            fileName: file.name,
            phrases,
            size: { w: page.width, h: page.height },
            angle: angles[0] ?? 0,
            rotation,
        };
    }

    if (signal?.aborted) {
        closeInvoice(invoice);
        throw abortError();
    }

    onProgress?.({ stage: 'extracting', label: 'Extracting invoice details…', canCancel });
    const extracted = extractInvoice(phrases);
    const facts: InvoiceFacts = {
        ...extracted,
        scanned,
        ...(ocrPagesRead !== undefined ? { ocrPagesRead } : {}),
        ...(totalPages !== undefined ? { totalPages } : {}),
    };

    return { invoice, facts, fileName: file.name };
}

/**
 * Re-run OCR on an already-opened image or PDF with a new rotation and/or page limit,
 * returning the updated LoadedInvoice alongside freshly extracted InvoiceFacts.
 */
export async function reReadInvoice(
    invoice: LoadedInvoice,
    opts: { rotation?: Rotation; maxPages?: number; onProgress?: (p: ReadProgress) => void; signal?: AbortSignal } = {},
): Promise<{ invoice: LoadedInvoice; facts: InvoiceFacts }> {
    const { onProgress, signal } = opts;
    const canCancel = Boolean(signal);
    if (signal?.aborted) throw abortError();

    if (invoice.kind === 'docx') {
        const facts: InvoiceFacts = { ...extractInvoice(invoice.phrases), scanned: false };
        return { invoice, facts };
    }

    const rotation: Rotation = opts.rotation ?? invoice.rotation ?? 0;

    if (invoice.kind === 'image') {
        if (!invoice.file) {
            throw new Error('The original image file is not available to re-read.');
        }
        onProgress?.({ stage: 'ocr', label: 'Reading the photo…', progress: 0, canCancel });
        const page = await photoPage(invoice.file, rotation);
        try {
            if (signal?.aborted) throw abortError();
            const scan = await readScan(
                [page],
                done => onProgress?.({
                    stage: 'ocr',
                    label: `Reading the photo… ${Math.round(done * 100)}%`,
                    progress: done,
                    canCancel,
                }),
                signal,
            );
            const phrases = ocrPhrases(scan.pageSizes, scan.items);
            onProgress?.({ stage: 'extracting', label: 'Extracting invoice details…', canCancel });
            const nextInvoice: LoadedInvoice = {
                ...invoice,
                phrases,
                size: { w: page.width, h: page.height },
                angle: scan.angles[0] ?? 0,
                rotation,
            };
            const facts: InvoiceFacts = {
                ...extractInvoice(phrases),
                scanned: true,
            };
            return { invoice: nextInvoice, facts };
        } finally {
            releasePages([page]);
        }
    }

    // PDF re-OCR
    const totalPages = invoice.pdf.doc.numPages;
    const maxPages = opts.maxPages ?? invoice.ocrPagesRead ?? DEFAULT_OCR_MAX_PAGES;
    const ocrPagesRead = Math.min(totalPages, maxPages);
    onProgress?.({ stage: 'ocr', label: 'Reading the scan…', progress: 0, canCancel });
    const pages = await scannedPdfPages(invoice.pdf.doc, { maxPages, rotation });
    try {
        if (signal?.aborted) throw abortError();
        const scan = await readScan(
            pages,
            done => onProgress?.({
                stage: 'ocr',
                label: `Reading the scan… ${Math.round(done * 100)}%`,
                progress: done,
                canCancel,
            }),
            signal,
        );
        const phrases = ocrPhrases(scan.pageSizes, scan.items);
        onProgress?.({ stage: 'extracting', label: 'Extracting invoice details…', canCancel });
        const nextInvoice: LoadedInvoice = {
            ...invoice,
            phrases,
            angles: scan.angles,
            rotation,
            ocrPagesRead,
            totalPages,
            scanned: true,
        };
        const facts: InvoiceFacts = {
            ...extractInvoice(phrases),
            scanned: true,
            ocrPagesRead,
            totalPages,
        };
        return { invoice: nextInvoice, facts };
    } finally {
        releasePages(pages);
    }
}

/**
 * The invoice drop & batch loader: reads one or more chosen files sequentially in the browser
 * (text, or OCR for scans/photos) with cancellation and progress updates, then passes all
 * successfully opened items to `onRead`.
 */
export function useOpenInvoice(onRead: (items: OpenedInvoice[]) => Promise<void> | void) {
    /** Human-readable status while reading, e.g. "(1/3) Reading the scan… 40%" */
    const [reading, setReading] = useState<string | null>(null);
    const [progress, setProgress] = useState<ReadProgress | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const onReadRef = useRef(onRead);

    useEffect(() => {
        onReadRef.current = onRead;
    }, [onRead]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            abortRef.current = null;
        };
    }, []);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const openFiles = useCallback(async (files: FileList | File[]) => {
        const list = Array.from(files);
        if (list.length === 0) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const fileCount = list.length;
        const opened: OpenedInvoice[] = [];

        const report = (p: ReadProgress, fileIndex: number) => {
            if (controller.signal.aborted) return;
            const prefix = fileCount > 1 ? `(${fileIndex + 1}/${fileCount}) ` : '';
            const label = `${prefix}${p.label}`;
            setReading(label);
            setProgress({ ...p, label, fileIndex, fileCount, canCancel: true });
        };

        try {
            for (let i = 0; i < list.length; i++) {
                if (controller.signal.aborted) break;
                const file = list[i];
                report({ stage: 'opening', label: fileCount > 1 ? `Opening ${file.name}…` : 'Reading the invoice…', canCancel: true }, i);
                try {
                    const item = await openInvoiceFile(file, {
                        signal: controller.signal,
                        onProgress: p => report(p, i),
                    });
                    if (controller.signal.aborted) {
                        closeInvoice(item.invoice);
                        break;
                    }
                    opened.push(item);
                } catch (err) {
                    if (controller.signal.aborted || isAbortError(err)) break;
                    const message = err instanceof Error ? err.message : 'The invoice could not be read';
                    toast.error(fileCount > 1 ? `${file.name}: ${message}` : message);
                }
            }

            if (controller.signal.aborted) {
                for (const item of opened) closeInvoice(item.invoice);
                return;
            }

            if (opened.length > 0) {
                await onReadRef.current(opened);
            }
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                setReading(null);
                setProgress(null);
            }
        }
    }, []);

    const open = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';
            if (files.length === 0) return;
            await openFiles(files);
        },
        [openFiles],
    );

    return { reading, progress, open, openFiles, cancel };
}

/** The size of each page the invoice's text was read on (none for Word: its text is laid out by the reader) */
export function invoicePageSizes(invoice: LoadedInvoice): { w: number; h: number }[] | undefined {
    if (invoice.kind === 'pdf') {
        const swapped = invoice.rotation === 90 || invoice.rotation === 270;
        return swapped
            ? invoice.pdf.layout.pages.map(p => ({ w: p.h, h: p.w }))
            : invoice.pdf.layout.pages;
    }
    if (invoice.kind === 'image') return [invoice.size];
    return undefined;
}

/** A requisition to fill in by hand, starting from the remembered defaults */
export function blankSession(defaults: ChequeReqDefaults): EditorSession {
    return {
        key: crypto.randomUUID(),
        invoice: null,
        facts: NO_FACTS,
        draft: {
            form: {
                ...structuredClone(EMPTY_FORM),
                actionNumber: defaults.actionNumber,
                requestedBy: defaults.requestedBy,
                ...(defaults.approvedBy ? { approvedBy: defaults.approvedBy } : {}),
            },
            flags: {},
            meta: { ...EMPTY_META },
            sources: {},
        },
    };
}

/** Start a fresh requisition prefilled from a known supplier's latest requisition */
export function supplierSession(supplierRow: SavedChequeReq, defaults: ChequeReqDefaults): EditorSession {
    return {
        key: crypto.randomUUID(),
        invoice: null,
        facts: NO_FACTS,
        draft: draftFromSupplier(supplierRow, defaults),
    };
}

/** Lets go of the invoice shown beside a requisition that is closed */
export function closeInvoice(invoice: LoadedInvoice | null): void {
    if (invoice?.kind === 'pdf') void Promise.resolve(invoice.pdf.doc.loadingTask.destroy()).catch(() => {});
    if (invoice?.kind === 'image') URL.revokeObjectURL(invoice.url);
}

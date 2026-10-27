import { useState, type ChangeEvent } from 'react';
import { loadPdf } from '../PdfForms/pdfHooks';
import { toast } from '../../lib/toast';
import { extractInvoice } from '../../lib/chequeReq/extract';
import { invoiceKind, MAX_INVOICE_BYTES, readDocxInvoice } from '../../lib/chequeReq/read';
import { ocrPhrases, photoPage, readScan, scannedPdfPages, type OcrPage } from '../../lib/chequeReq/ocr';
import { EMPTY_FORM, EMPTY_META, type InvoiceFacts } from '../../lib/chequeReq/types';
import type { ChequeReqDefaults } from '../../lib/chequeReq/draft';
import type { Phrase } from '../../lib/pdfForms/types';
import type { EditorSession, LoadedInvoice } from './Editor';

// Shared by the admin page and the public one (/cheque): nothing here talks to the database.

export const NO_FACTS: InvoiceFacts = { hasText: false, supplier: {}, items: [], people: [], mentionsSicap: false };

/** A PDF with hardly any text is a scan (perhaps with a scanner's stamp): its pages are pictures to read */
function looksScanned(phrases: Phrase[]): boolean {
    return phrases.map(p => p.text).join('').replace(/[^\p{L}\p{N}]/gu, '').length < 100;
}

/**
 * The invoice drop: reads the chosen file in the browser (text, or OCR for a scan or photo),
 * then `onRead` makes the requisition from what was read. `reading` says what is being done.
 */
export function useOpenInvoice(onRead: (invoice: LoadedInvoice, facts: InvoiceFacts, fileName: string) => Promise<void> | void) {
    /** What is being done while an invoice is read, e.g. "Reading the scan… 40%" */
    const [reading, setReading] = useState<string | null>(null);

    const open = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const kind = invoiceKind(file);
        if (!kind) {
            toast.error('Choose the invoice as a PDF, a Word file (.docx) or a photo');
            return;
        }
        if (file.size > MAX_INVOICE_BYTES) {
            toast.error('The file is larger than 25 MB');
            return;
        }
        setReading('Reading the invoice…');
        try {
            let invoice: LoadedInvoice;
            let phrases: Phrase[] = [];
            let scanned = false;
            // Pictures (a scanned PDF's pages, a photo) are read by OCR; if that fails the
            // invoice still opens beside an empty requisition to fill in by hand
            let angles: number[] = [];
            const readPictures = async (pages: OcrPage[]) => {
                scanned = true;
                try {
                    const read = await readScan(pages, done => setReading(`Reading the scan… ${Math.round(done * 100)}%`));
                    angles = read.angles;
                    return ocrPhrases(read.pageSizes, read.items);
                } catch (err) {
                    toast.error(err instanceof Error ? `The scan could not be read: ${err.message}` : 'The scan could not be read');
                    return [];
                }
            };
            if (kind === 'pdf') {
                const pdf = await loadPdf(new Uint8Array(await file.arrayBuffer()));
                phrases = pdf.layout.phrases;
                if (looksScanned(phrases)) {
                    setReading('Reading the scan…');
                    phrases = await readPictures(await scannedPdfPages(pdf.doc));
                }
                invoice = { kind, pdf, fileName: file.name, angles };
            } else if (kind === 'docx') {
                phrases = await readDocxInvoice(await file.arrayBuffer());
                invoice = { kind, file, phrases, fileName: file.name };
            } else {
                setReading('Reading the photo…');
                const page = await photoPage(file);
                phrases = await readPictures([page]);
                invoice = { kind, url: URL.createObjectURL(file), fileName: file.name, size: { w: page.width, h: page.height }, angle: angles[0] ?? 0 };
            }
            await onRead(invoice, { ...extractInvoice(phrases), scanned }, file.name);
        } catch (err) {
            toast.error(err instanceof Error ? `The invoice could not be read: ${err.message}` : 'The invoice could not be read');
        } finally {
            setReading(null);
        }
    };

    return { reading, open };
}

/** A requisition to fill in by hand, starting from the remembered action number and name */
export function blankSession(defaults: ChequeReqDefaults): EditorSession {
    return {
        key: crypto.randomUUID(),
        invoice: null,
        facts: NO_FACTS,
        draft: { form: { ...structuredClone(EMPTY_FORM), actionNumber: defaults.actionNumber, requestedBy: defaults.requestedBy }, flags: {}, meta: { ...EMPTY_META } },
    };
}

/** Lets go of the invoice shown beside a requisition that is closed */
export function closeInvoice(invoice: LoadedInvoice | null): void {
    if (invoice?.kind === 'pdf') void invoice.pdf.doc.loadingTask.destroy();
    if (invoice?.kind === 'image') URL.revokeObjectURL(invoice.url);
}

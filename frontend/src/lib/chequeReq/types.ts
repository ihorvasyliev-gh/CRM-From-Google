// ─── Cheque requisitions: data model ───────────────────────────
// A supplier invoice is read in the browser (extract.ts) into InvoiceFacts; those, with what
// was used for the same supplier last time, make a draft of the SICAP cheque requisition form
// (draft.ts), which the person checks, edits and downloads as .docx (docx.ts).

import type { Rect } from '../pdfForms/types';

/** Everything printed on the SICAP cheque requisition */
export interface ChequeReqForm {
    actionNumber: string;
    nonSicapFunding: string;
    poNumber: string;
    payeeName: string;
    payeeAddress: string;
    /** Payment amount as shown, e.g. "4,260.00" */
    amount: string;
    description: string;
    requestedBy: string;
    /** YYYY-MM-DD or '' (a blank line on the form, to date by hand) */
    requestedDate: string;
    approvedBy: string;
    approvedDate: string;
    approvalEmailAttached: boolean;
    quoteDate: string;
    amountQuoted: string;
    quoteBy: Record<QuoteMethod, boolean>;
    shopName: string;
    quotePhone: string;
    quoteEmail: string;
    quoteContact: string;
    quoteWebsite: string;
    checklist: Record<ChecklistItem, boolean>;
}

export type QuoteMethod = 'shop' | 'telephone' | 'email' | 'meeting' | 'online';
export type ChecklistItem = 'taxClearance' | 'poAndSicap' | 'description' | 'approval' | 'quoteDetails';

/** Text fields of the form that can carry a note ("check this", "from last time") */
export type FieldKey = Exclude<keyof ChequeReqForm, 'quoteBy' | 'checklist' | 'approvalEmailAttached'>;

export const EMPTY_FORM: ChequeReqForm = {
    actionNumber: '',
    nonSicapFunding: '',
    poNumber: '',
    payeeName: '',
    payeeAddress: '',
    amount: '',
    description: '',
    requestedBy: '',
    requestedDate: '',
    approvedBy: '',
    approvedDate: '',
    approvalEmailAttached: false,
    quoteDate: '',
    amountQuoted: '',
    quoteBy: { shop: false, telephone: false, email: false, meeting: false, online: false },
    shopName: '',
    quotePhone: '',
    quoteEmail: '',
    quoteContact: '',
    quoteWebsite: '',
    checklist: { taxClearance: false, poAndSicap: false, description: false, approval: false, quoteDetails: false },
};

/**
 * How sure a value is:
 *  found   — read next to its label on the invoice
 *  memory  — as on the last requisition for this supplier
 *  check   — a best guess: shown in orange until the person edits or accepts it
 *  missing — needed but not found: shown in red
 */
export type FlagLevel = 'found' | 'memory' | 'check' | 'missing';

export interface FieldFlag {
    level: FlagLevel;
    note: string;
    /** Where on the invoice it was read (PDF points, origin bottom-left) */
    source?: Rect[];
}

export type FieldFlags = Partial<Record<FieldKey, FieldFlag>>;

/** A value read from the invoice, with where it was and whether its label was clear */
export interface Found<T = string> {
    value: T;
    sure: boolean;
    source?: Rect[];
    /** The invoice text it came from, e.g. "Reference PO Number: 9001" */
    from?: string;
}

export interface InvoiceItem {
    description: string;
    /** Lines under the item: dates, names of participants… */
    details: string[];
    quantity?: number;
    unitPrice?: number;
    amount?: number;
    source?: Rect[];
}

export interface SupplierFacts {
    name?: Found;
    address?: Found;
    email?: string;
    phone?: string;
    website?: string;
    vatNumber?: string;
    iban?: string;
    bic?: string;
}

export interface InvoiceFacts {
    /** Whether any text could be read from the file */
    hasText: boolean;
    /** Read off a picture (a scan or a photo): a letter or digit may have been misread */
    scanned?: boolean;
    invoiceNumber?: Found;
    /** YYYY-MM-DD */
    invoiceDate?: Found;
    dueDate?: Found;
    poNumber?: Found;
    total?: Found<number>;
    subtotal?: Found<number>;
    vat?: Found<number>;
    supplier: SupplierFacts;
    items: InvoiceItem[];
    /** Numbered names under an item ("1. Anna Smith"), e.g. course participants */
    people: string[];
    /** When the course / service ran, from the item lines */
    serviceDates?: { start: string; end?: string };
    /** "Attention: …" — who ordered it */
    attention?: string;
    mentionsSicap: boolean;
}

/** What is kept about a requisition besides the form: for history, duplicates and suppliers */
export interface ChequeReqMeta {
    invoiceNumber: string;
    /** YYYY-MM-DD or '' */
    invoiceDate: string;
    dueDate: string;
    /** Excluding VAT, for the €5,000 single-quote limit; null when unknown */
    netAmount: number | null;
    supplierVat: string;
    supplierIban: string;
    /** "acme" from info@acme.ie */
    supplierDomain: string;
    /** The item and date the description was built from, to build the next one the same way */
    item: string;
    serviceDate: string;
    fileName: string;
}

export const EMPTY_META: ChequeReqMeta = {
    invoiceNumber: '',
    invoiceDate: '',
    dueDate: '',
    netAmount: null,
    supplierVat: '',
    supplierIban: '',
    supplierDomain: '',
    item: '',
    serviceDate: '',
    fileName: '',
};

/** A requisition kept in the history (table cheque_requisitions, migration 88) */
export interface SavedChequeReq {
    id: string;
    supplier_name: string;
    invoice_number: string | null;
    invoice_date: string | null;
    amount: number | null;
    net_amount: number | null;
    form: ChequeReqForm;
    meta: ChequeReqMeta;
    created_at: string;
    updated_at: string;
}

export interface Check {
    level: 'warning' | 'info' | 'ok';
    text: string;
}

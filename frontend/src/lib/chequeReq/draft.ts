// ─── Cheque requisitions: from invoice facts to a filled-in form ───
// What the invoice says, plus what was used for the same supplier last time, makes the
// draft. Every value carries a note: where it came from, or why it needs a look.

import { bigramSimilarity } from '../pdfForms/text';
import { collapseSpaces, domainWord, dottedDate, findDates, formatAmount, parseAmount, slashDate, squash } from './parse';
import { EMPTY_FORM, EMPTY_META, type ChequeReqForm, type ChequeReqMeta, type Check, type FieldFlags, type InvoiceFacts, type SavedChequeReq } from './types';

/** Payments to one supplier in a year from which three quotations are needed (excl. VAT) */
export const THREE_QUOTES_FROM = 5000;

/** Remembered between requisitions on this computer (works before migration 88 too) */
export interface ChequeReqDefaults {
    actionNumber: string;
    requestedBy: string;
    /** The last description with its item and date as {item} and {date} */
    descriptionPattern: string;
}

export const EMPTY_DEFAULTS: ChequeReqDefaults = { actionNumber: '', requestedBy: '', descriptionPattern: '' };

const DEFAULTS_KEY = 'cheque_req_defaults';

export function readDefaults(): ChequeReqDefaults {
    try {
        const stored = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? 'null') as Partial<ChequeReqDefaults> | null;
        if (!stored || typeof stored !== 'object') return { ...EMPTY_DEFAULTS };
        return {
            actionNumber: typeof stored.actionNumber === 'string' ? stored.actionNumber : '',
            requestedBy: typeof stored.requestedBy === 'string' ? stored.requestedBy : '',
            descriptionPattern: typeof stored.descriptionPattern === 'string' ? stored.descriptionPattern : '',
        };
    } catch {
        return { ...EMPTY_DEFAULTS };
    }
}

/** After a download: this requisition's action number, name and description wording start the next one */
export function rememberDefaults(form: ChequeReqForm, meta: ChequeReqMeta): void {
    const previous = readDefaults();
    const next: ChequeReqDefaults = {
        actionNumber: form.actionNumber.trim() || previous.actionNumber,
        requestedBy: form.requestedBy.trim() || previous.requestedBy,
        descriptionPattern: descriptionPattern(form.description, meta.item, meta.serviceDate) ?? previous.descriptionPattern,
    };
    try {
        localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next));
    } catch {
        // storage unavailable: the next requisition just starts emptier
    }
}

// ─── Suppliers ─────────────────────────────────────────────────

const COMPANY_WORDS = /\b(?:ltd|limited|t\/a|trading\s+as|clg|dac|teo|plc|llp|inc|uc|company|co|the|and)\b|&/gi;

export function supplierKey(name: string): string {
    return squash(name.replace(COMPANY_WORDS, ' '));
}

interface SupplierIds {
    name: string;
    vat: string;
    iban: string;
    domain: string;
}

export function sameSupplier(a: SupplierIds, b: SupplierIds): boolean {
    if (a.vat && b.vat && squash(a.vat).replace(/^ie/, '') === squash(b.vat).replace(/^ie/, '')) return true;
    if (a.iban && b.iban && squash(a.iban) === squash(b.iban)) return true;
    if (a.domain && b.domain && a.domain === b.domain) return true;
    const ka = supplierKey(a.name);
    const kb = supplierKey(b.name);
    if (!ka || !kb) return false;
    return ka === kb || bigramSimilarity(ka, kb) >= 0.8;
}

function idsOfSaved(r: SavedChequeReq): SupplierIds {
    return { name: r.supplier_name || r.form.payeeName, vat: r.meta?.supplierVat ?? '', iban: r.meta?.supplierIban ?? '', domain: r.meta?.supplierDomain ?? '' };
}

export function idsOf(form: ChequeReqForm, meta: ChequeReqMeta): SupplierIds {
    return { name: form.payeeName, vat: meta.supplierVat, iban: meta.supplierIban, domain: meta.supplierDomain };
}

/** The most recent requisition for this supplier (history is newest first) */
export function previousForSupplier(ids: SupplierIds, history: SavedChequeReq[], excludeId?: string): SavedChequeReq | undefined {
    return history.find(r => r.id !== excludeId && sameSupplier(ids, idsOfSaved(r)));
}

// ─── Description ───────────────────────────────────────────────

/** "Static and Retail QQI Level 4 course 01.10.2026 for IP and TP Clients" → "{item} course {date} for IP and TP Clients" */
export function descriptionPattern(description: string, item: string, serviceDate: string): string | null {
    const d = collapseSpaces(description);
    if (!item || !d.includes(item)) return null;
    let pattern = d.replace(item, '{item}');
    if (serviceDate) pattern = pattern.replace(dottedDate(serviceDate), '{date}');
    // Another date left in it would be copied onto every future requisition
    if (pattern === '{item}' || findDates(pattern.replace('{date}', '')).length > 0) return null;
    return pattern;
}

export function buildDescription(item: string, serviceDate: string, pattern: string | null): string {
    const date = serviceDate ? dottedDate(serviceDate) : '';
    if (pattern && item) {
        return collapseSpaces(pattern.replace('{item}', item).replace('{date}', date)).replace(/\s+([,.;])/g, '$1');
    }
    return [item, date].filter(Boolean).join(' ');
}

// ─── The draft ─────────────────────────────────────────────────

export interface DraftInput {
    facts: InvoiceFacts;
    history: SavedChequeReq[];
    defaults: ChequeReqDefaults;
    fileName: string;
}

export interface Draft {
    form: ChequeReqForm;
    flags: FieldFlags;
    meta: ChequeReqMeta;
    /** The requisition this supplier's details were taken from */
    previous?: SavedChequeReq;
}

function sinceLabel(r: SavedChequeReq): string {
    return r.invoice_number ? `your requisition for ${r.invoice_number}` : 'your last requisition for this supplier';
}

export function draftFromInvoice({ facts, history, defaults, fileName }: DraftInput): Draft {
    const form: ChequeReqForm = structuredClone(EMPTY_FORM);
    const flags: FieldFlags = {};
    const s = facts.supplier;
    const net = facts.subtotal?.value ?? (facts.total && facts.vat ? facts.total.value - facts.vat.value : facts.total?.value ?? null);
    const firstItem = facts.items.find(i => i.description)?.description ?? '';
    const meta: ChequeReqMeta = {
        ...EMPTY_META,
        invoiceNumber: facts.invoiceNumber?.value ?? '',
        invoiceDate: facts.invoiceDate?.value ?? '',
        dueDate: facts.dueDate?.value ?? '',
        netAmount: net === null ? null : Math.round(net * 100) / 100,
        supplierVat: s.vatNumber ?? '',
        supplierIban: s.iban ?? '',
        supplierDomain: domainWord(s.email ?? s.website ?? '') ?? '',
        item: firstItem,
        serviceDate: facts.serviceDates?.start ?? '',
        fileName,
    };

    const previous = previousForSupplier({ name: s.name?.value ?? '', vat: meta.supplierVat, iban: meta.supplierIban, domain: meta.supplierDomain }, history);
    const fromLast = previous ? `As on ${sinceLabel(previous)}` : '';

    // Payee: last time's spelling wins (it was checked then); else the invoice's
    if (previous?.form.payeeName) {
        form.payeeName = previous.form.payeeName;
        form.payeeAddress = previous.form.payeeAddress;
        flags.payeeName = { level: 'memory', note: fromLast, source: s.name?.source };
        flags.payeeAddress = { level: 'memory', note: fromLast, source: s.address?.source };
    } else {
        if (s.name) {
            form.payeeName = s.name.value;
            flags.payeeName = s.name.sure
                ? { level: 'found', note: 'From the invoice', source: s.name.source }
                : { level: 'check', note: 'Best guess from the invoice: check the spelling and that this is who gets paid', source: s.name.source };
        } else {
            flags.payeeName = { level: 'missing', note: 'Couldn’t tell who sent the invoice' };
        }
        if (s.address) {
            form.payeeAddress = s.address.value;
            flags.payeeAddress = s.address.sure ? { level: 'found', note: 'From the invoice', source: s.address.source } : { level: 'check', note: 'Best guess from the invoice', source: s.address.source };
        } else {
            flags.payeeAddress = { level: 'missing', note: 'No address found on the invoice' };
        }
    }

    if (facts.poNumber) {
        form.poNumber = facts.poNumber.value;
        flags.poNumber = { level: 'found', note: `From the invoice: “${facts.poNumber.from ?? facts.poNumber.value}”`, source: facts.poNumber.source };
    } else {
        flags.poNumber = { level: 'missing', note: 'No PO number on the invoice' };
    }

    if (facts.total) {
        form.amount = formatAmount(facts.total.value);
        form.amountQuoted = form.amount;
        flags.amount = facts.total.sure
            ? { level: 'found', note: `Invoice total${facts.vat ? ' incl. VAT' : ''}`, source: facts.total.source }
            : { level: 'check', note: `Read from “${facts.total.from ?? 'the invoice'}”: check it is the total to pay`, source: facts.total.source };
    } else {
        flags.amount = { level: 'missing', note: 'No total found on the invoice' };
    }

    // Description: built the way the last one was ({item} course {date} for …)
    const ownPattern = previous ? descriptionPattern(previous.form.description, previous.meta?.item ?? '', previous.meta?.serviceDate ?? '') : null;
    const pattern = ownPattern ?? (defaults.descriptionPattern || null);
    form.description = buildDescription(firstItem, meta.serviceDate, pattern);
    if (!form.description) flags.description = { level: 'missing', note: 'Say what was bought: the course or service, and its date' };
    else if (ownPattern) flags.description = { level: 'memory', note: `Worded like ${sinceLabel(previous!)}`, source: facts.items[0]?.source };
    else flags.description = { level: 'check', note: pattern ? 'Worded like your last requisition: check it fits' : 'From the invoice lines: add what it was for, if needed', source: facts.items[0]?.source };

    const action = previous?.form.actionNumber || defaults.actionNumber;
    form.actionNumber = action;
    flags.actionNumber = action
        ? { level: previous?.form.actionNumber ? 'memory' : 'check', note: previous?.form.actionNumber ? fromLast : 'As on your last requisition' }
        : { level: 'missing', note: 'Which SICAP action pays for this?' };
    if (previous?.form.nonSicapFunding) {
        form.nonSicapFunding = previous.form.nonSicapFunding;
        flags.nonSicapFunding = { level: 'memory', note: fromLast };
    }

    if (defaults.requestedBy) {
        form.requestedBy = defaults.requestedBy;
    } else if (facts.attention) {
        form.requestedBy = facts.attention;
        flags.requestedBy = { level: 'check', note: `“Attention: ${facts.attention}” on the invoice` };
    }

    // Quote details: the supplier's contact from last time, else the invoice's
    if (previous) {
        const p = previous.form;
        form.quoteBy = { ...p.quoteBy };
        form.shopName = p.shopName;
        form.quotePhone = p.quotePhone;
        form.quoteEmail = p.quoteEmail;
        form.quoteContact = p.quoteContact;
        form.quoteWebsite = p.quoteWebsite;
        for (const key of ['shopName', 'quotePhone', 'quoteEmail', 'quoteContact', 'quoteWebsite'] as const) {
            if (p[key]) flags[key] = { level: 'memory', note: fromLast };
        }
    } else {
        if (s.phone) {
            form.quotePhone = s.phone;
            flags.quotePhone = { level: 'check', note: 'The phone number on the invoice: is it who gave the quote?' };
        }
        if (s.email) {
            form.quoteEmail = s.email;
            flags.quoteEmail = { level: 'check', note: 'The email on the invoice: is it who gave the quote?' };
        }
    }
    return { form, flags, meta, previous };
}

// ─── Checks ────────────────────────────────────────────────────

function euro(value: number): string {
    return `€${formatAmount(value)}`;
}

/** What the invoice itself shows that needs attention (or is reassuring) */
export function invoiceChecks(facts: InvoiceFacts, today: string): Check[] {
    const checks: Check[] = [];
    if (!facts.hasText) {
        checks.push({ level: 'warning', text: 'No text could be read from this file (a scan or a photo?). Type the details from the invoice.' });
        return checks;
    }
    if (!facts.poNumber) checks.push({ level: 'warning', text: 'No PO number on the invoice. The checklist asks for the PO number and “SICAP” on the invoice.' });
    if (!facts.mentionsSicap) checks.push({ level: 'warning', text: '“SICAP” is not written on the invoice (checklist: PO Number and “SICAP” on Invoice).' });

    for (const item of facts.items) {
        if (item.quantity !== undefined && item.unitPrice !== undefined && item.amount !== undefined && Math.abs(item.quantity * item.unitPrice - item.amount) > 0.01) {
            checks.push({ level: 'warning', text: `“${item.description}”: ${item.quantity} × ${euro(item.unitPrice)} is ${euro(item.quantity * item.unitPrice)}, but the line says ${euro(item.amount)}.` });
        }
    }
    const priced = facts.items.filter(i => i.amount !== undefined);
    const base = facts.subtotal?.value ?? (facts.total ? facts.total.value - (facts.vat?.value ?? 0) : null);
    if (priced.length > 0 && base !== null) {
        const sum = priced.reduce((s, i) => s + (i.amount ?? 0), 0);
        if (Math.abs(sum - base) > 0.01) checks.push({ level: 'warning', text: `The invoice lines add up to ${euro(sum)}, but its ${facts.subtotal ? 'subtotal' : 'total'} is ${euro(base)}.` });
    }

    const quantity = facts.items.reduce((s, i) => s + (i.quantity ?? 0), 0);
    if (facts.people.length >= 2 && quantity > 0) {
        if (facts.people.length !== quantity) checks.push({ level: 'warning', text: `${facts.people.length} people are named on the invoice, but it charges for ${quantity}.` });
        else checks.push({ level: 'ok', text: `${facts.people.length} people named, matching the quantity charged.` });
    }
    if (facts.total?.sure) checks.push({ level: 'ok', text: `Total ${euro(facts.total.value)}${facts.subtotal || facts.items.length ? ', matching the invoice lines' : ''}.` });

    if (facts.dueDate) {
        if (facts.dueDate.value < today) checks.push({ level: 'warning', text: `The due date (${slashDate(facts.dueDate.value)}) has passed.` });
        else checks.push({ level: 'info', text: `Due by ${slashDate(facts.dueDate.value)}.` });
    }
    return checks;
}

/** Checks against earlier requisitions: the same invoice twice, and the €5,000 a year rule */
export function historyChecks(form: ChequeReqForm, meta: ChequeReqMeta, history: SavedChequeReq[], editingId: string | undefined, today: string): Check[] {
    const checks: Check[] = [];
    const ids = idsOf(form, meta);
    if (!ids.name && !ids.vat && !ids.iban && !ids.domain) return checks;
    const others = history.filter(r => r.id !== editingId && sameSupplier(ids, idsOfSaved(r)));
    const invoice = squash(meta.invoiceNumber);
    const twin = invoice ? others.find(r => squash(r.invoice_number ?? '') === invoice) : undefined;
    if (twin) {
        checks.push({ level: 'warning', text: `You already made a requisition for ${twin.invoice_number} from this supplier (${slashDate(twin.created_at.slice(0, 10))}).` });
    }

    const net = meta.netAmount ?? parseAmount(form.amount);
    const year = (meta.invoiceDate || today).slice(0, 4);
    const sameYear = others.filter(r => r !== twin && (r.invoice_date ?? r.created_at).slice(0, 4) === year);
    const before = sameYear.reduce((s, r) => s + (r.net_amount ?? r.amount ?? 0), 0);
    const total = before + (net ?? 0);
    if (net !== null && net >= THREE_QUOTES_FROM) {
        checks.push({ level: 'warning', text: `This invoice is ${euro(net)} excl. VAT: from ${euro(THREE_QUOTES_FROM)} a year to one supplier you need three quotations and the 3 quotes form.` });
    } else if (total >= THREE_QUOTES_FROM) {
        checks.push({ level: 'warning', text: `With this invoice, payments to this supplier in ${year} come to ${euro(total)} excl. VAT: from ${euro(THREE_QUOTES_FROM)} you need three quotations and the 3 quotes form.` });
    } else if (sameYear.length > 0) {
        checks.push({ level: 'info', text: `This supplier in ${year}: ${euro(total)} excl. VAT with this invoice (${sameYear.length} earlier requisition${sameYear.length === 1 ? '' : 's'}). A single quotation is enough below ${euro(THREE_QUOTES_FROM)}.` });
    }
    return checks;
}

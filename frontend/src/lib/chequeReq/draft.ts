// ─── Cheque requisitions: from invoice facts to a filled-in form ───
// What the invoice says, plus what was used for the same supplier last time, makes the
// draft. Every value carries a note: where it came from, or why it needs a look.

import { bigramSimilarity } from '../pdfForms/text';
import type { Phrase } from '../pdfForms/types';
import { collapseSpaces, domainWord, dottedDate, findDates, formatAmount, parseAmount, phoneKey, slashDate, squash } from './parse';
import { isPlaceField, readPlaces } from './pick';
import {
    EMPTY_FORM,
    EMPTY_META,
    type ChecklistItem,
    type ChequeReqForm,
    type ChequeReqMeta,
    type ChequeReqStatus,
    type Check,
    type FieldFlags,
    type FieldKey,
    type FieldSources,
    type InvoiceFacts,
    type PlaceField,
    type QuoteMethod,
    type SavedChequeReq,
    type SupplierSummary,
} from './types';

/** Payments to one supplier in a year from which three quotations are needed (excl. VAT) */
export const THREE_QUOTES_FROM = 5000;
/** 80% of the €5,000 threshold: flag suppliers approaching the 3-quotes limit */
export const APPROACHING_QUOTES_FROM = 4000;

/** Remembered between requisitions on this computer (works before migration 88 too) */
export interface ChequeReqDefaults {
    actionNumber: string;
    requestedBy: string;
    /** The last description with its item and date as {item} and {date} */
    descriptionPattern: string;
    approvedBy?: string;
    /** Coordinator-configured description templates for quick insertion */
    descriptionPresets?: string[];
}

export const EMPTY_DEFAULTS: ChequeReqDefaults = { actionNumber: '', requestedBy: '', descriptionPattern: '' };

const DEFAULTS_KEY = 'cheque_req_defaults';
/** The public page (/cheque) keeps its own: a coordinator's details never start a stranger's requisition */
export const PUBLIC_DEFAULTS_KEY = 'cheque_req_public_defaults';

export function readDefaults(key = DEFAULTS_KEY): ChequeReqDefaults {
    try {
        const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<ChequeReqDefaults> | null;
        if (!stored || typeof stored !== 'object') return { ...EMPTY_DEFAULTS };
        const approvedBy = typeof stored.approvedBy === 'string' ? stored.approvedBy.trim() : '';
        const descriptionPresets = Array.isArray(stored.descriptionPresets)
            ? stored.descriptionPresets.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map(p => p.trim())
            : [];
        return {
            actionNumber: typeof stored.actionNumber === 'string' ? stored.actionNumber : '',
            requestedBy: typeof stored.requestedBy === 'string' ? stored.requestedBy : '',
            // Wording kept before it had to be short and general is not carried on
            descriptionPattern: typeof stored.descriptionPattern === 'string' && generalWording(stored.descriptionPattern) ? stored.descriptionPattern : '',
            ...(approvedBy ? { approvedBy } : {}),
            ...(descriptionPresets.length ? { descriptionPresets } : {}),
        };
    } catch {
        return { ...EMPTY_DEFAULTS };
    }
}

/** Save explicit coordinator defaults and description presets from the Defaults modal */
export function saveDefaults(defaults: ChequeReqDefaults, key = DEFAULTS_KEY): void {
    const approvedBy = typeof defaults.approvedBy === 'string' ? defaults.approvedBy.trim() : '';
    const descriptionPresets = Array.isArray(defaults.descriptionPresets)
        ? [...new Set(defaults.descriptionPresets.map(p => p.trim()).filter(Boolean))]
        : [];
    const trimmedPattern = defaults.descriptionPattern.trim();
    const cleaned: ChequeReqDefaults = {
        actionNumber: defaults.actionNumber.trim(),
        requestedBy: defaults.requestedBy.trim(),
        descriptionPattern: trimmedPattern && generalWording(trimmedPattern) ? trimmedPattern : '',
        ...(approvedBy ? { approvedBy } : {}),
        ...(descriptionPresets.length ? { descriptionPresets } : {}),
    };
    try {
        localStorage.setItem(key, JSON.stringify(cleaned));
    } catch {
        // storage unavailable
    }
}

/** After a download: this requisition's action number, name and description wording start the next one */
export function rememberDefaults(form: ChequeReqForm, meta: ChequeReqMeta, key = DEFAULTS_KEY): void {
    const previous = readDefaults(key);
    const approvedBy = form.approvedBy.trim() || previous.approvedBy || '';
    const next: ChequeReqDefaults = {
        actionNumber: form.actionNumber.trim() || previous.actionNumber,
        requestedBy: form.requestedBy.trim() || previous.requestedBy,
        descriptionPattern: descriptionPattern(form.description, meta.item, meta.serviceDate) ?? previous.descriptionPattern,
        ...(approvedBy ? { approvedBy } : {}),
        ...(previous.descriptionPresets?.length ? { descriptionPresets: previous.descriptionPresets } : {}),
    };
    try {
        localStorage.setItem(key, JSON.stringify(next));
    } catch {
        // storage unavailable: the next requisition just starts emptier
    }
}

// ─── Suppliers ─────────────────────────────────────────────────

const COMPANY_WORDS = /\b(?:ltd|limited|t\/a|trading\s+as|clg|dac|teo|plc|llp|inc|uc|company|co|the|and)\b|&/gi;

export function supplierKey(name: string): string {
    return squash(name.replace(COMPANY_WORDS, ' '));
}

export interface SupplierIds {
    name: string;
    vat: string;
    iban: string;
    domain: string;
    email?: string;
    phone?: string;
}

/** Why two invoices are taken for one supplier's, said on the values brought over from last time */
export type SupplierMatch = 'vat' | 'iban' | 'domain' | 'email' | 'phone' | 'name';

const MATCH_LABEL: Record<SupplierMatch, string> = {
    vat: 'the same VAT number',
    iban: 'the same IBAN',
    domain: 'the same email or website',
    email: 'the same email address',
    phone: 'the same phone number',
    name: 'the same name',
};

export function supplierMatch(a: SupplierIds, b: SupplierIds): SupplierMatch | null {
    const vat = (v: string) => squash(v).replace(/^ie/, '');
    if (a.vat && b.vat && vat(a.vat) === vat(b.vat)) return 'vat';
    if (a.iban && b.iban && squash(a.iban) === squash(b.iban)) return 'iban';
    // Two VAT numbers or two IBANs that differ are two suppliers, whatever else they share
    if ((a.vat && b.vat) || (a.iban && b.iban)) return null;
    if (a.domain && b.domain && a.domain === b.domain) return 'domain';
    // The same email address or phone number (a gmail address, a name read differently)
    if (a.email && b.email && a.email.trim().toLowerCase() === b.email.trim().toLowerCase()) return 'email';
    const phone = phoneKey(a.phone ?? '');
    if (phone && phone === phoneKey(b.phone ?? '')) return 'phone';
    const ka = supplierKey(a.name);
    const kb = supplierKey(b.name);
    if (!ka || !kb) return null;
    return ka === kb || bigramSimilarity(ka, kb) >= 0.8 ? 'name' : null;
}

export function sameSupplier(a: SupplierIds, b: SupplierIds): boolean {
    return supplierMatch(a, b) !== null;
}

export function idsOfSaved(r: SavedChequeReq): SupplierIds {
    return { ...idsOf(r.form, r.meta ?? EMPTY_META), name: r.supplier_name || r.form.payeeName };
}

/** The quote's email and phone are the supplier's too (on requisitions kept before their own were) */
export function idsOf(form: ChequeReqForm, meta: ChequeReqMeta): SupplierIds {
    return {
        name: form.payeeName,
        vat: meta.supplierVat ?? '',
        iban: meta.supplierIban ?? '',
        domain: meta.supplierDomain ?? '',
        email: meta.supplierEmail || form.quoteEmail,
        phone: meta.supplierPhone || form.quotePhone,
    };
}

/** The most recent requisition for this supplier (history is newest first) */
export function previousForSupplier(ids: SupplierIds, history: SavedChequeReq[], excludeId?: string): SavedChequeReq | undefined {
    return history.find(r => r.id !== excludeId && sameSupplier(ids, idsOfSaved(r)));
}

/** "your requisition for INV-3209 (Greenleaf Catering, the same phone number)": whose it was and why it was taken */
function matchedLabel(r: SavedChequeReq, ids: SupplierIds): string {
    const match = supplierMatch(ids, idsOfSaved(r));
    const name = r.supplier_name || r.form.payeeName;
    const why = [match !== 'name' && name ? name : '', match ? MATCH_LABEL[match] : ''].filter(Boolean).join(', ');
    return why ? `${sinceLabel(r)} (${why})` : sinceLabel(r);
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
    return generalWording(pattern) ? pattern : null;
}

/** Most words a learnt wording may add around the item and date ("course … for IP and TP Clients") */
const MAX_PATTERN_WORDS = 8;

/**
 * Wording that fits the next requisition too: a few words such as "course {date} for IP and TP
 * Clients". Sentences typed about one event (how many came, what was served) are not: no
 * second sentence, no numbers, a few words at most.
 */
export function generalWording(pattern: string): boolean {
    const added = collapseSpaces(pattern.replace('{item}', ' ').replace('{date}', ' '));
    if (!added) return true;
    if (/\d/.test(added)) return false;
    if (/[.!?;:]\s*\S/.test(added)) return false;
    return added.split(' ').filter(w => /\w/.test(w)).length <= MAX_PATTERN_WORDS;
}

/** `days`: a course run on separate days, all of them listed */
export function buildDescription(item: string, serviceDate: string, pattern: string | null, days: string[] = []): string {
    // A date the invoice line already gives ("Manual Handling course 14.10.2026") is not added again
    const named = new Set(findDates(item).map(d => d.iso));
    const dates = (days.length > 1 ? days : serviceDate ? [serviceDate] : []).filter(d => !named.has(d));
    const date = dates.map(dottedDate).join(', ');
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
    /** The invoice's text, to read values where they were picked on the supplier's last invoice */
    phrases?: Phrase[];
    pageSizes?: { w: number; h: number }[];
}

export interface Draft {
    form: ChequeReqForm;
    flags: FieldFlags;
    meta: ChequeReqMeta;
    /** Preserved highlight regions on the invoice, kept even after flags are accepted */
    sources?: FieldSources;
    /** The requisition this supplier's details were taken from */
    previous?: SavedChequeReq;
}

function sinceLabel(r: SavedChequeReq): string {
    return r.invoice_number ? `your requisition for ${r.invoice_number}` : 'your last requisition for this supplier';
}

export function draftFromInvoice({ facts, history, defaults, fileName, phrases, pageSizes }: DraftInput): Draft {
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
        supplierEmail: s.email ?? '',
        supplierPhone: s.phone ?? '',
        item: firstItem,
        serviceDate: facts.serviceDates?.start ?? '',
        fileName,
    };

    const ids: SupplierIds = { name: s.name?.value ?? '', vat: meta.supplierVat, iban: meta.supplierIban, domain: meta.supplierDomain, email: meta.supplierEmail, phone: meta.supplierPhone };
    const previous = previousForSupplier(ids, history);
    // The payee says whose requisition it was and why: a wrong match is seen at once
    const fromLast = previous ? `As on ${sinceLabel(previous)}` : '';
    const fromMatched = previous ? `As on ${matchedLabel(previous, ids)}` : '';
    // What was picked by hand on the supplier's last invoice is read in the same places on this one
    meta.places = previous?.meta?.places ?? {};
    const picked = previous && phrases ? readPlaces(meta.places, phrases, pageSizes) : {};
    const pickedNote = previous ? `Read where you picked it on ${sinceLabel(previous)}` : '';
    const pickedLevel = facts.scanned ? 'check' : 'memory';

    // Payee: last time's spelling wins (it was checked then); else the invoice's
    if (previous?.form.payeeName) {
        form.payeeName = previous.form.payeeName;
        form.payeeAddress = previous.form.payeeAddress;
        // Taken for the same supplier by a contact alone, under a name the invoice doesn't give: worth a look
        const match = supplierMatch(ids, idsOfSaved(previous));
        const otherName = !!s.name && (match === 'domain' || match === 'email' || match === 'phone')
            && bigramSimilarity(supplierKey(s.name.value), supplierKey(previous.supplier_name || previous.form.payeeName)) < 0.5;
        flags.payeeName = otherName
            ? { level: 'check', note: `${fromMatched}. The invoice says “${s.name!.value}”: check it is the same supplier`, source: s.name?.source }
            : { level: 'memory', note: fromMatched, source: s.name?.source };
        flags.payeeAddress = { level: 'memory', note: fromLast, source: s.address?.source };
    } else {
        if (s.name) {
            form.payeeName = s.name.value;
            flags.payeeName = s.name.sure
                ? { level: 'found', note: /payable/i.test(s.name.from ?? '') ? `The invoice says: “${s.name.from}”` : 'From the invoice', source: s.name.source }
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

    const pickedPo = picked.poNumber;
    if (pickedPo && !(facts.poNumbers ?? [facts.poNumber?.value ?? '']).some(n => squash(n) === squash(pickedPo.value))) {
        form.poNumber = pickedPo.value;
        flags.poNumber = { level: pickedLevel, note: facts.poNumber ? `${pickedNote} (the invoice reading found “${facts.poNumber.value}”)` : pickedNote, source: pickedPo.source };
    } else if (facts.poNumber) {
        form.poNumber = facts.poNumber.value;
        flags.poNumber = { level: 'found', note: `From the invoice: “${facts.poNumber.from ?? facts.poNumber.value}”`, source: facts.poNumber.source };
    } else {
        flags.poNumber = { level: 'missing', note: 'No PO number on the invoice' };
    }

    const pickedAmount = picked.amount ? parseAmount(picked.amount.value) : null;
    if (pickedAmount !== null && (!facts.total || Math.abs(facts.total.value - pickedAmount) > 0.005)) {
        form.amount = formatAmount(pickedAmount);
        form.amountQuoted = form.amount;
        flags.amount = { level: pickedLevel, note: facts.total ? `${pickedNote} (the invoice reading found €${formatAmount(facts.total.value)})` : pickedNote, source: picked.amount?.source };
    } else if (facts.total) {
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
    const pickedItem = picked.description && squash(picked.description.value) !== squash(firstItem) ? picked.description : undefined;
    if (pickedItem) meta.item = pickedItem.value;
    form.description = buildDescription(meta.item, meta.serviceDate, pattern, facts.serviceDates?.days);
    if (pickedItem) flags.description = { level: pickedLevel, note: `The item where you picked it on ${sinceLabel(previous!)}${ownPattern ? ', worded like that requisition' : ''}`, source: pickedItem.source };
    else if (!form.description) flags.description = { level: 'missing', note: 'Say what was bought: the course or service, and its date' };
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
    if (defaults.approvedBy) {
        form.approvedBy = defaults.approvedBy;
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

    // Read off a picture: a letter or digit may be wrong, so nothing found is taken as certain
    if (facts.scanned) {
        for (const key of Object.keys(flags) as FieldKey[]) {
            const flag = flags[key];
            if (flag?.level === 'found') flags[key] = { ...flag, level: 'check', note: `${flag.note} (read from a scan: check it against the invoice)` };
        }
    }

    // Preserve highlight regions for every flagged field and invoice metadata field even after flags are accepted
    const sources: FieldSources = {};
    for (const key of Object.keys(flags) as FieldKey[]) {
        const src = flags[key]?.source;
        if (src?.length) sources[key] = src;
    }
    if (form.amountQuoted && flags.amount?.source?.length) sources.amountQuoted = flags.amount.source;
    if (facts.invoiceNumber?.source?.length) sources.invoiceNumber = facts.invoiceNumber.source;
    if (facts.invoiceDate?.source?.length) sources.invoiceDate = facts.invoiceDate.source;
    if (facts.dueDate?.source?.length) sources.dueDate = facts.dueDate.source;
    const netSource = facts.subtotal?.source ?? facts.total?.source;
    if (netSource?.length) sources.netAmount = netSource;

    return { form, flags, meta, sources, previous };
}

// ─── Checks ────────────────────────────────────────────────────

/** The highest VAT rate in Ireland */
const MAX_VAT = 0.23;

/**
 * What counts toward the €5,000 a year (excl. VAT): the invoice's net while it can be the net of
 * the payment (no more than it, no less than it less 23% VAT); else the payment itself, typed
 * over a misread total.
 */
export function netOfPayment(amount: number | null, net: number | null): number | null {
    if (amount === null || net === null) return net ?? amount;
    return net <= amount + 0.005 && net >= amount / (1 + MAX_VAT) - 0.005 ? net : amount;
}

function euro(value: number): string {
    return `€${formatAmount(value)}`;
}

/** What the invoice itself shows that needs attention (or is reassuring) */
export function invoiceChecks(facts: InvoiceFacts, today: string): Check[] {
    const checks: Check[] = [];
    if (!facts.hasText) {
        checks.push({
            level: 'warning',
            text: facts.scanned
                ? 'No text could be read from the picture (is it sharp, and the right way up?). Type the details from the invoice.'
                : 'No text could be read from this file. Type the details from the invoice.',
        });
        return checks;
    }
    if (facts.scanned) checks.push({ level: 'info', text: 'Read from a scan or photo: letters and digits can be misread, so every value is marked to check.' });
    if (!facts.poNumber) checks.push({ level: 'warning', text: 'No PO number on the invoice. The checklist asks for the PO number and “SICAP” on the invoice.' });
    if (facts.poNumbers && facts.poNumbers.length > 1) checks.push({ level: 'info', text: `${facts.poNumbers.length} PO numbers on this invoice (${facts.poNumbers.join(', ')}): all of them are on the requisition.` });
    if (!facts.mentionsSicap) checks.push({ level: 'warning', text: '“SICAP” is not written on the invoice (checklist: PO Number and “SICAP” on Invoice).' });

    for (const item of facts.items) {
        if (item.quantity !== undefined && item.unitPrice !== undefined && item.amount !== undefined && Math.abs(item.quantity * item.unitPrice - item.amount) > 0.01) {
            checks.push({ level: 'warning', text: `“${item.description}”: ${item.quantity} × ${euro(item.unitPrice)} is ${euro(item.quantity * item.unitPrice)}, but the line says ${euro(item.amount)}.` });
        }
    }
    const priced = facts.items.filter(i => i.amount !== undefined);
    const base = facts.subtotal?.value ?? (facts.total ? facts.total.value - (facts.vat?.value ?? 0) : null);
    const sum = priced.reduce((s, i) => s + (i.amount ?? 0), 0);
    const linesAddUp = priced.length > 0 && base !== null && Math.abs(sum - base) <= 0.01;
    if (priced.length > 0 && base !== null && !linesAddUp) {
        checks.push({ level: 'warning', text: `The invoice lines add up to ${euro(sum)}, but its ${facts.subtotal ? 'subtotal' : 'total'} is ${euro(base)}.` });
    }

    const quantity = facts.items.reduce((s, i) => s + (i.quantity ?? 0), 0);
    if (facts.people.length >= 2 && quantity > 0) {
        if (facts.people.length !== quantity) checks.push({ level: 'warning', text: `${facts.people.length} people are named on the invoice, but it charges for ${quantity}.` });
        else checks.push({ level: 'ok', text: `${facts.people.length} people named, matching the quantity charged.` });
    }
    if (facts.total?.sure && (linesAddUp || priced.length === 0)) checks.push({ level: 'ok', text: `Total ${euro(facts.total.value)}${linesAddUp ? ', matching the invoice lines' : ''}.` });

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
    if (!ids.name && !ids.vat && !ids.iban && !ids.domain && !ids.email && !ids.phone) return checks;
    const others = history.filter(r => r.id !== editingId && sameSupplier(ids, idsOfSaved(r)));
    const invoice = squash(meta.invoiceNumber);
    const twin = invoice ? others.find(r => squash(r.invoice_number ?? '') === invoice) : undefined;
    if (twin) {
        checks.push({
            level: 'warning',
            text: `You already made a requisition for ${twin.invoice_number} from this supplier (${slashDate(twin.created_at.slice(0, 10))}).`,
            relatedId: twin.id,
        });
    }

    const net = netOfPayment(parseAmount(form.amount), meta.netAmount);
    const year = (meta.invoiceDate || today).slice(0, 4);
    const sameYear = others.filter(r => r !== twin && (r.invoice_date ?? r.created_at).slice(0, 4) === year);
    const before = sameYear.reduce((s, r) => s + (netOfPayment(r.amount, r.net_amount) ?? 0), 0);
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

// ─── Workflow metadata & supplier roll-ups ─────────────────────

export function getReqStatus(r: SavedChequeReq): ChequeReqStatus {
    return r.status ?? r.meta?.status ?? 'ready';
}

export function getReqChequeNumber(r: SavedChequeReq): string {
    return r.cheque_number || r.meta?.chequeNumber || '';
}

export function getReqNotes(r: SavedChequeReq): string {
    return r.notes || r.meta?.notes || '';
}

function supplierConflict(a: SupplierIds, b: SupplierIds): boolean {
    const vat = (v: string) => squash(v).replace(/^ie/, '');
    if (a.vat && b.vat && vat(a.vat) !== vat(b.vat)) return true;
    if (a.iban && b.iban && squash(a.iban) !== squash(b.iban)) return true;
    return false;
}

const PLACE_ORDER: PlaceField[] = ['poNumber', 'amount', 'description'];

/**
 * Group saved requisitions by supplier (with transitive check against group members) and
 * total their net (excl. VAT) and gross spend against the €5,000 3-quotes threshold.
 */
export function suppliersSummary(rows: SavedChequeReq[], year: string | 'all'): SupplierSummary[] {
    const filtered = year === 'all'
        ? [...rows]
        : rows.filter(r => (r.invoice_date || r.created_at).slice(0, 4) === year);
    filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));

    interface Group {
        rows: SavedChequeReq[];
        ids: SupplierIds[];
    }
    const groups: Group[] = [];
    for (const row of filtered) {
        const rowIds = idsOfSaved(row);
        const matching: Group[] = [];
        for (const group of groups) {
            if (group.ids.some(m => supplierConflict(rowIds, m))) continue;
            if (group.ids.some(m => sameSupplier(rowIds, m))) matching.push(group);
        }
        if (matching.length === 0) {
            groups.push({ rows: [row], ids: [rowIds] });
        } else {
            const target = matching[0];
            target.rows.push(row);
            target.ids.push(rowIds);
            for (let i = 1; i < matching.length; i++) {
                const other = matching[i];
                const hasConflict = target.ids.some(a => other.ids.some(b => supplierConflict(a, b)));
                if (hasConflict) continue;
                target.rows.push(...other.rows);
                target.ids.push(...other.ids);
                groups.splice(groups.indexOf(other), 1);
            }
        }
    }

    const summaries: SupplierSummary[] = groups.map(group => {
        group.rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
        const latest = group.rows[0];
        const orderedIds = group.rows.map(idsOfSaved);
        const totalNet = Math.round(group.rows.reduce((sum, r) => sum + (netOfPayment(r.amount, r.net_amount) ?? 0), 0) * 100) / 100;
        const totalGross = Math.round(group.rows.reduce((sum, r) => sum + (r.amount ?? parseAmount(r.form.amount) ?? 0), 0) * 100) / 100;
        const tier: SupplierSummary['tier'] =
            totalNet >= THREE_QUOTES_FROM ? 'exceeded' : totalNet >= APPROACHING_QUOTES_FROM ? 'approaching' : 'ok';
        const learnedSet = new Set<PlaceField>();
        for (const r of group.rows) {
            for (const [k, place] of Object.entries(r.meta?.places ?? {})) {
                if (isPlaceField(k as FieldKey) && typeof place?.rect?.x === 'number') learnedSet.add(k as PlaceField);
            }
        }
        return {
            key: latest.id,
            name: latest.supplier_name || latest.form.payeeName || 'Unnamed supplier',
            vat: orderedIds.find(id => id.vat)?.vat ?? '',
            iban: orderedIds.find(id => id.iban)?.iban ?? '',
            email: orderedIds.find(id => id.email)?.email ?? '',
            phone: orderedIds.find(id => id.phone)?.phone ?? '',
            totalNet,
            totalGross,
            count: group.rows.length,
            tier,
            latest,
            learnedPlaces: PLACE_ORDER.filter(p => learnedSet.has(p)),
            requisitionIds: group.rows.map(r => r.id),
        };
    });

    return summaries.sort((a, b) => b.totalNet - a.totalNet || b.totalGross - a.totalGross || a.name.localeCompare(b.name));
}

/** Start a fresh requisition prefilled from a known supplier's latest requisition */
export function draftFromSupplier(supplierRow: SavedChequeReq, defaults: ChequeReqDefaults): Draft {
    const form: ChequeReqForm = structuredClone(EMPTY_FORM);
    const flags: FieldFlags = {};
    const prev = supplierRow.form;
    const prevMeta = supplierRow.meta ?? EMPTY_META;
    const fromLast = `As on ${sinceLabel(supplierRow)}`;

    form.payeeName = prev.payeeName || supplierRow.supplier_name || '';
    form.payeeAddress = prev.payeeAddress || '';
    if (form.payeeName) flags.payeeName = { level: 'memory', note: fromLast };
    if (form.payeeAddress) flags.payeeAddress = { level: 'memory', note: fromLast };

    const action = prev.actionNumber || defaults.actionNumber;
    form.actionNumber = action;
    flags.actionNumber = action
        ? { level: prev.actionNumber ? 'memory' : 'check', note: prev.actionNumber ? fromLast : 'As on your last requisition' }
        : { level: 'missing', note: 'Which SICAP action pays for this?' };

    if (prev.nonSicapFunding) {
        form.nonSicapFunding = prev.nonSicapFunding;
        flags.nonSicapFunding = { level: 'memory', note: fromLast };
    }

    if (defaults.requestedBy) form.requestedBy = defaults.requestedBy;
    if (defaults.approvedBy) form.approvedBy = defaults.approvedBy;

    form.quoteBy = { ...prev.quoteBy };
    form.shopName = prev.shopName;
    form.quotePhone = prev.quotePhone;
    form.quoteEmail = prev.quoteEmail;
    form.quoteContact = prev.quoteContact;
    form.quoteWebsite = prev.quoteWebsite;
    for (const key of ['shopName', 'quotePhone', 'quoteEmail', 'quoteContact', 'quoteWebsite'] as const) {
        if (prev[key]) flags[key] = { level: 'memory', note: fromLast };
    }

    const meta: ChequeReqMeta = {
        ...EMPTY_META,
        supplierVat: prevMeta.supplierVat ?? '',
        supplierIban: prevMeta.supplierIban ?? '',
        supplierDomain: prevMeta.supplierDomain || domainWord(prevMeta.supplierEmail || prev.quoteEmail || prev.quoteWebsite || '') || '',
        supplierEmail: prevMeta.supplierEmail || prev.quoteEmail || '',
        supplierPhone: prevMeta.supplierPhone || prev.quotePhone || '',
        places: prevMeta.places ? structuredClone(prevMeta.places) : {},
    };

    return { form, flags, meta, sources: {}, previous: supplierRow };
}

/**
 * Reset supplier & quote fields back to what the invoice itself extracted, clearing any
 * mismatched supplier memory (payee details, quote details, and learned invoice places).
 */
export function invoiceOnlyOverride(
    facts: InvoiceFacts,
    form: ChequeReqForm,
    meta: ChequeReqMeta,
): { form: ChequeReqForm; flags: FieldFlags; meta: ChequeReqMeta } {
    const s = facts.supplier;
    const nextForm: ChequeReqForm = {
        ...form,
        payeeName: s.name?.value ?? '',
        payeeAddress: s.address?.value ?? '',
        quoteBy: { ...EMPTY_FORM.quoteBy },
        shopName: '',
        quotePhone: s.phone ?? '',
        quoteEmail: s.email ?? '',
        quoteContact: '',
        quoteWebsite: '',
    };
    const flags: FieldFlags = {};
    if (s.name) {
        flags.payeeName = s.name.sure
            ? { level: 'found', note: /payable/i.test(s.name.from ?? '') ? `The invoice says: “${s.name.from}”` : 'From the invoice', source: s.name.source }
            : { level: 'check', note: 'Best guess from the invoice: check the spelling and that this is who gets paid', source: s.name.source };
    } else {
        flags.payeeName = { level: 'missing', note: 'Couldn’t tell who sent the invoice' };
    }
    if (s.address) {
        flags.payeeAddress = s.address.sure
            ? { level: 'found', note: 'From the invoice', source: s.address.source }
            : { level: 'check', note: 'Best guess from the invoice', source: s.address.source };
    } else {
        flags.payeeAddress = { level: 'missing', note: 'No address found on the invoice' };
    }
    if (s.phone) flags.quotePhone = { level: 'check', note: 'The phone number on the invoice: is it who gave the quote?' };
    if (s.email) flags.quoteEmail = { level: 'check', note: 'The email on the invoice: is it who gave the quote?' };
    if (facts.scanned) {
        for (const key of Object.keys(flags) as FieldKey[]) {
            const flag = flags[key];
            if (flag?.level === 'found') flags[key] = { ...flag, level: 'check', note: `${flag.note} (read from a scan: check it against the invoice)` };
        }
    }
    const nextMeta: ChequeReqMeta = {
        ...meta,
        supplierVat: s.vatNumber ?? '',
        supplierIban: s.iban ?? '',
        supplierDomain: domainWord(s.email ?? s.website ?? '') ?? '',
        supplierEmail: s.email ?? '',
        supplierPhone: s.phone ?? '',
        places: {},
    };
    return { form: nextForm, flags, meta: nextMeta };
}

/** Evidence-based readiness hints for the 5 SICAP checklist items */
export function suggestedChecklist(
    form: ChequeReqForm,
    facts: InvoiceFacts,
): Record<ChecklistItem, { ready: boolean; reason: string }> {
    const hasPo = Boolean(form.poNumber.trim() || facts.poNumber?.value);
    const hasSicap = facts.mentionsSicap;
    const poAndSicap = hasPo && hasSicap
        ? { ready: true, reason: 'PO number and “SICAP” are both present on the invoice.' }
        : !hasPo && !hasSicap
            ? { ready: false, reason: 'PO number and “SICAP” were not found on the invoice.' }
            : !hasPo
                ? { ready: false, reason: 'PO number is missing.' }
                : { ready: false, reason: '“SICAP” was not found on the invoice.' };

    const descTrimmed = form.description.trim();
    const description = descTrimmed.length >= 3
        ? { ready: true, reason: 'Description of goods/services is filled in.' }
        : { ready: false, reason: 'Add a description of the goods or services.' };

    const approvedBy = form.approvedBy.trim();
    const approval = approvedBy && form.approvalEmailAttached
        ? { ready: true, reason: `Approved by ${approvedBy} and approval email attached.` }
        : approvedBy
            ? { ready: true, reason: `Approved by ${approvedBy}.` }
            : form.approvalEmailAttached
                ? { ready: true, reason: 'Approval email attached is ticked.' }
                : { ready: false, reason: 'Enter who approved this or tick “Approval email attached”.' };

    const quotePairs: [QuoteMethod, string][] = [
        ['shop', form.shopName],
        ['telephone', form.quotePhone],
        ['email', form.quoteEmail],
        ['meeting', form.quoteContact],
        ['online', form.quoteWebsite],
    ];
    const tickedQuotes = quotePairs.filter(([m]) => form.quoteBy[m]);
    const hasQuoteDetail = tickedQuotes.some(([, value]) => value.trim().length > 0);
    const hasQuoteAmount = parseAmount(form.amountQuoted) !== null;
    const quoteDetails = hasQuoteAmount && hasQuoteDetail
        ? { ready: true, reason: 'Quote amount, method, and contact details are filled in.' }
        : !hasQuoteAmount
            ? { ready: false, reason: 'Amount quoted is missing.' }
            : tickedQuotes.length === 0
                ? { ready: false, reason: 'Tick how the quote was obtained and enter the contact detail.' }
                : { ready: false, reason: 'Fill in the contact detail for the ticked quote method.' };

    const taxClearance = {
        ready: false,
        reason: facts.supplier.vatNumber
            ? `Verify Tax Clearance (TCAN) or Tax Declaration Form manually (VAT ${facts.supplier.vatNumber} on invoice).`
            : 'Verify Tax Clearance (TCAN) or Tax Declaration Form manually.',
    };

    return { poAndSicap, description, approval, quoteDetails, taxClearance };
}

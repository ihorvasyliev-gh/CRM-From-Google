import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CircleCheck, Download, Eye, EyeOff, FileText, Info, TriangleAlert, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import ConfirmDialog from '../ConfirmDialog';
import InvoicePreview, { type LoadedInvoice } from './InvoicePreview';
import RequisitionForm from './RequisitionForm';
import { invoicePageSizes } from './useOpenInvoice';
import { toast } from '../../lib/toast';
import { downloadBlob } from '../../lib/download';
import { todayISO } from '../../lib/dateUtils';
import type { SaveChequeReqInput } from '../../hooks/useChequeRequisitions';
import { historyChecks, invoiceChecks, rememberDefaults, type Draft } from '../../lib/chequeReq/draft';
import { chequeReqFileName, renderChequeReq } from '../../lib/chequeReq/docx';
import { rectOf } from '../../lib/chequeReq/extract';
import { formatAmount, slashDate } from '../../lib/chequeReq/parse';
import { isPlaceField, MULTI_PICK, NOTHING_PICKED, pickedValue, placeOf, type Picked } from '../../lib/chequeReq/pick';
import type { Check, ChequeReqForm, ChequeReqMeta, FieldFlags, FieldKey, InvoiceFacts, SavedChequeReq } from '../../lib/chequeReq/types';

export type { LoadedInvoice };

export interface EditorSession {
    key: string;
    /** null: a blank requisition, or one opened from the history */
    invoice: LoadedInvoice | null;
    facts: InvoiceFacts;
    draft: Draft;
    /** Set once the requisition is kept in the history */
    savedId?: string;
}

interface Props {
    session: EditorSession;
    history: SavedChequeReq[];
    historyAvailable: boolean;
    /**
     * Keeps a downloaded requisition in the history: resolves to its id, or null when it isn't
     * kept. Left out on the public page, where nothing is kept anywhere.
     */
    keep?: (input: SaveChequeReqInput) => Promise<string | null>;
    /** Where this computer remembers the action number, name and description wording */
    defaultsKey?: string;
    backLabel?: string;
    onBack: () => void;
}

const FIELD_LABELS: Record<FieldKey, string> = {
    actionNumber: 'SICAP action number',
    nonSicapFunding: 'Non-SICAP funding',
    poNumber: 'PO number',
    payeeName: 'Payee name',
    payeeAddress: 'Payee address',
    amount: 'Payment amount',
    description: 'Description',
    requestedBy: 'Requested by',
    requestedDate: 'Requested date',
    approvedBy: 'Approved by',
    approvedDate: 'Approved date',
    quoteDate: 'Date of quote',
    amountQuoted: 'Amount quoted',
    shopName: 'Shop name',
    quotePhone: 'Quote phone',
    quoteEmail: 'Quote email',
    quoteContact: 'Quote contact',
    quoteWebsite: 'Quote website',
};

function CheckRow({ check }: { check: Check }) {
    const Icon = check.level === 'warning' ? TriangleAlert : check.level === 'ok' ? CircleCheck : Info;
    const tone = check.level === 'warning' ? 'text-status-requested' : check.level === 'ok' ? 'text-status-confirmed' : 'text-status-invited';
    return (
        <li className="flex items-start gap-2 text-sm text-primary">
            <Icon size={15} className={`${tone} shrink-0 mt-0.5`} />
            <span>{check.text}</span>
        </li>
    );
}

/** What was read from the invoice, for a side-by-side check */
function InvoiceFactsList({ facts }: { facts: InvoiceFacts }) {
    const [showPeople, setShowPeople] = useState(false);
    const euro = (n?: number) => (n === undefined ? undefined : `€${formatAmount(n)}`);
    const rows: [string, string | undefined][] = [
        ['Invoice', facts.invoiceNumber?.value],
        ['Invoice date', facts.invoiceDate && slashDate(facts.invoiceDate.value)],
        ['Due date', facts.dueDate && slashDate(facts.dueDate.value)],
        ['Subtotal', euro(facts.subtotal?.value)],
        ['VAT', euro(facts.vat?.value)],
        ['Total', euro(facts.total?.value)],
        ['Supplier VAT / tax no.', facts.supplier.vatNumber],
        ['IBAN', facts.supplier.iban],
        ['BIC', facts.supplier.bic],
        ['Email', facts.supplier.email],
        ['Phone', facts.supplier.phone],
        ['Course / service dates', facts.serviceDates && (facts.serviceDates.days?.map(slashDate).join(', ') ?? [facts.serviceDates.start, facts.serviceDates.end].filter(Boolean).map(d => slashDate(d!)).join(' – '))],
    ];
    const shown = rows.filter(([, v]) => v);
    if (shown.length === 0 && facts.people.length === 0) return null;
    return (
        <div className="rounded-xl border border-border-subtle bg-surface p-3 text-xs">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                {shown.map(([k, v]) => (
                    <div key={k} className="contents">
                        <dt className="text-muted">{k}</dt>
                        <dd className="text-primary font-medium break-words">{v}</dd>
                    </div>
                ))}
            </dl>
            {facts.people.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border-subtle">
                    <button type="button" onClick={() => setShowPeople(v => !v)} className="flex items-center gap-1.5 text-brand-600 dark:text-brand-400 font-semibold hover:underline">
                        <Users size={13} /> {facts.people.length} people named on the invoice {showPeople ? '(hide)' : '(show)'}
                    </button>
                    {showPeople && (
                        <ol className="mt-1.5 list-decimal pl-5 text-primary columns-1 sm:columns-2 gap-4">
                            {facts.people.map((p, i) => <li key={i}>{p}</li>)}
                        </ol>
                    )}
                </div>
            )}
        </div>
    );
}

/** One requisition: the invoice on one side, the form on the other, checks on top */
export default function ChequeReqEditor({ session, history, historyAvailable, keep, defaultsKey, backLabel = 'All requisitions', onBack }: Props) {
    const { invoice, facts, draft } = session;
    const [form, setForm] = useState<ChequeReqForm>(draft.form);
    const [flags, setFlags] = useState<FieldFlags>(draft.flags);
    const [savedId, setSavedId] = useState(session.savedId);
    const [downloaded, setDownloaded] = useState(!!session.savedId);
    const [touched, setTouched] = useState(false);
    const [active, setActive] = useState<FieldKey | null>(null);
    const [confirmDownload, setConfirmDownload] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [busy, setBusy] = useState(false);
    const [showInvoice, setShowInvoice] = useState(false);
    /** The field whose value is being picked on the invoice, and what was picked so far */
    const [picking, setPicking] = useState<{ key: FieldKey; picked: Picked } | null>(null);
    const [meta, setMeta] = useState<ChequeReqMeta>(draft.meta);
    const today = todayISO();

    const checks = useMemo(
        () => [...(invoice ? invoiceChecks(facts, today) : []), ...historyChecks(form, meta, history, savedId, today)],
        [invoice, facts, form, meta, history, savedId, today],
    );
    const warnings = checks.filter(c => c.level === 'warning').length;
    const toCheck = (Object.keys(flags) as FieldKey[]).filter(k => flags[k]?.level === 'check' || flags[k]?.level === 'missing');
    // Leaving loses work: edits since the last download, or an invoice never downloaded
    const unsaved = touched || (!!invoice && !downloaded);

    const unflag = (key: FieldKey) => setFlags(f => {
        if (!f[key]) return f;
        const next = { ...f };
        delete next[key];
        return next;
    });

    const change = <K extends keyof ChequeReqForm>(key: K, value: ChequeReqForm[K]) => {
        setForm(f => {
            const next = { ...f, [key]: value };
            // The amount quoted follows the payment amount while they were the same
            if (key === 'amount' && f.amountQuoted === f.amount) next.amountQuoted = value as string;
            return next;
        });
        if (key in flags) unflag(key as FieldKey);
        setTouched(true);
    };

    // Esc stops picking
    const isPicking = !!picking;
    useEffect(() => {
        if (!isPicking) return;
        const stop = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null);
        window.addEventListener('keydown', stop);
        return () => window.removeEventListener('keydown', stop);
    }, [isPicking]);

    const startPick = (key: FieldKey) => {
        setPicking(p => (p?.key === key ? null : { key, picked: NOTHING_PICKED }));
        setShowInvoice(true);
    };

    /** Text picked on the invoice fills the field; where it was is kept for the supplier's next invoice */
    const pick = (picked: Picked) => {
        if (!picking || !invoice) return;
        const { key } = picking;
        const multi = MULTI_PICK.has(key);
        setPicking(multi ? { key, picked } : null);
        const value = pickedValue(key, picked.texts);
        change(key, value);
        // Kept only where requisitions are (not on the public page)
        const place = keep && isPlaceField(key) && value ? placeOf(key, picked.phrases, invoice.phrases, invoicePageSizes(invoice)?.[picked.phrases[0]?.page ?? 0]) : null;
        if (isPlaceField(key)) {
            setMeta(m => {
                const places = { ...m.places };
                if (place) places[key] = place;
                else delete places[key];
                return { ...m, places, ...(key === 'description' ? { item: value } : {}) };
            });
        }
        if (value) {
            setFlags(f => ({
                ...f,
                [key]: { level: 'found', note: place ? 'Picked on the invoice: the supplier’s next invoice is read in the same place' : 'Picked on the invoice', source: picked.phrases.map(rectOf) },
            }));
        }
        // On a phone the form is under the invoice: back to the field
        if (!multi && window.matchMedia?.('(max-width: 1023px)').matches) document.getElementById(`cr-${key}`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    };

    const download = async () => {
        setConfirmDownload(false);
        setBusy(true);
        try {
            downloadBlob(await renderChequeReq(form), chequeReqFileName(meta, form));
        } catch (err) {
            toast.error(err instanceof Error ? `The requisition could not be made: ${err.message}` : 'The requisition could not be made');
            setBusy(false);
            return;
        }
        rememberDefaults(form, meta, defaultsKey);
        try {
            const id = keep ? await keep({ id: savedId, form, meta }) : null;
            if (id) setSavedId(id);
            setDownloaded(true);
            setTouched(false);
            toast.success(id ? 'Downloaded, and kept in the history' : 'Downloaded');
        } catch (err) {
            toast.error(`Downloaded, but not kept in the history: ${(err as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const highlight = !picking && active ? flags[active]?.source : undefined;
    const title = [form.payeeName.trim() || 'New requisition', meta.invoiceNumber].filter(Boolean).join(' · ');

    const formCard = (
        <Card
            title="Cheque requisition"
            icon={FileText}
            subtitle={toCheck.length ? 'Orange: a guess to check · red: not found · blue: as last time for this supplier' : 'Everything is filled in: download it when ready'}
            action={toCheck.length > 0 ? <Badge tone="warning">{toCheck.length} to check</Badge> : <Badge tone="success">Ready</Badge>}
            divided
        >
            <RequisitionForm form={form} flags={flags} onChange={change} onAccept={unflag} onActive={setActive} onPick={invoice ? startPick : undefined} picking={picking?.key} />
            <div className="mt-5 pt-4 border-t border-border-subtle flex flex-wrap items-center justify-end gap-2">
                {!keep ? (
                    <p className="text-xs text-muted mr-auto">Nothing is saved: you only get the file you download.</p>
                ) : !historyAvailable && (
                    <p className="text-xs text-muted mr-auto">Not kept in a history until migration 88 is applied.</p>
                )}
                <Button variant="primary" size="lg" loading={busy} onClick={() => (toCheck.length > 0 ? setConfirmDownload(true) : download())}>
                    {!busy && <Download size={16} />} Download the requisition (.docx)
                </Button>
            </div>
        </Card>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" aria-label={backLabel} onClick={() => (unsaved ? setConfirmLeave(true) : onBack())}>
                    <ArrowLeft size={15} /> <span className="sm:hidden">Back</span><span className="hidden sm:inline">{backLabel}</span>
                </Button>
                {/* On a phone the title gets its own row under the buttons */}
                <div className="min-w-0 basis-full order-last sm:order-none sm:basis-0 sm:flex-1">
                    <h2 className="text-lg font-semibold text-primary tracking-tight sm:truncate">{title}</h2>
                    {invoice && <p className="text-xs text-muted truncate">{invoice.fileName}</p>}
                </div>
                {invoice && (
                    <Button className="lg:hidden ml-auto sm:ml-0" onClick={() => setShowInvoice(v => !v)}>
                        {showInvoice ? <EyeOff size={15} /> : <Eye size={15} />} {showInvoice ? 'Hide' : 'Show'} the invoice
                    </Button>
                )}
                <Button variant="primary" className={invoice ? '' : 'ml-auto sm:ml-0'} loading={busy} onClick={() => (toCheck.length > 0 ? setConfirmDownload(true) : download())}>
                    {!busy && <Download size={15} />} Download
                </Button>
            </div>

            {checks.length > 0 && (
                <section aria-label="Checks" className={`rounded-xl border p-3 ${warnings ? 'border-warning/30 bg-warning/5' : 'border-border-subtle bg-surface'}`}>
                    <ul className="space-y-1.5">
                        {checks.map((c, i) => <CheckRow key={i} check={c} />)}
                    </ul>
                </section>
            )}

            {invoice ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
                    <div className={`space-y-3 lg:sticky lg:top-18 ${showInvoice ? '' : 'hidden lg:block'}`}>
                        <InvoiceFactsList facts={facts} />
                        <InvoicePreview
                            invoice={invoice}
                            highlight={highlight}
                            pick={picking ? { label: FIELD_LABELS[picking.key], multi: MULTI_PICK.has(picking.key), picked: picking.picked, onPick: pick, onDone: () => setPicking(null) } : undefined}
                        />
                    </div>
                    {formCard}
                </div>
            ) : (
                <div className="max-w-3xl">{formCard}</div>
            )}

            <ConfirmDialog
                open={confirmDownload}
                variant="warning"
                title="Some fields still need a look"
                message={`${toCheck.map(k => FIELD_LABELS[k]).join(', ')}: these are marked in orange or red. Download the requisition anyway?`}
                confirmLabel="Download anyway"
                onConfirm={download}
                onCancel={() => setConfirmDownload(false)}
            />
            <ConfirmDialog
                open={confirmLeave}
                variant="warning"
                title="Leave this requisition?"
                message={downloaded ? 'Changes made since the last download are lost.' : 'It hasn’t been downloaded yet: what you filled in is lost.'}
                confirmLabel="Leave"
                onConfirm={() => {
                    setConfirmLeave(false);
                    onBack();
                }}
                onCancel={() => setConfirmLeave(false)}
            />
        </div>
    );
}

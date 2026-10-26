import { useMemo, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FilePlus2, FileText, Receipt, Trash2 } from 'lucide-react';
import Card, { SectionHeader } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import Badge from './ui/Badge';
import FileDropzone from './ui/FileDropzone';
import { EmptyState, ErrorState, SkeletonRows } from './ui/States';
import { calloutCls, tableCls, tableWrapCls, tbodyCls, tdCls, thCls, theadCls, trCls } from './ui/styles';
import ConfirmDialog from './ConfirmDialog';
import ChequeReqEditor, { type EditorSession, type LoadedInvoice } from './ChequeRequisitions/Editor';
import { loadPdf } from './PdfForms/pdfHooks';
import { toast } from '../lib/toast';
import { downloadBlob } from '../lib/download';
import { formatDateDMY, todayISO } from '../lib/dateUtils';
import { useChequeReqHistory, useDeleteChequeReq, CHEQUE_REQ_KEY, fetchChequeReqHistory, type ChequeReqHistory } from '../hooks/useChequeRequisitions';
import { useFormUserName } from '../hooks/usePdfForms';
import { extractInvoice } from '../lib/chequeReq/extract';
import { draftFromInvoice, readDefaults, sameSupplier, THREE_QUOTES_FROM, type ChequeReqDefaults } from '../lib/chequeReq/draft';
import { chequeReqFileName, renderChequeReq } from '../lib/chequeReq/docx';
import { formatAmount } from '../lib/chequeReq/parse';
import { INVOICE_ACCEPT, invoiceKind, MAX_INVOICE_BYTES, readDocxInvoice } from '../lib/chequeReq/read';
import { ocrPhrases, photoPage, readScan, scannedPdfPages, type OcrPage } from '../lib/chequeReq/ocr';
import { EMPTY_FORM, EMPTY_META, type InvoiceFacts, type SavedChequeReq } from '../lib/chequeReq/types';
import type { Phrase } from '../lib/pdfForms/types';

const NO_FACTS: InvoiceFacts = { hasText: false, supplier: {}, items: [], people: [], mentionsSicap: false };

/** A PDF with hardly any text is a scan (perhaps with a scanner's stamp): its pages are pictures to read */
function looksScanned(phrases: Phrase[]): boolean {
    return phrases.map(p => p.text).join('').replace(/[^\p{L}\p{N}]/gu, '').length < 100;
}

/** This year's payments per supplier (excl. VAT), largest first: the €5,000 single-quote limit */
function yearTotals(rows: SavedChequeReq[], year: string) {
    const groups: { name: string; total: number; count: number; sample: SavedChequeReq }[] = [];
    for (const r of rows) {
        if ((r.invoice_date ?? r.created_at).slice(0, 4) !== year) continue;
        const ids = { name: r.supplier_name, vat: r.meta.supplierVat, iban: r.meta.supplierIban, domain: r.meta.supplierDomain };
        const group = groups.find(g => sameSupplier(ids, { name: g.sample.supplier_name, vat: g.sample.meta.supplierVat, iban: g.sample.meta.supplierIban, domain: g.sample.meta.supplierDomain }));
        const value = r.net_amount ?? r.amount ?? 0;
        if (group) {
            group.total += value;
            group.count += 1;
        } else {
            groups.push({ name: r.supplier_name || 'Unknown supplier', total: value, count: 1, sample: r });
        }
    }
    return groups.sort((a, b) => b.total - a.total);
}

/**
 * Cheque requisitions (admins): drop a supplier invoice, check the SICAP cheque requisition
 * filled in from it, download it as Word. The invoice is read in the browser.
 */
export default function ChequeRequisitions() {
    const queryClient = useQueryClient();
    const { data: history, isLoading, error, refetch } = useChequeReqHistory();
    const remove = useDeleteChequeReq();
    const userName = useFormUserName();
    const [session, setSession] = useState<EditorSession | null>(null);
    /** What is being done while an invoice is read, e.g. "Reading the scan… 40%" */
    const [reading, setReading] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<SavedChequeReq | null>(null);
    const rows = useMemo(() => history?.rows ?? [], [history]);
    const year = todayISO().slice(0, 4);
    const totals = useMemo(() => yearTotals(rows, year), [rows, year]);

    const defaultsFor = (hist: ChequeReqHistory | undefined): ChequeReqDefaults => {
        const stored = readDefaults();
        const last = hist?.rows[0]?.form;
        return {
            actionNumber: stored.actionNumber || last?.actionNumber || '',
            requestedBy: stored.requestedBy || last?.requestedBy || (userName.includes('@') ? '' : userName),
            descriptionPattern: stored.descriptionPattern,
        };
    };

    const openInvoice = async (e: ChangeEvent<HTMLInputElement>) => {
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
                invoice = { kind, phrases, fileName: file.name };
            } else {
                setReading('Reading the photo…');
                const page = await photoPage(file);
                phrases = await readPictures([page]);
                invoice = { kind, url: URL.createObjectURL(file), fileName: file.name, size: { w: page.width, h: page.height }, angle: angles[0] ?? 0 };
            }
            // Earlier requisitions first: they hold this supplier's details from last time
            const hist = await queryClient.fetchQuery({ queryKey: CHEQUE_REQ_KEY, queryFn: fetchChequeReqHistory, staleTime: 30_000 }).catch(() => undefined);
            const facts: InvoiceFacts = { ...extractInvoice(phrases), scanned };
            const draft = draftFromInvoice({ facts, history: hist?.rows ?? [], defaults: defaultsFor(hist), fileName: file.name });
            setSession({ key: crypto.randomUUID(), invoice, facts, draft });
        } catch (err) {
            toast.error(err instanceof Error ? `The invoice could not be read: ${err.message}` : 'The invoice could not be read');
        } finally {
            setReading(null);
        }
    };

    const startBlank = () => {
        const defaults = defaultsFor(history);
        setSession({
            key: crypto.randomUUID(),
            invoice: null,
            facts: NO_FACTS,
            draft: { form: { ...structuredClone(EMPTY_FORM), actionNumber: defaults.actionNumber, requestedBy: defaults.requestedBy }, flags: {}, meta: { ...EMPTY_META } },
        });
    };

    const openSaved = (r: SavedChequeReq) => {
        setSession({ key: r.id, invoice: null, facts: NO_FACTS, draft: { form: r.form, flags: {}, meta: r.meta }, savedId: r.id });
    };

    const downloadSaved = async (r: SavedChequeReq) => {
        try {
            downloadBlob(await renderChequeReq(r.form), chequeReqFileName(r.meta, r.form));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not make the document');
        }
    };

    const closeSession = () => {
        if (session?.invoice?.kind === 'pdf') void session.invoice.pdf.doc.loadingTask.destroy();
        if (session?.invoice?.kind === 'image') URL.revokeObjectURL(session.invoice.url);
        setSession(null);
    };

    if (session) {
        return (
            <ChequeReqEditor
                key={session.key}
                session={session}
                history={rows}
                historyAvailable={history?.available ?? false}
                onBack={closeSession}
            />
        );
    }

    return (
        <div className="space-y-5">
            <SectionHeader
                icon={Receipt}
                title="Cheque requisitions"
                description="Drop a supplier invoice: the SICAP cheque requisition is filled in from it for you to check, edit and download."
                actions={
                    <Button onClick={startBlank}>
                        <FilePlus2 size={15} /> Blank requisition
                    </Button>
                }
            />

            <FileDropzone
                accept={INVOICE_ACCEPT}
                onChange={openInvoice}
                uploading={!!reading}
                uploadingTitle={reading}
                icon={<FileText size={18} />}
                title="Make a requisition: click here to choose the invoice, or drag it onto this box"
                hint="PDF or Word file, a scan or a photo of a paper invoice. The invoice is read on this computer and never uploaded."
                className="py-10"
            />

            {history && !history.available && (
                <p className={`${calloutCls.info} text-sm p-3`}>
                    Requisitions are made and downloaded, but not kept yet: run migration <b>88_cheque_requisitions.sql</b> in Supabase to keep a history, remember each supplier’s details and warn about the €5,000 limit.
                </p>
            )}

            {totals.length > 0 && (
                <Card title={`Suppliers in ${year}`} icon={AlertTriangle} tone={totals.some(t => t.total >= THREE_QUOTES_FROM) ? 'warning' : 'brand'} subtitle={`Excl. VAT. From €${formatAmount(THREE_QUOTES_FROM)} a year to one supplier, three quotations are needed.`}>
                    <ul className="flex flex-wrap gap-2">
                        {totals.map(t => (
                            <li key={t.name}>
                                <Badge tone={t.total >= THREE_QUOTES_FROM ? 'warning' : 'neutral'} title={`${t.count} requisition${t.count === 1 ? '' : 's'}`}>
                                    {t.name}: €{formatAmount(t.total)}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <Card title="Made before" icon={Receipt} divided flush>
                {isLoading ? (
                    <div className="p-4"><SkeletonRows rows={3} bare /></div>
                ) : error ? (
                    <ErrorState title="The requisitions couldn't be loaded" error={error} onRetry={() => refetch()} className="m-4" />
                ) : rows.length === 0 ? (
                    <EmptyState bare icon={<Receipt size={22} />} title="No requisitions yet" description="Requisitions you download appear here, to open or download again." />
                ) : (
                    <div className={tableWrapCls}>
                        <table className={tableCls}>
                            <thead className={theadCls}>
                                <tr>
                                    <th className={thCls}>Made</th>
                                    <th className={thCls}>Supplier</th>
                                    <th className={thCls}>Invoice</th>
                                    <th className={`${thCls} text-right`}>Amount</th>
                                    <th className={thCls}><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className={tbodyCls}>
                                {rows.map(r => (
                                    <tr key={r.id} className={`${trCls} cursor-pointer`} onClick={() => openSaved(r)}>
                                        <td className={`${tdCls} whitespace-nowrap text-muted`}>{formatDateDMY(r.created_at)}</td>
                                        <td className={`${tdCls} max-w-[16rem]`}>
                                            <span className="block truncate font-medium text-primary">{r.supplier_name || '—'}</span>
                                            <span className="block truncate text-xs text-muted">{r.form.description}</span>
                                        </td>
                                        <td className={`${tdCls} whitespace-nowrap`}>
                                            {r.invoice_number || '—'}
                                            {r.invoice_date && <span className="block text-xs text-muted">{formatDateDMY(r.invoice_date)}</span>}
                                        </td>
                                        <td className={`${tdCls} text-right whitespace-nowrap tabular-nums`}>{r.amount !== null ? `€${formatAmount(r.amount)}` : '—'}</td>
                                        <td className={`${tdCls} text-right whitespace-nowrap`} onClick={e => e.stopPropagation()}>
                                            <IconButton label="Download again" size="sm" onClick={() => downloadSaved(r)}>
                                                <Download size={14} />
                                            </IconButton>
                                            <IconButton label="Delete" size="sm" tone="danger" onClick={() => setConfirmDelete(r)}>
                                                <Trash2 size={14} />
                                            </IconButton>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <ConfirmDialog
                open={!!confirmDelete}
                title="Delete this requisition?"
                message={`The requisition for ${confirmDelete?.invoice_number || 'this invoice'} from ${confirmDelete?.supplier_name || 'this supplier'} is removed from the history. Files you already downloaded are not affected.`}
                onConfirm={async () => {
                    if (!confirmDelete) return;
                    try {
                        await remove.mutateAsync(confirmDelete.id);
                        toast.success('Requisition deleted');
                        setConfirmDelete(null);
                    } catch (err) {
                        toast.error((err as Error).message);
                    }
                }}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
}

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
} from 'react';
import {
    ArrowDown,
    ArrowLeft,
    Check as CheckIcon,
    CheckCheck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    Download,
    FileDown,
    FileSpreadsheet,
    FileText,
    FileUp,
    FolderArchive,
    Info,
    Loader2,
    Paperclip,
    Plus,
    Printer,
    Save,
    Settings2,
    TriangleAlert,
} from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { buttonCls } from '../ui/buttonStyles';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import Menu from '../ui/Menu';
import { Segmented } from '../ui/Tabs';
import ConfirmDialog from '../ConfirmDialog';
import InvoicePreview, { type LoadedInvoice } from './InvoicePreview';
import type { PickMode } from './PickLayer';
import DocumentInspector from './DocumentInspector';
import RequisitionLivePreview from './RequisitionLivePreview';
import RequisitionForm from './RequisitionForm';
import { usePrintChequeReq } from './PrintPortal';
import {
    closeInvoice,
    invoicePageSizes,
    openInvoiceFile,
    reReadInvoice,
} from './useOpenInvoice';
import { toast } from '../../lib/toast';
import { downloadBlob } from '../../lib/download';
import { todayISO } from '../../lib/dateUtils';
import type { SaveChequeReqInput } from '../../hooks/useChequeRequisitions';
import {
    draftFromInvoice,
    historyChecks,
    invoiceChecks,
    invoiceOnlyOverride,
    readDefaults,
    rememberDefaults,
    suppliersSummary,
    type ChequeReqDefaults,
    type Draft,
} from '../../lib/chequeReq/draft';
import { chequeReqFileName, chequeReqPdfFileName, renderChequeReq } from '../../lib/chequeReq/docx';
import { renderChequeReqBatchZip, renderChequeReqPdf } from '../../lib/chequeReq/export';
import { rectOf } from '../../lib/chequeReq/extract';
import type { Rotation } from '../../lib/chequeReq/ocr';
import { domainWord, formatAmount, parseAmount, slashDate } from '../../lib/chequeReq/parse';
import {
    isMetaField,
    isPlaceField,
    MULTI_PICK,
    NOTHING_PICKED,
    pickedMetaValue,
    pickedValue,
    placeOf,
    type Picked,
} from '../../lib/chequeReq/pick';
import { INVOICE_ACCEPT, invoiceKind, MAX_INVOICE_BYTES, unsupportedFileReason } from '../../lib/chequeReq/read';
import {
    EMPTY_META,
    type Check,
    type ChequeReqForm,
    type ChequeReqMeta,
    type ChequeReqStatus,
    type FieldFlag,
    type FieldFlags,
    type FieldKey,
    type FieldSources,
    type InvoiceFacts,
    type MetaFieldKey,
    type PickFieldKey,
    type SavedChequeReq,
} from '../../lib/chequeReq/types';
import type { Rect } from '../../lib/pdfForms/types';

export type { LoadedInvoice };

export interface EditorSession {
    key: string;
    /** null: a blank requisition, or one opened from the history */
    invoice: LoadedInvoice | null;
    facts: InvoiceFacts;
    draft: Draft;
    /** Set once the requisition is kept in the history */
    savedId?: string;
    status?: ChequeReqStatus;
    chequeNumber?: string;
    notes?: string;
}

export interface ChequeReqEditorProps {
    session: EditorSession;
    /** When dropping multiple invoices at once, pass the full queue here */
    initialSessions?: EditorSession[];
    history: SavedChequeReq[];
    historyAvailable: boolean;
    /**
     * Keeps a downloaded or saved requisition in the history: resolves to its id, or null when
     * it isn't kept. Left out on the public page, where nothing is kept anywhere.
     */
    keep?: (input: SaveChequeReqInput) => Promise<string | null>;
    onOpenSaved?: (id: string) => void;
    onOpenDefaults?: () => void;
    defaults?: ChequeReqDefaults;
    /** Where this computer remembers the action number, name and description wording */
    defaultsKey?: string;
    backLabel?: string;
    onBack: () => void;
}

interface QueueItem {
    key: string;
    invoice: LoadedInvoice | null;
    facts: InvoiceFacts;
    form: ChequeReqForm;
    flags: FieldFlags;
    sources: FieldSources;
    meta: ChequeReqMeta;
    savedId?: string;
    status: ChequeReqStatus;
    chequeNumber: string;
    notes: string;
    matchedSupplierName?: string;
    downloaded: boolean;
    touched: boolean;
}

interface PickingState {
    key: PickFieldKey;
    picked: Picked;
    history: Picked[];
}

type LeftTab = 'invoice' | 'preview';
type MobilePane = 'form' | 'invoice' | 'preview';

const FIELD_ORDER: FieldKey[] = [
    'actionNumber',
    'nonSicapFunding',
    'poNumber',
    'amount',
    'payeeName',
    'payeeAddress',
    'description',
    'requestedBy',
    'requestedDate',
    'approvedBy',
    'approvedDate',
    'quoteDate',
    'amountQuoted',
    'shopName',
    'quotePhone',
    'quoteEmail',
    'quoteContact',
    'quoteWebsite',
];

const FIELD_LABELS: Record<PickFieldKey, string> = {
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
    invoiceNumber: 'Invoice number',
    invoiceDate: 'Invoice date',
    dueDate: 'Due date',
    netAmount: 'Net excl. VAT',
};

const STATUS_BADGE: Record<ChequeReqStatus, { label: string; tone: 'warning' | 'info' | 'success' }> = {
    draft: { label: 'Draft', tone: 'warning' },
    ready: { label: 'Ready to pay', tone: 'info' },
    paid: { label: 'Paid', tone: 'success' },
};

function extractSources(draft: Draft): FieldSources {
    const merged: FieldSources = { ...(draft.sources ?? {}) };
    for (const [k, flag] of Object.entries(draft.flags) as [FieldKey, FieldFlag | undefined][]) {
        if (flag?.source?.length && !merged[k]?.length) {
            merged[k] = flag.source;
        }
    }
    return merged;
}

function sessionToItem(s: EditorSession): QueueItem {
    const meta: ChequeReqMeta = {
        ...EMPTY_META,
        ...s.draft.meta,
        places: { ...(s.draft.meta.places ?? {}) },
    };
    const status: ChequeReqStatus = s.status ?? meta.status ?? 'ready';
    const chequeNumber = s.chequeNumber ?? meta.chequeNumber ?? '';
    const notes = s.notes ?? meta.notes ?? '';
    const matchedSupplierName = s.draft.previous
        ? (s.draft.previous.supplier_name || s.draft.previous.form.payeeName || undefined)
        : undefined;
    return {
        key: s.key,
        invoice: s.invoice,
        facts: s.facts,
        form: s.draft.form,
        flags: s.draft.flags,
        sources: extractSources(s.draft),
        meta,
        savedId: s.savedId,
        status,
        chequeNumber,
        notes,
        matchedSupplierName,
        downloaded: !!s.savedId,
        touched: false,
    };
}

function flaggedKeys(flags: FieldFlags): FieldKey[] {
    return FIELD_ORDER.filter(k => flags[k]?.level === 'check' || flags[k]?.level === 'missing');
}

function isEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function isAbortError(err: unknown): boolean {
    return err instanceof DOMException ? err.name === 'AbortError' : err instanceof Error && err.name === 'AbortError';
}

function activeHighlightText(active: PickFieldKey | null, form: ChequeReqForm, meta: ChequeReqMeta): string | undefined {
    if (!active) return undefined;
    if (isMetaField(active)) {
        switch (active) {
            case 'invoiceNumber':
                return meta.invoiceNumber.trim() || undefined;
            case 'invoiceDate':
                return meta.invoiceDate ? slashDate(meta.invoiceDate) : undefined;
            case 'dueDate':
                return meta.dueDate ? slashDate(meta.dueDate) : undefined;
            case 'netAmount':
                return meta.netAmount !== null ? formatAmount(meta.netAmount) : undefined;
        }
    }
    const raw = String(form[active] ?? '').trim();
    if (!raw) return undefined;
    if (active === 'requestedDate' || active === 'approvedDate' || active === 'quoteDate') {
        return slashDate(raw);
    }
    return raw;
}

function CheckRow({ check, onOpenSaved }: { check: Check; onOpenSaved?: (id: string) => void }) {
    const Icon = check.level === 'warning' ? TriangleAlert : check.level === 'ok' ? CircleCheck : Info;
    const tone =
        check.level === 'warning'
            ? 'text-status-requested'
            : check.level === 'ok'
                ? 'text-status-confirmed'
                : 'text-status-invited';
    return (
        <li className="flex items-start gap-2 text-sm text-primary">
            <Icon size={15} className={`${tone} shrink-0 mt-0.5`} />
            <span className="flex-1 min-w-0">
                {check.text}
                {check.relatedId && onOpenSaved && (
                    <>
                        {' '}
                        <button
                            type="button"
                            onClick={() => onOpenSaved(check.relatedId!)}
                            className="font-semibold text-brand-600 dark:text-brand-400 underline underline-offset-2 hover:no-underline"
                        >
                            View earlier
                        </button>
                    </>
                )}
            </span>
        </li>
    );
}

/** Two-pane cheque requisition studio: invoice/live preview on the left, smart form on the right */
export default function ChequeReqEditor({
    session,
    initialSessions,
    history,
    historyAvailable,
    keep,
    onOpenSaved,
    onOpenDefaults,
    defaults,
    defaultsKey,
    backLabel = 'All requisitions',
    onBack,
}: ChequeReqEditorProps) {
    const [items, setItems] = useState<QueueItem[]>(() => {
        const list = initialSessions && initialSessions.length > 0 ? initialSessions : [session];
        return list.map(sessionToItem);
    });
    const [activeIndex, setActiveIndex] = useState(0);
    const activeItem = items[activeIndex] ?? items[0];

    const [active, setActive] = useState<PickFieldKey | null>(null);
    const [focusedField, setFocusedField] = useState<PickFieldKey | null>(null);
    const [picking, setPicking] = useState<PickingState | null>(null);
    const [leftTab, setLeftTab] = useState<LeftTab>(() => (activeItem?.invoice ? 'invoice' : 'preview'));
    const [mobilePane, setMobilePane] = useState<MobilePane>('form');

    const handleFieldFocus = useCallback((key: PickFieldKey | null) => {
        setActive(key);
        setFocusedField(key);
    }, []);

    const [pendingDownload, setPendingDownload] = useState<'docx' | 'pdf' | null>(null);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [busyAction, setBusyAction] = useState<'docx' | 'pdf' | 'save' | 'batch' | null>(null);
    const [batchProgress, setBatchProgress] = useState<string | null>(null);
    const [reReading, setReReading] = useState(false);
    const [readingStatus, setReadingStatus] = useState<string | null>(null);
    const [dropActive, setDropActive] = useState(false);

    const attachInputRef = useRef<HTMLInputElement>(null);
    const readAbortRef = useRef<AbortController | null>(null);
    const itemsRef = useRef(items);
    const activeIndexRef = useRef(activeIndex);
    useLayoutEffect(() => {
        itemsRef.current = items;
        activeIndexRef.current = activeIndex;
    });
    const unmountTimerRef = useRef<number | null>(null);

    const { printing, print, printNode } = usePrintChequeReq();

    const effectiveDefaults = useMemo(
        () => defaults ?? readDefaults(defaultsKey),
        [defaults, defaultsKey],
    );
    const suppliers = useMemo(
        () => (history.length > 0 ? suppliersSummary(history, 'all') : []),
        [history],
    );
    const today = todayISO();

    // Update helper targeting the current active queue item
    const updateActive = useCallback((updater: (item: QueueItem) => QueueItem) => {
        setItems(prev => {
            const idx = activeIndexRef.current;
            const current = prev[idx];
            if (!current) return prev;
            const next = [...prev];
            next[idx] = updater(current);
            return next;
        });
    }, []);

    // StrictMode-safe unmount cleanup: closes every loaded PDF/image in the queue and aborts in-flight OCR
    useEffect(() => {
        if (unmountTimerRef.current !== null) {
            window.clearTimeout(unmountTimerRef.current);
            unmountTimerRef.current = null;
        }
        return () => {
            readAbortRef.current?.abort();
            unmountTimerRef.current = window.setTimeout(() => {
                const closed = new Set<LoadedInvoice>();
                for (const item of itemsRef.current) {
                    if (item.invoice && !closed.has(item.invoice)) {
                        closed.add(item.invoice);
                        closeInvoice(item.invoice);
                    }
                }
            }, 0);
        };
    }, []);

    const checks = useMemo(
        () => [
            ...(activeItem.invoice ? invoiceChecks(activeItem.facts, today) : []),
            ...historyChecks(activeItem.form, activeItem.meta, history, activeItem.savedId, today),
        ],
        [activeItem.invoice, activeItem.facts, activeItem.form, activeItem.meta, history, activeItem.savedId, today],
    );
    const warnings = checks.filter(c => c.level === 'warning').length;
    const toCheck = useMemo(() => flaggedKeys(activeItem.flags), [activeItem.flags]);
    const checkOnlyKeys = useMemo(
        () => toCheck.filter(k => activeItem.flags[k]?.level === 'check'),
        [toCheck, activeItem.flags],
    );

    const lastFlaggedRef = useRef<FieldKey | null>(null);
    useEffect(() => {
        if (active && !isMetaField(active)) {
            lastFlaggedRef.current = active;
        }
    }, [active]);

    const anyUnsaved = useMemo(
        () => items.some(item => item.touched || (!!item.invoice && !item.downloaded && !item.savedId)),
        [items],
    );

    // Warn before closing tab if any requisition in the queue has unsaved work
    useEffect(() => {
        if (!anyUnsaved) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [anyUnsaved]);

    // Field mutations (clear flags without clearing persistent sources)
    const unflag = useCallback((key: FieldKey) => {
        updateActive(item => {
            if (!item.flags[key]) return item;
            const nextFlags = { ...item.flags };
            delete nextFlags[key];
            return { ...item, flags: nextFlags };
        });
    }, [updateActive]);

    const acceptAllGuesses = useCallback(() => {
        updateActive(item => {
            const nextFlags: FieldFlags = {};
            for (const [k, flag] of Object.entries(item.flags) as [FieldKey, FieldFlag | undefined][]) {
                if (flag && flag.level !== 'check') {
                    nextFlags[k] = flag;
                }
            }
            return { ...item, flags: nextFlags };
        });
    }, [updateActive]);

    const change = useCallback(
        <K extends keyof ChequeReqForm>(key: K, value: ChequeReqForm[K]) => {
            updateActive(item => {
                const nextForm = { ...item.form, [key]: value };
                // The amount quoted follows the payment amount while they were the same
                if (key === 'amount' && item.form.amountQuoted === item.form.amount) {
                    nextForm.amountQuoted = value as string;
                }
                let nextFlags = item.flags;
                if (key in item.flags) {
                    nextFlags = { ...item.flags };
                    delete nextFlags[key as FieldKey];
                }
                return { ...item, form: nextForm, flags: nextFlags, touched: true };
            });
        },
        [updateActive],
    );

    const changeMeta = useCallback(
        <K extends MetaFieldKey>(key: K, value: ChequeReqMeta[K]) => {
            updateActive(item => ({
                ...item,
                meta: { ...item.meta, [key]: value },
                touched: true,
            }));
        },
        [updateActive],
    );

    const changeTracking = useCallback(
        (patch: { status?: ChequeReqStatus; chequeNumber?: string; notes?: string }) => {
            updateActive(item => {
                const nextStatus = patch.status ?? item.status;
                const nextChequeNumber = patch.chequeNumber ?? item.chequeNumber;
                const nextNotes = patch.notes ?? item.notes;
                return {
                    ...item,
                    status: nextStatus,
                    chequeNumber: nextChequeNumber,
                    notes: nextNotes,
                    meta: {
                        ...item.meta,
                        status: nextStatus,
                        chequeNumber: nextChequeNumber,
                        notes: nextNotes,
                    },
                    touched: true,
                };
            });
        },
        [updateActive],
    );

    // Supplier autocomplete selection & memory override
    const handleSelectSupplier = useCallback(
        (supplierRow: SavedChequeReq) => {
            const prev = supplierRow.form;
            const prevMeta = supplierRow.meta ?? EMPTY_META;
            const label = supplierRow.invoice_number
                ? `As on your requisition for ${supplierRow.invoice_number}`
                : 'As on your last requisition for this supplier';
            const supplierName = prev.payeeName || supplierRow.supplier_name || '';

            updateActive(item => {
                const nextForm: ChequeReqForm = {
                    ...item.form,
                    payeeName: supplierName,
                    payeeAddress: prev.payeeAddress || item.form.payeeAddress,
                    actionNumber: prev.actionNumber || item.form.actionNumber,
                    nonSicapFunding: prev.nonSicapFunding || item.form.nonSicapFunding,
                    quoteBy: { ...prev.quoteBy },
                    shopName: prev.shopName,
                    quotePhone: prev.quotePhone,
                    quoteEmail: prev.quoteEmail,
                    quoteContact: prev.quoteContact,
                    quoteWebsite: prev.quoteWebsite,
                };
                const nextFlags: FieldFlags = { ...item.flags };
                if (supplierName) nextFlags.payeeName = { level: 'memory', note: label };
                if (prev.payeeAddress) nextFlags.payeeAddress = { level: 'memory', note: label };
                if (prev.actionNumber) nextFlags.actionNumber = { level: 'memory', note: label };
                if (prev.nonSicapFunding) nextFlags.nonSicapFunding = { level: 'memory', note: label };
                for (const k of ['shopName', 'quotePhone', 'quoteEmail', 'quoteContact', 'quoteWebsite'] as const) {
                    if (prev[k]) nextFlags[k] = { level: 'memory', note: label };
                    else delete nextFlags[k];
                }
                const nextMeta: ChequeReqMeta = {
                    ...item.meta,
                    supplierVat: prevMeta.supplierVat || item.meta.supplierVat,
                    supplierIban: prevMeta.supplierIban || item.meta.supplierIban,
                    supplierDomain:
                        prevMeta.supplierDomain ||
                        domainWord(prevMeta.supplierEmail || prev.quoteEmail || prev.quoteWebsite || '') ||
                        item.meta.supplierDomain,
                    supplierEmail: prevMeta.supplierEmail || prev.quoteEmail || item.meta.supplierEmail,
                    supplierPhone: prevMeta.supplierPhone || prev.quotePhone || item.meta.supplierPhone,
                    places: Object.keys(item.meta.places ?? {}).length
                        ? item.meta.places
                        : structuredClone(prevMeta.places ?? {}),
                };
                return {
                    ...item,
                    form: nextForm,
                    flags: nextFlags,
                    meta: nextMeta,
                    matchedSupplierName: supplierName || undefined,
                    touched: true,
                };
            });
            toast.info(`Applied details from ${supplierName || 'supplier'}`);
        },
        [updateActive],
    );

    const handleUseInvoiceValues = useCallback(() => {
        updateActive(item => {
            const overridden = invoiceOnlyOverride(item.facts, item.form, item.meta);
            const nextFlags: FieldFlags = { ...item.flags };
            for (const k of [
                'payeeName',
                'payeeAddress',
                'shopName',
                'quotePhone',
                'quoteEmail',
                'quoteContact',
                'quoteWebsite',
            ] as const) {
                delete nextFlags[k];
                if (overridden.flags[k]) nextFlags[k] = overridden.flags[k];
            }
            const nextSources: FieldSources = { ...item.sources };
            if (overridden.flags.payeeName?.source?.length) nextSources.payeeName = overridden.flags.payeeName.source;
            if (overridden.flags.payeeAddress?.source?.length) nextSources.payeeAddress = overridden.flags.payeeAddress.source;
            return {
                ...item,
                form: overridden.form,
                flags: nextFlags,
                meta: overridden.meta,
                sources: nextSources,
                matchedSupplierName: undefined,
                touched: true,
            };
        });
    }, [updateActive]);

    // Guided Review jump helper
    const jumpToFlagged = useCallback(
        (direction: 1 | -1) => {
            if (toCheck.length === 0) return;
            const anchor = active && !isMetaField(active) ? active : lastFlaggedRef.current;
            const currentPos = anchor ? toCheck.indexOf(anchor) : -1;
            const nextIndex =
                currentPos === -1
                    ? direction === 1
                        ? 0
                        : toCheck.length - 1
                    : (currentPos + direction + toCheck.length) % toCheck.length;
            const key = toCheck[nextIndex];
            lastFlaggedRef.current = key;
            setMobilePane('form');
            setActive(key);
            requestAnimationFrame(() => {
                const el = document.getElementById(`cr-${key}`);
                el?.focus();
                el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
            });
        },
        [toCheck, active],
    );

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
    }, [keep]);

    // Keyboard shortcuts: Esc stops picking, Alt+ArrowDown/Up jumps flagged fields, Ctrl/Cmd+S saves
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
            if (e.key === 'Escape' && picking) {
                setPicking(null);
                return;
            }
            if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                if (toCheck.length > 0) {
                    e.preventDefault();
                    jumpToFlagged(e.key === 'ArrowDown' ? 1 : -1);
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && keep) {
                e.preventDefault();
                void saveOnly();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [picking, toCheck, jumpToFlagged, keep, saveOnly]);

    // Picking on the invoice
    const startPick = useCallback((key: PickFieldKey) => {
        setPicking(p => (p?.key === key ? null : { key, picked: NOTHING_PICKED, history: [] }));
        setLeftTab('invoice');
        setMobilePane('invoice');
    }, []);

    const applyPickedToItem = useCallback(
        (key: PickFieldKey, picked: Picked) => {
            const cur = itemsRef.current[activeIndexRef.current];
            const inv = cur?.invoice;
            if (!inv) return;
            const rects = picked.phrases.map(rectOf);

            if (isMetaField(key)) {
                const value = pickedMetaValue(key, picked.texts);
                updateActive(item => ({
                    ...item,
                    meta: { ...item.meta, [key]: value } as ChequeReqMeta,
                    sources: rects.length ? { ...item.sources, [key]: rects } : item.sources,
                    touched: true,
                }));
                return;
            }

            const value = pickedValue(key, picked.texts);
            const place =
                keep && isPlaceField(key) && value
                    ? placeOf(key, picked.phrases, inv.phrases, invoicePageSizes(inv)?.[picked.phrases[0]?.page ?? 0])
                    : null;

            updateActive(item => {
                const nextForm = { ...item.form, [key]: value };
                if (key === 'amount' && item.form.amountQuoted === item.form.amount) {
                    nextForm.amountQuoted = value;
                }
                const nextPlaces = { ...item.meta.places };
                if (isPlaceField(key)) {
                    if (place) nextPlaces[key] = place;
                    else delete nextPlaces[key];
                }
                const nextMeta: ChequeReqMeta = isPlaceField(key)
                    ? { ...item.meta, places: nextPlaces, ...(key === 'description' ? { item: value } : {}) }
                    : item.meta;
                const nextFlags: FieldFlags = { ...item.flags };
                if (value) {
                    nextFlags[key] = {
                        level: 'found',
                        note: place
                            ? 'Picked on the invoice: the supplier’s next invoice is read in the same place'
                            : 'Picked on the invoice',
                        source: rects,
                    };
                } else {
                    delete nextFlags[key];
                }
                const nextSources: FieldSources = rects.length ? { ...item.sources, [key]: rects } : item.sources;
                return {
                    ...item,
                    form: nextForm,
                    meta: nextMeta,
                    flags: nextFlags,
                    sources: nextSources,
                    touched: true,
                };
            });
        },
        [keep, updateActive],
    );

    const handlePick = useCallback(
        (picked: Picked) => {
            if (!picking) return;
            const { key } = picking;
            const multi = !isMetaField(key) && MULTI_PICK.has(key);
            setPicking(multi ? { key, picked, history: [...picking.history, picking.picked] } : null);
            applyPickedToItem(key, picked);
            if (!multi && window.matchMedia?.('(max-width: 1023px)').matches) {
                setMobilePane('form');
                requestAnimationFrame(() => {
                    document.getElementById(`cr-${key}`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
                });
            }
        },
        [picking, applyPickedToItem],
    );

    const handlePickUndo = useCallback(() => {
        if (!picking || picking.history.length === 0) return;
        const previous = picking.history[picking.history.length - 1];
        setPicking({
            key: picking.key,
            picked: previous,
            history: picking.history.slice(0, -1),
        });
        applyPickedToItem(picking.key, previous);
    }, [picking, applyPickedToItem]);

    // DocumentInspector callbacks
    const handleInspectorApply = useCallback(
        (target: PickFieldKey, value: string, source?: Rect[]) => {
            if (isMetaField(target)) {
                updateActive(item => ({
                    ...item,
                    meta: {
                        ...item.meta,
                        [target]: target === 'netAmount' ? parseAmount(value) : value,
                    } as ChequeReqMeta,
                    sources: source?.length ? { ...item.sources, [target]: source } : item.sources,
                    touched: true,
                }));
            } else {
                updateActive(item => {
                    const nextForm = { ...item.form, [target]: value };
                    if (target === 'amount' && item.form.amountQuoted === item.form.amount) {
                        nextForm.amountQuoted = value;
                    }
                    const nextFlags: FieldFlags = {
                        ...item.flags,
                        [target]: { level: 'found', note: 'Applied from invoice', source },
                    };
                    const nextSources: FieldSources = source?.length ? { ...item.sources, [target]: source } : item.sources;
                    return {
                        ...item,
                        form: nextForm,
                        flags: nextFlags,
                        sources: nextSources,
                        touched: true,
                    };
                });
            }
            setActive(target);
        },
        [updateActive],
    );

    const handleInspectorDescription = useCallback(
        (text: string, mode: 'replace' | 'append', source?: Rect[]) => {
            updateActive(item => {
                const cur = item.form.description.trim();
                const nextDesc = mode === 'replace' || !cur ? text : `${cur}, ${text}`;
                const nextFlags = { ...item.flags };
                delete nextFlags.description;
                const nextSources = source?.length ? { ...item.sources, description: source } : item.sources;
                return {
                    ...item,
                    form: { ...item.form, description: nextDesc },
                    flags: nextFlags,
                    sources: nextSources,
                    touched: true,
                };
            });
            setActive('description');
        },
        [updateActive],
    );

    // Attach / add / replace / re-read invoice files
    const openFileIntoQueue = useCallback(
        async (files: File[], mode: 'attach-or-append' | 'replace') => {
            const validFiles: File[] = [];
            for (const file of files) {
                if (!invoiceKind(file)) {
                    toast.error(`${file.name}: ${unsupportedFileReason(file)}`);
                    continue;
                }
                if (file.size > MAX_INVOICE_BYTES) {
                    toast.error(`${file.name}: The file is larger than 25 MB`);
                    continue;
                }
                validFiles.push(file);
            }
            if (validFiles.length === 0) return;

            readAbortRef.current?.abort();
            const controller = new AbortController();
            readAbortRef.current = controller;
            setReadingStatus('Reading the invoice…');

            try {
                const openedList = [];
                for (let i = 0; i < validFiles.length; i++) {
                    const file = validFiles[i];
                    const prefix = validFiles.length > 1 ? `(${i + 1}/${validFiles.length}) ` : '';
                    const opened = await openInvoiceFile(file, {
                        signal: controller.signal,
                        onProgress: p => setReadingStatus(`${prefix}${p.label}`),
                    });
                    openedList.push(opened);
                }

                if (controller.signal.aborted) {
                    for (const o of openedList) closeInvoice(o.invoice);
                    return;
                }

                const cur = itemsRef.current[activeIndexRef.current];
                if (mode === 'replace' && openedList.length > 0 && cur) {
                    const first = openedList[0];
                    const draft = draftFromInvoice({
                        facts: first.facts,
                        history,
                        defaults: effectiveDefaults,
                        fileName: first.fileName,
                        phrases: first.invoice.phrases,
                        pageSizes: invoicePageSizes(first.invoice),
                    });
                    const oldInvoice = cur.invoice;
                    updateActive(item => ({
                        ...sessionToItem({
                            key: item.key,
                            invoice: first.invoice,
                            facts: first.facts,
                            draft,
                            savedId: item.savedId,
                            status: item.status,
                            chequeNumber: item.chequeNumber,
                            notes: item.notes,
                        }),
                        touched: true,
                    }));
                    closeInvoice(oldInvoice);
                    setPicking(null);
                    handleFieldFocus(null);
                    setLeftTab('invoice');
                    toast.success(`Replaced invoice with ${first.fileName}`);
                    return;
                }

                let startIndex = 0;
                if (cur && !cur.invoice && openedList.length > 0) {
                    const first = openedList[0];
                    const freshDraft = draftFromInvoice({
                        facts: first.facts,
                        history,
                        defaults: effectiveDefaults,
                        fileName: first.fileName,
                        phrases: first.invoice.phrases,
                        pageSizes: invoicePageSizes(first.invoice),
                    });
                    const isBlankUntouched =
                        !cur.savedId &&
                        !cur.touched &&
                        !cur.form.payeeName.trim() &&
                        !cur.form.amount.trim();

                    if (isBlankUntouched) {
                        updateActive(item => ({
                            ...sessionToItem({
                                key: item.key,
                                invoice: first.invoice,
                                facts: first.facts,
                                draft: freshDraft,
                                status: item.status,
                                chequeNumber: item.chequeNumber,
                                notes: item.notes,
                            }),
                        }));
                    } else {
                        // Preserve edited/saved requisition values while attaching the invoice & filling blank metadata
                        const nextSources = extractSources(freshDraft);
                        updateActive(item => ({
                            ...item,
                            invoice: first.invoice,
                            facts: first.facts,
                            sources: { ...nextSources, ...item.sources },
                            meta: {
                                ...item.meta,
                                invoiceNumber: item.meta.invoiceNumber || freshDraft.meta.invoiceNumber,
                                invoiceDate: item.meta.invoiceDate || freshDraft.meta.invoiceDate,
                                dueDate: item.meta.dueDate || freshDraft.meta.dueDate,
                                netAmount: item.meta.netAmount ?? freshDraft.meta.netAmount,
                                fileName: first.fileName,
                            },
                            touched: true,
                        }));
                    }
                    setLeftTab('invoice');
                    startIndex = 1;
                }

                if (startIndex < openedList.length) {
                    const appended: QueueItem[] = openedList.slice(startIndex).map(opened => {
                        const draft = draftFromInvoice({
                            facts: opened.facts,
                            history,
                            defaults: effectiveDefaults,
                            fileName: opened.fileName,
                            phrases: opened.invoice.phrases,
                            pageSizes: invoicePageSizes(opened.invoice),
                        });
                        return sessionToItem({
                            key: crypto.randomUUID(),
                            invoice: opened.invoice,
                            facts: opened.facts,
                            draft,
                        });
                    });
                    const firstNewIndex = itemsRef.current.length;
                    setItems(prev => [...prev, ...appended]);
                    setActiveIndex(firstNewIndex);
                    setPicking(null);
                    handleFieldFocus(null);
                    setLeftTab('invoice');
                    toast.success(
                        appended.length === 1
                            ? `Added ${appended[0].invoice?.fileName ?? 'invoice'} to batch`
                            : `Added ${appended.length} invoices to batch`,
                    );
                } else if (startIndex === 1) {
                    toast.success(`Attached ${openedList[0].fileName}`);
                }
            } catch (err) {
                if (!isAbortError(err)) {
                    toast.error(err instanceof Error ? err.message : 'The invoice could not be read');
                }
            } finally {
                if (readAbortRef.current === controller) readAbortRef.current = null;
                setReadingStatus(null);
            }
        },
        [history, effectiveDefaults, updateActive, handleFieldFocus],
    );

    const handleAttachInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length > 0) void openFileIntoQueue(files, 'attach-or-append');
    };

    const handleReplaceFile = useCallback(
        (file: File) => {
            void openFileIntoQueue([file], 'replace');
        },
        [openFileIntoQueue],
    );

    const handleReRead = useCallback(
        async (opts: { rotation?: Rotation; maxPages?: number }) => {
            const cur = itemsRef.current[activeIndexRef.current];
            if (!cur?.invoice) return;
            readAbortRef.current?.abort();
            const controller = new AbortController();
            readAbortRef.current = controller;
            setReReading(true);
            setReadingStatus('Re-reading the invoice…');

            try {
                const { invoice: nextInvoice, facts: nextFacts } = await reReadInvoice(cur.invoice, {
                    ...opts,
                    signal: controller.signal,
                    onProgress: p => setReadingStatus(p.label),
                });
                if (controller.signal.aborted) return;

                const freshDraft = draftFromInvoice({
                    facts: nextFacts,
                    history,
                    defaults: effectiveDefaults,
                    fileName: nextInvoice.fileName,
                    phrases: nextInvoice.phrases,
                    pageSizes: invoicePageSizes(nextInvoice),
                });

                updateActive(item => ({
                    ...sessionToItem({
                        key: item.key,
                        invoice: nextInvoice,
                        facts: nextFacts,
                        draft: {
                            ...freshDraft,
                            form: {
                                ...freshDraft.form,
                                actionNumber: freshDraft.form.actionNumber || item.form.actionNumber,
                                requestedBy: freshDraft.form.requestedBy || item.form.requestedBy,
                                approvedBy: freshDraft.form.approvedBy || item.form.approvedBy,
                            },
                        },
                        savedId: item.savedId,
                        status: item.status,
                        chequeNumber: item.chequeNumber,
                        notes: item.notes,
                    }),
                    touched: item.touched,
                }));
                setPicking(null);
                handleFieldFocus(null);
                toast.success('Invoice re-read');
            } catch (err) {
                if (!isAbortError(err)) {
                    toast.error(err instanceof Error ? `Could not re-read invoice: ${err.message}` : 'Could not re-read invoice');
                }
            } finally {
                if (readAbortRef.current === controller) readAbortRef.current = null;
                setReReading(false);
                setReadingStatus(null);
            }
        },
        [history, effectiveDefaults, updateActive, handleFieldFocus],
    );

    // Global Ctrl+V clipboard image paste listener
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const clipboard = e.clipboardData;
            if (!clipboard?.items?.length) return;
            // Don't hijack normal text pastes inside inputs/textareas
            if (isEditableElement(e.target) && clipboard.getData('text/plain')) return;
            const imageItem = Array.from(clipboard.items).find(
                item => item.kind === 'file' && item.type.startsWith('image/'),
            );
            if (!imageItem) return;
            const rawFile = imageItem.getAsFile();
            if (!rawFile) return;
            e.preventDefault();
            const ext = rawFile.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
            const namedFile =
                rawFile.name && rawFile.name !== 'image.png'
                    ? rawFile
                    : new File([rawFile], `pasted-invoice.${ext}`, { type: rawFile.type });
            void openFileIntoQueue([namedFile], 'attach-or-append');
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [openFileIntoQueue]);

    // Download (.docx or .pdf)
    const executeDownload = async (format: 'docx' | 'pdf') => {
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
    };

    const requestDownload = (format: 'docx' | 'pdf') => {
        if (toCheck.length > 0) setPendingDownload(format);
        else void executeDownload(format);
    };

    // Batch ZIP download
    const downloadBatchZip = async (format: 'docx' | 'pdf') => {
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
    };

    const switchQueueItem = (nextIndex: number) => {
        if (nextIndex < 0 || nextIndex >= items.length || nextIndex === activeIndex) return;
        const target = items[nextIndex];
        lastFlaggedRef.current = null;
        setActiveIndex(nextIndex);
        setPicking(null);
        handleFieldFocus(null);
        setLeftTab(target.invoice ? 'invoice' : 'preview');
    };

    const handleLeftTabChange = (next: LeftTab) => {
        setLeftTab(next);
        if (mobilePane !== 'form') setMobilePane(next);
    };

    const handleMobilePaneChange = (next: MobilePane) => {
        setMobilePane(next);
        if (next !== 'form') setLeftTab(next);
    };

    const handleAttachDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDropActive(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length > 0) void openFileIntoQueue(files, 'attach-or-append');
    };

    const highlight = !picking && active ? activeItem.sources[active] : undefined;
    const highlightText = !picking ? activeHighlightText(active, activeItem.form, activeItem.meta) : undefined;
    const pickMode: PickMode | undefined = picking
        ? {
            label: FIELD_LABELS[picking.key],
            multi: !isMetaField(picking.key) && MULTI_PICK.has(picking.key),
            picked: picking.picked,
            onPick: handlePick,
            onDone: () => setPicking(null),
            onUndo:
                !isMetaField(picking.key) && MULTI_PICK.has(picking.key) && picking.history.length > 0
                    ? handlePickUndo
                    : undefined,
            count: picking.picked.texts.length,
        }
        : undefined;

    const title = [activeItem.form.payeeName.trim() || 'New requisition', activeItem.meta.invoiceNumber]
        .filter(Boolean)
        .join(' · ');
    const isBusy = busyAction !== null;
    const statusBadge = STATUS_BADGE[activeItem.status];

    return (
        <div className="space-y-4">
            {/* Hidden multi-file input for Attach invoice & + Add invoices */}
            <input
                ref={attachInputRef}
                type="file"
                accept={INVOICE_ACCEPT}
                multiple
                onChange={handleAttachInputChange}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
            />

            {/* Sticky workspace header */}
            <div className="sticky top-14 z-10 -mx-3 px-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-2.5 bg-background/90 backdrop-blur-md border-b border-border-subtle">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="ghost"
                        aria-label={backLabel}
                        onClick={() => (anyUnsaved ? setConfirmLeave(true) : onBack())}
                    >
                        <ArrowLeft size={15} />
                        <span className="sm:hidden">Back</span>
                        <span className="hidden sm:inline">{backLabel}</span>
                    </Button>

                    {/* Title & invoice subtitle */}
                    <div className="min-w-0 basis-full order-last sm:order-none sm:basis-0 sm:flex-1 flex items-center gap-2">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <h2 className="text-base sm:text-lg font-semibold text-primary tracking-tight truncate">
                                    {title}
                                </h2>
                                {keep && (
                                    <Badge tone={statusBadge.tone} className="shrink-0">
                                        {statusBadge.label}
                                    </Badge>
                                )}
                            </div>
                            {(activeItem.invoice || readingStatus) && (
                                <p className="text-xs text-muted truncate flex items-center gap-1.5">
                                    {readingStatus ? (
                                        <>
                                            <Loader2 size={11} className="animate-spin shrink-0 text-brand-500" />
                                            <span>{readingStatus}</span>
                                        </>
                                    ) : (
                                        activeItem.invoice?.fileName
                                    )}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Header actions */}
                    <div className="flex items-center gap-1.5 ml-auto sm:ml-0 flex-wrap">
                        {!activeItem.invoice && (
                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={!!readingStatus}
                                onClick={() => attachInputRef.current?.click()}
                                title="Attach invoice file"
                            >
                                <Paperclip size={14} />
                                <span className="sr-only md:not-sr-only">Attach invoice</span>
                            </Button>
                        )}
                        {onOpenDefaults && (
                            <IconButton label="Requisition defaults" onClick={onOpenDefaults}>
                                <Settings2 size={16} />
                            </IconButton>
                        )}
                        {keep && (
                            <Button
                                size="sm"
                                variant="secondary"
                                loading={busyAction === 'save'}
                                disabled={isBusy && busyAction !== 'save'}
                                onClick={() => void saveOnly()}
                                title="Save draft without downloading (Ctrl+S)"
                            >
                                {busyAction !== 'save' && <Save size={14} />}
                                <span className="sr-only sm:not-sr-only">Save</span>
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="secondary"
                            loading={printing}
                            disabled={isBusy}
                            onClick={() => void print(activeItem.form, activeItem.meta)}
                            title="Print requisition"
                        >
                            {!printing && <Printer size={14} />}
                            <span className="sr-only md:not-sr-only">Print</span>
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            loading={busyAction === 'pdf'}
                            disabled={isBusy && busyAction !== 'pdf'}
                            onClick={() => requestDownload('pdf')}
                            title="Download print-ready PDF"
                        >
                            {busyAction !== 'pdf' && <FileDown size={14} />}
                            <span className="sr-only md:not-sr-only">PDF</span>
                        </Button>
                        <Button
                            size="sm"
                            variant="primary"
                            loading={busyAction === 'docx'}
                            disabled={isBusy && busyAction !== 'docx'}
                            onClick={() => requestDownload('docx')}
                        >
                            {busyAction !== 'docx' && <Download size={14} />}
                            <span>Download</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Batch queue strip when multiple invoices are open */}
            {items.length > 1 && (
                <section
                    aria-label="Batch invoice queue"
                    className="rounded-2xl bg-surface border border-border-subtle shadow-card p-2.5 flex flex-wrap items-center gap-2"
                >
                    <div className="flex items-center gap-1 shrink-0">
                        <IconButton
                            size="sm"
                            label="Previous invoice"
                            disabled={activeIndex === 0}
                            onClick={() => switchQueueItem(activeIndex - 1)}
                        >
                            <ChevronLeft size={15} />
                        </IconButton>
                        <span className="text-xs font-semibold text-muted tabular-nums px-1">
                            {activeIndex + 1} / {items.length}
                        </span>
                        <IconButton
                            size="sm"
                            label="Next invoice"
                            disabled={activeIndex === items.length - 1}
                            onClick={() => switchQueueItem(activeIndex + 1)}
                        >
                            <ChevronRight size={15} />
                        </IconButton>
                    </div>

                    <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                        {items.map((item, idx) => {
                            const selected = idx === activeIndex;
                            const itemFlags = flaggedKeys(item.flags).length;
                            const label =
                                item.form.payeeName.trim() ||
                                item.meta.invoiceNumber.trim() ||
                                item.invoice?.fileName ||
                                `Requisition ${idx + 1}`;
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => switchQueueItem(idx)}
                                    className={`shrink-0 max-w-48 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium border transition-all ${
                                        selected
                                            ? 'bg-brand-500/12 border-brand-500/40 text-brand-700 dark:text-brand-300 shadow-xs'
                                            : 'bg-surface-elevated/60 border-border-subtle text-muted hover:text-primary hover:border-border-strong'
                                    }`}
                                >
                                    {item.downloaded ? (
                                        <CheckIcon size={12} className="text-status-confirmed shrink-0" />
                                    ) : (
                                        <span
                                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                itemFlags > 0 ? 'bg-warning' : 'bg-success'
                                            }`}
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span className="truncate">{label}</span>
                                    {!item.downloaded && itemFlags > 0 && (
                                        <span className="text-[10px] font-bold text-status-requested tabular-nums shrink-0">
                                            {itemFlags}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                            size="xs"
                            variant="ghost"
                            disabled={!!readingStatus}
                            onClick={() => attachInputRef.current?.click()}
                        >
                            <Plus size={13} /> Add invoices
                        </Button>
                        <Menu
                            label="Download all as ZIP"
                            triggerClassName={buttonCls('brand-soft', 'xs')}
                            items={[
                                {
                                    label: 'All as Word (.docx ZIP)',
                                    icon: <FileText size={14} />,
                                    onSelect: () => void downloadBatchZip('docx'),
                                },
                                {
                                    label: 'All as PDF (.pdf ZIP)',
                                    icon: <FileSpreadsheet size={14} />,
                                    onSelect: () => void downloadBatchZip('pdf'),
                                },
                            ]}
                        >
                            {busyAction === 'batch' ? (
                                <>
                                    <Loader2 size={13} className="animate-spin" />
                                    <span>{batchProgress ?? 'Building ZIP…'}</span>
                                </>
                            ) : (
                                <>
                                    <FolderArchive size={13} />
                                    <span>Download all (.zip)</span>
                                    <ChevronDown size={12} />
                                </>
                            )}
                        </Menu>
                    </div>
                </section>
            )}

            {/* Checks alert strip */}
            {checks.length > 0 && (
                <section
                    aria-label="Checks"
                    className={`rounded-xl border p-3 ${
                        warnings ? 'border-warning/30 bg-warning/5' : 'border-border-subtle bg-surface'
                    }`}
                >
                    <ul className="space-y-1.5">
                        {checks.map((c, i) => (
                            <CheckRow key={i} check={c} onOpenSaved={onOpenSaved} />
                        ))}
                    </ul>
                </section>
            )}

            {/* Mobile pane switch */}
            <div className="lg:hidden">
                <Segmented<MobilePane>
                    ariaLabel="Workspace view"
                    value={mobilePane}
                    onChange={handleMobilePaneChange}
                    options={[
                        { value: 'form', label: 'Form', count: toCheck.length > 0 ? toCheck.length : undefined },
                        { value: 'invoice', label: 'Invoice' },
                        { value: 'preview', label: 'Preview' },
                    ]}
                />
            </div>

            {/* Two-Pane Studio Workspace */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)] items-start">
                {/* Left sticky pane: Invoice + Document Inspector OR Live formatted Word preview */}
                <div className={`space-y-3 lg:sticky lg:top-28 ${mobilePane === 'form' ? 'hidden lg:block' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                        <Segmented<LeftTab>
                            ariaLabel="Document view"
                            value={leftTab}
                            onChange={handleLeftTabChange}
                            options={[
                                { value: 'invoice', label: 'Invoice' },
                                { value: 'preview', label: 'Live form (.docx)' },
                            ]}
                        />
                        {!activeItem.invoice && (
                            <Button
                                size="xs"
                                variant="ghost"
                                disabled={!!readingStatus}
                                onClick={() => attachInputRef.current?.click()}
                            >
                                <FileUp size={13} /> Attach invoice
                            </Button>
                        )}
                    </div>

                    {leftTab === 'invoice' ? (
                        activeItem.invoice ? (
                            <div className="space-y-3">
                                <InvoicePreview
                                    invoice={activeItem.invoice}
                                    highlight={highlight}
                                    highlightText={highlightText}
                                    pick={pickMode}
                                    onReRead={handleReRead}
                                    reReading={reReading}
                                    onReplaceFile={handleReplaceFile}
                                />

                                <DocumentInspector
                                    invoice={activeItem.invoice}
                                    facts={activeItem.facts}
                                    activeField={focusedField}
                                    onApplyValue={handleInspectorApply}
                                    onInsertDescription={handleInspectorDescription}
                                />
                            </div>
                        ) : (
                            <div
                                onDragOver={e => {
                                    e.preventDefault();
                                    setDropActive(true);
                                }}
                                onDragLeave={() => setDropActive(false)}
                                onDrop={handleAttachDrop}
                                className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                                    dropActive
                                        ? 'border-brand-500 bg-brand-500/5'
                                        : 'border-border-subtle bg-surface'
                                }`}
                            >
                                <div className="mx-auto w-11 h-11 rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
                                    {readingStatus ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} />}
                                </div>
                                <p className="text-sm font-semibold text-primary">
                                    {readingStatus ?? 'No invoice attached yet'}
                                </p>
                                <p className="mt-1 text-xs text-muted max-w-xs mx-auto leading-relaxed">
                                    Drop a PDF, Word file, or photo here — or press <kbd className="px-1 py-0.5 rounded bg-surface-elevated border border-border-subtle font-mono text-[10px]">Ctrl+V</kbd> to paste a screenshot.
                                </p>
                                <div className="mt-4">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={!!readingStatus}
                                        onClick={() => attachInputRef.current?.click()}
                                    >
                                        <Paperclip size={14} /> Choose invoice file
                                    </Button>
                                </div>
                            </div>
                        )
                    ) : (
                        <RequisitionLivePreview
                            form={activeItem.form}
                            meta={activeItem.meta}
                            onDownloadDocx={() => requestDownload('docx')}
                            onDownloadPdf={() => requestDownload('pdf')}
                            onPrint={() => void print(activeItem.form, activeItem.meta)}
                            downloading={isBusy || printing}
                        />
                    )}
                </div>

                {/* Right column: Guided review bar + Smart Requisition Form */}
                <div className={`space-y-3 ${mobilePane !== 'form' ? 'hidden lg:block' : ''}`}>
                    {toCheck.length > 0 && (
                        <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs text-primary">
                                <TriangleAlert size={14} className="text-status-requested shrink-0" />
                                <span className="font-semibold">
                                    {toCheck.length} {toCheck.length === 1 ? 'field needs' : 'fields need'} a quick check
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    size="xs"
                                    variant="secondary"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => jumpToFlagged(1)}
                                    title="Jump to next flagged field (Alt+Down)"
                                >
                                    <ArrowDown size={12} /> Next to check
                                    <kbd className="hidden sm:inline ml-0.5 text-[10px] text-muted font-mono">Alt+↓</kbd>
                                </Button>
                                {checkOnlyKeys.length > 0 && (
                                    <Button
                                        size="xs"
                                        variant="brand-soft"
                                        onClick={acceptAllGuesses}
                                    >
                                        <CheckCheck size={12} /> Accept all guesses
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    <Card
                        title="Cheque requisition"
                        icon={FileText}
                        subtitle={
                            toCheck.length
                                ? 'Orange: a guess to check · red: not found · blue: as last time for this supplier'
                                : 'Everything is filled in: download it when ready'
                        }
                        action={
                            toCheck.length > 0 ? (
                                <Badge tone="warning">{toCheck.length} to check</Badge>
                            ) : (
                                <Badge tone="success">Ready</Badge>
                            )
                        }
                        divided
                    >
                        <RequisitionForm
                            form={activeItem.form}
                            meta={activeItem.meta}
                            facts={activeItem.facts}
                            flags={activeItem.flags}
                            suppliers={suppliers}
                            matchedSupplierName={activeItem.matchedSupplierName}
                            showTracking={!!keep}
                            status={activeItem.status}
                            chequeNumber={activeItem.chequeNumber}
                            notes={activeItem.notes}
                            descriptionPresets={effectiveDefaults.descriptionPresets}
                            onChange={change}
                            onMetaChange={changeMeta}
                            onTrackingChange={keep ? changeTracking : undefined}
                            onSelectSupplier={keep ? handleSelectSupplier : undefined}
                            onUseInvoiceValues={activeItem.matchedSupplierName ? handleUseInvoiceValues : undefined}
                            onAccept={unflag}
                            onActive={handleFieldFocus}
                            onPick={activeItem.invoice ? startPick : undefined}
                            picking={picking?.key}
                        />

                        <div className="mt-5 pt-4 border-t border-border-subtle flex flex-wrap items-center justify-end gap-2">
                            {!keep ? (
                                <p className="text-xs text-muted mr-auto">
                                    Nothing is saved: you only get the file you download.
                                </p>
                            ) : (
                                !historyAvailable && (
                                    <p className="text-xs text-muted mr-auto">
                                        Not kept in a history until migration 88 is applied.
                                    </p>
                                )
                            )}
                            <Button
                                variant="secondary"
                                size="md"
                                loading={printing}
                                disabled={isBusy}
                                onClick={() => void print(activeItem.form, activeItem.meta)}
                            >
                                {!printing && <Printer size={15} />} Print
                            </Button>
                            <Button
                                variant="secondary"
                                size="md"
                                loading={busyAction === 'pdf'}
                                disabled={isBusy && busyAction !== 'pdf'}
                                onClick={() => requestDownload('pdf')}
                            >
                                {busyAction !== 'pdf' && <FileDown size={15} />} PDF
                            </Button>
                            <Button
                                variant="primary"
                                size="lg"
                                loading={busyAction === 'docx'}
                                disabled={isBusy && busyAction !== 'docx'}
                                onClick={() => requestDownload('docx')}
                            >
                                {busyAction !== 'docx' && <Download size={16} />} Download the requisition (.docx)
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>

            <ConfirmDialog
                open={pendingDownload !== null}
                variant="warning"
                title="Some fields still need a look"
                message={`${toCheck.map(k => FIELD_LABELS[k]).join(', ')}: these are marked in orange or red. Download the requisition anyway?`}
                confirmLabel="Download anyway"
                onConfirm={() => {
                    if (pendingDownload) void executeDownload(pendingDownload);
                }}
                onCancel={() => setPendingDownload(null)}
            />

            <ConfirmDialog
                open={confirmLeave}
                variant="warning"
                title={items.length > 1 ? 'Leave these requisitions?' : 'Leave this requisition?'}
                message={
                    items.length > 1
                        ? 'Unsaved changes or requisitions not yet downloaded will be lost.'
                        : activeItem.downloaded
                            ? 'Changes made since the last download are lost.'
                            : activeItem.savedId
                                ? 'Changes made since the last save are lost.'
                                : 'It hasn’t been downloaded yet: what you filled in is lost.'
                }
                confirmLabel="Leave"
                onConfirm={() => {
                    setConfirmLeave(false);
                    onBack();
                }}
                onCancel={() => setConfirmLeave(false)}
            />

            {printNode}
        </div>
    );
}

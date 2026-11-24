import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInRouterContext } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowRight,
    Building2,
    ChevronDown,
    ClipboardPaste,
    Download,
    Eye,
    FileCheck2,
    FileEdit,
    FilePlus2,
    FileText,
    History,
    Link2,
    Loader2,
    Receipt,
    Search,
    SlidersHorizontal,
    UploadCloud,
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import Badge, { type BadgeTone } from './ui/Badge';
import { Button, IconButton } from './ui/Button';
import Card from './ui/Card';
import FileDropzone from './ui/FileDropzone';
import { RouterTabSync } from './ui/RouterTabSync';
import StatTile from './ui/StatTile';
import { EmptyState, ErrorState, SkeletonRows } from './ui/States';
import { UnderlineTabs, type UnderlineTab } from './ui/Tabs';
import { calloutCls, panelCls } from './ui/styles';
import DefaultsModal from './ChequeRequisitions/DefaultsModal';
import ChequeReqEditor, { type EditorSession } from './ChequeRequisitions/Editor';
import HistoryTab from './ChequeRequisitions/HistoryTab';
import SuppliersTab from './ChequeRequisitions/SuppliersTab';
import { ReadingProgressBanner } from './ChequeRequisitions/chequeHelpers';
import { clipboardFiles, isEditableTarget } from './ChequeRequisitions/chequeUtils';
import {
    blankSession,
    closeInvoice,
    invoicePageSizes,
    NO_FACTS,
    supplierSession,
    useOpenInvoice,
    type OpenedInvoice,
} from './ChequeRequisitions/useOpenInvoice';
import { useAuth } from '../contexts/AuthContext';
import {
    CHEQUE_REQ_KEY,
    fetchChequeReqHistory,
    useChequeReqHistory,
    useDeleteChequeReq,
    useResetSupplierMemory,
    useSaveChequeReq,
    useUpdateChequeReqStatus,
    type ChequeReqHistory,
} from '../hooks/useChequeRequisitions';
import { formatDisplayDate, todayISO } from '../lib/dateUtils';
import { staffNameOf } from '../lib/documentUtils';
import { downloadBlob } from '../lib/download';
import { toast } from '../lib/toast';
import { chequeReqFileName, renderChequeReq } from '../lib/chequeReq/docx';
import {
    draftFromInvoice,
    getReqChequeNumber,
    getReqNotes,
    getReqStatus,
    idsOfSaved,
    readDefaults,
    sameSupplier,
    suppliersSummary,
    type ChequeReqDefaults,
} from '../lib/chequeReq/draft';
import { formatAmount, parseAmount } from '../lib/chequeReq/parse';
import { INVOICE_ACCEPT } from '../lib/chequeReq/read';
import { EMPTY_FORM, type ChequeReqStatus, type SavedChequeReq, type SupplierSummary } from '../lib/chequeReq/types';

type ChequeTabKey = 'new' | 'history' | 'suppliers';

function isChequeTabKey(value: string | null): value is ChequeTabKey {
    return value === 'new' || value === 'history' || value === 'suppliers';
}

const RECENT_STATUS: Record<ChequeReqStatus, { label: string; tone: BadgeTone }> = {
    draft: { label: 'Draft', tone: 'warning' },
    ready: { label: 'Ready', tone: 'info' },
    paid: { label: 'Paid', tone: 'success' },
};

function KnownSupplierPicker({
    suppliers,
    disabled,
    onPick,
}: {
    suppliers: SupplierSummary[];
    disabled?: boolean;
    onPick: (latestRow: SavedChequeReq) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            clearTimeout(focusTimer);
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return suppliers.slice(0, 12);
        return suppliers
            .filter(s => [s.name, s.vat, s.email, s.phone].join(' ').toLowerCase().includes(q))
            .slice(0, 20);
    }, [suppliers, query]);

    if (suppliers.length === 0) return null;

    return (
        <div ref={rootRef} className="relative">
            <Button
                variant="secondary"
                size="sm"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => {
                    setOpen(prev => !prev);
                    setQuery('');
                }}
            >
                <Building2 size={14} />
                Start from known supplier
                <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>

            {open && (
                <div className="absolute left-0 top-full mt-1.5 z-40 w-72 sm:w-80 rounded-xl bg-surface border border-border-subtle shadow-float p-2 animate-popoverScaleIn origin-top-left">
                    <div className="relative mb-1.5">
                        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Filter suppliers…"
                            aria-label="Filter known suppliers"
                            className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-surface-elevated border border-border-subtle text-xs text-primary placeholder:text-muted/70 focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                        />
                    </div>
                    <div role="listbox" aria-label="Known suppliers" className="max-h-60 overflow-y-auto divide-y divide-border-subtle/50">
                        {filtered.length === 0 ? (
                            <p className="py-4 text-center text-xs text-muted">No matching suppliers</p>
                        ) : (
                            filtered.map(s => (
                                <button
                                    key={s.key}
                                    type="button"
                                    role="option"
                                    aria-selected={false}
                                    onClick={() => {
                                        setOpen(false);
                                        onPick(s.latest);
                                    }}
                                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-surface-elevated transition-colors cursor-pointer"
                                >
                                    <div className="min-w-0">
                                        <span className="block text-xs font-semibold text-primary truncate">{s.name}</span>
                                        {(s.vat || s.email) && (
                                            <span className="block text-[11px] text-muted truncate">
                                                {s.vat ? `VAT ${s.vat}` : s.email}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] text-muted tabular-nums shrink-0">
                                        {s.count} req{s.count === 1 ? '' : 's'}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Cheque requisitions (admins): drop one or more supplier invoices, inspect highlights and live
 * SICAP preview, track history statuses, and monitor the €5,000 annual supplier limit.
 * Invoice files are read locally in the browser and never uploaded.
 */
export default function ChequeRequisitions() {
    const inRouter = useInRouterContext();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const staffName = useMemo(() => staffNameOf(user), [user]);

    const { data: history, isLoading, error, refetch } = useChequeReqHistory();
    const save = useSaveChequeReq();
    const remove = useDeleteChequeReq();
    const updateStatus = useUpdateChequeReqStatus();
    const resetMemory = useResetSupplierMemory();

    const [activeTab, setActiveTab] = useState<ChequeTabKey>('new');
    const [routerNav, setRouterNav] = useState<((tab: ChequeTabKey) => void) | null>(null);
    const [supplierFilter, setSupplierFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<ChequeReqStatus | 'all'>('all');

    const [queue, setQueue] = useState<EditorSession[] | null>(null);
    const queueRef = useRef<EditorSession[] | null>(null);

    const [defaultsOpen, setDefaultsOpen] = useState(false);
    const [storedDefaults, setStoredDefaults] = useState<ChequeReqDefaults>(() => readDefaults());
    const [confirmDelete, setConfirmDelete] = useState<SavedChequeReq | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    // Safe cleanup of any loaded PDF/image invoice resources on unmount
    useEffect(() => {
        return () => {
            queueRef.current?.forEach(s => closeInvoice(s.invoice));
            queueRef.current = null;
        };
    }, []);

    const registerNavigate = useCallback((fn: (tab: ChequeTabKey) => void) => {
        setRouterNav(() => fn);
    }, []);

    const handleNavigateTab = useCallback(
        (nextTab: ChequeTabKey) => {
            setActiveTab(nextTab);
            routerNav?.(nextTab);
        },
        [routerNav],
    );

    const rows = useMemo(() => history?.rows ?? [], [history]);
    const year = todayISO().slice(0, 4);

    const kpis = useMemo(() => {
        const yearRows = rows.filter(r => (r.invoice_date || r.created_at).slice(0, 4) === year);
        const yearGross = Math.round(yearRows.reduce((sum, r) => sum + (r.amount ?? parseAmount(r.form.amount) ?? 0), 0) * 100) / 100;
        const yearSuppliers = suppliersSummary(rows, year);
        const exceededCount = yearSuppliers.filter(s => s.tier === 'exceeded').length;
        const approachingCount = yearSuppliers.filter(s => s.tier === 'approaching').length;
        const draftsCount = rows.filter(r => getReqStatus(r) === 'draft').length;
        const allSuppliers = suppliersSummary(rows, 'all');
        const learnedSuppliersCount = allSuppliers.filter(s => s.learnedPlaces.length > 0).length;
        return {
            yearCount: yearRows.length,
            yearGross,
            exceededCount,
            approachingCount,
            flaggedSuppliersCount: exceededCount + approachingCount,
            draftsCount,
            allSuppliers,
            learnedSuppliersCount,
        };
    }, [rows, year]);

    const recentRows = useMemo(() => rows.slice(0, 5), [rows]);

    // Never inherit another coordinator's requestedBy from shared DB history
    const defaultsFor = useCallback(
        (hist: ChequeReqHistory | undefined, base?: ChequeReqDefaults): ChequeReqDefaults => {
            const stored = base ?? readDefaults();
            const lastAction = hist?.rows[0]?.form.actionNumber || '';
            return {
                actionNumber: stored.actionNumber || lastAction,
                requestedBy: stored.requestedBy || staffName,
                descriptionPattern: stored.descriptionPattern,
                ...(stored.approvedBy ? { approvedBy: stored.approvedBy } : {}),
                ...(stored.descriptionPresets?.length ? { descriptionPresets: stored.descriptionPresets } : {}),
            };
        },
        [staffName],
    );

    const editorDefaults = useMemo(() => defaultsFor(history, storedDefaults), [defaultsFor, history, storedDefaults]);

    const replaceQueue = useCallback((next: EditorSession[] | null) => {
        queueRef.current?.forEach(s => closeInvoice(s.invoice));
        queueRef.current = next;
        setQueue(next);
    }, []);

    const handleInvoicesRead = useCallback(
        async (items: OpenedInvoice[]) => {
            if (items.length === 0) return;
            // Fetch latest history first so supplier details & learned zones are fresh
            const hist = await queryClient
                .fetchQuery({ queryKey: CHEQUE_REQ_KEY, queryFn: fetchChequeReqHistory, staleTime: 30_000 })
                .catch(() => history);
            const defaults = defaultsFor(hist);
            const sessions: EditorSession[] = items.map(({ invoice, facts, fileName }) => ({
                key: crypto.randomUUID(),
                invoice,
                facts,
                draft: draftFromInvoice({
                    facts,
                    history: hist?.rows ?? [],
                    defaults,
                    fileName,
                    phrases: invoice.phrases,
                    pageSizes: invoicePageSizes(invoice),
                }),
                status: 'draft',
            }));
            replaceQueue(sessions);
        },
        [queryClient, history, defaultsFor, replaceQueue],
    );

    const { reading, progress, open: openInvoice, openFiles, cancel } = useOpenInvoice(handleInvoicesRead);

    // Global Ctrl+V clipboard screenshot/file paste when on the New tab with no modal open
    useEffect(() => {
        if (queue || activeTab !== 'new' || defaultsOpen || confirmDelete) return;
        const onPaste = (e: ClipboardEvent) => {
            if (isEditableTarget(e.target)) return;
            const files = clipboardFiles(e.clipboardData);
            if (files.length === 0) return;
            e.preventDefault();
            void openFiles(files);
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [queue, activeTab, defaultsOpen, confirmDelete, openFiles]);

    const startBlank = useCallback(() => {
        replaceQueue([blankSession(defaultsFor(history))]);
    }, [replaceQueue, defaultsFor, history]);

    const startForSupplier = useCallback(
        (latestRow: SavedChequeReq) => {
            replaceQueue([supplierSession(latestRow, defaultsFor(history))]);
        },
        [replaceQueue, defaultsFor, history],
    );

    const openSaved = useCallback(
        (row: SavedChequeReq) => {
            replaceQueue([
                {
                    key: row.id,
                    invoice: null,
                    facts: NO_FACTS,
                    draft: {
                        form: structuredClone(row.form),
                        flags: {},
                        meta: structuredClone(row.meta),
                    },
                    savedId: row.id,
                    status: getReqStatus(row),
                    chequeNumber: getReqChequeNumber(row),
                    notes: getReqNotes(row),
                },
            ]);
        },
        [replaceQueue],
    );

    const openSavedById = useCallback(
        (id: string) => {
            const found = rows.find(r => r.id === id);
            if (found) {
                openSaved(found);
            } else {
                toast.error('Could not find that saved requisition');
            }
        },
        [rows, openSaved],
    );

    const duplicateSaved = useCallback(
        (row: SavedChequeReq) => {
            const defaults = defaultsFor(history);
            const nextForm = structuredClone(row.form);
            nextForm.requestedDate = '';
            nextForm.approvedDate = '';
            nextForm.checklist = { ...EMPTY_FORM.checklist };
            if (defaults.requestedBy) nextForm.requestedBy = defaults.requestedBy;

            const nextMeta = structuredClone(row.meta);
            nextMeta.invoiceNumber = '';
            nextMeta.invoiceDate = '';
            nextMeta.dueDate = '';
            nextMeta.fileName = '';
            nextMeta.status = 'draft';
            nextMeta.chequeNumber = '';
            nextMeta.notes = '';

            replaceQueue([
                {
                    key: crypto.randomUUID(),
                    invoice: null,
                    facts: NO_FACTS,
                    draft: { form: nextForm, flags: {}, meta: nextMeta, previous: row },
                    status: 'draft',
                },
            ]);
            toast.info('Duplicated as a new draft — update the invoice details before saving.');
        },
        [defaultsFor, history, replaceQueue],
    );

    const closeSession = useCallback(() => {
        replaceQueue(null);
        setStoredDefaults(readDefaults());
    }, [replaceQueue]);

    const copyPublicLink = async () => {
        const link = `${window.location.origin}/cheque`;
        try {
            await navigator.clipboard.writeText(link);
            toast.success('Link copied. Anyone with it can make a requisition without signing in; nothing they add is saved, and they see nothing from the CRM.');
        } catch {
            toast.error(`Could not copy the link: it is ${link}`);
        }
    };

    const downloadRecentDocx = async (row: SavedChequeReq) => {
        setDownloadingId(row.id);
        try {
            downloadBlob(await renderChequeReq(row.form), chequeReqFileName(row.meta, row.form));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not make the document');
        } finally {
            setDownloadingId(prev => (prev === row.id ? null : prev));
        }
    };

    const handleUpdateStatus = async (row: SavedChequeReq, status: ChequeReqStatus) => {
        try {
            await updateStatus.mutateAsync({ id: row.id, status, meta: row.meta });
            toast.success(`Marked as ${RECENT_STATUS[status].label}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not update status');
        }
    };

    const handleResetMemory = async (supplier: SupplierSummary) => {
        const latestIds = idsOfSaved(supplier.latest);
        const matchingIds = new Set<string>(supplier.requisitionIds);
        for (const r of rows) {
            if (sameSupplier(idsOfSaved(r), latestIds)) matchingIds.add(r.id);
        }
        try {
            await resetMemory.mutateAsync({ ids: Array.from(matchingIds) });
            toast.success(`Cleared learned invoice zones for ${supplier.name}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not reset learned zones');
            throw err;
        }
    };

    const tabs: UnderlineTab<ChequeTabKey>[] = [
        {
            value: 'new',
            label: 'New / Queue',
            icon: UploadCloud,
        },
        {
            value: 'history',
            label: 'History',
            icon: History,
            count: rows.length,
        },
        {
            value: 'suppliers',
            label: 'Suppliers & €5k',
            icon: Building2,
            count: kpis.allSuppliers.length,
            countTone: kpis.exceededCount > 0 ? 'warning' : 'default',
            dot: kpis.exceededCount > 0 ? 'bg-warning' : undefined,
            dotLabel:
                kpis.exceededCount > 0
                    ? `${kpis.exceededCount} supplier${kpis.exceededCount === 1 ? '' : 's'} at or above €5,000`
                    : undefined,
        },
    ];

    return (
        <>
            {queue ? (
                <ChequeReqEditor
                    key={queue[0].key}
                    session={queue[0]}
                    initialSessions={queue}
                    history={rows}
                    historyAvailable={history?.available ?? false}
                    keep={input => save.mutateAsync(input)}
                    defaults={editorDefaults}
                    onOpenSaved={openSavedById}
                    onOpenDefaults={() => setDefaultsOpen(true)}
                    onBack={closeSession}
                />
            ) : (
                <div className="max-w-[1600px] mx-auto flex-1 flex flex-col gap-5 sm:gap-6 pb-12 w-full">
                    {inRouter && (
                        <RouterTabSync
                            activeTab={activeTab}
                            isValidTab={isChequeTabKey}
                            onTabFromUrl={setActiveTab}
                            registerNavigate={registerNavigate}
                        />
                    )}

                    {/* 4 clickable KPI StatTiles */}
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                        <StatTile
                            label={`Requisitions (${year})`}
                            icon={Receipt}
                            tone="brand"
                            loading={isLoading}
                            value={kpis.yearCount}
                            hint={`€${formatAmount(kpis.yearGross)} total`}
                            onClick={() => {
                                setSupplierFilter('');
                                setStatusFilter('all');
                                handleNavigateTab('history');
                            }}
                        />
                        <StatTile
                            label="Suppliers near / over €5k"
                            icon={AlertTriangle}
                            tone={kpis.exceededCount > 0 ? 'warning' : 'success'}
                            loading={isLoading}
                            value={kpis.flaggedSuppliersCount}
                            hint={
                                kpis.exceededCount > 0
                                    ? '3 quotes required'
                                    : kpis.approachingCount > 0
                                        ? `${kpis.approachingCount} approaching €5,000`
                                        : 'All below €4,000'
                            }
                            hintTone={kpis.exceededCount > 0 ? 'alert' : kpis.approachingCount > 0 ? 'muted' : 'positive'}
                            onClick={() => handleNavigateTab('suppliers')}
                        />
                        <StatTile
                            label="Drafts to finish"
                            icon={FileEdit}
                            tone="info"
                            loading={isLoading}
                            value={kpis.draftsCount}
                            hint={kpis.draftsCount > 0 ? 'Resume saved drafts' : 'All caught up'}
                            onClick={() => {
                                setSupplierFilter('');
                                setStatusFilter('draft');
                                handleNavigateTab('history');
                            }}
                        />
                        <StatTile
                            label="Remembered suppliers"
                            icon={Building2}
                            tone="completed"
                            loading={isLoading}
                            value={kpis.allSuppliers.length}
                            hint={
                                kpis.learnedSuppliersCount > 0
                                    ? `${kpis.learnedSuppliersCount} with learned invoice zones`
                                    : 'Auto-fills supplier details'
                            }
                            onClick={() => handleNavigateTab('suppliers')}
                        />
                    </div>

                    {/* Top workspace bar: UnderlineTabs + right-side actions */}
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border-subtle">
                        <UnderlineTabs<ChequeTabKey>
                            ariaLabel="Cheque requisition sections"
                            tabs={tabs}
                            value={activeTab}
                            onChange={handleNavigateTab}
                            className="border-b-0 -mb-px"
                        />
                        <div className="flex items-center gap-2 flex-wrap pb-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDefaultsOpen(true)}
                                title="Set your default SICAP action number, requester name, approver, and description presets"
                            >
                                <SlidersHorizontal size={14} />
                                Defaults
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={copyPublicLink}
                                title="A link to this page without signing in, to share: it saves nothing and shows nothing from the CRM"
                            >
                                <Link2 size={14} />
                                Copy public link
                            </Button>
                            <Button variant="primary" size="sm" onClick={startBlank}>
                                <FilePlus2 size={14} />
                                Blank requisition
                            </Button>
                        </div>
                    </div>

                    {/* Active tab panel */}
                    <div key={activeTab} className="animate-fadeIn">
                        {activeTab === 'new' && (
                            <div className="space-y-5">
                                <Card>
                                    <div className="space-y-4">
                                        <FileDropzone
                                            multiple
                                            accept={INVOICE_ACCEPT}
                                            onChange={openInvoice}
                                            uploading={!!reading}
                                            uploadingTitle={progress?.label || reading || 'Reading invoice…'}
                                            icon={<FileText size={20} />}
                                            title="Make a requisition: click here to choose one or more invoices, or drag them onto this box"
                                            hint="PDF, Word (.docx), scan, or photo of a paper invoice. Multi-file drops open as a queue — files are read locally and never uploaded."
                                            className="py-10"
                                        />

                                        <ReadingProgressBanner reading={reading} progress={progress} onCancel={cancel} />

                                        {/* Quick-start bar */}
                                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button variant="secondary" size="sm" onClick={startBlank} disabled={!!reading}>
                                                    <FilePlus2 size={14} />
                                                    Start blank requisition
                                                </Button>
                                                <KnownSupplierPicker
                                                    suppliers={kpis.allSuppliers}
                                                    disabled={!!reading}
                                                    onPick={startForSupplier}
                                                />
                                            </div>
                                            <span className="inline-flex items-center gap-1.5 text-xs text-muted px-2.5 py-1 rounded-lg bg-surface-elevated border border-border-subtle">
                                                <ClipboardPaste size={13} className="text-brand-500" aria-hidden="true" />
                                                Paste screenshot (Ctrl+V)
                                            </span>
                                        </div>

                                        {/* Compact 3-step visual workflow strip */}
                                        <div className="grid sm:grid-cols-3 gap-2.5 pt-2 border-t border-border-subtle">
                                            <div className={`${panelCls} p-3 flex items-start gap-2.5`}>
                                                <span className="w-6 h-6 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">
                                                    1
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-primary">Drop 1 or more invoices</p>
                                                    <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                                                        PDF, Word, scan, or pasted screenshot — multiple invoices queue automatically.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`${panelCls} p-3 flex items-start gap-2.5`}>
                                                <span className="w-6 h-6 rounded-lg bg-info/15 text-status-invited flex items-center justify-center shrink-0">
                                                    <Eye size={13} />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-primary">Verify highlights &amp; live preview</p>
                                                    <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                                                        Review extracted fields side by side with the invoice and click to pick values.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`${panelCls} p-3 flex items-start gap-2.5`}>
                                                <span className="w-6 h-6 rounded-lg bg-success/15 text-status-confirmed flex items-center justify-center shrink-0">
                                                    <FileCheck2 size={13} />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-primary">Download Word, PDF, or Print</p>
                                                    <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                                                        Files stay in your browser; supplier details &amp; €5k totals are tracked automatically.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Card>

                                {history && !history.available && (
                                    <p className={`${calloutCls.info} text-sm p-3.5`}>
                                        Requisitions are made and downloaded, but not kept yet: run migration <b>88_cheque_requisitions.sql</b> in Supabase to keep a history, remember each supplier’s details, and warn about the €5,000 limit.
                                    </p>
                                )}

                                {/* Recent requisitions (last 5) */}
                                <Card
                                    title="Recent requisitions"
                                    subtitle={rows.length > 0 ? `Latest ${recentRows.length} of ${rows.length} saved requisitions` : undefined}
                                    icon={History}
                                    divided
                                    flush
                                    action={
                                        rows.length > 0 ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setSupplierFilter('');
                                                    setStatusFilter('all');
                                                    handleNavigateTab('history');
                                                }}
                                            >
                                                View all history
                                                <ArrowRight size={14} />
                                            </Button>
                                        ) : undefined
                                    }
                                >
                                    {isLoading ? (
                                        <div className="p-4">
                                            <SkeletonRows rows={3} bare />
                                        </div>
                                    ) : error ? (
                                        <ErrorState
                                            title="The requisitions couldn't be loaded"
                                            error={error}
                                            onRetry={() => void refetch()}
                                            className="m-4"
                                        />
                                    ) : recentRows.length === 0 ? (
                                        <EmptyState
                                            bare
                                            icon={<Receipt size={22} />}
                                            title="No requisitions yet"
                                            description="Drop an invoice above or start a blank requisition — saved requisitions will appear here for quick access."
                                        />
                                    ) : (
                                        <div className="divide-y divide-border-subtle">
                                            {recentRows.map(row => {
                                                const gross = row.amount ?? parseAmount(row.form.amount);
                                                const st = RECENT_STATUS[getReqStatus(row)];
                                                const busy = downloadingId === row.id;
                                                const invoiceNo = row.invoice_number || row.meta?.invoiceNumber || '';
                                                const invoiceDate = row.invoice_date || row.meta?.invoiceDate || '';
                                                return (
                                                    <div
                                                        key={row.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => openSaved(row)}
                                                        onKeyDown={e => {
                                                            if (e.target !== e.currentTarget) return;
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                openSaved(row);
                                                            }
                                                        }}
                                                        className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-surface-elevated/50 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:bg-brand-500/6"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="text-sm font-semibold text-primary truncate">
                                                                    {row.supplier_name || row.form.payeeName || 'Unnamed supplier'}
                                                                </span>
                                                                <Badge tone={st.tone} shape="pill" className="shrink-0">
                                                                    {st.label}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-xs text-muted truncate mt-0.5">
                                                                {[
                                                                    row.form.description || 'No description',
                                                                    invoiceNo ? `Inv ${invoiceNo}` : '',
                                                                    invoiceDate ? formatDisplayDate(invoiceDate) : formatDisplayDate(row.created_at),
                                                                ]
                                                                    .filter(Boolean)
                                                                    .join(' · ')}
                                                            </p>
                                                        </div>

                                                        <span className="text-sm font-semibold text-primary tabular-nums whitespace-nowrap shrink-0">
                                                            {gross !== null ? `€${formatAmount(gross)}` : '—'}
                                                        </span>

                                                        {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- event-bubbling barrier so download button clicks (even while disabled) do not open the row */}
                                                        <div
                                                            className="shrink-0"
                                                            onClick={e => e.stopPropagation()}
                                                            onKeyDown={e => e.stopPropagation()}
                                                        >
                                                            <IconButton
                                                                label="Download Word (.docx)"
                                                                size="sm"
                                                                disabled={busy}
                                                                onClick={() => void downloadRecentDocx(row)}
                                                            >
                                                                {busy ? <Loader2 size={14} className="animate-spin text-brand-500" /> : <Download size={14} />}
                                                            </IconButton>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </Card>
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <HistoryTab
                                rows={rows}
                                isLoading={isLoading}
                                error={error}
                                onRetry={() => void refetch()}
                                supplierFilter={supplierFilter}
                                statusFilter={statusFilter}
                                onSupplierFilterChange={setSupplierFilter}
                                onStatusFilterChange={setStatusFilter}
                                onOpen={openSaved}
                                onDuplicate={duplicateSaved}
                                onDelete={setConfirmDelete}
                                onUpdateStatus={(row, status) => void handleUpdateStatus(row, status)}
                            />
                        )}

                        {activeTab === 'suppliers' && (
                            <SuppliersTab
                                rows={rows}
                                isLoading={isLoading}
                                onNewForSupplier={startForSupplier}
                                onViewHistory={name => {
                                    setSupplierFilter(name);
                                    setStatusFilter('all');
                                    handleNavigateTab('history');
                                }}
                                onResetMemory={handleResetMemory}
                            />
                        )}
                    </div>
                </div>
            )}

            <DefaultsModal
                open={defaultsOpen}
                onClose={() => setDefaultsOpen(false)}
                staffName={staffName}
                onSaved={next => setStoredDefaults(next)}
            />

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
        </>
    );
}

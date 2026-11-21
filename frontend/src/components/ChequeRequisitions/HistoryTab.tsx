import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
    ArrowUpDown,
    Calendar,
    Check,
    ChevronDown,
    Copy,
    Download,
    ExternalLink,
    FileDown,
    FileSpreadsheet,
    Hash,
    Loader2,
    MoreHorizontal,
    Receipt,
    Search,
    StickyNote,
    Trash2,
    X,
} from 'lucide-react';
import Badge from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import Card from '../ui/Card';
import Menu, { type MenuItem } from '../ui/Menu';
import Pagination from '../ui/Pagination';
import SearchInput from '../ui/SearchInput';
import { EmptyState, ErrorState, SkeletonRows } from '../ui/States';
import { Segmented, type SegmentOption } from '../ui/Tabs';
import { fieldCls, tableCls, tableWrapCls, tbodyCls, tdCls, thCls, theadCls, trCls } from '../ui/styles';
import { formatDisplayDate } from '../../lib/dateUtils';
import { downloadBlob } from '../../lib/download';
import { toast } from '../../lib/toast';
import { chequeReqFileName, chequeReqPdfFileName, renderChequeReq } from '../../lib/chequeReq/docx';
import { getReqChequeNumber, getReqNotes, getReqStatus, netOfPayment, suppliersSummary } from '../../lib/chequeReq/draft';
import { exportChequeReqsToExcel, renderChequeReqPdf } from '../../lib/chequeReq/export';
import { formatAmount, parseAmount } from '../../lib/chequeReq/parse';
import type { ChequeReqStatus, SavedChequeReq } from '../../lib/chequeReq/types';

export interface HistoryTabProps {
    rows: SavedChequeReq[];
    isLoading: boolean;
    error: unknown;
    onRetry: () => void;
    supplierFilter: string;
    statusFilter: ChequeReqStatus | 'all';
    onSupplierFilterChange: (supplier: string) => void;
    onStatusFilterChange: (status: ChequeReqStatus | 'all') => void;
    onOpen: (row: SavedChequeReq) => void;
    onDuplicate: (row: SavedChequeReq) => void;
    onDelete: (row: SavedChequeReq) => void;
    onUpdateStatus: (row: SavedChequeReq, status: ChequeReqStatus) => void;
}

type SortKey = 'newest' | 'invoiceDate' | 'amountDesc' | 'supplierAsc';

const PAGE_SIZE = 25;

const STATUS_META: Record<ChequeReqStatus, { label: string; dot: string; pillCls: string }> = {
    draft: {
        label: 'Draft',
        dot: 'bg-warning',
        pillCls: 'bg-warning/10 text-status-requested border-warning/30 hover:bg-warning/15',
    },
    ready: {
        label: 'Ready',
        dot: 'bg-info',
        pillCls: 'bg-info/10 text-status-invited border-info/25 hover:bg-info/15',
    },
    paid: {
        label: 'Paid',
        dot: 'bg-success',
        pillCls: 'bg-success/10 text-status-confirmed border-success/25 hover:bg-success/15',
    },
};

const STATUS_ORDER: ChequeReqStatus[] = ['draft', 'ready', 'paid'];

function rowGross(row: SavedChequeReq): number | null {
    return row.amount ?? parseAmount(row.form.amount);
}

function rowNet(row: SavedChequeReq): number | null {
    return netOfPayment(rowGross(row), row.net_amount ?? row.meta?.netAmount ?? null);
}

function rowYear(row: SavedChequeReq): string {
    return (row.invoice_date || row.created_at).slice(0, 4);
}

function rowSupplierName(row: SavedChequeReq): string {
    return row.supplier_name || row.form.payeeName || 'Unnamed supplier';
}

function StatusQuickMenu({
    row,
    onSelect,
}: {
    row: SavedChequeReq;
    onSelect: (row: SavedChequeReq, status: ChequeReqStatus) => void;
}) {
    const current = getReqStatus(row);
    const meta = STATUS_META[current];

    const items: MenuItem[] = STATUS_ORDER.map(status => ({
        label: STATUS_META[status].label,
        icon: (
            <span className="flex items-center justify-center w-4 h-4 shrink-0">
                {status === current ? (
                    <Check size={13} className="text-brand-500" />
                ) : (
                    <span className={`w-2 h-2 rounded-full ${STATUS_META[status].dot}`} />
                )}
            </span>
        ),
        onSelect: () => {
            if (status !== current) onSelect(row, status);
        },
    }));

    return (
        <Menu
            items={items}
            label={`Change status (${meta.label})`}
            align="start"
            triggerClassName={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-xs font-semibold border transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${meta.pillCls}`}
        >
            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            <span>{meta.label}</span>
            <ChevronDown size={11} className="opacity-70" />
        </Menu>
    );
}

export default function HistoryTab({
    rows,
    isLoading,
    error,
    onRetry,
    supplierFilter,
    statusFilter,
    onSupplierFilterChange,
    onStatusFilterChange,
    onOpen,
    onDuplicate,
    onDelete,
    onUpdateStatus,
}: HistoryTabProps) {
    const [query, setQuery] = useState('');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<SortKey>('newest');
    const [page, setPage] = useState(1);
    const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
    const [exportingExcel, setExportingExcel] = useState(false);

    useEffect(() => {
        setPage(1);
    }, [query, yearFilter, supplierFilter, statusFilter, sortBy]);

    const years = useMemo(() => {
        const set = new Set<string>();
        for (const row of rows) {
            const yr = rowYear(row);
            if (/^\d{4}$/.test(yr)) set.add(yr);
        }
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [rows]);

    // Match all rows belonging to a supplier group (including VAT/IBAN-linked aliases) when filtered from SuppliersTab
    const supplierGroupIds = useMemo(() => {
        const trimmed = supplierFilter.trim().toLowerCase();
        if (!trimmed) return null;
        const summaries = suppliersSummary(rows, 'all');
        const ids = new Set<string>();
        for (const s of summaries) {
            if (s.name.toLowerCase() === trimmed) {
                for (const id of s.requisitionIds) ids.add(id);
            }
        }
        return ids;
    }, [rows, supplierFilter]);

    const baseFiltered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const sup = supplierFilter.trim().toLowerCase();

        return rows.filter(r => {
            if (yearFilter !== 'all' && rowYear(r) !== yearFilter) return false;
            if (sup) {
                const nameMatch = rowSupplierName(r).toLowerCase().includes(sup);
                const groupMatch = supplierGroupIds ? supplierGroupIds.has(r.id) : false;
                if (!nameMatch && !groupMatch) return false;
            }
            if (q) {
                const haystack = [
                    r.supplier_name,
                    r.form.payeeName,
                    r.invoice_number ?? '',
                    r.meta?.invoiceNumber ?? '',
                    r.form.poNumber,
                    r.form.description,
                    r.form.actionNumber,
                    getReqChequeNumber(r),
                    getReqNotes(r),
                    r.form.requestedBy,
                ]
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [rows, yearFilter, supplierFilter, supplierGroupIds, query]);

    const statusCounts = useMemo(() => {
        const counts = { all: baseFiltered.length, draft: 0, ready: 0, paid: 0 };
        for (const r of baseFiltered) {
            counts[getReqStatus(r)] += 1;
        }
        return counts;
    }, [baseFiltered]);

    const filteredRows = useMemo(() => {
        const list = statusFilter === 'all' ? [...baseFiltered] : baseFiltered.filter(r => getReqStatus(r) === statusFilter);
        list.sort((a, b) => {
            switch (sortBy) {
                case 'invoiceDate':
                    return (
                        (b.invoice_date || b.created_at.slice(0, 10)).localeCompare(a.invoice_date || a.created_at.slice(0, 10)) ||
                        b.created_at.localeCompare(a.created_at)
                    );
                case 'amountDesc':
                    return (rowGross(b) ?? -1) - (rowGross(a) ?? -1) || b.created_at.localeCompare(a.created_at);
                case 'supplierAsc':
                    return rowSupplierName(a).localeCompare(rowSupplierName(b)) || b.created_at.localeCompare(a.created_at);
                case 'newest':
                default:
                    return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
            }
        });
        return list;
    }, [baseFiltered, statusFilter, sortBy]);

    const totals = useMemo(() => {
        let gross = 0;
        let net = 0;
        for (const r of filteredRows) {
            gross += rowGross(r) ?? 0;
            net += rowNet(r) ?? 0;
        }
        return {
            gross: Math.round(gross * 100) / 100,
            net: Math.round(net * 100) / 100,
        };
    }, [filteredRows]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pagedRows = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return filteredRows.slice(start, start + PAGE_SIZE);
    }, [filteredRows, safePage]);

    const statusOptions: SegmentOption<ChequeReqStatus | 'all'>[] = [
        { value: 'all', label: 'All', count: statusCounts.all },
        { value: 'draft', label: 'Draft', dot: STATUS_META.draft.dot, count: statusCounts.draft },
        { value: 'ready', label: 'Ready', dot: STATUS_META.ready.dot, count: statusCounts.ready },
        { value: 'paid', label: 'Paid', dot: STATUS_META.paid.dot, count: statusCounts.paid },
    ];

    const hasActiveFilters = Boolean(query.trim() || yearFilter !== 'all' || supplierFilter.trim() || statusFilter !== 'all');

    const clearFilters = () => {
        setQuery('');
        setYearFilter('all');
        onSupplierFilterChange('');
        onStatusFilterChange('all');
    };

    const handleDownloadDocx = async (row: SavedChequeReq) => {
        const key = `${row.id}:docx`;
        setDownloadingKey(key);
        try {
            const blob = await renderChequeReq(row.form);
            downloadBlob(blob, chequeReqFileName(row.meta, row.form));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not build the Word document');
        } finally {
            setDownloadingKey(prev => (prev === key ? null : prev));
        }
    };

    const handleDownloadPdf = async (row: SavedChequeReq) => {
        const key = `${row.id}:pdf`;
        setDownloadingKey(key);
        try {
            const blob = await renderChequeReqPdf(row.form, row.meta);
            downloadBlob(blob, chequeReqPdfFileName(row.meta, row.form));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not build the PDF');
        } finally {
            setDownloadingKey(prev => (prev === key ? null : prev));
        }
    };

    const handleExportExcel = async () => {
        if (filteredRows.length === 0 || exportingExcel) return;
        setExportingExcel(true);
        try {
            const yearLabel = yearFilter === 'all' ? 'all' : yearFilter;
            await exportChequeReqsToExcel(filteredRows, yearLabel);
            toast.success(`Exported ${filteredRows.length} requisition${filteredRows.length === 1 ? '' : 's'} to Excel`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not export to Excel');
        } finally {
            setExportingExcel(false);
        }
    };

    const rowMenuItems = (row: SavedChequeReq): MenuItem[] => [
        {
            label: 'Open in editor',
            icon: <ExternalLink size={14} className="text-muted" />,
            onSelect: () => onOpen(row),
        },
        {
            label: 'Download Word (.docx)',
            icon: <Download size={14} className="text-muted" />,
            onSelect: () => void handleDownloadDocx(row),
        },
        {
            label: 'Download PDF',
            icon: <FileDown size={14} className="text-muted" />,
            onSelect: () => void handleDownloadPdf(row),
        },
        {
            label: 'Duplicate as new',
            icon: <Copy size={14} className="text-muted" />,
            onSelect: () => onDuplicate(row),
        },
        {
            label: 'Delete',
            icon: <Trash2 size={14} />,
            tone: 'danger',
            onSelect: () => onDelete(row),
        },
    ];

    const onRowKeyDown = (e: KeyboardEvent<HTMLElement>, row: SavedChequeReq) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(row);
        }
    };

    return (
        <div className="space-y-4">
            {/* Top filter toolbar */}
            <div className="rounded-2xl bg-surface border border-border-subtle shadow-card p-3 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        placeholder="Search supplier, invoice #, PO, description, action, cheque ref, notes…"
                        wrapperClassName="flex-1 min-w-0"
                        aria-label="Search requisitions"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Calendar size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                            <select
                                aria-label="Filter by year"
                                value={yearFilter}
                                onChange={e => setYearFilter(e.target.value)}
                                className={`${fieldCls} w-auto pl-8 pr-7 h-9 sm:h-10 text-xs font-medium cursor-pointer`}
                            >
                                <option value="all">All years</option>
                                {years.map(yr => (
                                    <option key={yr} value={yr}>
                                        {yr}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="relative">
                            <ArrowUpDown size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                            <select
                                aria-label="Sort requisitions"
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value as SortKey)}
                                className={`${fieldCls} w-auto pl-8 pr-7 h-9 sm:h-10 text-xs font-medium cursor-pointer`}
                            >
                                <option value="newest">Newest</option>
                                <option value="invoiceDate">Invoice date</option>
                                <option value="amountDesc">Highest amount</option>
                                <option value="supplierAsc">Supplier A–Z</option>
                            </select>
                        </div>

                        <Button
                            variant="secondary"
                            size="md"
                            loading={exportingExcel}
                            disabled={filteredRows.length === 0}
                            onClick={() => void handleExportExcel()}
                            className="h-9 sm:h-10"
                            title="Export the currently filtered requisitions and supplier totals to Excel (.xlsx)"
                        >
                            {!exportingExcel && <FileSpreadsheet size={15} />}
                            Export Excel (.xlsx)
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <Segmented<ChequeReqStatus | 'all'>
                        ariaLabel="Filter by requisition status"
                        options={statusOptions}
                        value={statusFilter}
                        onChange={onStatusFilterChange}
                    />

                    {supplierFilter.trim() && (
                        <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 h-7 rounded-lg text-xs font-semibold bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20">
                                <span className="max-w-[14rem] truncate">Supplier: {supplierFilter}</span>
                                <button
                                    type="button"
                                    onClick={() => onSupplierFilterChange('')}
                                    aria-label={`Clear supplier filter ${supplierFilter}`}
                                    className="p-0.5 rounded-md hover:bg-brand-500/15 transition-colors cursor-pointer"
                                >
                                    <X size={13} />
                                </button>
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Content area */}
            {isLoading ? (
                <SkeletonRows rows={6} />
            ) : error ? (
                <ErrorState title="The requisitions couldn't be loaded" error={error} onRetry={onRetry} />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={<Receipt size={22} />}
                    title="No requisitions yet"
                    description="Requisitions you save or download appear here so you can reopen, update status, duplicate, or export them."
                />
            ) : filteredRows.length === 0 ? (
                <EmptyState
                    icon={<Search size={22} />}
                    title="No requisitions match your filters"
                    description="Try clearing or broadening your search, year, supplier, or status filter."
                    action={
                        hasActiveFilters ? (
                            <Button variant="secondary" onClick={clearFilters}>
                                Clear filters
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <Card flush>
                    {/* Desktop table */}
                    <div className={`hidden md:block ${tableWrapCls}`}>
                        <table className={tableCls}>
                            <thead className={theadCls}>
                                <tr>
                                    <th className={thCls}>Made</th>
                                    <th className={thCls}>Supplier &amp; Description</th>
                                    <th className={thCls}>Invoice</th>
                                    <th className={thCls}>Status</th>
                                    <th className={`${thCls} text-right`}>Amount</th>
                                    <th className={thCls}>
                                        <span className="sr-only">Actions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className={tbodyCls}>
                                {pagedRows.map(row => {
                                    const gross = rowGross(row);
                                    const net = rowNet(row);
                                    const showNet = gross !== null && net !== null && Math.abs(gross - net) > 0.005;
                                    const chequeRef = getReqChequeNumber(row);
                                    const notes = getReqNotes(row);
                                    const invoiceNo = row.invoice_number || row.meta?.invoiceNumber || '';
                                    const invoiceDate = row.invoice_date || row.meta?.invoiceDate || '';
                                    const docxBusy = downloadingKey === `${row.id}:docx`;
                                    const pdfBusy = downloadingKey === `${row.id}:pdf`;

                                    return (
                                        <tr
                                            key={row.id}
                                            tabIndex={0}
                                            onClick={() => onOpen(row)}
                                            onKeyDown={e => onRowKeyDown(e, row)}
                                            className={`${trCls} cursor-pointer focus-visible:outline-hidden focus-visible:bg-brand-500/6`}
                                        >
                                            <td className={`${tdCls} whitespace-nowrap text-xs text-muted tabular-nums`}>
                                                {formatDisplayDate(row.created_at) || '—'}
                                            </td>
                                            <td className={`${tdCls} max-w-[24rem]`}>
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="font-semibold text-primary truncate">{rowSupplierName(row)}</span>
                                                    {chequeRef && (
                                                        <Badge tone="neutral" shape="pill" className="shrink-0" title={`Cheque reference: ${chequeRef}`}>
                                                            <Hash size={10} />
                                                            {chequeRef}
                                                        </Badge>
                                                    )}
                                                    {notes && (
                                                        <Badge tone="brand" shape="pill" className="shrink-0" title={notes}>
                                                            <StickyNote size={10} />
                                                            Note
                                                        </Badge>
                                                    )}
                                                </div>
                                                <span className="block truncate text-xs text-muted mt-0.5">
                                                    {row.form.description || 'No description'}
                                                    {row.form.actionNumber ? ` · Action ${row.form.actionNumber}` : ''}
                                                </span>
                                            </td>
                                            <td className={`${tdCls} whitespace-nowrap`}>
                                                <span className="block text-sm font-medium text-primary">{invoiceNo || '—'}</span>
                                                <span className="block text-xs text-muted">
                                                    {[
                                                        invoiceDate ? formatDisplayDate(invoiceDate) : '',
                                                        row.form.poNumber ? `PO ${row.form.poNumber}` : '',
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' · ') || '—'}
                                                </span>
                                            </td>
                                            <td
                                                className={`${tdCls} whitespace-nowrap`}
                                                onClick={e => e.stopPropagation()}
                                                onKeyDown={e => e.stopPropagation()}
                                            >
                                                <StatusQuickMenu row={row} onSelect={onUpdateStatus} />
                                            </td>
                                            <td className={`${tdCls} text-right whitespace-nowrap tabular-nums`}>
                                                <span className="block font-semibold text-primary">
                                                    {gross !== null ? `€${formatAmount(gross)}` : '—'}
                                                </span>
                                                {showNet && (
                                                    <span className="block text-xs text-muted">
                                                        ex VAT €{formatAmount(net)}
                                                    </span>
                                                )}
                                            </td>
                                            <td
                                                className={`${tdCls} text-right whitespace-nowrap`}
                                                onClick={e => e.stopPropagation()}
                                                onKeyDown={e => e.stopPropagation()}
                                            >
                                                <div className="inline-flex items-center justify-end gap-0.5">
                                                    <IconButton
                                                        label="Download Word (.docx)"
                                                        size="sm"
                                                        disabled={docxBusy}
                                                        onClick={() => void handleDownloadDocx(row)}
                                                    >
                                                        {docxBusy ? <Loader2 size={14} className="animate-spin text-brand-500" /> : <Download size={14} />}
                                                    </IconButton>
                                                    <IconButton
                                                        label="Download PDF"
                                                        size="sm"
                                                        disabled={pdfBusy}
                                                        onClick={() => void handleDownloadPdf(row)}
                                                    >
                                                        {pdfBusy ? <Loader2 size={14} className="animate-spin text-brand-500" /> : <FileDown size={14} />}
                                                    </IconButton>
                                                    <Menu
                                                        items={rowMenuItems(row)}
                                                        label={`More actions for ${rowSupplierName(row)}`}
                                                        triggerClassName="hit-area inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40"
                                                    >
                                                        <MoreHorizontal size={15} />
                                                    </Menu>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile tappable card list */}
                    <div className="md:hidden divide-y divide-border-subtle">
                        {pagedRows.map(row => {
                            const gross = rowGross(row);
                            const net = rowNet(row);
                            const showNet = gross !== null && net !== null && Math.abs(gross - net) > 0.005;
                            const chequeRef = getReqChequeNumber(row);
                            const notes = getReqNotes(row);
                            const invoiceNo = row.invoice_number || row.meta?.invoiceNumber || '';
                            const invoiceDate = row.invoice_date || row.meta?.invoiceDate || '';
                            const docxBusy = downloadingKey === `${row.id}:docx`;
                            const pdfBusy = downloadingKey === `${row.id}:pdf`;

                            return (
                                <div
                                    key={row.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onOpen(row)}
                                    onKeyDown={e => onRowKeyDown(e, row)}
                                    className="p-3.5 hover:bg-surface-elevated/40 active:bg-surface-elevated/70 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:bg-brand-500/6"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-primary truncate">{rowSupplierName(row)}</p>
                                            <p className="text-xs text-muted line-clamp-2 mt-0.5">{row.form.description || 'No description'}</p>
                                        </div>
                                        <div className="text-right shrink-0 tabular-nums">
                                            <p className="text-sm font-bold text-primary">{gross !== null ? `€${formatAmount(gross)}` : '—'}</p>
                                            {showNet && <p className="text-[11px] text-muted">ex VAT €{formatAmount(net)}</p>}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-xs text-muted">
                                        <span>Made {formatDisplayDate(row.created_at) || '—'}</span>
                                        {invoiceNo && <span>· Inv {invoiceNo}</span>}
                                        {invoiceDate && <span>({formatDisplayDate(invoiceDate)})</span>}
                                        {row.form.poNumber && <span>· PO {row.form.poNumber}</span>}
                                    </div>

                                    {(chequeRef || notes) && (
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                            {chequeRef && (
                                                <Badge tone="neutral" shape="pill">
                                                    <Hash size={10} />
                                                    {chequeRef}
                                                </Badge>
                                            )}
                                            {notes && (
                                                <Badge tone="brand" shape="pill" title={notes}>
                                                    <StickyNote size={10} />
                                                    <span className="max-w-[12rem] truncate">{notes}</span>
                                                </Badge>
                                            )}
                                        </div>
                                    )}

                                    <div
                                        className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-border-subtle/70"
                                        onClick={e => e.stopPropagation()}
                                        onKeyDown={e => e.stopPropagation()}
                                    >
                                        <StatusQuickMenu row={row} onSelect={onUpdateStatus} />

                                        <div className="flex items-center gap-1">
                                            <IconButton
                                                label="Download Word (.docx)"
                                                size="sm"
                                                disabled={docxBusy}
                                                onClick={() => void handleDownloadDocx(row)}
                                            >
                                                {docxBusy ? <Loader2 size={14} className="animate-spin text-brand-500" /> : <Download size={14} />}
                                            </IconButton>
                                            <IconButton
                                                label="Download PDF"
                                                size="sm"
                                                disabled={pdfBusy}
                                                onClick={() => void handleDownloadPdf(row)}
                                            >
                                                {pdfBusy ? <Loader2 size={14} className="animate-spin text-brand-500" /> : <FileDown size={14} />}
                                            </IconButton>
                                            <Menu
                                                items={rowMenuItems(row)}
                                                label={`More actions for ${rowSupplierName(row)}`}
                                                triggerClassName="hit-area inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40"
                                            >
                                                <MoreHorizontal size={15} />
                                            </Menu>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Filtered summary + Pagination */}
                    <div className="border-t border-border-subtle bg-surface-elevated/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <span className="tabular-nums font-medium">
                            <span className="font-semibold text-primary">{filteredRows.length}</span>{' '}
                            requisition{filteredRows.length === 1 ? '' : 's'} ·{' '}
                            <span className="font-semibold text-primary">€{formatAmount(totals.gross)}</span> gross ·{' '}
                            <span className="font-semibold text-primary">€{formatAmount(totals.net)}</span> excl. VAT
                        </span>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="text-brand-600 dark:text-brand-400 font-semibold hover:underline cursor-pointer"
                            >
                                Reset filters
                            </button>
                        )}
                    </div>

                    <Pagination
                        page={safePage}
                        totalPages={totalPages}
                        totalItems={filteredRows.length}
                        pageSize={PAGE_SIZE}
                        onPageChange={setPage}
                        itemLabel="requisitions"
                    />
                </Card>
            )}
        </div>
    );
}

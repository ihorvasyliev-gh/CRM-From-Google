import { useMemo, useState } from 'react';
import {
    AlertTriangle,
    Building2,
    Calendar,
    CreditCard,
    Crosshair,
    FilePlus2,
    History,
    Info,
    Mail,
    Phone,
    Receipt,
    RotateCcw,
    Search,
} from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import SearchInput from '../ui/SearchInput';
import { EmptyState } from '../ui/States';
import { Segmented, type SegmentOption } from '../ui/Tabs';
import { calloutCls, fieldCls, panelCls, toneChipCls } from '../ui/styles';
import { formatDisplayDate, todayISO } from '../../lib/dateUtils';
import { APPROACHING_QUOTES_FROM, suppliersSummary, THREE_QUOTES_FROM } from '../../lib/chequeReq/draft';
import { formatAmount } from '../../lib/chequeReq/parse';
import type { PlaceField, SavedChequeReq, SupplierSummary } from '../../lib/chequeReq/types';

export interface SuppliersTabProps {
    rows: SavedChequeReq[];
    isLoading: boolean;
    onNewForSupplier: (latestRow: SavedChequeReq) => void;
    onViewHistory: (supplierName: string) => void;
    onResetMemory: (supplier: SupplierSummary) => Promise<void>;
}

type SupplierFilterKey = 'all' | 'exceeded' | 'approaching' | 'learned';

const PLACE_LABEL: Record<PlaceField, string> = {
    poNumber: 'PO',
    amount: 'Amount',
    description: 'Description',
};

function maskIban(iban: string): string {
    const compact = iban.replace(/\s+/g, '');
    if (compact.length <= 12) return iban;
    return `${compact.slice(0, 4)} ···· ${compact.slice(-4)}`;
}

function SupplierSkeletonGrid() {
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading suppliers">
            {Array.from({ length: 6 }).map((_, idx) => (
                <div
                    key={idx}
                    className="rounded-2xl bg-surface border border-border-subtle shadow-card p-4 space-y-3 animate-pulse"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-muted/15 shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3.5 bg-muted/15 rounded-sm w-2/3" />
                            <div className="h-3 bg-muted/10 rounded-sm w-1/3" />
                        </div>
                    </div>
                    <div className="h-2 bg-muted/15 rounded-full w-full" />
                    <div className="h-8 bg-muted/10 rounded-xl w-full" />
                </div>
            ))}
        </div>
    );
}

export default function SuppliersTab({
    rows,
    isLoading,
    onNewForSupplier,
    onViewHistory,
    onResetMemory,
}: SuppliersTabProps) {
    const currentYear = todayISO().slice(0, 4);
    const [selectedYear, setSelectedYear] = useState<string>(currentYear);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<SupplierFilterKey>('all');
    const [confirmReset, setConfirmReset] = useState<SupplierSummary | null>(null);

    const years = useMemo(() => {
        const set = new Set<string>([currentYear]);
        for (const r of rows) {
            const yr = (r.invoice_date || r.created_at).slice(0, 4);
            if (/^\d{4}$/.test(yr)) set.add(yr);
        }
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [rows, currentYear]);

    const suppliers = useMemo(() => suppliersSummary(rows, selectedYear), [rows, selectedYear]);

    const searchMatched = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return suppliers;
        return suppliers.filter(s => {
            const haystack = [s.name, s.vat, s.iban, s.email, s.phone].join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [suppliers, query]);

    const counts = useMemo(() => {
        let exceeded = 0;
        let approaching = 0;
        let learned = 0;
        for (const s of searchMatched) {
            if (s.tier === 'exceeded') exceeded += 1;
            else if (s.tier === 'approaching') approaching += 1;
            if (s.learnedPlaces.length > 0) learned += 1;
        }
        return { all: searchMatched.length, exceeded, approaching, learned };
    }, [searchMatched]);

    const filteredSuppliers = useMemo(() => {
        switch (filter) {
            case 'exceeded':
                return searchMatched.filter(s => s.tier === 'exceeded');
            case 'approaching':
                return searchMatched.filter(s => s.tier === 'approaching' || s.tier === 'exceeded');
            case 'learned':
                return searchMatched.filter(s => s.learnedPlaces.length > 0);
            case 'all':
            default:
                return searchMatched;
        }
    }, [searchMatched, filter]);

    const filterOptions: SegmentOption<SupplierFilterKey>[] = [
        { value: 'all', label: 'All', count: counts.all },
        { value: 'exceeded', label: '≥ €5,000 (3 quotes)', dot: 'bg-danger', count: counts.exceeded },
        {
            value: 'approaching',
            label: 'Approaching (€4k+)',
            dot: 'bg-warning',
            count: counts.approaching + counts.exceeded,
            title: 'Suppliers at €4,000 or more excl. VAT',
        },
        { value: 'learned', label: 'Learned zones', count: counts.learned },
    ];

    const isYearView = selectedYear !== 'all';
    const yearExceededCount = useMemo(() => suppliers.filter(s => s.tier === 'exceeded').length, [suppliers]);
    const yearApproachingCount = useMemo(() => suppliers.filter(s => s.tier === 'approaching').length, [suppliers]);

    const clearFilters = () => {
        setQuery('');
        setFilter('all');
    };

    return (
        <div className="space-y-4">
            {/* Top filter toolbar */}
            <div className="rounded-2xl bg-surface border border-border-subtle shadow-card p-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <div className="relative shrink-0">
                        <Calendar size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <select
                            aria-label="Select supplier spend period"
                            value={selectedYear}
                            onChange={e => setSelectedYear(e.target.value)}
                            className={`${fieldCls} w-full sm:w-auto pl-8 pr-8 h-9 sm:h-10 text-xs font-semibold cursor-pointer`}
                        >
                            {years.map(yr => (
                                <option key={yr} value={yr}>
                                    {yr} {yr === currentYear ? '(this year)' : ''}
                                </option>
                            ))}
                            <option value="all">All time</option>
                        </select>
                    </div>

                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        placeholder="Search supplier name, VAT, email, or phone…"
                        wrapperClassName="flex-1 min-w-0"
                        aria-label="Search suppliers"
                    />
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Segmented<SupplierFilterKey>
                        ariaLabel="Filter suppliers"
                        options={filterOptions}
                        value={filter}
                        onChange={setFilter}
                    />
                    <span className="text-xs text-muted tabular-nums">
                        {filteredSuppliers.length} supplier{filteredSuppliers.length === 1 ? '' : 's'}
                        {isYearView ? ` in ${selectedYear}` : ' all time'}
                    </span>
                </div>
            </div>

            {/* €5,000 annual procurement rule callout */}
            {isYearView && (yearExceededCount > 0 || yearApproachingCount > 0) ? (
                <div className={`${calloutCls.warning} p-3.5 text-xs sm:text-sm flex items-start gap-2.5`}>
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-status-requested" aria-hidden="true" />
                    <div className="space-y-0.5 leading-relaxed">
                        <p className="font-semibold text-primary">
                            {yearExceededCount > 0
                                ? `${yearExceededCount} supplier${yearExceededCount === 1 ? ' has' : 's have'} reached €${formatAmount(THREE_QUOTES_FROM)} excl. VAT in ${selectedYear}`
                                : `${yearApproachingCount} supplier${yearApproachingCount === 1 ? ' is' : 's are'} approaching €${formatAmount(THREE_QUOTES_FROM)} excl. VAT in ${selectedYear}`}
                            {yearExceededCount > 0 && yearApproachingCount > 0
                                ? ` · ${yearApproachingCount} more above €${formatAmount(APPROACHING_QUOTES_FROM)}`
                                : ''}
                        </p>
                        <p className="text-xs text-muted">
                            Under SICAP procurement rules, once cumulative spend with one supplier reaches €5,000 excl. VAT in a calendar year, three written quotations and the 3-quotes form are required.
                        </p>
                    </div>
                </div>
            ) : (
                <div className={`${calloutCls.info} p-3.5 text-xs flex items-start gap-2.5`}>
                    <Info size={15} className="shrink-0 mt-0.5 text-status-invited" aria-hidden="true" />
                    <p className="leading-relaxed text-primary/90">
                        <span className="font-semibold text-primary">€5,000 excl. VAT annual rule:</span> A single quotation is enough below €5,000 excl. VAT per supplier per calendar year; from €5,000 excl. VAT, three quotations and the 3-quotes form are required.
                        {!isYearView && ' Select a specific year above to track annual progress bars.'}
                    </p>
                </div>
            )}

            {/* Content */}
            {isLoading ? (
                <SupplierSkeletonGrid />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={<Building2 size={22} />}
                    title="No suppliers remembered yet"
                    description="As you save or download requisitions, suppliers are grouped automatically so you can track the €5,000 annual limit and reuse their details."
                />
            ) : suppliers.length === 0 ? (
                <EmptyState
                    icon={<Building2 size={22} />}
                    title={`No suppliers in ${selectedYear}`}
                    description={`There are no saved requisitions dated in ${selectedYear} yet.`}
                    action={
                        <Button variant="secondary" onClick={() => setSelectedYear('all')}>
                            View all time
                        </Button>
                    }
                />
            ) : filteredSuppliers.length === 0 ? (
                <EmptyState
                    icon={<Search size={22} />}
                    title="No suppliers match your filters"
                    description="Try clearing your search or choosing a different filter pill."
                    action={
                        <Button variant="secondary" onClick={clearFilters}>
                            Clear filters
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filteredSuppliers.map(supplier => {
                        const pct = Math.min(100, Math.round((supplier.totalNet / THREE_QUOTES_FROM) * 100));
                        const remaining = Math.max(0, THREE_QUOTES_FROM - supplier.totalNet);
                        const over = Math.max(0, supplier.totalNet - THREE_QUOTES_FROM);

                        const chipTone = !isYearView
                            ? 'brand'
                            : supplier.tier === 'exceeded'
                                ? 'danger'
                                : supplier.tier === 'approaching'
                                    ? 'warning'
                                    : 'brand';

                        const barColor =
                            supplier.tier === 'exceeded'
                                ? 'bg-rose-500'
                                : supplier.tier === 'approaching'
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500';

                        const lastDate = supplier.latest.invoice_date || supplier.latest.created_at;

                        return (
                            <article
                                key={supplier.key}
                                className="rounded-2xl bg-surface border border-border-subtle shadow-card hover:shadow-card-hover hover:border-border-strong transition-all p-4 flex flex-col gap-3 min-w-0"
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between gap-2.5 min-w-0">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className={`flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${toneChipCls[chipTone]}`}>
                                            <Building2 size={17} />
                                        </span>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-semibold text-primary truncate" title={supplier.name}>
                                                {supplier.name}
                                            </h4>
                                            <p className="text-xs text-muted tabular-nums">
                                                {supplier.count} requisition{supplier.count === 1 ? '' : 's'}
                                                {lastDate ? ` · Last ${formatDisplayDate(lastDate)}` : ''}
                                            </p>
                                        </div>
                                    </div>

                                    {isYearView ? (
                                        supplier.tier === 'exceeded' ? (
                                            <Badge tone="danger" shape="pill" className="shrink-0">
                                                3 quotes needed
                                            </Badge>
                                        ) : supplier.tier === 'approaching' ? (
                                            <Badge tone="warning" shape="pill" className="shrink-0">
                                                Near €5k
                                            </Badge>
                                        ) : (
                                            <Badge tone="success" shape="pill" className="shrink-0">
                                                Single quote
                                            </Badge>
                                        )
                                    ) : (
                                        <Badge tone="neutral" shape="pill" className="shrink-0">
                                            All time
                                        </Badge>
                                    )}
                                </div>

                                {/* Metadata pills */}
                                {(supplier.vat || supplier.iban || supplier.email || supplier.phone) && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {supplier.vat && (
                                            <span
                                                title={`VAT: ${supplier.vat}`}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-elevated text-muted border border-border-subtle max-w-full truncate"
                                            >
                                                <Receipt size={11} className="shrink-0 opacity-75" />
                                                <span className="truncate">VAT {supplier.vat}</span>
                                            </span>
                                        )}
                                        {supplier.iban && (
                                            <span
                                                title={`IBAN: ${supplier.iban}`}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-elevated text-muted border border-border-subtle max-w-full truncate"
                                            >
                                                <CreditCard size={11} className="shrink-0 opacity-75" />
                                                <span className="truncate">{maskIban(supplier.iban)}</span>
                                            </span>
                                        )}
                                        {supplier.email && (
                                            <span
                                                title={supplier.email}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-elevated text-muted border border-border-subtle max-w-[13rem] truncate"
                                            >
                                                <Mail size={11} className="shrink-0 opacity-75" />
                                                <span className="truncate">{supplier.email}</span>
                                            </span>
                                        )}
                                        {supplier.phone && (
                                            <span
                                                title={supplier.phone}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-elevated text-muted border border-border-subtle max-w-full truncate"
                                            >
                                                <Phone size={11} className="shrink-0 opacity-75" />
                                                <span className="truncate">{supplier.phone}</span>
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* €5,000 Annual Progress Bar (year view) or All-time spend summary */}
                                {isYearView ? (
                                    <div className="space-y-1.5">
                                        <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                                            <span className="font-semibold text-primary">
                                                €{formatAmount(supplier.totalNet)}{' '}
                                                <span className="font-normal text-muted">/ €5,000 excl. VAT</span>
                                            </span>
                                            {supplier.tier === 'exceeded' ? (
                                                <span className="font-semibold text-status-rejected shrink-0">
                                                    {over > 0 ? `+€${formatAmount(over)} over` : 'Limit reached'}
                                                </span>
                                            ) : (
                                                <span
                                                    className={`shrink-0 ${
                                                        supplier.tier === 'approaching'
                                                            ? 'font-semibold text-status-requested'
                                                            : 'text-muted'
                                                    }`}
                                                >
                                                    €{formatAmount(remaining)} remaining
                                                </span>
                                            )}
                                        </div>
                                        <div
                                            role="progressbar"
                                            aria-label={`${supplier.name} annual spend toward €5,000 limit`}
                                            aria-valuenow={Math.round(supplier.totalNet)}
                                            aria-valuemin={0}
                                            aria-valuemax={THREE_QUOTES_FROM}
                                            className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden"
                                        >
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                                style={{ width: `${Math.max(supplier.totalNet > 0 ? 3 : 0, pct)}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted tabular-nums">
                                            <span>Gross total: €{formatAmount(supplier.totalGross)}</span>
                                            <span>{pct}% of limit</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`${panelCls} px-3 py-2 flex items-center justify-between gap-3 text-xs tabular-nums`}>
                                        <div>
                                            <span className="block text-[11px] text-muted">Total excl. VAT</span>
                                            <span className="font-semibold text-primary">€{formatAmount(supplier.totalNet)}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-[11px] text-muted">Total gross</span>
                                            <span className="font-semibold text-primary">€{formatAmount(supplier.totalGross)}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Learned invoice zones */}
                                {supplier.learnedPlaces.length > 0 && (
                                    <div className={`${panelCls} px-3 py-2 flex items-center justify-between gap-2 flex-wrap`}>
                                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                            <Crosshair size={12} className="text-brand-500 shrink-0" aria-hidden="true" />
                                            <span className="text-[11px] font-semibold text-muted">Learned:</span>
                                            {supplier.learnedPlaces.map(place => (
                                                <Badge key={place} tone="brand" shape="pill" className="h-4 px-1.5 text-[11px]">
                                                    {PLACE_LABEL[place]}
                                                </Badge>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmReset(supplier)}
                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-status-rejected transition-colors cursor-pointer shrink-0 rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40"
                                            title="Clear saved invoice pick zones for this supplier"
                                        >
                                            <RotateCcw size={11} />
                                            Reset zones
                                        </button>
                                    </div>
                                )}

                                {/* Action footer */}
                                <div className="mt-auto pt-3 border-t border-border-subtle flex items-center justify-between gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => onNewForSupplier(supplier.latest)}
                                    >
                                        <FilePlus2 size={14} />
                                        New requisition
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onViewHistory(supplier.name)}
                                    >
                                        <History size={14} />
                                        History ({supplier.count})
                                    </Button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            <ConfirmDialog
                open={!!confirmReset}
                variant="warning"
                title="Reset learned invoice zones?"
                message={`Clear the remembered invoice pick zones (${confirmReset?.learnedPlaces.map(p => PLACE_LABEL[p]).join(', ') ?? ''}) for ${confirmReset?.name ?? 'this supplier'}? Saved requisitions and supplier contact details are kept, and future invoices will be read fresh.`}
                confirmLabel="Reset zones"
                onConfirm={async () => {
                    if (!confirmReset) return;
                    try {
                        await onResetMemory(confirmReset);
                        setConfirmReset(null);
                    } catch {
                        // Error toast handled by parent
                    }
                }}
                onCancel={() => setConfirmReset(null)}
            />
        </div>
    );
}

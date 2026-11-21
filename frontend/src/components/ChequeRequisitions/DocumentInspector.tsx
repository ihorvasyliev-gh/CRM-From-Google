import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    AlignLeft,
    Calendar,
    Check,
    ChevronDown,
    ChevronRight,
    Copy,
    Euro,
    Hash,
    ListChecks,
    Plus,
    Search,
    Sparkles,
    Users,
    X,
} from 'lucide-react';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import { Segmented, type SegmentOption } from '../ui/Tabs';
import { rawInvoiceText } from '../../lib/chequeReq/extract';
import { formatAmount, slashDate } from '../../lib/chequeReq/parse';
import { toast } from '../../lib/toast';
import type { ExtractedAmountChip, ExtractedDateChip, InvoiceFacts, PickFieldKey } from '../../lib/chequeReq/types';
import type { Rect } from '../../lib/pdfForms/types';
import type { LoadedInvoice } from './InvoicePreview';

export interface DocumentInspectorProps {
    invoice: LoadedInvoice;
    facts: InvoiceFacts;
    activeField: PickFieldKey | null;
    onApplyValue: (target: PickFieldKey, value: string, source?: Rect[]) => void;
    onInsertDescription: (text: string, mode: 'replace' | 'append', source?: Rect[]) => void;
}

type InspectorTab = 'chips' | 'text';

const AMOUNT_FIELDS = new Set<PickFieldKey>(['amount', 'amountQuoted', 'netAmount']);
const DATE_FIELDS = new Set<PickFieldKey>(['invoiceDate', 'dueDate', 'quoteDate', 'requestedDate', 'approvedDate']);

const TARGET_LABEL: Partial<Record<PickFieldKey, string>> = {
    amount: 'Payment amount',
    amountQuoted: 'Amount quoted',
    netAmount: 'Net amount (excl. VAT)',
    invoiceNumber: 'Invoice number',
    invoiceDate: 'Invoice date',
    dueDate: 'Due date',
    quoteDate: 'Date of quote',
    requestedDate: 'Requested date',
    approvedDate: 'Approved date',
    poNumber: 'PO number',
    quoteEmail: 'Quote email',
    quotePhone: 'Quote phone',
    quoteWebsite: 'Quote website',
};

function shortDateLabel(label?: string): string {
    if (!label) return 'Date';
    if (/invoice/i.test(label)) return 'Invoice';
    if (/due/i.test(label)) return 'Due';
    if (/service\s*start/i.test(label)) return 'Service start';
    if (/service\s*end/i.test(label)) return 'Service end';
    if (/service/i.test(label)) return 'Service';
    return label;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(line: string, query: string): ReactNode {
    const trimmed = query.trim();
    if (!trimmed) return line;
    const re = new RegExp(`(${escapeRegExp(trimmed)})`, 'gi');
    const parts = line.split(re);
    if (parts.length === 1) return line;
    const lower = trimmed.toLowerCase();
    return parts.map((part, idx) =>
        part.toLowerCase() === lower ? (
            <mark key={idx} className="bg-brand-500/20 text-primary font-semibold rounded-xs px-0.5">
                {part}
            </mark>
        ) : (
            <span key={idx}>{part}</span>
        ),
    );
}

/**
 * Collapsible document facts & raw-text inspector sitting alongside the invoice preview.
 * Surfaces one-click quick-fill chips for amounts, dates, references, contacts, line items,
 * and participants, plus searchable plain text extracted from the document.
 */
export default function DocumentInspector({
    invoice,
    facts,
    activeField,
    onApplyValue,
    onInsertDescription,
}: DocumentInspectorProps) {
    const [open, setOpen] = useState(true);
    const [tab, setTab] = useState<InspectorTab>('chips');
    const [showPeople, setShowPeople] = useState(false);
    const [textQuery, setTextQuery] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
        };
    }, []);

    const amountChips = useMemo<ExtractedAmountChip[]>(() => {
        if (facts.candidateAmounts && facts.candidateAmounts.length > 0) return facts.candidateAmounts;
        const fallback: ExtractedAmountChip[] = [];
        if (facts.total) fallback.push({ value: facts.total.value, label: 'Total', source: facts.total.source });
        if (facts.subtotal) fallback.push({ value: facts.subtotal.value, label: 'Subtotal', source: facts.subtotal.source });
        if (facts.vat) fallback.push({ value: facts.vat.value, label: 'VAT', source: facts.vat.source });
        return fallback;
    }, [facts]);

    const dateChips = useMemo<ExtractedDateChip[]>(() => {
        if (facts.candidateDates && facts.candidateDates.length > 0) return facts.candidateDates;
        const fallback: ExtractedDateChip[] = [];
        if (facts.invoiceDate) fallback.push({ iso: facts.invoiceDate.value, label: 'Invoice date', source: facts.invoiceDate.source });
        if (facts.dueDate) fallback.push({ iso: facts.dueDate.value, label: 'Due date', source: facts.dueDate.source });
        if (facts.serviceDates?.start) fallback.push({ iso: facts.serviceDates.start, label: 'Service date' });
        return fallback;
    }, [facts]);

    const rawText = useMemo(() => rawInvoiceText(invoice.phrases), [invoice.phrases]);
    const rawLines = useMemo(() => (rawText ? rawText.split('\n') : []), [rawText]);

    const filteredLines = useMemo(() => {
        const q = textQuery.trim().toLowerCase();
        if (!q) return rawLines.map((text, idx) => ({ idx, text }));
        return rawLines
            .map((text, idx) => ({ idx, text }))
            .filter(item => item.text.toLowerCase().includes(q));
    }, [rawLines, textQuery]);

    const copyText = async (value: string, label: string, key: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedKey(key);
            toast.success(`Copied ${label}`);
            if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => {
                setCopiedKey(prev => (prev === key ? null : prev));
                copyTimerRef.current = null;
            }, 1500);
        } catch {
            toast.error(`Could not copy ${label}`);
        }
    };

    const resolveAmountTarget = (chip: ExtractedAmountChip): PickFieldKey => {
        if (activeField && AMOUNT_FIELDS.has(activeField)) return activeField;
        if (chip.label && /\b(?:sub\s*total|net)\b/i.test(chip.label)) return 'netAmount';
        return 'amount';
    };

    const resolveDateTarget = (chip: ExtractedDateChip): PickFieldKey => {
        if (activeField && DATE_FIELDS.has(activeField)) return activeField;
        if (chip.label && /\bdue\b/i.test(chip.label)) return 'dueDate';
        return 'invoiceDate';
    };

    const references = useMemo(() => {
        const list: Array<
            | { id: string; kind: 'apply'; label: string; value: string; target: PickFieldKey; source?: Rect[] }
            | { id: string; kind: 'copy'; label: string; value: string }
        > = [];
        if (facts.invoiceNumber?.value) {
            list.push({
                id: 'invoiceNumber',
                kind: 'apply',
                label: 'Invoice #',
                value: facts.invoiceNumber.value,
                target: 'invoiceNumber',
                source: facts.invoiceNumber.source,
            });
        }
        if (facts.poNumbers && facts.poNumbers.length > 1) {
            if (facts.poNumber?.value) {
                list.push({
                    id: 'po-all',
                    kind: 'apply',
                    label: 'All POs',
                    value: facts.poNumber.value,
                    target: 'poNumber',
                    source: facts.poNumber.source,
                });
            }
            facts.poNumbers.forEach((po, idx) => {
                list.push({
                    id: `po-${idx}-${po}`,
                    kind: 'apply',
                    label: 'PO #',
                    value: po,
                    target: 'poNumber',
                    source: facts.poNumber?.source,
                });
            });
        } else if (facts.poNumber?.value) {
            list.push({
                id: 'po-single',
                kind: 'apply',
                label: 'PO #',
                value: facts.poNumber.value,
                target: 'poNumber',
                source: facts.poNumber.source,
            });
        }
        if (facts.supplier.vatNumber) {
            list.push({ id: 'vat', kind: 'copy', label: 'VAT', value: facts.supplier.vatNumber });
        }
        if (facts.supplier.iban) {
            list.push({ id: 'iban', kind: 'copy', label: 'IBAN', value: facts.supplier.iban });
        }
        if (facts.supplier.bic) {
            list.push({ id: 'bic', kind: 'copy', label: 'BIC', value: facts.supplier.bic });
        }
        if (facts.supplier.email) {
            list.push({ id: 'email', kind: 'apply', label: 'Email', value: facts.supplier.email, target: 'quoteEmail' });
        }
        if (facts.supplier.phone) {
            list.push({ id: 'phone', kind: 'apply', label: 'Phone', value: facts.supplier.phone, target: 'quotePhone' });
        }
        if (facts.supplier.website) {
            list.push({ id: 'website', kind: 'apply', label: 'Website', value: facts.supplier.website, target: 'quoteWebsite' });
        }
        return list;
    }, [facts]);

    const chipCount = amountChips.length + dateChips.length + references.length + facts.items.length;

    const summaryPills = useMemo(() => {
        const pills: string[] = [];
        if (facts.invoiceNumber?.value) pills.push(facts.invoiceNumber.value);
        if (facts.total) pills.push(`€${formatAmount(facts.total.value)}`);
        if (facts.items.length > 0) pills.push(`${facts.items.length} item${facts.items.length === 1 ? '' : 's'}`);
        if (facts.people.length > 0) pills.push(`${facts.people.length} ${facts.people.length === 1 ? 'person' : 'people'}`);
        return pills;
    }, [facts]);

    const tabOptions: SegmentOption<InspectorTab>[] = [
        { value: 'chips', label: 'Quick-Fill Chips', count: chipCount, icon: <Sparkles size={12} /> },
        { value: 'text', label: 'Raw Text', count: rawLines.filter(Boolean).length, icon: <AlignLeft size={12} /> },
    ];

    const hasAnyChips = chipCount > 0 || facts.people.length > 0;

    return (
        <section
            aria-label="Document inspector"
            className="rounded-xl border border-border-subtle bg-surface overflow-hidden"
        >
            {/* Compact Summary Header Bar */}
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(v => !v)}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-surface-elevated/60 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-inset"
            >
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary shrink-0">
                        <Sparkles size={13} className="text-brand-600 dark:text-brand-400" />
                        Inspector
                    </span>
                    {summaryPills.length > 0 ? (
                        <span className="text-xs text-muted truncate tabular-nums">
                            {summaryPills.join(' · ')}
                        </span>
                    ) : (
                        <span className="text-xs text-muted truncate">
                            {facts.hasText ? 'Extracted text & quick-fill' : 'No text extracted'}
                        </span>
                    )}
                    {facts.scanned && (
                        <Badge tone="info" shape="pill">OCR</Badge>
                    )}
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted shrink-0">
                    <span className="hidden sm:inline">{open ? 'Hide' : 'Quick-fill'}</span>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
            </button>

            {/* Collapsible Body */}
            {open && (
                <div className="border-t border-border-subtle px-3 py-3 space-y-3 bg-surface">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Segmented
                            options={tabOptions}
                            value={tab}
                            onChange={setTab}
                            ariaLabel="Inspector view"
                            size="sm"
                        />
                        {tab === 'chips' && activeField && TARGET_LABEL[activeField] && (
                            <span className="text-[11px] text-muted">
                                Filling <strong className="text-primary">{TARGET_LABEL[activeField]}</strong>
                            </span>
                        )}
                    </div>

                    {tab === 'chips' ? (
                        hasAnyChips ? (
                            <div className="space-y-3 text-xs">
                                {/* Amounts */}
                                {amountChips.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                                            <Euro size={11} /> Amounts
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {amountChips.map((chip, idx) => {
                                                const target = resolveAmountTarget(chip);
                                                const formatted = formatAmount(chip.value);
                                                return (
                                                    <button
                                                        key={`${chip.label ?? 'amt'}-${chip.value}-${idx}`}
                                                        type="button"
                                                        title={`Fill ${TARGET_LABEL[target] ?? target} with €${formatted}`}
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => onApplyValue(target, formatted, chip.source)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle bg-surface-elevated/70 hover:bg-brand-500/10 hover:border-brand-500/40 text-primary transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 cursor-pointer"
                                                    >
                                                        {chip.label && <span className="text-muted font-medium max-w-[140px] truncate">{chip.label}</span>}{' '}
                                                        <span className="font-semibold tabular-nums">€{formatted}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Dates */}
                                {dateChips.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                                            <Calendar size={11} /> Dates
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {dateChips.map((chip, idx) => {
                                                const target = resolveDateTarget(chip);
                                                const display = slashDate(chip.iso);
                                                return (
                                                    <button
                                                        key={`${chip.label ?? 'date'}-${chip.iso}-${idx}`}
                                                        type="button"
                                                        title={`Fill ${TARGET_LABEL[target] ?? target} with ${display}`}
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => onApplyValue(target, chip.iso, chip.source)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle bg-surface-elevated/70 hover:bg-brand-500/10 hover:border-brand-500/40 text-primary transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 cursor-pointer"
                                                    >
                                                        <span className="text-muted font-medium">{shortDateLabel(chip.label)}</span>{' '}
                                                        <span className="font-semibold tabular-nums">{display}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* References & Contacts */}
                                {references.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                                            <Hash size={11} /> References & Contacts
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {references.map(ref =>
                                                ref.kind === 'apply' ? (
                                                    <button
                                                        key={ref.id}
                                                        type="button"
                                                        title={`Fill ${TARGET_LABEL[ref.target] ?? ref.target} with ${ref.value}`}
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => onApplyValue(ref.target, ref.value, ref.source)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle bg-surface-elevated/70 hover:bg-brand-500/10 hover:border-brand-500/40 text-primary transition-colors max-w-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 cursor-pointer"
                                                    >
                                                        <span className="text-muted font-medium shrink-0">{ref.label}</span>{' '}
                                                        <span className="font-semibold truncate max-w-[200px]">{ref.value}</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        key={ref.id}
                                                        type="button"
                                                        title={`Copy ${ref.label}`}
                                                        onClick={() => void copyText(ref.value, ref.label, ref.id)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle bg-surface-elevated/40 hover:bg-surface-elevated text-primary transition-colors max-w-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 cursor-pointer"
                                                    >
                                                        <span className="text-muted font-medium shrink-0">{ref.label}</span>{' '}
                                                        <span className="font-mono text-[11px] font-medium truncate max-w-[180px]">{ref.value}</span>
                                                        {copiedKey === ref.id ? (
                                                            <Check size={11} className="shrink-0 text-status-confirmed" />
                                                        ) : (
                                                            <Copy size={11} className="shrink-0 text-muted" />
                                                        )}
                                                    </button>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Line Items */}
                                {facts.items.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                                            <ListChecks size={11} /> Line Items ({facts.items.length})
                                        </p>
                                        <ul className="space-y-1.5">
                                            {facts.items.map((item, idx) => {
                                                const desc = item.description.trim();
                                                const metaParts: string[] = [];
                                                if (item.quantity !== undefined && item.unitPrice !== undefined) {
                                                    metaParts.push(`${item.quantity} × €${formatAmount(item.unitPrice)}`);
                                                } else if (item.quantity !== undefined) {
                                                    metaParts.push(`Qty ${item.quantity}`);
                                                }
                                                if (item.amount !== undefined) {
                                                    metaParts.push(`€${formatAmount(item.amount)}`);
                                                }
                                                return (
                                                    <li
                                                        key={idx}
                                                        className="rounded-lg border border-border-subtle bg-surface-elevated/40 px-2.5 py-2 flex flex-col gap-1.5"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="text-primary font-medium leading-snug break-words min-w-0">
                                                                {desc || 'Line item'}
                                                            </span>
                                                            {metaParts.length > 0 && (
                                                                <span className="text-[11px] text-muted font-medium tabular-nums whitespace-nowrap shrink-0">
                                                                    {metaParts.join(' · ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {desc && (
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <Button
                                                                    size="xs"
                                                                    variant="secondary"
                                                                    onMouseDown={e => e.preventDefault()}
                                                                    onClick={() => onInsertDescription(desc, 'replace', item.source)}
                                                                >
                                                                    Use in description
                                                                </Button>
                                                                <Button
                                                                    size="xs"
                                                                    variant="ghost"
                                                                    onMouseDown={e => e.preventDefault()}
                                                                    onClick={() => onInsertDescription(desc, 'append', item.source)}
                                                                >
                                                                    <Plus size={11} /> Append
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}

                                {/* People */}
                                {facts.people.length > 0 && (
                                    <div className="pt-2 border-t border-border-subtle space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <button
                                                type="button"
                                                aria-expanded={showPeople}
                                                onClick={() => setShowPeople(v => !v)}
                                                className="inline-flex items-center gap-1.5 font-semibold text-brand-600 dark:text-brand-400 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-sm"
                                            >
                                                <Users size={13} />
                                                <span>People named on invoice</span>
                                                <Badge tone="brand" shape="pill" className="tabular-nums">
                                                    {facts.people.length}
                                                </Badge>
                                                {showPeople ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                            </button>
                                            <Button
                                                size="xs"
                                                variant="ghost"
                                                onClick={() =>
                                                    void copyText(
                                                        facts.people.map((p, i) => `${i + 1}. ${p}`).join('\n'),
                                                        `${facts.people.length} names`,
                                                        'people',
                                                    )
                                                }
                                            >
                                                {copiedKey === 'people' ? <Check size={12} className="text-status-confirmed" /> : <Copy size={12} />}
                                                Copy names
                                            </Button>
                                        </div>
                                        {showPeople && (
                                            <ol className="list-decimal pl-5 text-primary space-y-0.5 columns-1 sm:columns-2 gap-4">
                                                {facts.people.map((person, idx) => (
                                                    <li key={idx} className="break-inside-avoid">{person}</li>
                                                ))}
                                            </ol>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-muted py-2">
                                No structured amounts, dates, or references were detected automatically. Check the Raw Text tab or pick values directly on the invoice.
                            </p>
                        )
                    ) : (
                        /* Raw Text Tab */
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1 min-w-0">
                                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                                    <input
                                        type="text"
                                        value={textQuery}
                                        onChange={e => setTextQuery(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Escape' && textQuery) {
                                                e.preventDefault();
                                                setTextQuery('');
                                            }
                                        }}
                                        placeholder="Filter extracted text…"
                                        aria-label="Filter extracted invoice text"
                                        className="w-full h-8 pl-8 pr-7 bg-surface-elevated/60 border border-border-subtle rounded-lg text-xs text-primary placeholder:text-muted/70 focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors"
                                    />
                                    {textQuery && (
                                        <button
                                            type="button"
                                            aria-label="Clear filter"
                                            onClick={() => setTextQuery('')}
                                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted hover:text-primary hover:bg-surface transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                                <Button
                                    size="xs"
                                    variant="secondary"
                                    disabled={!rawText}
                                    onClick={() => void copyText(rawText, 'invoice text', 'raw-all')}
                                >
                                    {copiedKey === 'raw-all' ? <Check size={12} className="text-status-confirmed" /> : <Copy size={12} />}
                                    Copy all text
                                </Button>
                            </div>

                            {textQuery.trim() && (
                                <p className="text-[11px] text-muted tabular-nums">
                                    {filteredLines.length} matching {filteredLines.length === 1 ? 'line' : 'lines'}
                                </p>
                            )}

                            {!rawText ? (
                                <p className="text-xs text-muted py-3 text-center rounded-lg border border-dashed border-border-subtle">
                                    No text could be read from this document.
                                </p>
                            ) : filteredLines.length === 0 ? (
                                <p className="text-xs text-muted py-3 text-center rounded-lg border border-dashed border-border-subtle">
                                    No lines match “{textQuery}”.
                                </p>
                            ) : (
                                <div className="max-h-60 overflow-y-auto rounded-lg border border-border-subtle bg-surface-elevated/50 p-2.5 font-mono text-[11px] leading-relaxed text-primary space-y-0.5 select-text">
                                    {filteredLines.map(({ idx, text }) =>
                                        text === '' ? (
                                            <div key={idx} className="h-2 border-b border-dashed border-border-subtle/70 my-1" />
                                        ) : (
                                            <div key={idx} className="break-words whitespace-pre-wrap">
                                                {highlightMatch(text, textQuery)}
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

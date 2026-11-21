import {
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import {
    Building2,
    Calendar,
    Check,
    CheckCheck,
    ChevronDown,
    CircleAlert,
    History,
    MousePointerClick,
    Plus,
    Sparkles,
    TriangleAlert,
} from 'lucide-react';
import { DateInput } from '../ui/DatePicker';
import { Segmented } from '../ui/Tabs';
import Badge from '../ui/Badge';
import { calloutCls, eyebrowCls, labelCls } from '../ui/styles';
import { todayISO } from '../../lib/dateUtils';
import { descriptionFit } from '../../lib/chequeReq/docx';
import { buildDescription, suggestedChecklist } from '../../lib/chequeReq/draft';
import { dottedDate, formatAmount, parseAmount } from '../../lib/chequeReq/parse';
import { META_PICKABLE, MULTI_PICK, PICKABLE } from '../../lib/chequeReq/pick';
import type {
    ChecklistItem,
    ChequeReqForm,
    ChequeReqMeta,
    ChequeReqStatus,
    FieldFlag,
    FieldFlags,
    FieldKey,
    InvoiceFacts,
    MetaFieldKey,
    PickFieldKey,
    QuoteMethod,
    SavedChequeReq,
    SupplierSummary,
} from '../../lib/chequeReq/types';

export interface RequisitionFormProps {
    form: ChequeReqForm;
    meta: ChequeReqMeta;
    facts: InvoiceFacts;
    flags: FieldFlags;
    /** Known suppliers from history for autocomplete (empty on public page) */
    suppliers?: SupplierSummary[];
    /** Matched previous requisition from supplier memory, if any */
    matchedSupplierName?: string;
    /** Show admin-only status/cheque/notes tracking section */
    showTracking?: boolean;
    status?: ChequeReqStatus;
    chequeNumber?: string;
    notes?: string;
    descriptionPresets?: string[];
    onChange: <K extends keyof ChequeReqForm>(key: K, value: ChequeReqForm[K]) => void;
    onMetaChange: <K extends MetaFieldKey>(key: K, value: ChequeReqMeta[K]) => void;
    onTrackingChange?: (patch: { status?: ChequeReqStatus; chequeNumber?: string; notes?: string }) => void;
    onSelectSupplier?: (supplierRow: SavedChequeReq) => void;
    onUseInvoiceValues?: () => void;
    onAccept: (key: FieldKey) => void;
    onActive: (key: PickFieldKey | null) => void;
    onPick?: (key: PickFieldKey) => void;
    picking?: PickFieldKey | null;
}

const INPUT =
    'w-full px-3 border rounded-xl text-sm text-primary placeholder:text-muted/70 focus:outline-hidden focus:ring-2 transition-colors';

function inputTone(flag?: FieldFlag, picked = false): string {
    if (picked) {
        return 'bg-surface border-brand-500 ring-2 ring-brand-500/25 focus:border-brand-500 focus:ring-brand-500/25';
    }
    switch (flag?.level) {
        case 'check':
            return 'bg-warning/5 border-warning/70 focus:border-warning focus:ring-warning/25';
        case 'missing':
            return 'bg-danger/5 border-danger/60 focus:border-danger focus:ring-danger/20';
        case 'memory':
            return 'bg-surface border-info/50 focus:border-brand-500 focus:ring-brand-500/20';
        default:
            return 'bg-surface border-border-subtle focus:border-brand-500 focus:ring-brand-500/20';
    }
}

function pickAriaLabel(label: string): string {
    return `Pick the ${label.replace(/^\p{Lu}(?=\p{Ll})/u, c => c.toLowerCase())} on the invoice`;
}

function FlagNote({ flag, onAccept }: { flag: FieldFlag; onAccept: () => void }) {
    if (flag.level === 'found') {
        return (
            <p className="mt-1 text-xs text-muted flex items-center gap-1">
                <Check size={11} className="text-status-confirmed shrink-0" /> {flag.note}
            </p>
        );
    }
    const Icon = flag.level === 'memory' ? History : flag.level === 'missing' ? CircleAlert : TriangleAlert;
    const tone =
        flag.level === 'memory'
            ? 'text-status-invited'
            : flag.level === 'missing'
                ? 'text-status-rejected'
                : 'text-status-requested';
    return (
        <p className={`mt-1 text-xs flex items-start gap-1 ${tone}`}>
            <Icon size={12} className="shrink-0 mt-px" />
            <span className="flex-1 min-w-0">{flag.note}</span>
            {flag.level !== 'memory' && (
                <button
                    type="button"
                    onClick={onAccept}
                    className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
                >
                    {flag.level === 'missing' ? 'Leave blank' : 'Looks right'}
                </button>
            )}
        </p>
    );
}

function Section({
    title,
    action,
    children,
}: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    const headingId = useId();
    return (
        <section aria-labelledby={headingId} className="space-y-3 pt-4 first:pt-0 border-t first:border-t-0 border-border-subtle">
            <div className="flex items-center justify-between gap-2 mb-3">
                <h3 id={headingId} className={eyebrowCls}>{title}</h3>
                {action}
            </div>
            <div className="space-y-3">{children}</div>
        </section>
    );
}

/** Auto-resizing textarea that grows cleanly across Firefox, Safari, and Chrome */
function AutoTextarea({
    value,
    minHeight = 64,
    className,
    ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & {
    value: string;
    minHeight?: number;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
    }, [value, minHeight]);

    return <textarea ref={ref} value={value} rows={2} className={className} {...rest} />;
}

function PickButton({
    label,
    picked,
    onClick,
    className = '',
}: {
    label: string;
    picked: boolean;
    onClick: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={picked}
            aria-label={pickAriaLabel(label)}
            title="Pick it on the invoice"
            className={`w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0 transition-colors ${
                picked
                    ? 'bg-brand-500 text-white'
                    : 'text-muted hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-500/10'
            } ${className}`}
        >
            <MousePointerClick size={14} />
        </button>
    );
}

/** Editable currency input for Net excl. VAT with Irish VAT quick-math helpers */
function NetAmountField({
    netAmount,
    grossText,
    picked,
    onChange,
    onActive,
    onPick,
}: {
    netAmount: number | null;
    grossText: string;
    picked: boolean;
    onChange: (value: number | null) => void;
    onActive: (key: PickFieldKey | null) => void;
    onPick?: (key: PickFieldKey) => void;
}) {
    const [focused, setFocused] = useState(false);
    const [draft, setDraft] = useState(() => (netAmount !== null ? formatAmount(netAmount) : ''));

    useEffect(() => {
        if (!focused) {
            setDraft(netAmount !== null ? formatAmount(netAmount) : '');
        }
    }, [netAmount, focused]);

    const gross = parseAmount(grossText);
    const vatAmount =
        gross !== null && netAmount !== null && gross > netAmount + 0.005
            ? Math.round((gross - netAmount) * 100) / 100
            : null;
    const vatPct =
        vatAmount !== null && netAmount !== null && netAmount > 0
            ? Math.round((vatAmount / netAmount) * 1000) / 10
            : null;

    const applyNet = (val: number) => {
        const rounded = Math.round(val * 100) / 100;
        onChange(rounded);
        setDraft(formatAmount(rounded));
    };

    const pickable = !!onPick && META_PICKABLE.has('netAmount');

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="cr-netAmount" className={`${labelCls} mb-0`}>
                    Net excl. VAT
                </label>
                {vatAmount !== null && (
                    <span className="text-[11px] font-medium text-muted tabular-nums">
                        VAT €{formatAmount(vatAmount)}
                        {vatPct !== null ? ` (${vatPct}%)` : ''}
                    </span>
                )}
            </div>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">€</span>
                <input
                    id="cr-netAmount"
                    type="text"
                    inputMode="decimal"
                    value={focused ? draft : netAmount !== null ? formatAmount(netAmount) : ''}
                    placeholder="For €5,000 limit"
                    onFocus={() => {
                        setFocused(true);
                        setDraft(netAmount !== null ? formatAmount(netAmount) : '');
                        onActive('netAmount');
                    }}
                    onBlur={() => {
                        setFocused(false);
                        const parsed = parseAmount(draft);
                        setDraft(parsed !== null ? formatAmount(parsed) : '');
                        onActive(null);
                    }}
                    onChange={e => {
                        const raw = e.target.value;
                        setDraft(raw);
                        if (!raw.trim()) {
                            onChange(null);
                        } else {
                            const parsed = parseAmount(raw);
                            if (parsed !== null) onChange(parsed);
                        }
                    }}
                    className={`${INPUT} ${inputTone(undefined, picked)} h-9 pl-7 tabular-nums ${pickable ? 'pr-9' : ''}`}
                />
                {pickable && (
                    <PickButton
                        label="Net excl. VAT"
                        picked={picked}
                        onClick={() => onPick('netAmount')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    />
                )}
            </div>
            {picked ? (
                <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">Click it on the invoice. Esc stops.</p>
            ) : gross !== null && gross > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {(netAmount === null || Math.abs(netAmount - gross) > 0.005) && (
                        <button
                            type="button"
                            onClick={() => applyNet(gross)}
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium text-muted hover:text-primary bg-surface border border-border-subtle hover:border-border-strong transition-colors"
                        >
                            Set = Payment
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => applyNet(gross / 1.23)}
                        className="px-2 py-0.5 rounded-md text-[11px] font-medium text-muted hover:text-primary bg-surface border border-border-subtle hover:border-border-strong transition-colors"
                    >
                        Calc ex 23%
                    </button>
                    <button
                        type="button"
                        onClick={() => applyNet(gross / 1.135)}
                        className="px-2 py-0.5 rounded-md text-[11px] font-medium text-muted hover:text-primary bg-surface border border-border-subtle hover:border-border-strong transition-colors"
                    >
                        Calc ex 13.5%
                    </button>
                </div>
            ) : null}
        </div>
    );
}

const QUOTE_ROWS: { method: QuoteMethod; label: string; detail: FieldKey; detailLabel: string; type?: string }[] = [
    { method: 'shop', label: 'In shop purchase', detail: 'shopName', detailLabel: 'Shop name' },
    { method: 'telephone', label: 'Telephone', detail: 'quotePhone', detailLabel: 'Phone no.', type: 'tel' },
    { method: 'email', label: 'E-mail', detail: 'quoteEmail', detailLabel: 'Email address', type: 'email' },
    { method: 'meeting', label: 'Meeting', detail: 'quoteContact', detailLabel: 'Contact name' },
    { method: 'online', label: 'Correspondence / online', detail: 'quoteWebsite', detailLabel: 'Website' },
];

const CHECKLIST: { item: ChecklistItem; label: string }[] = [
    { item: 'taxClearance', label: 'Tax Declaration Form or TCAN' },
    { item: 'poAndSicap', label: 'PO Number and “SICAP” on Invoice' },
    { item: 'description', label: 'Description' },
    { item: 'approval', label: 'Approval' },
    { item: 'quoteDetails', label: 'Quote Details' },
];

const STATUS_OPTIONS: { value: ChequeReqStatus; label: string; dot: string }[] = [
    { value: 'draft', label: 'Draft', dot: 'bg-warning' },
    { value: 'ready', label: 'Ready to pay', dot: 'bg-info' },
    { value: 'paid', label: 'Paid', dot: 'bg-success' },
];

/** The SICAP cheque requisition, field by field, with smart helpers, live Word fit, and source picking */
export default function RequisitionForm({
    form,
    meta,
    facts,
    flags,
    suppliers = [],
    matchedSupplierName,
    showTracking = false,
    status = 'ready',
    chequeNumber = '',
    notes = '',
    descriptionPresets = [],
    onChange,
    onMetaChange,
    onTrackingChange,
    onSelectSupplier,
    onUseInvoiceValues,
    onAccept,
    onActive,
    onPick,
    picking,
}: RequisitionFormProps) {
    // Supplier autocomplete state
    const [supplierOpen, setSupplierOpen] = useState(false);
    const [supplierBrowseAll, setSupplierBrowseAll] = useState(false);
    const [supplierCursor, setSupplierCursor] = useState(0);
    const payeeBoxRef = useRef<HTMLDivElement>(null);

    const hasSuppliers = suppliers.length > 0 && !!onSelectSupplier;
    const filteredSuppliers = useMemo(() => {
        if (!hasSuppliers) return [];
        const q = form.payeeName.trim().toLowerCase();
        if (!q || supplierBrowseAll) return suppliers.slice(0, 8);
        return suppliers
            .filter(
                s =>
                    s.name.toLowerCase().includes(q) ||
                    s.vat.toLowerCase().includes(q) ||
                    s.email.toLowerCase().includes(q) ||
                    s.phone.toLowerCase().includes(q),
            )
            .slice(0, 6);
    }, [hasSuppliers, suppliers, form.payeeName, supplierBrowseAll]);

    const showSupplierPopover =
        hasSuppliers &&
        supplierOpen &&
        filteredSuppliers.length > 0 &&
        (supplierBrowseAll ||
            !(
                filteredSuppliers.length === 1 &&
                filteredSuppliers[0].name.trim().toLowerCase() === form.payeeName.trim().toLowerCase()
            ));

    useEffect(() => {
        if (!supplierOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!payeeBoxRef.current?.contains(e.target as Node)) {
                setSupplierOpen(false);
                setSupplierBrowseAll(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [supplierOpen]);

    const selectSupplierItem = (s: SupplierSummary) => {
        onSelectSupplier?.(s.latest);
        setSupplierOpen(false);
        setSupplierBrowseAll(false);
    };

    const handlePayeeKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (!showSupplierPopover) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSupplierCursor(c => (c + 1) % filteredSuppliers.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSupplierCursor(c => (c - 1 + filteredSuppliers.length) % filteredSuppliers.length);
        } else if (e.key === 'Enter' && filteredSuppliers[supplierCursor]) {
            e.preventDefault();
            selectSupplierItem(filteredSuppliers[supplierCursor]);
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            setSupplierOpen(false);
            setSupplierBrowseAll(false);
        }
    };

    // Description fit & quick-insert chips
    const fit = useMemo(() => descriptionFit(form.description), [form.description]);
    const itemChips = useMemo(() => {
        const seen = new Set<string>();
        const list: string[] = [];
        for (const item of facts.items) {
            const d = item.description.trim();
            if (d && !seen.has(d.toLowerCase())) {
                seen.add(d.toLowerCase());
                list.push(d);
            }
        }
        return list.slice(0, 6);
    }, [facts.items]);

    const serviceDateChip = useMemo(() => {
        const sd = facts.serviceDates;
        if (!sd) return '';
        if (sd.days && sd.days.length > 1) return sd.days.map(dottedDate).join(', ');
        if (sd.start && sd.end && sd.end !== sd.start) return `${dottedDate(sd.start)} – ${dottedDate(sd.end)}`;
        return sd.start ? dottedDate(sd.start) : '';
    }, [facts.serviceDates]);

    const applyItemChip = (text: string) => {
        const cur = form.description.trim();
        if (!cur) {
            onChange('description', text);
        } else if (!cur.toLowerCase().includes(text.toLowerCase())) {
            onChange('description', `${cur}, ${text}`);
        }
    };

    const applyDateChip = () => {
        if (!serviceDateChip) return;
        const cur = form.description.trim();
        if (!cur) {
            onChange('description', serviceDateChip);
        } else if (!cur.includes(serviceDateChip)) {
            onChange('description', `${cur} ${serviceDateChip}`);
        }
    };

    const applyPresetChip = (preset: string) => {
        const item = meta.item || facts.items[0]?.description || '';
        const date = meta.serviceDate || facts.serviceDates?.start || '';
        const days = facts.serviceDates?.days ?? [];
        const built = item
            ? buildDescription(item, date, preset, days)
            : preset
                .replace(/\{item\}/g, form.description.trim())
                .replace(/\{date\}/g, date ? dottedDate(date) : '')
                .replace(/\s+/g, ' ')
                .trim();
        if (built) onChange('description', built);
    };

    // Smart quote rows
    const activeQuoteRows = QUOTE_ROWS.filter(
        row =>
            form.quoteBy[row.method] ||
            Boolean((form[row.detail] as string).trim()) ||
            Boolean(flags[row.detail]) ||
            picking === row.detail,
    );
    const inactiveQuoteRows = QUOTE_ROWS.filter(row => !activeQuoteRows.includes(row));

    const activateQuoteMethod = (row: (typeof QUOTE_ROWS)[number], checked: boolean) => {
        onChange('quoteBy', { ...form.quoteBy, [row.method]: checked });
        if (checked) {
            requestAnimationFrame(() => {
                document.getElementById(`cr-${row.detail}`)?.focus();
            });
        }
    };

    // Smart checklist suggestions
    const checklistHints = useMemo(() => suggestedChecklist(form, facts), [form, facts]);
    const untickedReady = useMemo(
        () => CHECKLIST.filter(c => checklistHints[c.item].ready && !form.checklist[c.item]),
        [checklistHints, form.checklist],
    );
    const tickAllVerified = () => {
        const next = { ...form.checklist };
        for (const c of untickedReady) next[c.item] = true;
        onChange('checklist', next);
    };

    const textField = (
        key: FieldKey,
        label: string,
        opts: {
            multiline?: boolean;
            prefix?: string;
            placeholder?: string;
            type?: string;
            className?: string;
            labelAction?: ReactNode;
            onValueChange?: (val: string) => void;
        } = {},
    ) => {
        const flag = flags[key];
        const id = `cr-${key}`;
        const pickable = !!onPick && PICKABLE.has(key);
        const picked = picking === key;
        const tone = inputTone(flag, picked);
        const handleChange = (val: string) => {
            if (opts.onValueChange) opts.onValueChange(val);
            else onChange(key, val);
        };
        const common = {
            id,
            value: form[key] as string,
            placeholder: opts.placeholder,
            onFocus: () => onActive(key),
            onBlur: () => onActive(null),
            'aria-invalid': flag?.level === 'missing' || undefined,
        };
        return (
            <div className={opts.className}>
                {opts.labelAction ? (
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label htmlFor={id} className={`${labelCls} mb-0`}>
                            {label}
                        </label>
                        {opts.labelAction}
                    </div>
                ) : (
                    <label htmlFor={id} className={labelCls}>
                        {label}
                    </label>
                )}
                <div className="relative">
                    {opts.prefix && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">
                            {opts.prefix}
                        </span>
                    )}
                    {opts.multiline ? (
                        <AutoTextarea
                            {...common}
                            onChange={e => handleChange(e.target.value)}
                            className={`${INPUT} ${tone} py-2 resize-y min-h-16 ${pickable ? 'pr-9' : ''}`}
                        />
                    ) : (
                        <input
                            {...common}
                            type={opts.type ?? 'text'}
                            onChange={e => handleChange(e.target.value)}
                            className={`${INPUT} ${tone} h-9 ${opts.prefix ? 'pl-7 tabular-nums' : ''} ${pickable ? 'pr-9' : ''}`}
                        />
                    )}
                    {pickable && (
                        <PickButton
                            label={label}
                            picked={picked}
                            onClick={() => onPick(key)}
                            className={`absolute right-1.5 ${opts.multiline ? 'top-1.5' : 'top-1/2 -translate-y-1/2'}`}
                        />
                    )}
                </div>
                {picked ? (
                    <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">
                        {MULTI_PICK.has(key) ? 'Click each piece of it on the invoice, then Done.' : 'Click it on the invoice.'} Esc stops.
                    </p>
                ) : (
                    flag && <FlagNote flag={flag} onAccept={() => onAccept(key)} />
                )}
            </div>
        );
    };

    const dateField = (
        key: 'requestedDate' | 'approvedDate' | 'quoteDate' | 'invoiceDate' | 'dueDate',
        label: string,
        opts: { placeholder?: string; isMeta?: boolean } = {},
    ) => {
        const value = opts.isMeta ? (meta[key as 'invoiceDate' | 'dueDate'] ?? '') : (form[key as 'requestedDate' | 'approvedDate' | 'quoteDate'] ?? '');
        const setVal = (v: string) => {
            if (opts.isMeta) onMetaChange(key as 'invoiceDate' | 'dueDate', v);
            else onChange(key as 'requestedDate' | 'approvedDate' | 'quoteDate', v);
        };
        const pickable = !!onPick && (opts.isMeta ? META_PICKABLE.has(key as MetaFieldKey) : PICKABLE.has(key as FieldKey));
        const picked = picking === key;

        return (
            <div onFocus={() => onActive(key)} onBlur={() => onActive(null)}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label htmlFor={`cr-${key}`} className={`${labelCls} mb-0`}>
                        {label}
                    </label>
                    {value ? (
                        <button type="button" onClick={() => setVal('')} className="text-xs text-muted hover:text-primary">
                            Clear
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setVal(todayISO())}
                            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                        >
                            Today
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                        <DateInput
                            id={`cr-${key}`}
                            value={value}
                            onChange={setVal}
                            placeholder={opts.placeholder ?? 'Blank (date by hand)'}
                            className={`${INPUT} ${inputTone(undefined, picked)} h-9`}
                        />
                    </div>
                    {pickable && (
                        <PickButton
                            label={label}
                            picked={picked}
                            onClick={() => onPick(key)}
                            className="w-8 h-9 rounded-xl border border-border-subtle bg-surface"
                        />
                    )}
                </div>
                {picked && <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">Click it on the invoice. Esc stops.</p>}
            </div>
        );
    };

    const checkbox = (checked: boolean, label: ReactNode, onToggle: (v: boolean) => void) => (
        <label className="flex items-center gap-2 text-sm text-primary cursor-pointer select-none">
            <input
                type="checkbox"
                checked={checked}
                onChange={e => onToggle(e.target.checked)}
                className="w-4 h-4 rounded accent-brand-500 shrink-0"
            />
            {label}
        </label>
    );

    const showMemoryOverride =
        Boolean(matchedSupplierName) && Boolean(onUseInvoiceValues) && Boolean(facts.supplier.name || facts.supplier.address);
    const quoteAmountDiffers =
        Boolean(form.amount.trim()) && form.amountQuoted.trim() !== form.amount.trim();

    const payeeFlag = flags.payeeName;
    const payeePickable = !!onPick && PICKABLE.has('payeeName');
    const payeePicked = picking === 'payeeName';

    return (
        <div className="space-y-4">
            <Section title="Funding">
                <div className="grid gap-3 sm:grid-cols-2">
                    {textField('actionNumber', 'SICAP action number', { placeholder: 'e.g. 9.' })}
                    {textField('nonSicapFunding', 'Non-SICAP funding')}
                </div>
            </Section>

            <Section title="Payment">
                <div className="grid gap-3 sm:grid-cols-2">
                    {textField('poNumber', 'PO number')}
                    {textField('amount', 'Payment amount', { prefix: '€', placeholder: '0.00' })}
                </div>

                {showMemoryOverride && (
                    <div className={`${calloutCls.info} px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2`}>
                        <span className="flex items-center gap-1.5 min-w-0">
                            <History size={13} className="text-status-invited shrink-0" />
                            <span>
                                Prefilled from previous <strong>{matchedSupplierName}</strong> requisition
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={onUseInvoiceValues}
                            className="font-semibold text-brand-600 dark:text-brand-400 underline underline-offset-2 hover:no-underline shrink-0"
                        >
                            Use invoice values instead
                        </button>
                    </div>
                )}

                {/* Payee name with optional known-supplier quick-pick */}
                <div ref={payeeBoxRef} className="relative">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label htmlFor="cr-payeeName" className={`${labelCls} mb-0`}>
                            Payee name
                        </label>
                        {hasSuppliers && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSupplierBrowseAll(true);
                                    setSupplierOpen(o => !o);
                                    setSupplierCursor(0);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-elevated text-muted hover:text-primary border border-border-subtle transition-colors"
                            >
                                <Building2 size={11} />
                                Known suppliers
                                <ChevronDown size={11} />
                            </button>
                        )}
                    </div>
                    <div className="relative">
                        <input
                            id="cr-payeeName"
                            type="text"
                            value={form.payeeName}
                            autoComplete="off"
                            onFocus={() => {
                                onActive('payeeName');
                                if (hasSuppliers) {
                                    setSupplierBrowseAll(false);
                                    setSupplierOpen(true);
                                    setSupplierCursor(0);
                                }
                            }}
                            onBlur={() => onActive(null)}
                            onKeyDown={handlePayeeKeyDown}
                            onChange={e => {
                                onChange('payeeName', e.target.value);
                                if (hasSuppliers) {
                                    setSupplierBrowseAll(false);
                                    setSupplierOpen(true);
                                    setSupplierCursor(0);
                                }
                            }}
                            aria-invalid={payeeFlag?.level === 'missing' || undefined}
                            className={`${INPUT} ${inputTone(payeeFlag, payeePicked)} h-9 ${payeePickable ? 'pr-9' : ''}`}
                        />
                        {payeePickable && (
                            <PickButton
                                label="Payee name"
                                picked={payeePicked}
                                onClick={() => onPick('payeeName')}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2"
                            />
                        )}
                    </div>

                    {showSupplierPopover && (
                        <div
                            role="listbox"
                            aria-label="Known suppliers"
                            className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl bg-surface border border-border-subtle shadow-float p-1 max-h-60 overflow-y-auto animate-popoverScaleIn"
                        >
                            {filteredSuppliers.map((s, idx) => {
                                const highlighted = idx === supplierCursor;
                                const tierDot =
                                    s.tier === 'exceeded'
                                        ? 'bg-danger'
                                        : s.tier === 'approaching'
                                            ? 'bg-warning'
                                            : 'bg-success';
                                return (
                                    <button
                                        key={s.key}
                                        type="button"
                                        role="option"
                                        aria-selected={highlighted}
                                        onMouseDown={e => e.preventDefault()}
                                        onMouseEnter={() => setSupplierCursor(idx)}
                                        onClick={() => selectSupplierItem(s)}
                                        className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-start justify-between gap-2 ${
                                            highlighted ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/60'
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tierDot}`} aria-hidden="true" />
                                                <span className="text-xs font-semibold text-primary truncate">{s.name}</span>
                                                <span className="text-[11px] text-muted shrink-0">({s.count})</span>
                                            </div>
                                            {(s.vat || s.email) && (
                                                <p className="text-[11px] text-muted truncate pl-3 mt-0.5">
                                                    {[s.vat && `VAT ${s.vat}`, s.email].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                        <span className="text-[11px] font-medium text-muted tabular-nums shrink-0 pt-0.5">
                                            €{formatAmount(s.totalNet)} net
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {payeePicked ? (
                        <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">Click it on the invoice. Esc stops.</p>
                    ) : (
                        payeeFlag && <FlagNote flag={payeeFlag} onAccept={() => onAccept('payeeName')} />
                    )}
                </div>

                {textField('payeeAddress', 'Payee address', { multiline: true })}

                {/* Description with live Word 2-line fit indicator & quick-insert chips */}
                <div>
                    {textField('description', 'Description of goods / services', { multiline: true })}

                    {form.description.trim().length > 0 && (
                        <div className="mt-2 rounded-xl bg-surface-elevated/50 border border-border-subtle px-3 py-2 space-y-1.5">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px] text-muted">
                                        <span>Line 1 (next to Checklist)</span>
                                        <span className="tabular-nums font-medium">{Math.min(100, fit.line1Pct)}%</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-brand-500 transition-all"
                                            style={{ width: `${Math.min(100, fit.line1Pct)}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px] text-muted">
                                        <span>Line 2 (full width)</span>
                                        <span
                                            className={`tabular-nums font-semibold ${
                                                fit.overflowsLine2
                                                    ? 'text-status-requested'
                                                    : fit.line2Pct >= 85
                                                        ? 'text-status-requested'
                                                        : 'text-muted'
                                            }`}
                                        >
                                            {fit.line2Pct}%
                                        </span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${
                                                fit.overflowsLine2
                                                    ? 'bg-warning'
                                                    : fit.line2Pct >= 85
                                                        ? 'bg-warning'
                                                        : 'bg-success'
                                            }`}
                                            style={{ width: `${Math.min(100, fit.line2Pct)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                            {fit.overflowsLine2 && (
                                <p className="text-xs text-status-requested flex items-start gap-1.5 pt-0.5">
                                    <TriangleAlert size={13} className="shrink-0 mt-0.5" />
                                    <span>Exceeds the 2 ruled lines on the Word form — shorten slightly so it doesn’t push down the layout.</span>
                                </p>
                            )}
                        </div>
                    )}

                    {(itemChips.length > 0 || serviceDateChip || descriptionPresets.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {itemChips.map(desc => (
                                <button
                                    key={desc}
                                    type="button"
                                    onClick={() => applyItemChip(desc)}
                                    title={`Insert “${desc}” into description`}
                                    className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-lg text-xs bg-surface border border-border-subtle hover:border-brand-500/40 hover:bg-brand-500/5 text-primary transition-colors"
                                >
                                    <Plus size={11} className="text-muted shrink-0" />
                                    <span className="truncate max-w-60">{desc}</span>
                                </button>
                            ))}
                            {serviceDateChip && (
                                <button
                                    type="button"
                                    onClick={applyDateChip}
                                    title={`Append service date ${serviceDateChip}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs bg-surface border border-border-subtle hover:border-brand-500/40 hover:bg-brand-500/5 text-primary transition-colors"
                                >
                                    <Calendar size={11} className="text-muted shrink-0" />
                                    <span>{serviceDateChip}</span>
                                </button>
                            )}
                            {descriptionPresets.map(preset => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => applyPresetChip(preset)}
                                    title={`Apply wording preset: ${preset}`}
                                    className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-lg text-xs bg-brand-500/10 border border-brand-500/20 hover:bg-brand-500/15 text-brand-600 dark:text-brand-400 font-medium transition-colors"
                                >
                                    <Sparkles size={11} className="shrink-0" />
                                    <span className="truncate max-w-64">{preset}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Section>

            {/* Editable invoice metadata card (used for duplicate detection, €5,000 threshold & filenames) */}
            <Section title="Invoice details" action={<span className="text-[11px] text-muted">For duplicate & €5,000 checks</span>}>
                <div className="rounded-xl bg-surface-elevated/40 border border-border-subtle p-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor="cr-invoiceNumber" className={labelCls}>
                                Invoice number
                            </label>
                            <div className="relative">
                                <input
                                    id="cr-invoiceNumber"
                                    type="text"
                                    value={meta.invoiceNumber}
                                    placeholder="e.g. INV-0101"
                                    onFocus={() => onActive('invoiceNumber')}
                                    onBlur={() => onActive(null)}
                                    onChange={e => onMetaChange('invoiceNumber', e.target.value)}
                                    className={`${INPUT} ${inputTone(undefined, picking === 'invoiceNumber')} h-9 ${
                                        onPick ? 'pr-9' : ''
                                    }`}
                                />
                                {onPick && (
                                    <PickButton
                                        label="Invoice number"
                                        picked={picking === 'invoiceNumber'}
                                        onClick={() => onPick('invoiceNumber')}
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2"
                                    />
                                )}
                            </div>
                            {picking === 'invoiceNumber' && (
                                <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">Click it on the invoice. Esc stops.</p>
                            )}
                        </div>

                        <NetAmountField
                            netAmount={meta.netAmount}
                            grossText={form.amount}
                            picked={picking === 'netAmount'}
                            onChange={val => onMetaChange('netAmount', val)}
                            onActive={onActive}
                            onPick={onPick}
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {dateField('invoiceDate', 'Invoice date', { placeholder: 'Optional', isMeta: true })}
                        {dateField('dueDate', 'Due date', { placeholder: 'Optional', isMeta: true })}
                    </div>
                </div>
            </Section>

            <Section title="Requested and approved">
                <div className="grid gap-3 sm:grid-cols-2">
                    {textField('requestedBy', 'Requested by')}
                    {dateField('requestedDate', 'Requested date')}
                    {textField('approvedBy', 'Approved by', { placeholder: 'Blank (sign by hand)' })}
                    {dateField('approvedDate', 'Approved date')}
                </div>
                {checkbox(form.approvalEmailAttached, 'OR Approval email attached', v => onChange('approvalEmailAttached', v))}
            </Section>

            <Section title="Single quotation">
                <div className="grid gap-3 sm:grid-cols-2">
                    {dateField('quoteDate', 'Date of quote')}
                    {textField('amountQuoted', 'Amount quoted', {
                        prefix: '€',
                        placeholder: '0.00',
                        labelAction: quoteAmountDiffers ? (
                            <button
                                type="button"
                                onClick={() => onChange('amountQuoted', form.amount)}
                                className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                            >
                                Match payment
                            </button>
                        ) : undefined,
                    })}
                </div>

                <div className="space-y-2.5">
                    <p className={`${labelCls} mb-1`}>Quote obtained by (tick and complete)</p>

                    {activeQuoteRows.length > 0 && (
                        <div className="space-y-2">
                            {activeQuoteRows.map(row => (
                                <div
                                    key={row.method}
                                    className="grid gap-2 sm:grid-cols-[12.5rem_minmax(0,1fr)] sm:items-start rounded-xl bg-surface-elevated/35 border border-border-subtle p-2.5"
                                >
                                    <div className="sm:pt-2">
                                        {checkbox(form.quoteBy[row.method], row.label, v => activateQuoteMethod(row, v))}
                                    </div>
                                    {textField(row.detail, row.detailLabel, {
                                        type: row.type,
                                        placeholder: row.detailLabel,
                                        className: '[&>label]:sr-only',
                                        onValueChange: val => {
                                            onChange(row.detail, val);
                                            if (val.trim() && !form.quoteBy[row.method]) {
                                                onChange('quoteBy', { ...form.quoteBy, [row.method]: true });
                                            }
                                        },
                                    })}
                                </div>
                            ))}
                        </div>
                    )}

                    {inactiveQuoteRows.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="text-xs text-muted mr-0.5">
                                {activeQuoteRows.length > 0 ? 'Add quote method:' : 'Select quote method:'}
                            </span>
                            {inactiveQuoteRows.map(row => (
                                <label
                                    key={row.method}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-primary bg-surface border border-border-subtle hover:border-brand-500/40 hover:bg-brand-500/5 cursor-pointer select-none transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.quoteBy[row.method]}
                                        onChange={e => activateQuoteMethod(row, e.target.checked)}
                                        className="w-3.5 h-3.5 rounded accent-brand-500 shrink-0"
                                    />
                                    <span>{row.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </Section>

            <Section
                title="Checklist box"
                action={
                    untickedReady.length > 0 ? (
                        <button
                            type="button"
                            onClick={tickAllVerified}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-success/10 text-status-confirmed border border-success/25 hover:bg-success/15 transition-colors"
                        >
                            <CheckCheck size={13} /> Tick verified ({untickedReady.length})
                        </button>
                    ) : undefined
                }
            >
                <div className="grid gap-2 sm:grid-cols-2">
                    {CHECKLIST.map(c => {
                        const hint = checklistHints[c.item];
                        const checked = form.checklist[c.item];
                        return (
                            <label
                                key={c.item}
                                className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-colors ${
                                    checked
                                        ? 'bg-success/5 border-success/30'
                                        : hint.ready
                                            ? 'bg-surface border-border-subtle hover:border-success/40'
                                            : 'bg-surface border-border-subtle hover:border-border-strong'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => onChange('checklist', { ...form.checklist, [c.item]: e.target.checked })}
                                    className="w-4 h-4 mt-0.5 rounded accent-brand-500 shrink-0"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-primary leading-snug">{c.label}</span>
                                    <span
                                        className={`mt-0.5 flex items-start gap-1 text-[11px] leading-snug ${
                                            hint.ready ? 'text-status-confirmed' : 'text-muted'
                                        }`}
                                    >
                                        {hint.ready && <Check size={11} className="shrink-0 mt-0.5" />}
                                        <span>{hint.reason}</span>
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </Section>

            {showTracking && onTrackingChange && (
                <Section
                    title="CRM tracking"
                    action={<Badge tone="neutral">Not printed on the requisition</Badge>}
                >
                    <div className="rounded-xl bg-surface-elevated/40 border border-border-subtle p-3 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                            <div>
                                <span className={labelCls}>Status</span>
                                <Segmented
                                    ariaLabel="Requisition status"
                                    options={STATUS_OPTIONS}
                                    value={status}
                                    onChange={nextStatus => onTrackingChange({ status: nextStatus })}
                                />
                            </div>
                            <div>
                                <label htmlFor="cr-chequeNumber" className={labelCls}>
                                    Cheque / EFT ref
                                </label>
                                <input
                                    id="cr-chequeNumber"
                                    type="text"
                                    value={chequeNumber}
                                    placeholder="e.g. CHQ-1042 or EFT ref"
                                    onChange={e => onTrackingChange({ chequeNumber: e.target.value })}
                                    className={`${INPUT} ${inputTone()} h-9`}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="cr-notes" className={labelCls}>
                                Internal notes
                            </label>
                            <AutoTextarea
                                id="cr-notes"
                                value={notes}
                                minHeight={52}
                                placeholder="Optional note for the finance team (never printed on the Word form)"
                                onChange={e => onTrackingChange({ notes: e.target.value })}
                                className={`${INPUT} ${inputTone()} py-2 resize-y min-h-13`}
                            />
                        </div>
                    </div>
                </Section>
            )}
        </div>
    );
}

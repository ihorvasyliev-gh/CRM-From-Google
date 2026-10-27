import type { ReactNode } from 'react';
import { Check, CircleAlert, History, MousePointerClick, TriangleAlert } from 'lucide-react';
import { DateInput } from '../ui/DatePicker';
import { labelCls, eyebrowCls } from '../ui/styles';
import { todayISO } from '../../lib/dateUtils';
import { MULTI_PICK, PICKABLE } from '../../lib/chequeReq/pick';
import type { ChecklistItem, ChequeReqForm, FieldFlag, FieldFlags, FieldKey, QuoteMethod } from '../../lib/chequeReq/types';

interface Props {
    form: ChequeReqForm;
    flags: FieldFlags;
    onChange: <K extends keyof ChequeReqForm>(key: K, value: ChequeReqForm[K]) => void;
    /** "Looks right": clears a field's orange / red mark without editing it */
    onAccept: (key: FieldKey) => void;
    /** The field being edited (its source is outlined on the invoice) */
    onActive: (key: FieldKey | null) => void;
    /** Starts (or stops) picking a field's value on the invoice: only with an invoice beside the form */
    onPick?: (key: FieldKey) => void;
    /** The field being picked */
    picking?: FieldKey | null;
}

const INPUT = 'w-full px-3 border rounded-xl text-sm text-primary placeholder:text-muted/70 focus:outline-hidden focus:ring-2 transition-colors';

function inputTone(flag?: FieldFlag): string {
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

function FlagNote({ flag, onAccept }: { flag: FieldFlag; onAccept: () => void }) {
    if (flag.level === 'found') {
        return <p className="mt-1 text-xs text-muted flex items-center gap-1"><Check size={11} className="text-status-confirmed shrink-0" /> {flag.note}</p>;
    }
    const Icon = flag.level === 'memory' ? History : flag.level === 'missing' ? CircleAlert : TriangleAlert;
    const tone = flag.level === 'memory' ? 'text-status-invited' : flag.level === 'missing' ? 'text-status-rejected' : 'text-status-requested';
    return (
        <p className={`mt-1 text-xs flex items-start gap-1 ${tone}`}>
            <Icon size={12} className="shrink-0 mt-px" />
            <span className="flex-1 min-w-0">{flag.note}</span>
            {flag.level !== 'memory' && (
                <button type="button" onClick={onAccept} className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">
                    {flag.level === 'missing' ? 'Leave blank' : 'Looks right'}
                </button>
            )}
        </p>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <fieldset className="space-y-3 pt-4 first:pt-0 border-t first:border-t-0 border-border-subtle">
            <legend className={`${eyebrowCls} float-left w-full mb-3`}>{title}</legend>
            <div className="clear-both space-y-3">{children}</div>
        </fieldset>
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

/** The SICAP cheque requisition, field by field, with every guess marked */
export default function RequisitionForm({ form, flags, onChange, onAccept, onActive, onPick, picking }: Props) {
    const text = (key: FieldKey, label: string, opts: { multiline?: boolean; prefix?: string; placeholder?: string; type?: string; className?: string } = {}) => {
        const flag = flags[key];
        const id = `cr-${key}`;
        const pickable = !!onPick && PICKABLE.has(key);
        const picked = picking === key;
        const tone = picked ? 'bg-surface border-brand-500 ring-2 ring-brand-500/25 focus:border-brand-500 focus:ring-brand-500/25' : inputTone(flag);
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
                <label htmlFor={id} className={labelCls}>{label}</label>
                <div className="relative">
                    {opts.prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">{opts.prefix}</span>}
                    {opts.multiline ? (
                        <textarea {...common} rows={2} onChange={e => onChange(key, e.target.value)} className={`${INPUT} ${tone} py-2 resize-y min-h-16 field-sizing-content ${pickable ? 'pr-9' : ''}`} />
                    ) : (
                        <input {...common} type={opts.type ?? 'text'} onChange={e => onChange(key, e.target.value)} className={`${INPUT} ${tone} h-9 ${opts.prefix ? 'pl-7' : ''} ${pickable ? 'pr-9' : ''}`} />
                    )}
                    {pickable && (
                        <button
                            type="button"
                            onClick={() => onPick(key)}
                            aria-pressed={picked}
                            aria-label={`Pick the ${label.replace(/^\p{Lu}(?=\p{Ll})/u, c => c.toLowerCase())} on the invoice`}
                            title="Pick it on the invoice"
                            className={`absolute right-1.5 ${opts.multiline ? 'top-1.5' : 'top-1/2 -translate-y-1/2'} w-6 h-6 rounded-md inline-flex items-center justify-center transition-colors ${picked ? 'bg-brand-500 text-white' : 'text-muted hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-500/10'}`}
                        >
                            <MousePointerClick size={14} />
                        </button>
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

    const date = (key: 'requestedDate' | 'approvedDate' | 'quoteDate', label: string) => (
        <div>
            <div className="flex items-center justify-between">
                <label htmlFor={`cr-${key}`} className={labelCls}>{label}</label>
                {form[key] ? (
                    <button type="button" onClick={() => onChange(key, '')} className="text-xs text-muted hover:text-primary mb-1.5">Clear</button>
                ) : (
                    <button type="button" onClick={() => onChange(key, todayISO())} className="text-xs text-brand-600 dark:text-brand-400 hover:underline mb-1.5">Today</button>
                )}
            </div>
            <DateInput id={`cr-${key}`} value={form[key]} onChange={v => onChange(key, v)} placeholder="Blank (date by hand)" className={`${INPUT} ${inputTone()} h-9`} />
        </div>
    );

    const box = (checked: boolean, label: ReactNode, onToggle: (v: boolean) => void) => (
        <label className="flex items-center gap-2 text-sm text-primary cursor-pointer select-none">
            <input type="checkbox" checked={checked} onChange={e => onToggle(e.target.checked)} className="w-4 h-4 rounded accent-brand-500 shrink-0" />
            {label}
        </label>
    );

    return (
        <div className="space-y-4">
            <Section title="Funding">
                <div className="grid gap-3 sm:grid-cols-2">
                    {text('actionNumber', 'SICAP action number', { placeholder: 'e.g. 9.' })}
                    {text('nonSicapFunding', 'Non-SICAP funding')}
                </div>
            </Section>

            <Section title="Payment">
                <div className="grid gap-3 sm:grid-cols-2">
                    {text('poNumber', 'PO number')}
                    {text('amount', 'Payment amount', { prefix: '€', placeholder: '0.00' })}
                </div>
                {text('payeeName', 'Payee name')}
                {text('payeeAddress', 'Payee address', { multiline: true })}
                {text('description', 'Description of goods / services', { multiline: true })}
            </Section>

            <Section title="Requested and approved">
                <div className="grid gap-3 sm:grid-cols-2">
                    {text('requestedBy', 'Requested by')}
                    {date('requestedDate', 'Date')}
                    {text('approvedBy', 'Approved by', { placeholder: 'Blank (sign by hand)' })}
                    {date('approvedDate', 'Date')}
                </div>
                {box(form.approvalEmailAttached, 'OR Approval email attached', v => onChange('approvalEmailAttached', v))}
            </Section>

            <Section title="Single quotation">
                <div className="grid gap-3 sm:grid-cols-2">
                    {date('quoteDate', 'Date of quote')}
                    {text('amountQuoted', 'Amount quoted', { prefix: '€', placeholder: '0.00' })}
                </div>
                <div>
                    <p className={labelCls}>Quote obtained by (tick and complete)</p>
                    <div className="space-y-2">
                        {QUOTE_ROWS.map(row => (
                            <div key={row.method} className="grid gap-2 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-start">
                                <div className="sm:pt-2">{box(form.quoteBy[row.method], row.label, v => onChange('quoteBy', { ...form.quoteBy, [row.method]: v }))}</div>
                                {text(row.detail, row.detailLabel, { type: row.type, placeholder: row.detailLabel, className: '[&>label]:sr-only' })}
                            </div>
                        ))}
                    </div>
                </div>
            </Section>

            <Section title="Checklist box">
                <div className="grid gap-2 sm:grid-cols-2">
                    {CHECKLIST.map(c => (
                        <div key={c.item}>{box(form.checklist[c.item], c.label, v => onChange('checklist', { ...form.checklist, [c.item]: v }))}</div>
                    ))}
                </div>
            </Section>
        </div>
    );
}

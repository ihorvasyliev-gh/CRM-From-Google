import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { fieldCls } from '../ui/styles';
import { todayISO } from '../../lib/dateUtils';
import {
    DATE_BASES, DATE_FORMATS, DATE_UNITS, addToDate, formatRuleDate,
    type DateBase, type DateFormat, type DateRule, type DateUnit,
} from '../../lib/documentUtils';

const MIN_AMOUNT = -100;
const MAX_AMOUNT = 100;

function clampAmount(value: number): number {
    return Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.trunc(value)));
}

/** "[Course date] + [2] [years], shown as [01 Oct 2028]" — with a worked example. */
export default function DateRuleFields({ rule, onChange }: { rule: DateRule; onChange: (rule: DateRule) => void }) {
    const [draft, setDraft] = useState(() => String(rule.amount));
    const set = (patch: Partial<DateRule>) => onChange({ ...rule, ...patch });
    const example = todayISO();
    const baseLabel = DATE_BASES.find(b => b.value === rule.base)?.label.toLowerCase();

    useEffect(() => {
        setDraft(String(rule.amount));
    }, [rule.amount]);

    function handleAmountChange(raw: string) {
        if (!/^-?\d*$/.test(raw)) return;
        if (raw === '' || raw === '-') {
            setDraft(raw);
            return;
        }
        const parsed = Number.parseInt(raw, 10);
        if (Number.isNaN(parsed)) return;
        const clamped = clampAmount(parsed);
        setDraft(clamped !== parsed ? String(clamped) : raw);
        if (clamped !== rule.amount) set({ amount: clamped });
    }

    function handleAmountBlur() {
        if (draft === '' || draft === '-') {
            setDraft('0');
            if (rule.amount !== 0) set({ amount: 0 });
            return;
        }
        const parsed = Number.parseInt(draft, 10);
        const clamped = Number.isNaN(parsed) ? 0 : clampAmount(parsed);
        setDraft(String(clamped));
        if (clamped !== rule.amount) set({ amount: clamped });
    }

    function handleAmountKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const delta = e.key === 'ArrowUp' ? 1 : -1;
            const next = clampAmount(rule.amount + delta);
            setDraft(String(next));
            if (next !== rule.amount) set({ amount: next });
        }
    }

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-[1.4fr_0.7fr_1fr_1.2fr] gap-2">
                <select
                    aria-label="Counted from"
                    value={rule.base}
                    onChange={e => set({ base: e.target.value as DateBase })}
                    className={fieldCls}
                >
                    {DATE_BASES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
                <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Amount to add"
                    placeholder="e.g. 2 or -7"
                    title="Whole number from -100 to 100 (negative counts backwards)"
                    value={draft}
                    onChange={e => handleAmountChange(e.target.value)}
                    onBlur={handleAmountBlur}
                    onKeyDown={handleAmountKeyDown}
                    className={`${fieldCls} tabular-nums`}
                />
                <select aria-label="Unit" value={rule.unit} onChange={e => set({ unit: e.target.value as DateUnit })} className={fieldCls}>
                    {DATE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
                <select aria-label="Date format" value={rule.format} onChange={e => set({ format: e.target.value as DateFormat })} className={fieldCls}>
                    {DATE_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
            </div>
            <p className="text-xs text-muted flex items-center gap-1.5">
                <CalendarClock size={13} className="shrink-0" />
                <span>
                    Worked out for each participant. E.g. {baseLabel} {formatRuleDate({ ...rule, amount: 0 }, example)} →{' '}
                    <strong className="text-primary font-semibold">{formatRuleDate(rule, addToDate(example, rule.amount, rule.unit))}</strong>
                    {rule.base === 'completedAt' && ' · blank for people who have not completed'}
                </span>
            </p>
        </div>
    );
}

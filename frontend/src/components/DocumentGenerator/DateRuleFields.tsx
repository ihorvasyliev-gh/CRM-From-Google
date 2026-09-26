import { CalendarClock } from 'lucide-react';
import { fieldCls } from '../ui/styles';
import { todayISO } from '../../lib/dateUtils';
import {
    DATE_BASES, DATE_FORMATS, DATE_UNITS, addToDate, formatRuleDate,
    type DateBase, type DateFormat, type DateRule, type DateUnit,
} from '../../lib/documentUtils';

/** "[Course date] + [2] [years], shown as [01 Oct 2028]" — with a worked example. */
export default function DateRuleFields({ rule, onChange }: { rule: DateRule; onChange: (rule: DateRule) => void }) {
    const set = (patch: Partial<DateRule>) => onChange({ ...rule, ...patch });
    const example = todayISO();
    const baseLabel = DATE_BASES.find(b => b.value === rule.base)?.label.toLowerCase();

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
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    aria-label="Amount to add"
                    value={rule.amount}
                    onChange={e => set({ amount: Math.min(100, Math.max(0, Math.trunc(Number(e.target.value) || 0))) })}
                    className={`${fieldCls} tabular-nums`}
                />
                <select aria-label="Unit" value={rule.unit} onChange={e => set({ unit: e.target.value as DateUnit })} className={fieldCls}>
                    {DATE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
                <select aria-label="Date format" value={rule.format} onChange={e => set({ format: e.target.value as DateFormat })} className={fieldCls}>
                    {DATE_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
            </div>
            <p className="text-[11px] text-muted flex items-center gap-1.5">
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

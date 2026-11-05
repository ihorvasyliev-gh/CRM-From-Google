import { CalendarClock } from 'lucide-react';
import DateField from './DateField';
import { addMonths, formatCertDate, parseCertDate, validityLabel, VALIDITY_PRESETS } from '../../lib/certificates/dates';

interface Props {
    id: string;
    label: string;
    /** Typed or picked, when no length is chosen */
    value: string;
    onChange: (value: string) => void;
    /** The chosen length in months, or null for a date of its own */
    validityMonths: number | null;
    onValidityChange: (months: number | null) => void;
    /** The course date as typed, when it is the same for everyone; null when it differs per person */
    courseDate: string | null;
    /** The template has a course date to count from */
    canCount: boolean;
    /** The template's own length, offered even when it is not one of the usual ones */
    templateMonths?: number | null;
}

const chipCls = (on: boolean) =>
    `h-8 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
        on
            ? 'bg-brand-500 text-white border-brand-500 shadow-xs'
            : 'bg-surface text-secondary border-border-subtle hover:border-border-strong hover:text-primary'
    }`;

/** The expiry date: a length (1 to 5 years) counted from the course date, or a date of its own */
export default function ExpiryField({ id, label, value, onChange, validityMonths, onValidityChange, courseDate, canCount, templateMonths }: Props) {
    const presets = [...new Set([...VALIDITY_PRESETS, ...(templateMonths ? [templateMonths] : [])])].sort((a, b) => a - b);
    const course = courseDate === null ? null : parseCertDate(courseDate);

    return (
        <div className="space-y-2">
            {canCount && (
                <div role="group" aria-label={`How long the certificate is valid`} className="flex flex-wrap gap-1.5">
                    {presets.map(m => (
                        <button key={m} type="button" aria-pressed={validityMonths === m} onClick={() => onValidityChange(m)} className={chipCls(validityMonths === m)}>
                            {validityLabel(m)}
                        </button>
                    ))}
                    <button type="button" aria-pressed={validityMonths === null} onClick={() => onValidityChange(null)} className={chipCls(validityMonths === null)}>
                        Own date
                    </button>
                </div>
            )}
            {validityMonths && canCount ? (
                <div id={id} className="min-h-9 px-3 py-2 rounded-xl border border-dashed border-border-strong bg-surface-elevated/50 text-sm flex items-center gap-2" aria-live="polite">
                    <CalendarClock size={15} className="text-muted shrink-0" aria-hidden="true" />
                    {courseDate === null ? (
                        <span className="text-secondary">{validityLabel(validityMonths)} after each person's course date</span>
                    ) : course ? (
                        <span><span className="font-semibold text-primary tabular-nums">{formatCertDate(addMonths(course, validityMonths))}</span>
                            <span className="text-muted"> · {validityLabel(validityMonths)} after the course date</span></span>
                    ) : (
                        <span className="text-muted">{courseDate.trim() ? "Can't read the course date: pick it on the calendar" : 'Choose the course date first'}</span>
                    )}
                </div>
            ) : (
                <DateField id={id} label={label} value={value} onChange={onChange} />
            )}
        </div>
    );
}

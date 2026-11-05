import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { CalendarPopover } from '../ui/DatePicker';
import { fieldCls } from '../ui/styles';
import { formatCertDate, formatCertMonth, parseCertDate, parseCertMonth } from '../../lib/certificates/dates';

interface Props {
    id: string;
    /** As printed: "21/09/2026", "September 2026", or whatever was typed */
    value: string;
    onChange: (value: string) => void;
    /** A day, or a month ("September 2026") */
    mode?: 'date' | 'month';
    label: string;
    invalid?: boolean;
}

/**
 * A date on the certificate: picked on the calendar, or typed (a span like "21–23/09/2026" is
 * printed as typed). The calendar opens on the date in the box.
 */
export default function DateField({ id, value, onChange, mode = 'date', label, invalid }: Props) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const picked = mode === 'date' ? parseCertDate(value) : parseCertMonth(value);

    return (
        <div ref={wrapRef} className="relative">
            <input
                id={id}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={mode === 'date' ? 'e.g. 21/09/2026' : 'e.g. September 2026'}
                className={`${fieldCls} pr-10 ${invalid ? 'border-status-requested/60' : ''}`}
                autoComplete="off"
                inputMode="text"
            />
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-label={`Choose the ${label.toLowerCase()} on a calendar`}
                aria-haspopup="dialog"
                aria-expanded={open}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-7 flex items-center justify-center rounded-lg text-muted hover:text-brand-600 dark:hover:text-brand-400 hover:bg-surface-elevated transition-colors cursor-pointer"
            >
                <CalendarDays size={16} aria-hidden="true" />
            </button>
            <CalendarPopover
                anchorRef={wrapRef}
                open={open}
                onClose={() => setOpen(false)}
                mode={mode}
                label={label}
                value={picked ?? ''}
                onChange={v => onChange(!v ? '' : mode === 'date' ? formatCertDate(v) : formatCertMonth(v))}
            />
        </div>
    );
}

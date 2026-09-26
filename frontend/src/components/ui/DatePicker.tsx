import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateDMY, todayISO } from '../../lib/dateUtils';

/**
 * The app's one calendar. `CalendarPanel` draws the grid (days → months → years, click the
 * title to zoom out); `MonthPicker` is it inline in month mode, `DateInput` is a field that
 * opens it in a popover. Values stay native-input compatible: "YYYY-MM-DD" / "YYYY-MM" / ''.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

type Mode = 'date' | 'month';
type View = 'day' | 'month' | 'year';
const STEP_UNIT: Record<View, string> = { day: 'month', month: 'year', year: 'years' };

const pad = (n: number) => String(n).padStart(2, '0');

function outOfRange(key: string, min?: string, max?: string) {
    // Keys and bounds are zero-padded ISO prefixes, so string comparison is date order
    return (!!min && key < min.slice(0, key.length)) || (!!max && key > max.slice(0, key.length));
}

const cellCls = (selected: boolean, current: boolean) =>
    `rounded-lg text-xs font-semibold border transition-all disabled:opacity-30 disabled:pointer-events-none ${
        selected
            ? 'bg-brand-500/20 text-brand-400 border-brand-500/40 shadow-sm'
            : current
                ? 'text-primary border-border-strong hover:bg-surface-elevated'
                : 'text-muted border-transparent hover:text-primary hover:bg-surface-elevated'
    }`;

const navBtnCls = 'p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated transition-colors';

interface PanelProps {
    mode: Mode;
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    label?: string;
    className?: string;
}

export function CalendarPanel({ mode, value, onChange, min, max, label, className = '' }: PanelProps) {
    const today = todayISO();
    const anchor = value || (max && max < today ? max : min && min > today ? min : today);
    const [year, setYear] = useState(Number(anchor.slice(0, 4)));
    const [month, setMonth] = useState(Number(anchor.slice(5, 7)) - 1);
    const [view, setView] = useState<View>(mode === 'date' ? 'day' : 'month');

    const selected = value.slice(0, mode === 'date' ? 10 : 7);
    const nowKey = mode === 'date' ? today : today.slice(0, 7);
    const yearPage = year - (year % 12);

    function step(dir: 1 | -1) {
        if (view === 'year') return setYear(year + dir * 12);
        if (view === 'month') return setYear(year + dir);
        const m = month + dir;
        setMonth((m + 12) % 12);
        if (m < 0 || m > 11) setYear(year + dir);
    }

    function zoomOut() {
        if (view === 'day') setView('month');
        else if (view === 'month') setView('year');
    }

    const title =
        view === 'day' ? `${MONTHS_LONG[month]} ${year}` : view === 'month' ? String(year) : `${yearPage} – ${yearPage + 11}`;

    let grid: React.JSX.Element;
    if (view === 'year') {
        grid = (
            <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => yearPage + i).map(y => (
                    <button key={y} type="button" disabled={outOfRange(String(y), min, max)}
                        onClick={() => { setYear(y); setView('month'); }}
                        className={`py-2 tabular-nums ${cellCls(selected.startsWith(String(y)), today.startsWith(String(y)))}`}>
                        {y}
                    </button>
                ))}
            </div>
        );
    } else if (view === 'month') {
        grid = (
            <div className="grid grid-cols-4 gap-1.5">
                {MONTHS.map((m, i) => {
                    const key = `${year}-${pad(i + 1)}`;
                    const isSel = mode === 'month' ? selected === key : selected.startsWith(key);
                    return (
                        <button key={m} type="button" aria-label={`${MONTHS_LONG[i]} ${year}`} aria-pressed={isSel}
                            disabled={outOfRange(key, min, max)}
                            onClick={() => {
                                if (mode === 'month') onChange(isSel ? '' : key);
                                else { setMonth(i); setView('day'); }
                            }}
                            className={`py-2 ${cellCls(isSel, today.startsWith(key))}`}>
                            {m}
                        </button>
                    );
                })}
            </div>
        );
    } else {
        const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
        const days = new Date(year, month + 1, 0).getDate();
        grid = (
            <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map(d => (
                    <span key={d} className="text-center text-[10px] font-semibold uppercase text-muted/70 pb-1">{d}</span>
                ))}
                {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
                {Array.from({ length: days }, (_, i) => {
                    const key = `${year}-${pad(month + 1)}-${pad(i + 1)}`;
                    return (
                        <button key={key} type="button" aria-label={formatDateDMY(key)} aria-pressed={selected === key}
                            disabled={outOfRange(key, min, max)} onClick={() => onChange(key)}
                            className={`h-8 tabular-nums ${cellCls(selected === key, today === key)}`}>
                            {i + 1}
                        </button>
                    );
                })}
            </div>
        );
    }

    const selectedText = !selected
        ? 'Not set'
        : mode === 'date'
            ? formatDateDMY(selected)
            : `${MONTHS_LONG[Number(selected.slice(5, 7)) - 1]} ${selected.slice(0, 4)}`;

    return (
        <div role="group" aria-label={label} className={`rounded-xl border border-border-subtle p-3 select-none ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => step(-1)} aria-label={`Previous ${STEP_UNIT[view]}`} className={navBtnCls}>
                    <ChevronLeft size={16} />
                </button>
                <button type="button" onClick={zoomOut} disabled={view === 'year'}
                    className="px-2 py-1 rounded-lg text-sm font-bold text-primary tabular-nums hover:bg-surface-elevated disabled:hover:bg-transparent transition-colors">
                    {title}
                </button>
                <button type="button" onClick={() => step(1)} aria-label={`Next ${STEP_UNIT[view]}`} className={navBtnCls}>
                    <ChevronRight size={16} />
                </button>
            </div>
            {grid}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle text-xs">
                <span className="text-muted">{selectedText}</span>
                <div className="flex gap-3">
                    {value && (
                        <button type="button" onClick={() => onChange('')} className="font-semibold text-muted hover:text-primary">
                            Clear
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={outOfRange(nowKey, min, max)}
                        onClick={() => {
                            setYear(Number(today.slice(0, 4)));
                            setMonth(Number(today.slice(5, 7)) - 1);
                            setView(mode === 'date' ? 'day' : 'month');
                            onChange(nowKey);
                        }}
                        className="font-semibold text-brand-400 hover:text-brand-500 disabled:opacity-40 disabled:pointer-events-none"
                    >
                        {mode === 'date' ? 'Today' : 'This month'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Inline month grid; value "YYYY-MM" or ''. */
export function MonthPicker(props: Omit<PanelProps, 'mode'>) {
    return <CalendarPanel mode="month" {...props} className={`bg-background ${props.className ?? ''}`} />;
}

interface DateInputProps {
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    id?: string;
    placeholder?: string;
    /** Classes for the field itself — pass the same ones the old <input> had. */
    className?: string;
    disabled?: boolean;
}

/** Date field that opens the calendar in a popover; value "YYYY-MM-DD" or ''. */
export function DateInput({ value, onChange, min, max, id, placeholder = 'Select date', className = '', disabled }: DateInputProps) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    // Fixed-position portal so modals with overflow:hidden don't clip it; flips up near the bottom
    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return;
        const r = triggerRef.current.getBoundingClientRect();
        const h = popRef.current?.offsetHeight ?? 340;
        const w = 288;
        const below = r.bottom + 6 + h <= window.innerHeight;
        setPos({
            top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h),
            left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8),
        });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!popRef.current?.contains(t) && !triggerRef.current?.contains(t)) close();
        };
        const onScroll = (e: Event) => {
            if (!popRef.current?.contains(e.target as Node)) close();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault(); // tells useModalBehavior to leave the modal open
            close();
            triggerRef.current?.focus();
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', close);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', close);
        };
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                className={`flex items-center justify-between gap-2 text-left ${className}`}
            >
                <span className={value ? 'text-primary' : 'text-muted/70'}>{value ? formatDateDMY(value) : placeholder}</span>
                <Calendar size={15} className="text-muted shrink-0" />
            </button>
            {open && createPortal(
                <div
                    ref={popRef}
                    role="dialog"
                    style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? 0, width: 288 }}
                    className="z-[300] animate-scaleIn"
                >
                    <CalendarPanel
                        mode="date"
                        value={value}
                        min={min}
                        max={max}
                        onChange={v => { onChange(v); setOpen(false); }}
                        className="bg-surface shadow-float"
                    />
                </div>,
                document.body,
            )}
        </>
    );
}

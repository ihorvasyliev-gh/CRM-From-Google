import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X } from 'lucide-react';
import { formatDuration, minutesOf, parseTimeText, timeOf, timeSlots } from '../../lib/timeUtils';

interface TimeInputProps {
    /** "HH:MM" or '' */
    value: string;
    onChange: (value: string) => void;
    id?: string;
    ariaLabel?: string;
    placeholder?: string;
    /**
     * Start of the same day: the list then only offers later times, each with how long the
     * day would be ("14:00  4 h"), like an end-time field in a calendar app.
     */
    durationFrom?: string | null;
    /** Classes for the field — pass the same ones a plain <input> would have. */
    className?: string;
}

const SLOTS = timeSlots(15);
const LIST_WIDTH = 176;

/**
 * Time field: type a time ("9", "930", "2pm" — read on Enter or when leaving the field) or
 * pick one from a list every 15 minutes. 24-hour "HH:MM" values, '' when empty.
 */
export function TimeInput({ value, onChange, id, ariaLabel, placeholder = '--:--', durationFrom, className = '' }: TimeInputProps) {
    const listId = useId();
    const [draft, setDraft] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const from = durationFrom && parseTimeText(durationFrom);
    const slots = useMemo(
        () => (from ? SLOTS.filter(s => minutesOf(s) > minutesOf(from)) : SLOTS),
        [from],
    );

    /** Index of the given time in the list, or of the first later one. */
    const indexNear = (time: string) => {
        const i = slots.findIndex(s => s >= time);
        return i === -1 ? slots.length - 1 : i;
    };
    // Where the list opens: the value, else an hour after the start, else 09:00
    const defaultIndex = () => indexNear(value || (from ? timeOf(Math.min(minutesOf(from) + 60, 23 * 60 + 45)) : '09:00'));

    function openList() {
        if (open) return;
        setActive(defaultIndex());
        setOpen(true);
    }

    function close() {
        setOpen(false);
        setActive(-1);
    }

    function pick(time: string) {
        setDraft(null);
        onChange(time);
        close();
    }

    /** Read what was typed: a time is saved, an empty field clears, anything else is dropped. */
    function commit() {
        if (draft === null) return;
        const text = draft.trim();
        if (!text) onChange('');
        else {
            const parsed = parseTimeText(text);
            if (parsed) onChange(parsed);
        }
        setDraft(null);
    }

    /** Put the list under the field (above it near the bottom of the window). */
    function place() {
        if (!inputRef.current) return;
        const r = inputRef.current.getBoundingClientRect();
        const h = listRef.current?.offsetHeight ?? 240;
        const width = Math.max(r.width, LIST_WIDTH);
        const below = r.bottom + 6 + h <= window.innerHeight;
        setPos({
            top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h),
            left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
            width,
        });
    }

    useLayoutEffect(() => {
        if (open) place();
    }, [open]);

    // Keep the highlighted time in view
    useEffect(() => {
        const list = listRef.current;
        if (!open || !list || active < 0) return;
        const item = list.children[active] as HTMLElement | undefined;
        if (!item) return;
        if (item.offsetTop < list.scrollTop || item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
            list.scrollTop = item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2;
        }
    }, [open, active, pos]);

    // Close on a click elsewhere or when the page scrolls; follow the field when the window resizes
    // (a phone keyboard opening resizes it)
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!listRef.current?.contains(t) && !inputRef.current?.parentElement?.contains(t)) close();
        };
        const onScroll = (e: Event) => {
            if (!listRef.current?.contains(e.target as Node)) close();
        };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', place);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', place);
        };
    }, [open]);

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) { openList(); return; }
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive(i => Math.min(Math.max((i < 0 ? defaultIndex() : i + step), 0), slots.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (draft !== null) { commit(); close(); }
            else if (open && active >= 0) pick(slots[active]);
            else openList();
        } else if (e.key === 'Escape' && (open || draft !== null)) {
            e.preventDefault(); // tells useModalBehavior to leave the dialog open
            setDraft(null);
            close();
        }
    }

    function onType(text: string) {
        setDraft(text);
        if (!open) setOpen(true);
        const parsed = parseTimeText(text);
        if (parsed) setActive(indexNear(parsed));
    }

    return (
        <div className="relative min-w-0 w-full">
            <input
                ref={inputRef}
                id={id}
                type="text"
                role="combobox"
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
                autoComplete="off"
                spellCheck={false}
                placeholder={placeholder}
                value={draft ?? value}
                onFocus={openList}
                onClick={openList}
                onChange={e => onType(e.target.value)}
                onBlur={() => { commit(); close(); }}
                onKeyDown={onKeyDown}
                className={`pr-8 tabular-nums ${className}`}
            />
            {value && draft === null ? (
                <button
                    type="button"
                    aria-label={`Clear ${ariaLabel ?? 'time'}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { onChange(''); close(); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted hover:text-primary hover:bg-surface-elevated transition-colors"
                >
                    <X size={13} />
                </button>
            ) : (
                <Clock size={14} aria-hidden="true" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            )}
            {open && createPortal(
                <ul
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    aria-label={ariaLabel}
                    style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? 0, width: pos?.width ?? LIST_WIDTH }}
                    className="z-300 max-h-60 overflow-y-auto overscroll-contain p-1 rounded-xl border border-border-subtle bg-surface shadow-float animate-scaleIn"
                >
                    {slots.map((slot, i) => {
                        const selected = slot === value;
                        const fullHour = slot.endsWith(':00');
                        return (
                            <li
                                key={slot}
                                id={`${listId}-${i}`}
                                role="option"
                                aria-selected={selected}
                                // Keep focus in the field, so picking doesn't count as leaving it
                                onMouseDown={e => e.preventDefault()}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => pick(slot)}
                                className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-sm tabular-nums cursor-pointer select-none ${
                                    i === active ? 'bg-brand-500/15' : ''
                                } ${selected ? 'font-bold text-brand-500' : fullHour ? 'text-primary font-medium' : 'text-muted'}`}
                            >
                                <span>{slot}</span>
                                {from && <span className="text-[11px] font-normal text-muted">{formatDuration(minutesOf(slot) - minutesOf(from))}</span>}
                            </li>
                        );
                    })}
                </ul>,
                document.body,
            )}
        </div>
    );
}

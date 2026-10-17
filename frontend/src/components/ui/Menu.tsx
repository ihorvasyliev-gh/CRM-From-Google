import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
    label: string;
    icon?: ReactNode;
    onSelect: () => void;
    tone?: 'default' | 'danger';
}

interface MenuProps {
    items: MenuItem[];
    /** Accessible name of the trigger (and its tooltip) */
    label: string;
    /** What the trigger shows */
    children: ReactNode;
    triggerClassName: string;
    /** Opens above the trigger, e.g. from a bar at the bottom of the screen */
    placement?: 'top' | 'bottom';
    /** Which edge of the trigger the menu lines up with */
    align?: 'start' | 'end';
}

const itemCls = 'w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-xs font-medium text-left transition-colors focus-visible:outline-hidden';
const toneCls = {
    default: 'text-primary hover:bg-surface-elevated focus-visible:bg-surface-elevated',
    danger: 'text-red-600 dark:text-status-rejected hover:bg-danger/10 focus-visible:bg-danger/10',
};

/**
 * A button that opens a short list of actions. The list is drawn over the page (portaled), so a
 * card or a bar with clipped content can't hide it; it closes on a choice, Escape, a click
 * elsewhere, or a scroll. Arrow keys move between the actions.
 */
export default function Menu({ items, label, children, triggerClassName, placement = 'bottom', align = 'end' }: MenuProps) {
    const [open, setOpen] = useState(false);
    const [style, setStyle] = useState<CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const close = useCallback((refocus: boolean) => {
        setOpen(false);
        if (refocus) triggerRef.current?.focus();
    }, []);

    // Placed next to the trigger before it is painted
    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setStyle({
            ...(placement === 'top' ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
            ...(align === 'end' ? { right: Math.max(8, window.innerWidth - rect.right) } : { left: Math.max(8, rect.left) }),
        });
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, [open, placement, align]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
        };
        const onScroll = (e: Event) => {
            if (!menuRef.current?.contains(e.target as Node)) close(false);
        };
        const onResize = () => close(false);
        document.addEventListener('pointerdown', onDown);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
        };
    }, [open, close]);

    const onMenuKeyDown = (e: React.KeyboardEvent) => {
        const options = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const at = options.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation(); // not also the dialog or selection behind it
            close(true);
        } else if (e.key === 'Tab') {
            close(false);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            options[(at + step + options.length) % options.length]?.focus();
        } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            options[e.key === 'Home' ? 0 : options.length - 1]?.focus();
        }
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={label}
                title={label}
                onClick={() => setOpen(o => !o)}
                className={triggerClassName}
            >
                {children}
            </button>
            {open && createPortal(
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label={label}
                    onKeyDown={onMenuKeyDown}
                    style={style}
                    className={`fixed z-10040 min-w-44 max-w-[calc(100vw-1rem)] p-1.5 bg-surface border border-border-subtle rounded-xl shadow-float animate-popoverScaleIn ${placement === 'top' ? 'origin-bottom' : 'origin-top'}`}
                >
                    {items.map(item => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            className={`${itemCls} ${toneCls[item.tone ?? 'default']}`}
                            onClick={() => {
                                close(true);
                                item.onSelect();
                            }}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
}

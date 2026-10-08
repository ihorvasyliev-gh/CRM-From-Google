import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Toaster, toast as sonner } from 'sonner';
import { CheckCircle, XCircle, AlertCircle, X, RotateCcw } from 'lucide-react';
import { subscribeToasts, type ToastData } from '../lib/toast';

export type { ToastData };

/** Errors and toasts with an action (Undo) stay a bit longer, so they can be read and used */
function toastDuration(t: ToastData): number {
    return t.duration || (t.action || t.type === 'error' ? 5000 : 3000);
}

function show(t: ToastData) {
    sonner[t.type](t.message, {
        duration: toastDuration(t),
        // The action closes the toast after running (sonner's default)
        action: t.action && {
            label: <><RotateCcw size={12} />{t.action.label}</>,
            onClick: t.action.onClick,
        },
    });
}

/** The app's theme is a class on <html> (useTheme), not the system preference */
function subscribeTheme(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
}
const isDark = () => document.documentElement.classList.contains('dark');

const chip = (cls: string, icon: ReactNode) => (
    <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${cls}`}>{icon}</span>
);

const ICONS = {
    success: chip('bg-success/15 text-status-confirmed', <CheckCircle size={16} />),
    error: chip('bg-danger/15 text-status-rejected', <XCircle size={16} />),
    info: chip('bg-brand-500/10 text-brand-600 dark:text-brand-400', <AlertCircle size={16} />),
    close: <X size={14} />,
};

// Unstyled sonner toasts: sonner stacks, swipes and animates them, the classes below draw them
const CLASS_NAMES = {
    toast: 'flex items-center gap-3 w-full pl-3 pr-2.5 py-2.5 bg-surface text-primary border border-border-subtle rounded-xl shadow-float font-sans',
    icon: 'shrink-0',
    content: 'flex-1 min-w-0',
    title: 'text-sm font-medium leading-snug wrap-break-word',
    actionButton: [
        'shrink-0 flex items-center gap-1 h-7 px-2.5 text-xs font-semibold rounded-lg border cursor-pointer transition active:scale-95',
        'bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 border-brand-500/30',
        'in-data-[type=success]:bg-success/10 in-data-[type=success]:text-status-confirmed in-data-[type=success]:hover:bg-success/20 in-data-[type=success]:border-success/30',
        'in-data-[type=error]:bg-danger/10 in-data-[type=error]:text-status-rejected in-data-[type=error]:hover:bg-danger/20 in-data-[type=error]:border-danger/30',
    ].join(' '),
    // Sonner puts the close button first: show it last, on the right. Its dark theme paints the
    // button black even when unstyled, hence the important colours.
    closeButton: 'order-last shrink-0 p-1.5 rounded-lg border-0! bg-transparent! text-muted! hover:text-primary! hover:bg-surface-elevated! cursor-pointer transition-colors',
};

/**
 * App-level toaster driven by the `toast` bus in lib/toast.ts: stacked toasts that pause on
 * hover and can be swiped away.
 */
export function GlobalToaster() {
    const dark = useSyncExternalStore(subscribeTheme, isDark, () => false);

    useEffect(() => subscribeToasts(show), []);

    return (
        <Toaster
            theme={dark ? 'dark' : 'light'}
            position="top-right"
            offset={16}
            mobileOffset={12}
            visibleToasts={4}
            closeButton
            icons={ICONS}
            toastOptions={{ unstyled: true, classNames: CLASS_NAMES }}
            containerAriaLabel="Notifications"
        />
    );
}

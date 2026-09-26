import { useEffect, useState, useRef, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, X, RotateCcw } from 'lucide-react';
import { subscribeToasts } from '../lib/toast';

export interface ToastData {
    message: string;
    type: 'success' | 'error' | 'info';
    action?: {
        label: string;
        onClick: () => void;
    };
    duration?: number;
}

interface Props {
    toast: ToastData | null;
    onDismiss: () => void;
}

const STYLES = {
    success: {
        icon: <CheckCircle size={16} />,
        chip: 'bg-success/15 text-status-confirmed',
        actionBtn: 'bg-success/10 text-status-confirmed hover:bg-success/20 border-success/30',
        bar: 'bg-success',
    },
    error: {
        icon: <XCircle size={16} />,
        chip: 'bg-danger/15 text-status-rejected',
        actionBtn: 'bg-danger/10 text-status-rejected hover:bg-danger/20 border-danger/30',
        bar: 'bg-danger',
    },
    info: {
        icon: <AlertCircle size={16} />,
        chip: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
        actionBtn: 'bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 border-brand-500/30',
        bar: 'bg-brand-500',
    },
};

const toastKeys = new WeakMap<ToastData, number>();
let toastSeq = 0;
function toastKey(t: ToastData): number {
    let key = toastKeys.get(t);
    if (key === undefined) {
        key = ++toastSeq;
        toastKeys.set(t, key);
    }
    return key;
}

export default function Toast({ toast, onDismiss }: Props) {
    const [visible, setVisible] = useState(false);
    const [paused, setPaused] = useState(false);

    // Parents usually pass an inline `() => setToast(null)`; keep it in a ref so
    // unrelated parent re-renders don't restart the auto-dismiss timer.
    const onDismissRef = useRef(onDismiss);
    useEffect(() => {
        onDismissRef.current = onDismiss;
    });

    // Errors stay a bit longer so they can actually be read
    const duration = toast?.duration || (toast?.action ? 5000 : toast?.type === 'error' ? 5000 : 3000);

    // New key per toast object so the progress bar animation restarts even for repeated messages
    const barKey = toast ? toastKey(toast) : 0;

    const remainingRef = useRef(duration);
    const startedAtRef = useRef(0);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const clearTimers = useCallback(() => {
        clearTimeout(hideTimerRef.current);
        clearTimeout(dismissTimerRef.current);
    }, []);

    const close = useCallback((delay = 200) => {
        clearTimers();
        setVisible(false);
        dismissTimerRef.current = setTimeout(() => onDismissRef.current(), delay);
    }, [clearTimers]);

    const startHideTimer = useCallback((ms: number) => {
        clearTimeout(hideTimerRef.current);
        startedAtRef.current = Date.now();
        hideTimerRef.current = setTimeout(() => close(300), ms);
    }, [close]);

    useEffect(() => {
        if (!toast) return;
        remainingRef.current = duration;
        setPaused(false);
        const initTimer = setTimeout(() => setVisible(true), 10);
        startHideTimer(duration);
        return () => {
            clearTimeout(initTimer);
            clearTimers();
        };
    }, [toast, duration, startHideTimer, clearTimers]);

    if (!toast) return null;

    const s = STYLES[toast.type];

    const handleMouseEnter = () => {
        if (paused) return;
        clearTimeout(hideTimerRef.current);
        remainingRef.current = Math.max(1000, remainingRef.current - (Date.now() - startedAtRef.current));
        setPaused(true);
    };

    const handleMouseLeave = () => {
        if (!paused) return;
        setPaused(false);
        startHideTimer(remainingRef.current);
    };

    const handleActionClick = () => {
        toast.action?.onClick();
        close();
    };

    return (
        <div
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`fixed top-4 right-4 left-4 sm:left-auto z-120 sm:max-w-sm sm:w-full transition-all duration-300 ${
                visible ? 'animate-slideInRight opacity-100 translate-x-0' : 'opacity-0 translate-x-5'
            }`}
        >
            <div className="bg-surface border border-border-subtle rounded-xl shadow-float overflow-hidden">
                <div className="flex items-center gap-3 pl-3 pr-2.5 py-2.5">
                    <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${s.chip}`}>{s.icon}</div>
                    <span className="text-sm font-medium text-primary flex-1 leading-snug wrap-break-word">
                        {toast.message}
                    </span>

                    {toast.action && (
                        <button
                            onClick={handleActionClick}
                            className={`flex items-center gap-1 h-7 px-2.5 text-xs font-semibold rounded-lg border transition-all active:scale-95 shrink-0 ${s.actionBtn}`}
                        >
                            <RotateCcw size={12} />
                            {toast.action.label}
                        </button>
                    )}

                    <button
                        onClick={() => close()}
                        aria-label="Dismiss notification"
                        className="text-muted hover:text-primary p-1.5 rounded-lg hover:bg-surface-elevated transition-colors shrink-0"
                    >
                        <X size={14} />
                    </button>
                </div>
                {/* Auto-dismiss progress bar (keyed so it restarts for every new toast, paused on hover) */}
                <div
                    key={barKey}
                    className={`h-0.5 ${s.bar} opacity-70 progress-bar`}
                    style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                />
            </div>
        </div>
    );
}

/**
 * App-level toaster driven by the `toast` bus in lib/toast.ts.
 */
export function GlobalToaster() {
    const [current, setCurrent] = useState<ToastData | null>(null);

    useEffect(() => subscribeToasts(t => setCurrent({ ...t })), []);

    return <Toast toast={current} onDismiss={() => setCurrent(null)} />;
}

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
        icon: <CheckCircle size={18} className="text-emerald-500" />,
        bg: 'bg-surface-elevated border-emerald-500/30 dark:border-emerald-500/30',
        actionBtn: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30',
        bar: 'bg-emerald-500',
    },
    error: {
        icon: <XCircle size={18} className="text-red-500" />,
        bg: 'bg-surface-elevated border-red-500/30 dark:border-red-500/30',
        actionBtn: 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border-red-500/30',
        bar: 'bg-red-500',
    },
    info: {
        icon: <AlertCircle size={18} className="text-brand-500" />,
        bg: 'bg-surface-elevated border-brand-500/30 dark:border-brand-500/30',
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
    const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>();

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
            className={`fixed top-4 right-4 left-4 sm:left-auto z-[120] sm:max-w-sm sm:w-full transition-all duration-300 ${
                visible ? 'animate-slideInRight opacity-100 translate-x-0' : 'opacity-0 translate-x-5'
            }`}
        >
            <div className={`${s.bg} border rounded-2xl shadow-2xl shadow-black/20 overflow-hidden backdrop-blur-md`}>
                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-shrink-0">{s.icon}</div>
                    <span className="text-sm font-medium text-primary flex-1 leading-snug break-words">
                        {toast.message}
                    </span>

                    {toast.action && (
                        <button
                            onClick={handleActionClick}
                            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border transition-all active:scale-95 flex-shrink-0 ${s.actionBtn}`}
                        >
                            <RotateCcw size={12} />
                            {toast.action.label}
                        </button>
                    )}

                    <button
                        onClick={() => close()}
                        aria-label="Dismiss notification"
                        className="text-muted hover:text-primary p-1 rounded-lg hover:bg-surface transition-all flex-shrink-0"
                    >
                        <X size={14} />
                    </button>
                </div>
                {/* Auto-dismiss progress bar (keyed so it restarts for every new toast, paused on hover) */}
                <div
                    key={barKey}
                    className={`h-1 ${s.bar} progress-bar`}
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

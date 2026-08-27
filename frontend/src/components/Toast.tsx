import { useEffect, useState, useRef } from 'react';
import { CheckCircle, XCircle, AlertCircle, X, RotateCcw } from 'lucide-react';

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

export default function Toast({ toast, onDismiss }: Props) {
    const [visible, setVisible] = useState(false);
    const initTimerRef = useRef<ReturnType<typeof setTimeout>>();

    const duration = toast?.duration || (toast?.action ? 5000 : 3000);

    useEffect(() => {
        if (toast) {
            initTimerRef.current = setTimeout(() => setVisible(true), 10);
            let dismissTimer: ReturnType<typeof setTimeout>;
            const timer = setTimeout(() => {
                setVisible(false);
                dismissTimer = setTimeout(onDismiss, 300);
            }, duration);
            return () => {
                clearTimeout(initTimerRef.current);
                clearTimeout(timer);
                clearTimeout(dismissTimer);
            };
        }
    }, [toast, onDismiss, duration]);

    if (!toast) return null;

    const styles = {
        success: {
            icon: <CheckCircle size={18} className="text-emerald-500" />,
            bg: 'bg-surface-elevated border-emerald-500/30 dark:border-emerald-500/30',
            text: 'text-primary',
            actionBtn: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30',
            bar: 'bg-emerald-500',
        },
        error: {
            icon: <XCircle size={18} className="text-red-500" />,
            bg: 'bg-surface-elevated border-red-500/30 dark:border-red-500/30',
            text: 'text-primary',
            actionBtn: 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border-red-500/30',
            bar: 'bg-red-500',
        },
        info: {
            icon: <AlertCircle size={18} className="text-brand-500" />,
            bg: 'bg-surface-elevated border-brand-500/30 dark:border-brand-500/30',
            text: 'text-primary',
            actionBtn: 'bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 border-brand-500/30',
            bar: 'bg-brand-500',
        },
    };

    const s = styles[toast.type];

    const handleActionClick = () => {
        if (toast.action) {
            toast.action.onClick();
        }
        setVisible(false);
        setTimeout(onDismiss, 200);
    };

    return (
        <div
            className={`fixed top-4 right-4 z-[120] max-w-sm w-full transition-all duration-300 ${
                visible ? 'animate-slideInRight opacity-100 translate-x-0' : 'opacity-0 translate-x-5'
            }`}
        >
            <div className={`${s.bg} border rounded-2xl shadow-2xl shadow-black/20 overflow-hidden backdrop-blur-md`}>
                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-shrink-0">{s.icon}</div>
                    <span className={`text-sm font-medium ${s.text} flex-1 leading-snug`}>
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
                        onClick={() => {
                            setVisible(false);
                            setTimeout(onDismiss, 200);
                        }}
                        className="text-muted hover:text-primary p-1 rounded-lg hover:bg-surface transition-all flex-shrink-0"
                    >
                        <X size={14} />
                    </button>
                </div>
                {/* Auto-dismiss progress bar */}
                <div
                    className={`h-1 ${s.bar} progress-bar`}
                    style={{ animationDuration: `${duration}ms` }}
                />
            </div>
        </div>
    );
}

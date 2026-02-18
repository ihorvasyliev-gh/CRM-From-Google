import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

export interface ToastData {
    message: string;
    type: 'success' | 'error' | 'info';
}

interface Props {
    toast: ToastData | null;
    onDismiss: () => void;
}

export default function Toast({ toast, onDismiss }: Props) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (toast) {
            setVisible(true);
            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(onDismiss, 300);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    if (!toast) return null;

    const styles = {
        success: {
            icon: <CheckCircle size={18} className="text-emerald-500" />,
            bg: 'bg-emerald-50 border-emerald-200',
            text: 'text-emerald-800',
            bar: 'bg-emerald-500',
        },
        error: {
            icon: <XCircle size={18} className="text-red-500" />,
            bg: 'bg-red-50 border-red-200',
            text: 'text-red-800',
            bar: 'bg-red-500',
        },
        info: {
            icon: <AlertCircle size={18} className="text-brand-500" />,
            bg: 'bg-brand-50 border-brand-200',
            text: 'text-brand-800',
            bar: 'bg-brand-500',
        },
    };

    const s = styles[toast.type];

    return (
        <div
            className={`fixed top-4 right-4 z-[100] max-w-sm w-full transition-all duration-300 ${visible ? 'animate-slideInRight' : 'opacity-0 translate-x-5'}`}
        >
            <div className={`${s.bg} border rounded-xl shadow-lg overflow-hidden`}>
                <div className="flex items-center gap-3 px-4 py-3">
                    {s.icon}
                    <span className={`text-sm font-medium ${s.text} flex-1`}>{toast.message}</span>
                    <button
                        onClick={() => { setVisible(false); setTimeout(onDismiss, 200); }}
                        className="text-surface-400 hover:text-surface-600 p-1 rounded-lg hover:bg-white/50 transition-all"
                    >
                        <X size={14} />
                    </button>
                </div>
                {/* Auto-dismiss progress bar */}
                <div className={`h-0.5 ${s.bar} progress-bar`} />
            </div>
        </div>
    );
}

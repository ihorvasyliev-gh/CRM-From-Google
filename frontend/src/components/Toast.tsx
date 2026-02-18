import { useEffect } from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';

export interface ToastData {
    message: string;
    type: 'success' | 'error' | 'info';
}

interface ToastProps {
    toast: ToastData | null;
    onDismiss: () => void;
}

const ICONS = {
    success: <CheckCircle size={16} />,
    error: <XCircle size={16} />,
    info: <Info size={16} />
};

const COLORS = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600'
};

export default function Toast({ toast, onDismiss }: ToastProps) {
    useEffect(() => {
        if (toast) {
            const t = setTimeout(onDismiss, 3000);
            return () => clearTimeout(t);
        }
    }, [toast, onDismiss]);

    if (!toast) return null;

    return (
        <div className={`fixed top-6 right-6 z-[70] px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white flex items-center gap-2 animate-slideInRight ${COLORS[toast.type]}`}>
            {ICONS[toast.type]}
            {toast.message}
        </div>
    );
}

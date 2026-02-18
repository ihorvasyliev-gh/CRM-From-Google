import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Delete',
    variant = 'danger',
    onConfirm,
    onCancel
}: ConfirmDialogProps) {
    if (!open) return null;

    const colors = variant === 'danger'
        ? { bg: 'bg-red-600 hover:bg-red-700', icon: 'text-red-600 bg-red-100' }
        : { bg: 'bg-yellow-600 hover:bg-yellow-700', icon: 'text-yellow-600 bg-yellow-100' };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 animate-fadeIn" onClick={onCancel} />
            <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-scaleIn">
                <button onClick={onCancel} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <X size={18} />
                </button>

                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-full ${colors.icon}`}>
                        <AlertTriangle size={24} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
                        <p className="text-sm text-slate-500">{message}</p>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-medium text-white ${colors.bg} rounded-lg transition`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

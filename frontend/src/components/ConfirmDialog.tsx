import { AlertTriangle, AlertCircle } from 'lucide-react';

interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', variant = 'danger', onConfirm, onCancel }: Props) {
    if (!open) return null;

    const isDanger = variant === 'danger';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-surface-950/40 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl animate-scaleIn overflow-hidden">
                <div className="p-6 text-center">
                    {/* Icon */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isDanger ? 'bg-red-50' : 'bg-amber-50'}`}>
                        {isDanger
                            ? <AlertTriangle size={28} className="text-red-500" />
                            : <AlertCircle size={28} className="text-amber-500" />
                        }
                    </div>

                    <h3 className="text-lg font-bold text-surface-900 mb-1.5">{title}</h3>
                    <p className="text-sm text-surface-500 leading-relaxed">{message}</p>
                </div>

                <div className="flex gap-3 px-6 pb-6">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-sm hover:shadow-md ${isDanger
                            ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
                            }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

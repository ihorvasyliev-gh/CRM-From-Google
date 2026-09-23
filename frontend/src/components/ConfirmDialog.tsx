import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning';
    /** May return a promise — the dialog then shows a spinner and blocks double submits until it settles. */
    onConfirm: () => void | Promise<unknown>;
    onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', variant = 'danger', onConfirm, onCancel }: Props) {
    const [busy, setBusy] = useState(false);
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (open) {
            setBusy(false);
            // Focus "Cancel" for destructive dialogs so a stray Enter never deletes by accident
            const t = setTimeout(() => cancelRef.current?.focus(), 0);
            return () => clearTimeout(t);
        }
    }, [open]);

    useModalBehavior(open, onCancel, { closeOnEscape: !busy });

    if (!open) return null;

    const isDanger = variant === 'danger';

    const handleConfirm = async () => {
        if (busy) return;
        const result = onConfirm();
        if (result && typeof (result as Promise<unknown>).then === 'function') {
            setBusy(true);
            try {
                await result;
            } finally {
                setBusy(false);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-message"
                className="relative w-full max-w-sm bg-surface-elevated rounded-2xl shadow-2xl animate-scaleIn overflow-hidden"
            >
                <div className="p-6 text-center">
                    {/* Icon */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isDanger ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                        {isDanger
                            ? <AlertTriangle size={28} className="text-red-500" />
                            : <AlertCircle size={28} className="text-amber-500" />
                        }
                    </div>

                    <h3 id="confirm-dialog-title" className="text-lg font-bold text-primary mb-1.5">{title}</h3>
                    <p id="confirm-dialog-message" className="text-sm text-muted leading-relaxed">{message}</p>
                </div>

                <div className="flex gap-3 px-6 pb-6">
                    <button
                        ref={cancelRef}
                        onClick={onCancel}
                        disabled={busy}
                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-muted bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={busy}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-wait ${isDanger
                            ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
                            }`}
                    >
                        {busy && <Loader2 size={15} className="animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

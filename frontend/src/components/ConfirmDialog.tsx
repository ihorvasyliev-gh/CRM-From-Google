import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

    // Portal to <body> so the dialog layers above the sidebar / drawers regardless of where it's rendered
    return createPortal(
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={busy ? undefined : onCancel} />
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-message"
                className="relative w-full max-w-sm bg-surface border border-border-subtle rounded-2xl shadow-float animate-scaleIn overflow-hidden"
            >
                <div className="p-6 flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDanger ? 'bg-danger/10 text-status-rejected' : 'bg-warning/15 text-status-requested'}`}>
                        {isDanger ? <AlertTriangle size={20} /> : <AlertCircle size={20} />}
                    </div>
                    <div className="min-w-0 pt-0.5">
                        <h3 id="confirm-dialog-title" className="text-base font-semibold text-primary mb-1">{title}</h3>
                        <p id="confirm-dialog-message" className="text-sm text-muted leading-relaxed">{message}</p>
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-6 py-3.5 border-t border-border-subtle bg-surface-elevated/40">
                    <button
                        ref={cancelRef}
                        onClick={onCancel}
                        disabled={busy}
                        className="h-9 px-3.5 text-xs font-semibold text-primary bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={busy}
                        className={`h-9 flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-white rounded-xl transition-colors shadow-xs disabled:opacity-70 disabled:cursor-wait ${isDanger
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-amber-500 hover:bg-amber-600'
                            }`}
                    >
                        {busy && <Loader2 size={15} className="animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

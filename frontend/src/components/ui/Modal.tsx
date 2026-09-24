import type { ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { toneChipCls, type Tone } from './styles';

const WIDTHS = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
    '3xl': 'max-w-5xl',
} as const;

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    icon?: LucideIcon;
    tone?: Tone;
    size?: keyof typeof WIDTHS;
    children: ReactNode;
    /** Right-aligned buttons row. */
    footer?: ReactNode;
    /** Extra content on the right of the header (before the close button). */
    headerAction?: ReactNode;
    /** Keep the dialog open on Escape / backdrop click (e.g. while saving). */
    dismissible?: boolean;
    /** id used for aria-labelledby. */
    labelId?: string;
    bodyClassName?: string;
    zIndex?: string;
    /** Bottom sheet on small screens. */
    sheetOnMobile?: boolean;
}

/**
 * Shared dialog shell: blurred overlay, rounded-2xl panel, header with icon chip,
 * scrollable body and a footer for actions. Escape + focus restore via useModalBehavior.
 */
export default function Modal({
    open,
    onClose,
    title,
    subtitle,
    icon: Icon,
    tone = 'brand',
    size = 'md',
    children,
    footer,
    headerAction,
    dismissible = true,
    labelId = 'modal-title',
    bodyClassName = '',
    zIndex = 'z-50',
    sheetOnMobile = false,
}: ModalProps) {
    useModalBehavior(open, onClose, { closeOnEscape: dismissible });
    if (!open) return null;
    return (
        <div className={`fixed inset-0 ${zIndex} flex ${sheetOnMobile ? 'items-end sm:items-center' : 'items-center'} justify-center ${sheetOnMobile ? 'sm:p-4' : 'p-4'} animate-fadeIn`}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismissible ? onClose : undefined} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelId}
                className={`relative w-full ${WIDTHS[size]} max-h-[90dvh] flex flex-col bg-surface border border-border-subtle shadow-float ${
                    sheetOnMobile ? 'rounded-t-2xl sm:rounded-2xl animate-sheetSlideUp sm:animate-scaleIn' : 'rounded-2xl animate-scaleIn'
                } overflow-hidden`}
            >
                <ModalHeader
                    title={title}
                    subtitle={subtitle}
                    icon={Icon}
                    tone={tone}
                    onClose={dismissible ? onClose : undefined}
                    action={headerAction}
                    labelId={labelId}
                />
                <div className={`flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 ${bodyClassName}`}>{children}</div>
                {footer && <ModalFooter>{footer}</ModalFooter>}
            </div>
        </div>
    );
}

export function ModalHeader({
    title,
    subtitle,
    icon: Icon,
    tone = 'brand',
    onClose,
    action,
    labelId,
}: {
    title: ReactNode;
    subtitle?: ReactNode;
    icon?: LucideIcon;
    tone?: Tone;
    onClose?: () => void;
    action?: ReactNode;
    labelId?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-border-subtle flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
                {Icon && (
                    <span className={`flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${toneChipCls[tone]}`}>
                        <Icon size={18} />
                    </span>
                )}
                <div className="min-w-0">
                    <h2 id={labelId} className="text-base font-semibold text-primary tracking-tight truncate">
                        {title}
                    </h2>
                    {subtitle && <p className="text-xs text-muted truncate mt-0.5">{subtitle}</p>}
                </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
                {action}
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="p-2 text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                )}
            </div>
        </div>
    );
}

export function ModalFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t border-border-subtle bg-surface-elevated/40 flex-shrink-0 ${className}`}>
            {children}
        </div>
    );
}

/** Inline error message inside forms / dialogs. */
export function FormError({ children }: { children: ReactNode }) {
    return (
        <div role="alert" className="text-sm text-status-rejected bg-danger/10 border border-danger/25 px-3.5 py-2.5 rounded-xl animate-slideDown">
            {children}
        </div>
    );
}

import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { usePresence } from '../../hooks/usePresence';
import Freeze from './Freeze';

export interface DialogLayerProps {
    open: boolean;
    onClose: () => void;
    /** Escape and a click on the backdrop close the layer (turn off while saving) */
    dismissible?: boolean;
    /** The full-screen layer: z-index, and where the panel sits in it */
    className?: string;
    backdropClassName?: string;
    /** The dialog itself */
    panelClassName?: string;
    /** The panel's animations in and out (the whole layer also fades) */
    enter?: string;
    exit?: string;
    role?: 'dialog' | 'alertdialog';
    label?: string;
    labelledBy?: string;
    describedBy?: string;
    children: ReactNode;
}

/**
 * Every dialog, sheet and drawer of the app sits in one of these:
 *  - portaled to <body>, above the page and outside its scroll container (the page behind
 *    doesn't scroll along)
 *  - Escape closes the top-most layer, focus moves into the dialog, Tab stays inside it and
 *    focus returns to where it was on close (useModalBehavior)
 *  - it animates out with the content it had (usePresence + Freeze), inert and letting clicks
 *    through while it does
 */
export default function DialogLayer({
    open,
    onClose,
    dismissible = true,
    className = 'z-50 flex items-center justify-center p-4',
    backdropClassName = 'bg-black/40 backdrop-blur-xs',
    panelClassName = '',
    enter = 'animate-scaleIn',
    exit = 'animate-scaleOut',
    role = 'dialog',
    label,
    labelledBy,
    describedBy,
    children,
}: DialogLayerProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    useModalBehavior(open, onClose, { closeOnEscape: dismissible, trapFocus: panelRef });
    const { mounted, closing, ref } = usePresence(open);
    if (!mounted) return null;

    return createPortal(
        <div ref={ref} inert={closing} className={`fixed inset-0 ${className} ${closing ? 'animate-fadeOut pointer-events-none' : 'animate-fadeIn'}`}>
            <div aria-hidden className={`absolute inset-0 ${backdropClassName}`} onClick={dismissible ? onClose : undefined} />
            <div
                ref={panelRef}
                role={role}
                aria-modal="true"
                aria-label={label}
                aria-labelledby={labelledBy}
                aria-describedby={describedBy}
                tabIndex={-1}
                className={`relative outline-none ${panelClassName} ${closing ? exit : enter}`}
            >
                <Freeze frozen={closing}>{children}</Freeze>
            </div>
        </div>,
        document.body
    );
}

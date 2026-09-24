import { forwardRef } from 'react';
import type React from 'react';
import { Loader2 } from 'lucide-react';
import { buttonCls, type ButtonSize, type ButtonVariant } from './buttonStyles';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Shows a spinner in place of the leading icon and disables the button. */
    loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'secondary', size = 'md', loading = false, className = '', children, disabled, type = 'button', ...rest },
    ref
) {
    return (
        <button ref={ref} type={type} className={buttonCls(variant, size, className)} disabled={disabled || loading} {...rest}>
            {loading && <Loader2 size={size === 'lg' ? 16 : 14} className="animate-spin" />}
            {children}
        </button>
    );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Accessible name (also used as the tooltip when no `title` is given). */
    label: string;
    size?: 'sm' | 'md';
    tone?: 'default' | 'danger' | 'brand';
    active?: boolean;
}

/** Square, borderless icon-only button used for row actions and toolbars. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
    { label, size = 'md', tone = 'default', active = false, className = '', title, type = 'button', children, ...rest },
    ref
) {
    const dims = size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-9 h-9 rounded-xl';
    const tones = {
        default: 'hover:text-primary hover:bg-surface-elevated',
        brand: 'hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-500/10',
        danger: 'hover:text-status-rejected hover:bg-danger/10',
    }[tone];
    return (
        <button
            ref={ref}
            type={type}
            aria-label={label}
            title={title ?? label}
            className={`inline-flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${dims} ${
                active ? 'text-brand-600 dark:text-brand-400 bg-brand-500/10' : `text-muted ${tones}`
            } ${className}`}
            {...rest}
        >
            {children}
        </button>
    );
});

export default Button;

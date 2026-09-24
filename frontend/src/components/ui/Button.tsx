import { forwardRef } from 'react';
import type React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'danger-soft' | 'brand-soft';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const BASE =
    'inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl transition-all active:scale-[0.97] ' +
    'disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-brand-500/40 whitespace-nowrap select-none';

const SIZES: Record<ButtonSize, string> = {
    xs: 'h-7 px-2 text-[11px] rounded-lg',
    sm: 'h-8 px-2.5 text-xs',
    md: 'h-9 px-3.5 text-xs',
    lg: 'h-10 px-4 text-sm',
};

const VARIANTS: Record<ButtonVariant, string> = {
    primary: 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-500/20',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
    secondary: 'bg-surface hover:bg-surface-elevated text-primary border border-border-subtle hover:border-border-strong shadow-card',
    ghost: 'text-muted hover:text-primary hover:bg-surface-elevated',
    'danger-soft': 'text-status-rejected bg-danger/10 hover:bg-danger/15 border border-danger/20',
    'brand-soft': 'text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/15 border border-brand-500/20',
};

/** Class string for elements that must look like a button but aren't one (labels, links). */
export function buttonCls(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className = '') {
    return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
}

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

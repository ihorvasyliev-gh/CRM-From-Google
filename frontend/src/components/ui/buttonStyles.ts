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

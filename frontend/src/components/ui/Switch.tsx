import { forwardRef, useId } from 'react';
import type React from 'react';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'onChange' | 'checked'> {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Optional visible label rendered beside the switch. */
    label?: React.ReactNode;
    /** Optional supporting text shown beneath `label` and linked via `aria-describedby`. */
    description?: React.ReactNode;
    /** Track size: `'sm'` (36×20px) or `'md'` (40×24px). Defaults to `'md'`. */
    size?: 'sm' | 'md';
    /** Position of `label`/`description` relative to the switch track. Defaults to `'right'`. */
    labelPosition?: 'left' | 'right';
}

const TRACK_SIZES: Record<'sm' | 'md', string> = {
    sm: 'w-9 h-5',
    md: 'w-10 h-6',
};

const THUMB_SIZES: Record<'sm' | 'md', string> = {
    sm: 'left-0.5 top-0.5 w-4 h-4 peer-checked:translate-x-4',
    md: 'left-1 top-1 w-4 h-4 peer-checked:translate-x-4',
};

/**
 * Accessible toggle switch backed by a native checkbox (`role="switch"`).
 * Renders its own `<label>` wrapper — pair with `label`/`description`, `aria-label`,
 * or an external `<label htmlFor={id}>` rather than nesting inside another `<label>`.
 */
const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
    {
        id,
        checked,
        onChange,
        disabled = false,
        size = 'md',
        label,
        description,
        labelPosition = 'right',
        className = '',
        'aria-describedby': ariaDescribedBy,
        ...rest
    },
    ref,
) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const descId = description ? `${inputId}-desc` : undefined;
    const describedBy = [ariaDescribedBy, descId].filter(Boolean).join(' ') || undefined;

    const control = (
        <span className="relative inline-flex items-center shrink-0">
            <input
                ref={ref}
                id={inputId}
                type="checkbox"
                role="switch"
                aria-checked={checked}
                aria-describedby={describedBy}
                checked={checked}
                disabled={disabled}
                onChange={e => onChange(e.target.checked)}
                className="peer sr-only"
                {...rest}
            />
            <span
                aria-hidden="true"
                className={`block rounded-full bg-border-strong peer-checked:bg-brand-500 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface ${TRACK_SIZES[size]}`}
            />
            <span
                aria-hidden="true"
                className={`pointer-events-none absolute rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform ${THUMB_SIZES[size]}`}
            />
        </span>
    );

    if (!label && !description) {
        return (
            <label
                htmlFor={inputId}
                className={`inline-flex items-center shrink-0 select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
            >
                {control}
            </label>
        );
    }

    if (!description) {
        const labelEl = (
            <span className={`${size === 'sm' ? 'text-xs' : 'text-[13px]'} font-medium text-primary`}>
                {label}
            </span>
        );
        return (
            <label
                htmlFor={inputId}
                className={`inline-flex items-center gap-2.5 select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
            >
                {labelPosition === 'left' && labelEl}
                {control}
                {labelPosition === 'right' && labelEl}
            </label>
        );
    }

    const textBlock = (
        <div className="min-w-0">
            {label && (
                <label
                    htmlFor={inputId}
                    className={`block text-[13px] font-semibold text-primary select-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    {label}
                </label>
            )}
            <p id={descId} className="text-xs text-muted mt-0.5">
                {description}
            </p>
        </div>
    );

    return (
        <div
            className={`${labelPosition === 'left' ? 'flex items-center justify-between gap-4' : 'inline-flex items-start gap-2.5'} ${disabled ? 'opacity-50' : ''} ${className}`}
        >
            {labelPosition === 'left' && textBlock}
            <label
                htmlFor={inputId}
                className={`inline-flex items-center shrink-0 select-none ${labelPosition === 'right' ? 'mt-0.5' : ''} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
                {control}
            </label>
            {labelPosition === 'right' && textBlock}
        </div>
    );
});

export default Switch;

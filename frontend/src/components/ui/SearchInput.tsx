import { forwardRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: string;
    onChange: (value: string) => void;
    /** Shows a small spinner instead of the clear button (e.g. while a debounced query is running). */
    loading?: boolean;
    /** Classes for the wrapper element (width, flex…). */
    wrapperClassName?: string;
}

/**
 * Search field with a leading icon, a clear (×) button and Escape-to-clear.
 * Marked with `data-page-search` so the global "/" shortcut focuses it.
 */
const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
    { value, onChange, loading = false, wrapperClassName = '', className = '', onKeyDown, ...rest },
    ref
) {
    return (
        <div className={`relative ${wrapperClassName}`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={16} />
            <input
                ref={ref}
                type="text"
                data-page-search=""
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Escape' && value) {
                        // Clear first; a second Escape bubbles up (e.g. closes a modal)
                        e.preventDefault();
                        onChange('');
                    }
                    onKeyDown?.(e);
                }}
                className={`w-full h-9 sm:h-10 pl-9 pr-9 bg-surface border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors placeholder:text-muted/70 text-primary ${className}`}
                {...rest}
            />
            {loading ? (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-500 animate-spin" />
            ) : value ? (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted hover:text-primary hover:bg-surface-elevated transition-colors"
                >
                    <X size={14} />
                </button>
            ) : null}
        </div>
    );
});

export default SearchInput;

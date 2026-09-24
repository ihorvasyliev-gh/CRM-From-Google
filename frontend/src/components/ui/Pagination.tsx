import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Footer for paginated tables: "Showing a–b of n" · prev / page / next. */
export default function Pagination({
    page,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    itemLabel = 'rows',
    className = '',
}: {
    /** 1-based current page. */
    page: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    itemLabel?: string;
    className?: string;
}) {
    if (totalItems === 0) return null;
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, totalItems);
    const btn =
        'inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border-subtle bg-surface text-muted hover:text-primary hover:bg-surface-elevated disabled:opacity-40 disabled:pointer-events-none transition-colors';
    return (
        <div className={`flex items-center justify-between gap-3 px-4 py-3 border-t border-border-subtle text-xs text-muted ${className}`}>
            <span className="tabular-nums">
                Showing <span className="font-semibold text-primary">{from}–{to}</span> of{' '}
                <span className="font-semibold text-primary">{totalItems}</span> {itemLabel}
            </span>
            {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                    <button type="button" className={btn} onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page">
                        <ChevronLeft size={15} />
                    </button>
                    <span className="px-2 tabular-nums font-semibold text-primary">
                        {page} <span className="text-muted font-medium">/ {totalPages}</span>
                    </span>
                    <button
                        type="button"
                        className={btn}
                        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                        aria-label="Next page"
                    >
                        <ChevronRight size={15} />
                    </button>
                </div>
            )}
        </div>
    );
}

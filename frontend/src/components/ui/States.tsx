import type React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({
    icon,
    title,
    description,
    action,
    bare = false,
    className = '',
}: {
    icon: React.ReactNode;
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
    /** Render without the dashed card (when already inside a card). */
    bare?: boolean;
    className?: string;
}) {
    return (
        <div
            className={`${bare ? '' : 'bg-surface rounded-2xl border border-dashed border-border-strong/60'} px-6 ${bare ? 'py-10' : 'py-12'} text-center ${className}`}
        >
            <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border-subtle text-muted mx-auto flex items-center justify-center mb-3">
                {icon}
            </div>
            <h3 className="text-base font-semibold text-primary">{title}</h3>
            {description && <p className="text-sm text-muted mt-1 max-w-sm mx-auto">{description}</p>}
            {action && <div className="mt-4 flex justify-center gap-2 flex-wrap">{action}</div>}
        </div>
    );
}

export function ErrorState({
    title,
    error,
    onRetry,
    className = '',
}: {
    title: string;
    error: unknown;
    onRetry: () => void;
    className?: string;
}) {
    return (
        <div role="alert" className={`bg-surface rounded-2xl border border-danger/25 px-6 py-10 text-center ${className}`}>
            <div className="w-12 h-12 rounded-2xl bg-danger/10 text-status-rejected mx-auto flex items-center justify-center mb-3">
                <AlertCircle size={24} />
            </div>
            <h3 className="text-base font-semibold text-primary">{title}</h3>
            <p className="text-sm text-muted mt-1">
                {error instanceof Error ? error.message : (error as { message?: string } | null)?.message || 'Check your connection and try again.'}
            </p>
            <div className="mt-4 flex justify-center">
                <Button variant="primary" onClick={onRetry}>
                    <RotateCcw size={14} />
                    Retry
                </Button>
            </div>
        </div>
    );
}

export function SkeletonRows({ rows = 6, bare = false }: { rows?: number; bare?: boolean }) {
    return (
        <div
            className={`${bare ? '' : 'bg-surface rounded-2xl border border-border-subtle overflow-hidden'} divide-y divide-border-subtle`}
            aria-busy="true"
            aria-label="Loading"
        >
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-muted/15 shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-muted/15 rounded w-1/3" />
                        <div className="h-3 bg-muted/10 rounded w-1/2" />
                    </div>
                    <div className="hidden sm:block w-24 h-5 bg-muted/15 rounded-full" />
                </div>
            ))}
        </div>
    );
}

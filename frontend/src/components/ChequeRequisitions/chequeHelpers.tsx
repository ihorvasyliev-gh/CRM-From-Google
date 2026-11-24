import { Loader2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { ReadProgress } from './useOpenInvoice';

export function ReadingProgressBanner({
    reading,
    progress,
    onCancel,
}: {
    reading: string | null;
    progress: ReadProgress | null;
    onCancel: () => void;
}) {
    if (!reading && !progress) return null;
    const label = progress?.label || reading || 'Reading invoice…';
    const pct =
        typeof progress?.progress === 'number'
            ? Math.max(0, Math.min(100, Math.round(progress.progress * (progress.progress <= 1 ? 100 : 1))))
            : null;
    const fileMeta =
        progress?.fileCount && progress.fileCount > 1 && progress.fileIndex !== undefined
            ? `File ${progress.fileIndex + 1} of ${progress.fileCount}`
            : null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-brand-500/25 bg-brand-500/[0.06] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
        >
            <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-2 font-semibold text-primary min-w-0">
                        <Loader2 size={14} className="animate-spin text-brand-500 shrink-0" />
                        <span className="truncate">{label}</span>
                    </span>
                    <span className="text-muted tabular-nums shrink-0">
                        {[fileMeta, pct !== null ? `${pct}%` : null].filter(Boolean).join(' · ')}
                    </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden">
                    {pct !== null ? (
                        <div
                            className="h-full rounded-full bg-brand-500 transition-all duration-200"
                            style={{ width: `${Math.max(4, pct)}%` }}
                        />
                    ) : (
                        <div className="h-full w-1/3 rounded-full bg-brand-500/75 animate-pulse" />
                    )}
                </div>
            </div>
            {progress?.canCancel !== false && (
                <Button variant="secondary" size="sm" onClick={onCancel} className="shrink-0 self-start sm:self-center">
                    <X size={13} />
                    Cancel
                </Button>
            )}
        </div>
    );
}

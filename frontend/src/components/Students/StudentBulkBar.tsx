import { FileSpreadsheet, GraduationCap, Loader2, X } from 'lucide-react';

const actionCls = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-white leading-none whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50 disabled:cursor-not-allowed';

interface Props {
    count: number;
    exporting: boolean;
    onEnroll: () => void;
    onExport: () => void;
    onClear: () => void;
}

/** Floating bar for the selected students (above the phone's bottom navigation) */
export default function StudentBulkBar({ count, exporting, onEnroll, onExport, onClear }: Props) {
    if (count === 0) return null;
    return (
        <div
            role="toolbar"
            aria-label="Selected students"
            className="fixed bottom-[max(calc(env(safe-area-inset-bottom)+4.25rem),4.25rem)] lg:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slideUpCenter"
        >
            <div className="glass-dark rounded-2xl shadow-float px-3 py-2 flex items-center gap-1.5 w-[calc(100vw-2rem)] sm:w-auto justify-between sm:justify-center">
                <span className="px-2 text-xs font-semibold text-white whitespace-nowrap" aria-live="polite">
                    <span className="tabular-nums">{count}</span> <span className="text-white/70">selected</span>
                </span>
                <div className="flex items-center gap-1.5">
                    <button type="button" onClick={onEnroll} className={`${actionCls} bg-brand-500 hover:bg-brand-600`}>
                        <GraduationCap size={14} aria-hidden />
                        <span className="hidden sm:inline">Enroll on a course</span>
                        <span className="sm:hidden">Enroll</span>
                    </button>
                    <button type="button" onClick={onExport} disabled={exporting} className={`${actionCls} bg-white/10 hover:bg-white/20`}>
                        {exporting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FileSpreadsheet size={14} aria-hidden />}
                        <span className="hidden sm:inline">Export to Excel</span>
                        <span className="sm:hidden">Excel</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClear}
                        aria-label="Clear selection"
                        title="Clear selection"
                        className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}

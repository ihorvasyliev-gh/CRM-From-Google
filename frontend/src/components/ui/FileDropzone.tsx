import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';

/**
 * Click-or-drop file picker. Dropped files are fed through the same `onChange`
 * handler as the hidden input, so existing upload logic (type / size checks) is reused.
 */
export default function FileDropzone({
    accept,
    multiple = false,
    onChange,
    disabled = false,
    uploading = false,
    title = 'Drop a file here or click to browse',
    hint,
    compact = false,
    className = '',
    icon,
}: {
    accept?: string;
    multiple?: boolean;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    uploading?: boolean;
    title?: ReactNode;
    hint?: ReactNode;
    compact?: boolean;
    className?: string;
    icon?: ReactNode;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const inactive = disabled || uploading;

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (inactive || !inputRef.current || !e.dataTransfer.files.length) return;
        const dt = new DataTransfer();
        const files = Array.from(e.dataTransfer.files);
        (multiple ? files : files.slice(0, 1)).forEach(f => dt.items.add(f));
        inputRef.current.files = dt.files;
        inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    };

    return (
        <label
            onDragOver={e => {
                e.preventDefault();
                if (!inactive) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`group flex ${compact ? 'flex-row gap-3 px-4 py-3' : 'flex-col gap-2 px-4 py-6 text-center'} items-center justify-center rounded-xl border border-dashed transition-colors ${
                inactive ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
            } ${
                dragOver
                    ? 'border-brand-500 bg-brand-500/6'
                    : 'border-border-strong/70 bg-surface-elevated/40 hover:border-brand-500/60 hover:bg-brand-500/4'
            } ${className}`}
        >
            <span
                className={`flex items-center justify-center ${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl bg-surface border border-border-subtle text-muted group-hover:text-brand-500 transition-colors shrink-0`}
            >
                {uploading ? <Loader2 size={compact ? 15 : 18} className="animate-spin text-brand-500" /> : icon ?? <UploadCloud size={compact ? 15 : 18} />}
            </span>
            <span className={`min-w-0 ${compact ? 'text-left' : ''}`}>
                <span className="block text-xs font-semibold text-primary">{uploading ? 'Uploading…' : title}</span>
                {hint && <span className="block text-[11px] text-muted mt-0.5">{hint}</span>}
            </span>
            <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={onChange} disabled={inactive} />
        </label>
    );
}

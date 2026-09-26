import { useRef, type ReactNode } from 'react';
import { Check, Copy, Download, RefreshCw } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { copyText } from '../Viewer/viewerUtils';
import { fileInputHandler } from './helpers';

export function StepHeader({ n, title, done, hint }: { n: number; title: string; done: boolean; hint?: ReactNode }) {
    return (
        <div className="flex items-center gap-3 mb-3">
            <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    done ? 'bg-success text-white' : 'bg-surface-elevated text-muted border border-border-subtle'
                }`}
            >
                {done ? <Check size={13} strokeWidth={3} /> : n}
            </span>
            <span className="text-[13px] font-semibold text-primary">{title}</span>
            {hint && <span className="ml-auto text-[11px] text-muted text-right">{hint}</span>}
        </div>
    );
}

/** Icon button that opens a .docx picker — replaces a template's file in place. */
export function ReplaceFileButton({ label, onFile, disabled }: { label: string; onFile: (file: File) => void; disabled?: boolean }) {
    const input = useRef<HTMLInputElement>(null);
    return (
        <>
            <IconButton size="sm" tone="brand" label={label} disabled={disabled} onClick={() => input.current?.click()}>
                <RefreshCw size={13} />
            </IconButton>
            <input ref={input} type="file" accept=".docx" className="hidden" tabIndex={-1} onChange={fileInputHandler(onFile)} />
        </>
    );
}

export function DownloadButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <IconButton size="sm" tone="brand" label={label} onClick={onClick}>
            <Download size={13} />
        </IconButton>
    );
}

/** A `{placeholder}` chip that copies itself when clicked. */
export function PlaceholderButton({ tag, desc, tone = 'brand' }: { tag: string; desc: ReactNode; tone?: 'brand' | 'custom' }) {
    return (
        <button
            type="button"
            onClick={() => copyText(`{${tag}}`, 'Placeholder')}
            className="w-full flex items-center gap-2 text-left text-[13px] px-1.5 py-1 -mx-1.5 rounded-lg hover:bg-surface-elevated transition-colors group"
            title={`Copy {${tag}}`}
        >
            <code className={`${tone === 'brand' ? 'text-brand-600 dark:text-brand-400 bg-brand-500/10' : 'text-status-confirmed bg-success/10'} px-1.5 py-0.5 rounded-sm font-mono text-xs shrink-0`}>
                {`{${tag}}`}
            </code>
            <span className="text-muted truncate flex-1">{desc}</span>
            <Copy size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
    );
}

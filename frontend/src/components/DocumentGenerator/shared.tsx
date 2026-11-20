import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download, RefreshCw } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { copyText } from '../Viewer/viewerUtils';
import { fileInputHandler } from './helpers';

export function StepHeader({ n, title, done, hint }: { n: number; title: string; done: boolean; hint?: ReactNode }) {
    return (
        <div className="flex items-center gap-3 mb-3">
            <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    done ? 'bg-success text-white' : 'bg-surface-elevated text-muted border border-border-subtle'
                }`}
            >
                {done ? <Check size={13} strokeWidth={3} /> : n}
            </span>
            <span className="text-[13px] font-semibold text-primary">{title}</span>
            {hint && <span className="ml-auto text-xs text-muted text-right">{hint}</span>}
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
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    async function handleCopy() {
        const token = `{${tag}}`;
        const ok = await copyText(token, token);
        if (!ok) return;
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1500);
    }

    return (
        <button
            type="button"
            onClick={() => void handleCopy()}
            className="w-full flex items-center gap-2 text-left text-[13px] px-1.5 py-1 -mx-1.5 rounded-lg hover:bg-surface-elevated transition-colors group"
            title={`Copy {${tag}}`}
        >
            <code className={`${tone === 'brand' ? 'text-brand-600 dark:text-brand-400 bg-brand-500/10' : 'text-status-confirmed bg-success/10'} px-1.5 py-0.5 rounded-sm font-mono text-xs shrink-0`}>
                {`{${tag}}`}
            </code>
            <span className="text-muted truncate flex-1">{desc}</span>
            {copied ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-confirmed shrink-0">
                    <Check size={12} />
                    Copied!
                </span>
            ) : (
                <Copy size={12} className="text-muted opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100 transition-opacity shrink-0" />
            )}
        </button>
    );
}

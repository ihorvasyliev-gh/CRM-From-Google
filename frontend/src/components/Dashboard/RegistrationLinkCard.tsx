import { useState, type JSX } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';

export const GOOGLE_FORM_URL = 'https://forms.gle/9U4DsSe5UYnsakJZ8';

interface RegistrationLinkCardProps {
    compact?: boolean;
    variant?: 'compact' | 'card';
}

export default function RegistrationLinkCard({ compact = false, variant }: RegistrationLinkCardProps): JSX.Element {
    const [copied, setCopied] = useState(false);
    const isCompact = compact || variant === 'compact';

    const handleCopy = () => {
        navigator.clipboard.writeText(GOOGLE_FORM_URL).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    if (isCompact) {
        return (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-brand-500/10 border border-brand-500/25 shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 truncate">
                        📝 Registration Form
                    </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                        type="button"
                        onClick={handleCopy}
                        aria-label={copied ? 'Copied' : 'Copy Link'}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                            copied
                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-xs'
                                : 'bg-surface hover:bg-surface-elevated text-brand-600 dark:text-brand-400 border-brand-500/30'
                        }`}
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                    </button>
                    <a
                        href={GOOGLE_FORM_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open registration form"
                        className="p-1.5 rounded-lg text-muted hover:text-brand-500 hover:bg-brand-500/10 transition-colors"
                        title="Open form in new tab"
                    >
                        <ExternalLink size={14} />
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/10 via-brand-500/5 to-transparent p-4 shadow-card">
            <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-brand-500/15 text-brand-600 dark:text-brand-400 rounded-xl flex-shrink-0">
                    <ExternalLink size={18} />
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Registration Form</h4>
                    <span className="block text-xs font-mono text-primary truncate">forms.gle/9U4DsSe5UYnsakJZ8</span>
                </div>
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={handleCopy}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl border transition-all duration-300 cursor-pointer ${
                        copied
                            ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                            : 'bg-brand-500 text-white hover:bg-brand-600 border-transparent shadow-xs active:scale-[0.98]'
                    }`}
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <a
                    href={GOOGLE_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted hover:text-primary bg-surface-elevated hover:bg-surface-elevated/80 border border-border-subtle rounded-xl transition-all"
                >
                    <ExternalLink size={14} />
                    Open
                </a>
            </div>
        </div>
    );
}

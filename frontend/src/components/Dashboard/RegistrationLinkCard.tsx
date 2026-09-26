import { useState, type JSX } from 'react';
import { ExternalLink, Copy, Check, Link2 } from 'lucide-react';

export const GOOGLE_FORM_URL = 'https://forms.gle/9U4DsSe5UYnsakJZ8';
const DISPLAY_URL = GOOGLE_FORM_URL.replace(/^https?:\/\//, '');

interface RegistrationLinkCardProps {
    compact?: boolean;
    variant?: 'compact' | 'card';
    className?: string;
}

export default function RegistrationLinkCard({ compact = false, variant, className = '' }: RegistrationLinkCardProps): JSX.Element {
    const [copied, setCopied] = useState(false);
    const isCompact = compact || variant === 'compact';

    const handleCopy = () => {
        navigator.clipboard.writeText(GOOGLE_FORM_URL).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const copyClasses = copied
        ? 'bg-success text-white border-success'
        : 'bg-brand-500 hover:bg-brand-600 text-white border-transparent';

    if (isCompact) {
        return (
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-surface border border-border-subtle shadow-card ${className}`}>
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-500/10 text-brand-500 shrink-0">
                    <Link2 size={16} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-primary truncate">Registration Form</p>
                    <p className="text-[11px] text-muted font-mono truncate">{DISPLAY_URL}</p>
                </div>
                <button
                    type="button"
                    onClick={handleCopy}
                    aria-label={copied ? 'Copied' : 'Copy Link'}
                    className={`h-8 px-3 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0 ${copyClasses}`}
                >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                </button>
                <a
                    href={GOOGLE_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open registration form"
                    className="p-2 rounded-lg text-muted hover:text-brand-500 hover:bg-brand-500/10 transition-colors shrink-0"
                    title="Open form in new tab"
                >
                    <ExternalLink size={15} />
                </a>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-card bg-linear-to-br from-indigo-600 via-indigo-700 to-violet-800 ${className}`}>
            {/* Decorative glow */}
            <div aria-hidden className="orb absolute -top-20 -right-20 w-56 h-56 text-white/[0.14]" />
            <div aria-hidden className="orb absolute bottom-[-88px] left-[-46px] w-48 h-48 text-white/12" />

            <div className="relative flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 ring-1 ring-white/25 shrink-0">
                    <Link2 size={17} />
                </span>
                <div className="min-w-0">
                    <h4 className="text-sm font-semibold">Registration Form</h4>
                    <p className="text-[11px] text-white/75">Share with new students to sign up</p>
                </div>
            </div>

            <div className="relative mt-4 px-3 py-2 rounded-xl bg-black/15 ring-1 ring-white/15 font-mono text-xs truncate select-all">
                {DISPLAY_URL}
            </div>

            <div className="relative mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={handleCopy}
                    className={`flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer active:scale-[0.98] ${
                        copied ? 'bg-success text-white' : 'bg-white text-indigo-700 hover:bg-white/90'
                    }`}
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <a
                    href={GOOGLE_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-xl bg-white/15 hover:bg-white/25 ring-1 ring-white/25 transition-colors"
                >
                    <ExternalLink size={14} />
                    Open
                </a>
            </div>
        </div>
    );
}

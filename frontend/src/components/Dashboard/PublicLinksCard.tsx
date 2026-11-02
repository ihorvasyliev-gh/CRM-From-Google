import { useEffect, useId, useRef, useState, type JSX, type ReactNode } from 'react';
import { Award, Briefcase, Check, ClipboardList, Copy, ExternalLink, Globe, Receipt } from 'lucide-react';

export const GOOGLE_FORM_URL = 'https://forms.gle/9U4DsSe5UYnsakJZ8';

interface PublicLink {
    key: string;
    name: string;
    hint: string;
    url: string;
    icon: ReactNode;
}

/**
 * Every page someone can open without signing in, plus the registration Google Form.
 * The confirmation page (/confirm, /c/…) is left out: its link is made for one course
 * and date when invitations are sent.
 */
function publicLinks(origin: string = window.location.origin): PublicLink[] {
    return [
        { key: 'form', name: 'Registration form', hint: 'New students sign up', url: GOOGLE_FORM_URL, icon: <ClipboardList size={16} /> },
        { key: 'cheque', name: 'Cheque requisition', hint: 'Made from an invoice, nothing saved', url: `${origin}/cheque`, icon: <Receipt size={16} /> },
        { key: 'certificates', name: 'Certificates', hint: 'A Word template filled in for a group', url: `${origin}/certificates`, icon: <Award size={16} /> },
        { key: 'status', name: 'Employment update', hint: 'Graduates tell us if they are working', url: `${origin}/status`, icon: <Briefcase size={16} /> },
    ];
}

const displayUrl = (url: string) => url.replace(/^https?:\/\//, '');

function LinkRow({ link }: { link: PublicLink }): JSX.Element {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);

    const copy = () => {
        navigator.clipboard.writeText(link.url).then(() => {
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
        }).catch(() => { /* the link is shown and can be opened instead */ });
    };

    return (
        <li className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0" aria-hidden>
                {link.icon}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-primary truncate" title={link.hint}>{link.name}</p>
                <p className="text-xs text-muted font-mono truncate" title={link.url}>{displayUrl(link.url)}</p>
            </div>
            <button
                type="button"
                onClick={copy}
                aria-label={copied ? `${link.name} link copied` : `Copy ${link.name} link`}
                title={copied ? 'Copied' : 'Copy link'}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all cursor-pointer active:scale-95 shrink-0 ${
                    copied
                        ? 'bg-success text-white border-success'
                        : 'border-border-subtle text-muted hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-500/40 hover:bg-brand-500/10'
                }`}
            >
                {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${link.name}`}
                title="Open in a new tab"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-500/10 transition-colors shrink-0"
            >
                <ExternalLink size={15} />
            </a>
        </li>
    );
}

/** Dashboard card (admin and viewer) with the public pages and the registration form, to open or copy and share. */
export default function PublicLinksCard({ className = '' }: { className?: string }): JSX.Element {
    const links = publicLinks();
    const titleId = useId();
    return (
        <section aria-labelledby={titleId} className={`bg-surface rounded-2xl border border-border-subtle shadow-card overflow-hidden ${className}`}>
            <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5 border-b border-border-subtle">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-linear-to-br from-indigo-600 to-violet-700 text-white shrink-0" aria-hidden>
                    <Globe size={16} />
                </span>
                <div className="min-w-0">
                    <h2 id={titleId} className="text-sm font-bold text-primary">Links to share</h2>
                    <p className="text-xs text-muted">They open without signing in</p>
                </div>
            </div>
            <ul className="divide-y divide-border-subtle">
                {links.map(link => <LinkRow key={link.key} link={link} />)}
            </ul>
        </section>
    );
}

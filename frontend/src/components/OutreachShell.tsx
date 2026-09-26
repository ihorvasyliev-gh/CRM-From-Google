import { Suspense, useState } from 'react';
import { LogOut, Moon, Sun, Upload, Mail, CheckCircle, X, HelpCircle } from 'lucide-react';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { IconButton } from './ui/Button';
import NetworkStatusIndicator from './ui/NetworkStatusIndicator';
import { GlobalToaster } from './Toast';

const OutreachLists = lazyWithRetry(() => import('./OutreachLists'));

const GUIDE_HIDDEN_KEY = 'outreach_guide_hidden';

const GUIDE_STEPS = [
    { icon: Upload, title: 'Add people', text: 'Import the Excel/CSV export from IRIS, or add someone by hand.' },
    { icon: Mail, title: 'Send the survey', text: 'Tick people and click “Send Email”. Your email app opens with the survey ready to paste.' },
    { icon: CheckCircle, title: 'Answers arrive', text: 'Replies update the status automatically. You can also change a status yourself.' },
];

function readGuideHidden(): boolean {
    try {
        return localStorage.getItem(GUIDE_HIDDEN_KEY) === '1';
    } catch {
        return false;
    }
}

interface OutreachShellProps {
    darkMode: boolean;
    toggleDarkMode: () => void;
    userEmail?: string;
    onSignOut: () => void;
}

/** The whole app for the "outreach" role: External Lists only (migration 65). */
export default function OutreachShell({ darkMode, toggleDarkMode, userEmail, onSignOut }: OutreachShellProps) {
    const [guideHidden, setGuideHidden] = useState(readGuideHidden);
    const toggleGuide = (hidden: boolean) => {
        setGuideHidden(hidden);
        try {
            localStorage.setItem(GUIDE_HIDDEN_KEY, hidden ? '1' : '0');
        } catch {
            // storage unavailable — the choice just isn't remembered
        }
    };

    return (
        <div className="min-h-screen w-full bg-background text-primary flex flex-col">
            <header className="sticky top-0 z-20 h-14 bg-background/85 backdrop-blur-md backdrop-saturate-150 border-b border-border-subtle px-3 sm:px-6 lg:px-8 flex items-center gap-3 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 bg-linear-to-br from-brand-500 via-brand-600 to-violet-500 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs shadow-brand-500/25 ring-1 ring-inset ring-white/15 shrink-0">C</span>
                    <span className="leading-tight min-w-0">
                        <span className="block text-sm font-bold text-primary tracking-tight truncate">External Lists</span>
                        <span className="hidden sm:block text-[11px] text-muted truncate">Track employment status of people on external lists (e.g. Action 11)</span>
                    </span>
                </div>
                <div className="ml-auto flex items-center gap-1 shrink-0">
                    <NetworkStatusIndicator />
                    {guideHidden && (
                        <IconButton label="How it works" onClick={() => toggleGuide(false)}>
                            <HelpCircle size={17} />
                        </IconButton>
                    )}
                    <span className="hidden md:block text-xs text-muted truncate max-w-[220px] mx-1" title={userEmail}>{userEmail}</span>
                    <IconButton label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleDarkMode}>
                        {darkMode ? <Sun size={17} /> : <Moon size={17} />}
                    </IconButton>
                    <IconButton tone="danger" label="Sign out" onClick={onSignOut}>
                        <LogOut size={17} />
                    </IconButton>
                </div>
            </header>

            <main className="flex-1 w-full px-3 pt-3 sm:px-6 sm:pt-5 lg:px-8 lg:pt-6 pb-24">
                {!guideHidden && (
                    <section aria-label="How it works" className="relative mb-4 rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4 pr-10">
                        <button
                            type="button"
                            onClick={() => toggleGuide(true)}
                            aria-label="Hide these tips"
                            title="Hide these tips"
                            className="absolute top-2.5 right-2.5 p-1.5 text-muted hover:text-primary rounded-lg transition-colors"
                        >
                            <X size={15} />
                        </button>
                        <ol className="grid gap-3 sm:grid-cols-3">
                            {GUIDE_STEPS.map(({ icon: Icon, title, text }, i) => (
                                <li key={title} className="flex items-start gap-3">
                                    <span className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                                        <Icon size={16} />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-primary">{i + 1}. {title}</span>
                                        <span className="block text-xs text-muted mt-0.5">{text}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </section>
                )}
                <Suspense fallback={
                    <div className="w-full flex items-center justify-center min-h-[50vh]">
                        <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
                    </div>
                }>
                    <OutreachLists />
                </Suspense>
            </main>

            <GlobalToaster />
        </div>
    );
}

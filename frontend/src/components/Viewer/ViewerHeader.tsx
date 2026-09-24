import { useEffect, useRef, useState } from 'react';
import { ChevronDown, HelpCircle, LogOut, Moon, Rows3, Search, Sun } from 'lucide-react';
import { VIEWER_TABS, type ViewerTab } from './viewerMeta';
import NetworkStatusIndicator from '../ui/NetworkStatusIndicator';
import { useViewerUpcoming } from './useViewerData';
import { daysFromToday } from './viewerUtils';
import { Kbd } from './ViewerUI';

interface ViewerHeaderProps {
    activeTab: ViewerTab;
    onNavigate: (tab: ViewerTab) => void;
    onOpenSearch: () => void;
    onOpenShortcuts: () => void;
    darkMode: boolean;
    toggleDarkMode: () => void;
    density: 'comfortable' | 'compact';
    toggleDensity: () => void;
    userEmail?: string;
    onSignOut: () => void;
}

export default function ViewerHeader({
    activeTab, onNavigate, onOpenSearch, onOpenShortcuts, darkMode, toggleDarkMode, density, toggleDensity, userEmail, onSignOut,
}: ViewerHeaderProps) {
    const { data: upcoming = [] } = useViewerUpcoming();
    const todayCount = upcoming.filter(s => daysFromToday(s.course_date) === 0).length;

    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMenuOpen(false); } };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [menuOpen]);

    const activeLabel = VIEWER_TABS.find(t => t.key === activeTab)?.label;
    const menuItem = 'w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-xs font-medium text-primary hover:bg-surface-elevated transition-colors';

    return (
        <header className="sticky top-0 z-20 h-14 bg-background/85 backdrop-blur-md backdrop-saturate-150 border-b border-border-subtle/60 px-3 sm:px-6 flex items-center gap-3 min-w-0">
            <button type="button" onClick={() => onNavigate('home')} className="flex items-center gap-2.5 shrink-0" aria-label="Home">
                <span className="w-8 h-8 bg-gradient-to-br from-brand-500 via-brand-600 to-violet-500 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-brand-500/25 ring-1 ring-inset ring-white/15">C</span>
                <span className="hidden sm:block text-left leading-tight">
                    <span className="block text-sm font-bold text-primary tracking-tight">Course CRM</span>
                    <span className="block text-[9px] text-muted font-semibold tracking-wide uppercase">Viewer</span>
                </span>
                <span className="sm:hidden text-sm font-bold text-primary">{activeLabel}</span>
            </button>

            {/* Desktop tabs (mobile uses the bottom dock) */}
            <nav aria-label="Main" className="hidden lg:flex items-center gap-1 ml-4 h-full">
                {VIEWER_TABS.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => onNavigate(tab.key)}
                            aria-current={active ? 'page' : undefined}
                            title={`${tab.label} (${tab.shortcut})`}
                            className={`relative h-full flex items-center gap-1.5 px-3 text-sm font-semibold transition-colors ${active ? 'text-primary' : 'text-muted hover:text-primary'}`}
                        >
                            <Icon size={15} className={active ? 'text-brand-500' : ''} />
                            {tab.label}
                            {tab.key === 'home' && todayCount > 0 && (
                                <span className="ml-0.5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold tabular-nums" title={`${todayCount} session(s) today`}>{todayCount}</span>
                            )}
                            {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-brand-500" />}
                        </button>
                    );
                })}
            </nav>

            <div className="flex-1" />

            <button
                type="button"
                onClick={onOpenSearch}
                className="hidden sm:flex items-center gap-2 h-9 pl-3 pr-2 w-56 xl:w-72 bg-surface-elevated hover:bg-surface border border-border-subtle hover:border-brand-500/40 text-muted rounded-xl text-xs font-medium transition-all group"
                title="Search students & courses (Ctrl+K)"
            >
                <Search size={14} className="group-hover:text-brand-500" />
                <span className="flex-1 text-left">Search…</span>
                <Kbd>Ctrl K</Kbd>
            </button>
            <button type="button" onClick={onOpenSearch} className="sm:hidden p-2 text-muted hover:text-primary rounded-lg" aria-label="Search">
                <Search size={18} />
            </button>

            <NetworkStatusIndicator />

            <div className="relative hidden lg:block" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setMenuOpen(o => !o)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Account menu"
                    className={`flex items-center gap-1.5 h-9 pl-1 pr-2 rounded-xl border transition-colors ${menuOpen ? 'bg-surface-elevated border-border-strong' : 'border-transparent hover:bg-surface-elevated hover:border-border-subtle'}`}
                >
                    <span className="w-7 h-7 bg-gradient-to-br from-brand-500 to-violet-500 rounded-full flex items-center justify-center text-white text-[11px] font-bold">
                        {(userEmail?.[0] || 'V').toUpperCase()}
                    </span>
                    <ChevronDown size={14} className={`text-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </button>
                {menuOpen && (
                    <div role="menu" className="absolute right-0 mt-2 w-64 p-1.5 bg-surface border border-border-subtle rounded-2xl shadow-float animate-popoverScaleIn origin-top-right">
                        <div className="px-3 py-2 mb-1 border-b border-border-subtle">
                            <p className="text-xs font-semibold text-primary truncate">{userEmail}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">Viewer access</p>
                        </div>
                        <button role="menuitem" type="button" className={menuItem} onClick={toggleDarkMode}>
                            {darkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-brand-500" />}
                            <span className="flex-1 text-left">{darkMode ? 'Light theme' : 'Dark theme'}</span>
                            <Kbd>Ctrl ⇧ D</Kbd>
                        </button>
                        <button role="menuitem" type="button" className={menuItem} onClick={toggleDensity}>
                            <Rows3 size={15} className="text-brand-500" />
                            <span className="flex-1 text-left">{density === 'compact' ? 'Comfortable view' : 'Compact view'}</span>
                            <Kbd>Ctrl ⇧ C</Kbd>
                        </button>
                        <button role="menuitem" type="button" className={menuItem} onClick={() => { setMenuOpen(false); onOpenShortcuts(); }}>
                            <HelpCircle size={15} className="text-muted" />
                            <span className="flex-1 text-left">Keyboard shortcuts</span>
                            <Kbd>?</Kbd>
                        </button>
                        <div className="my-1 border-t border-border-subtle" />
                        <button role="menuitem" type="button" className={`${menuItem} text-red-600 dark:text-status-rejected hover:bg-danger/10`} onClick={onSignOut}>
                            <LogOut size={15} />
                            <span className="flex-1 text-left">Sign out</span>
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}

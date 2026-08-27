import { Keyboard, X, Sparkles } from 'lucide-react';

interface Props {
    open: boolean;
    onClose: () => void;
}

interface ShortcutCategory {
    title: string;
    shortcuts: Array<{
        keys: string[];
        description: string;
    }>;
}

export default function KeyboardShortcutsModal({ open, onClose }: Props) {
    if (!open) return null;

    const categories: ShortcutCategory[] = [
        {
            title: 'Global & Navigation',
            shortcuts: [
                { keys: ['Ctrl', 'K'], description: 'Open Command Palette & Omnisearch' },
                { keys: ['1', '–', '8'], description: 'Jump to CRM sections (Dashboard, Students...)' },
                { keys: ['/'], description: 'Focus search bar in current view' },
                { keys: ['?'], description: 'Open Keyboard Shortcuts cheat sheet' },
                { keys: ['Esc'], description: 'Close any active modal or search' },
            ],
        },
        {
            title: 'Quick Actions & Preferences',
            shortcuts: [
                { keys: ['N'], description: 'Add new student or course' },
                { keys: ['Ctrl', 'Shift', 'D'], description: 'Toggle Theme (Dark / Light)' },
                { keys: ['Ctrl', 'Shift', 'C'], description: 'Toggle Density (Compact / Comfortable)' },
            ],
        },
        {
            title: 'Rosters & Data Operations',
            shortcuts: [
                { keys: ['Click', 'Field'], description: '1-click copy Name, Email, Phone, Address' },
                { keys: ['BCC', 'Copy'], description: 'Copy all selected emails formatted for email client' },
                { keys: ['Drag & Drop'], description: 'Drag student card between status columns' },
            ],
        },
    ];

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fadeIn">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-background/70 backdrop-blur-md transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col animate-scaleIn">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/50">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center">
                            <Keyboard size={18} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-primary">Keyboard Shortcuts</h2>
                            <p className="text-xs text-muted">Boost productivity with quick hotkeys</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {categories.map(cat => (
                        <div key={cat.title} className="space-y-2.5">
                            <h3 className="text-xs font-bold text-muted uppercase tracking-wider">
                                {cat.title}
                            </h3>
                            <div className="space-y-1.5">
                                {cat.shortcuts.map((sc, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-2 rounded-xl bg-surface/40 hover:bg-surface/80 transition-colors"
                                    >
                                        <span className="text-xs font-medium text-primary pr-3">
                                            {sc.description}
                                        </span>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {sc.keys.map((k, kIdx) => (
                                                <kbd
                                                    key={kIdx}
                                                    className="px-2 py-0.5 text-[11px] font-mono font-bold text-primary bg-surface border border-border-subtle rounded-md shadow-xs"
                                                >
                                                    {k}
                                                </kbd>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-surface/60 border-t border-border-subtle flex items-center justify-between text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                        <Sparkles size={14} className="text-brand-500" />
                        Press <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-[10px] font-bold">?</kbd> anywhere to open
                    </span>
                    <button
                        onClick={onClose}
                        className="px-3 py-1 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg text-xs transition-colors"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}

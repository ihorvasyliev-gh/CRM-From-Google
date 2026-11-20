// Floating bulk action bar shared by Outcomes (CRM Graduates) and External Lists (OutreachLists).
import { useState, useEffect } from 'react';
import { ChevronDown, Clock, Copy, Loader2, Mail, X } from 'lucide-react';

const actionCls = 'inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-lg text-[12px] font-semibold text-white leading-none whitespace-nowrap transition-colors shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50 disabled:cursor-not-allowed';

export interface BulkSelectedItem {
    id: string;
    name: string;
    subtitle?: string;
}

export interface OutcomeBulkBarProps {
    selectedItems: BulkSelectedItem[];
    busy?: boolean;
    busyLabel?: string;
    onCopyEmails: () => void;
    onMarkPending: () => void;
    onSendSurvey: () => void;
    onDeselect: (id: string) => void;
    onClear: () => void;
}

export default function OutcomeBulkBar({
    selectedItems,
    busy = false,
    busyLabel,
    onCopyEmails,
    onMarkPending,
    onSendSurvey,
    onDeselect,
    onClear,
}: OutcomeBulkBarProps) {
    const [showList, setShowList] = useState(false);

    useEffect(() => {
        if (selectedItems.length === 0) setShowList(false);
    }, [selectedItems.length]);

    if (selectedItems.length === 0) return null;

    return (
        <div className="fixed bottom-[max(calc(env(safe-area-inset-bottom)+4.25rem),4.25rem)] lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 animate-slideUpCenter">
            {showList && (
                <div className="bg-surface border border-border-subtle rounded-xl shadow-float w-72 sm:w-80 max-h-64 flex flex-col overflow-hidden animate-slideUp">
                    <div className="px-4 py-3 border-b border-border-subtle flex justify-between items-center bg-surface">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">
                            Selected ({selectedItems.length})
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowList(false)}
                            aria-label="Close selected list"
                            className="text-muted hover:text-primary transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="overflow-y-auto p-1.5 flex-1 space-y-0.5 min-h-0">
                        {selectedItems.map(item => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-elevated rounded-lg group transition-colors"
                            >
                                <div className="min-w-0">
                                    <div className="text-[13px] font-semibold text-primary truncate">{item.name}</div>
                                    {item.subtitle && (
                                        <div className="text-[11px] text-muted truncate">{item.subtitle}</div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onDeselect(item.id)}
                                    disabled={busy}
                                    className="text-muted sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 hover:text-status-rejected hover:bg-danger/10 transition-all p-1 rounded-md shrink-0 disabled:opacity-50"
                                    aria-label={`Deselect ${item.name}`}
                                    title="Deselect"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="glass-dark rounded-2xl shadow-float px-3.5 sm:px-4 py-2.5 flex flex-wrap justify-center items-center gap-1.5 w-[calc(100vw-2rem)] sm:w-auto max-w-[520px] sm:max-w-none">
                <button
                    type="button"
                    onClick={() => setShowList(prev => !prev)}
                    aria-expanded={showList}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-white leading-none rounded-lg transition-colors whitespace-nowrap ${
                        showList ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'
                    }`}
                    title="View selected list"
                >
                    {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                    <span className="font-mono">{selectedItems.length}</span>
                    <span className="font-medium text-white/70">{busy ? (busyLabel || 'working…') : 'selected'}</span>
                    <ChevronDown
                        size={12}
                        className={`transition-transform ${showList ? 'rotate-180' : ''} opacity-70`}
                        aria-hidden="true"
                    />
                </button>

                <div className="w-px h-5 bg-white/15 mx-0.5" />

                <button
                    type="button"
                    onClick={onCopyEmails}
                    disabled={busy}
                    aria-label="Copy Emails"
                    title="Copy eligible emails (BCC)"
                    className={`${actionCls} bg-white/10 hover:bg-white/20`}
                >
                    <Copy size={13} />
                    <span className="hidden sm:inline">Copy Emails</span>
                    <span className="inline sm:hidden">Emails</span>
                </button>

                <button
                    type="button"
                    onClick={onMarkPending}
                    disabled={busy}
                    title="Mark as Pending without opening an email draft"
                    className={`${actionCls} bg-white/10 hover:bg-white/20`}
                >
                    <Clock size={13} />
                    <span>Mark Pending</span>
                </button>

                <button
                    type="button"
                    onClick={onSendSurvey}
                    disabled={busy}
                    className={`${actionCls} bg-brand-500 hover:bg-brand-600`}
                >
                    {busy ? (
                        <><Loader2 size={13} className="animate-spin" /> {busyLabel || 'Working…'}</>
                    ) : (
                        <>
                            <Mail size={13} />
                            <span className="hidden sm:inline">Send Email & Move to Pending</span>
                            <span className="inline sm:hidden">Send Email</span>
                        </>
                    )}
                </button>

                <div className="w-px h-5 bg-white/15 mx-0.5" />

                <button
                    type="button"
                    onClick={onClear}
                    disabled={busy}
                    aria-label="Clear selection"
                    title="Clear selection"
                    className="text-white/60 hover:text-white transition-all p-1.5 hover:bg-white/10 rounded-lg disabled:opacity-50"
                >
                    <X size={15} />
                </button>
            </div>
        </div>
    );
}

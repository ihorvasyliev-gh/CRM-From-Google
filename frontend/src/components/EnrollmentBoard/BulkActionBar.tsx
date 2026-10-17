import { useState } from 'react';
import { Copy, Clock, Send, BellRing, CheckCircle, GraduationCap, Ban, FileArchive, Trash2, X, MoreHorizontal } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';
import Menu, { type MenuItem } from '../ui/Menu';
import { fittingActions } from './bulkActions';
import type { EnrollmentStatus } from '../../lib/types';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

const actionCls = 'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-semibold text-white leading-none whitespace-nowrap transition-colors shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/60';

interface BulkActionBarProps {
    selectedCount: number;
    selectedEnrollments: EnrollmentRow[];
    handleCopySelectedEmails: () => void;
    bulkUpdateStatus: (status: EnrollmentStatus) => void;
    /** Opens the document generation dialog for the selection. */
    handleGenerateDocuments: () => void;
    sendReminder: () => void;
    setBulkDeleteOpen: (open: boolean) => void;
    clearSelection: () => void;
    toggleSelect: (id: string) => void;
}

export default function BulkActionBar({
    selectedCount,
    selectedEnrollments,
    handleCopySelectedEmails,
    bulkUpdateStatus,
    handleGenerateDocuments,
    sendReminder,
    setBulkDeleteOpen,
    clearSelection,
    toggleSelect
}: BulkActionBarProps) {
    const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
    const [showList, setShowList] = useState(false);

    if (selectedCount === 0) return null;

    const fits = fittingActions(new Set(selectedEnrollments.map(e => e.status)));
    const moreItems: MenuItem[] = [
        ...(fits.backToRequested ? [{ label: 'Back to requested', icon: <Clock size={14} />, onSelect: () => bulkUpdateStatus('requested') }] : []),
        ...(fits.reject ? [{ label: 'Reject…', icon: <Ban size={14} />, onSelect: () => setConfirmRejectOpen(true), tone: 'danger' as const }] : []),
        { label: 'Delete…', icon: <Trash2 size={14} />, onSelect: () => setBulkDeleteOpen(true), tone: 'danger' },
    ];

    return (
        <>
        <div className="fixed bottom-[max(calc(env(safe-area-inset-bottom)+4.25rem),4.25rem)] lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 animate-slideUpCenter">
            
            {showList && (
                <div className="bg-surface border border-border-subtle rounded-xl shadow-float w-72 max-h-64 flex flex-col overflow-hidden animate-slideUp">
                    <div className="px-4 py-3 border-b border-border-subtle flex justify-between items-center bg-surface">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">Selected Students ({selectedCount})</span>
                        <button type="button" onClick={() => setShowList(false)} aria-label="Close the list" className="text-muted hover:text-primary transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="overflow-y-auto p-1.5 flex-1 space-y-0.5 min-h-0">
                        {selectedEnrollments.map((e: EnrollmentRow) => (
                            <div key={e.id} className="flex items-center justify-between px-3 py-2 hover:bg-surface rounded-lg group transition-colors">
                                <span className="text-[13px] font-semibold text-primary truncate pr-2">
                                    {e.students?.first_name} {e.students?.last_name}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => toggleSelect(e.id)}
                                    className="text-muted sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500 hover:bg-danger/10 transition-all p-1 rounded-md"
                                    aria-label={`Deselect ${e.students?.first_name ?? ''} ${e.students?.last_name ?? ''}`.trim()}
                                    title="Deselect"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="glass-dark rounded-2xl shadow-float px-4 py-2.5 flex flex-wrap justify-center items-center gap-1.5 w-[calc(100vw-2rem)] sm:w-auto max-w-[450px] sm:max-w-none">
                <button
                    type="button"
                    onClick={() => setShowList(!showList)}
                    aria-expanded={showList}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-white leading-none rounded-lg transition-colors whitespace-nowrap ${showList ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
                    title="View selected list"
                >
                    <span className="font-mono">{selectedCount}</span>
                    <span className="font-medium text-white/70">selected</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`transition-transform ${showList ? 'rotate-180' : ''} opacity-60`}>
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>


                <div className="w-px h-5 bg-white/10 ml-0.5" />

                <button type="button" onClick={handleCopySelectedEmails} aria-label="Copy emails (BCC)" title="Copy emails (BCC)" className={`${actionCls} bg-white/10 hover:bg-white/20`}>
                    <Copy size={14} />
                    <span className="hidden sm:inline">Emails</span>
                </button>

                {fits.invite && (
                    <button type="button" onClick={() => bulkUpdateStatus('invited')} className={`${actionCls} bg-blue-500 hover:bg-blue-600`}>
                        <Send size={14} /> Invite
                    </button>
                )}
                {fits.remind && (
                    <button type="button" onClick={sendReminder} title="Send a reminder to the confirmed ones" className={`${actionCls} bg-sky-500 hover:bg-sky-600`}>
                        <BellRing size={14} /> Remind
                    </button>
                )}
                {fits.confirm && (
                    <button type="button" onClick={() => bulkUpdateStatus('confirmed')} className={`${actionCls} bg-emerald-500 hover:bg-emerald-600`}>
                        <CheckCircle size={14} /> Confirm
                    </button>
                )}
                {fits.complete && (
                    <button type="button" onClick={() => bulkUpdateStatus('completed')} className={`${actionCls} bg-teal-500 hover:bg-teal-600`}>
                        <GraduationCap size={14} /> Complete
                    </button>
                )}

                <div className="w-px h-5 bg-white/10" />

                <button type="button" onClick={handleGenerateDocuments} aria-label="Generate documents" title="Generate documents" className={`${actionCls} bg-white/10 hover:bg-white/20`}>
                    <FileArchive size={14} />
                    <span className="hidden sm:inline">Docs</span>
                </button>

                <Menu label="More actions" placement="top" items={moreItems} triggerClassName={`${actionCls} bg-white/10 hover:bg-white/20`}>
                    <MoreHorizontal size={14} />
                    <span className="hidden sm:inline">More</span>
                </Menu>

                <div className="w-px h-5 bg-white/10" />

                <button
                    type="button"
                    onClick={clearSelection}
                    aria-label="Clear selection"
                    title="Clear selection"
                    className="text-white/60 hover:text-white transition-all p-1.5 hover:bg-white/10 rounded-lg"
                >
                    <X size={15} />
                </button>
            </div>
        </div>

            <ConfirmDialog
                open={confirmRejectOpen}
                title="Reject Selected Enrollments"
                message={`Are you sure you want to reject ${selectedCount} selected enrollment(s)?`}
                confirmLabel="Reject"
                onConfirm={() => { bulkUpdateStatus('rejected'); setConfirmRejectOpen(false); }}
                onCancel={() => setConfirmRejectOpen(false)}
            />
        </>
    );
}

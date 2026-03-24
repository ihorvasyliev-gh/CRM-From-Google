import { useState } from 'react';
import { Copy, Clock, Send, CheckCircle, GraduationCap, Ban, Loader2, FileArchive, Trash2, X } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';
import { CustomTooltip } from '../ui/Tooltip';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

interface BulkActionBarProps {
    selectedCount: number;
    selectedEnrollments: EnrollmentRow[];
    generatingDocs: boolean;
    handleCopySelectedEmails: () => void;
    bulkUpdateStatus: (status: string) => void;
    handleGenerateDocuments: () => void;
    setBulkDeleteOpen: (open: boolean) => void;
    clearSelection: () => void;
    toggleSelect: (id: string) => void;
}

export default function BulkActionBar({
    selectedCount,
    selectedEnrollments,
    generatingDocs,
    handleCopySelectedEmails,
    bulkUpdateStatus,
    handleGenerateDocuments,
    setBulkDeleteOpen,
    clearSelection,
    toggleSelect
}: BulkActionBarProps) {
    const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
    const [showList, setShowList] = useState(false);

    if (selectedCount === 0) return null;

    return (
        <>
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 animate-slideUp">
            
            {showList && (
                <div className="bg-surface-elevated border border-border-subtle rounded-xl shadow-float w-72 max-h-64 flex flex-col overflow-hidden animate-slideUp">
                    <div className="px-4 py-3 border-b border-border-subtle flex justify-between items-center bg-surface">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">Selected Students ({selectedCount})</span>
                        <button onClick={() => setShowList(false)} className="text-muted hover:text-primary transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="overflow-y-auto p-1.5 flex-1 space-y-0.5 min-h-0">
                        {selectedEnrollments.map((e: EnrollmentRow) => (
                            <div key={e.id} className="flex items-center justify-between px-3 py-2 hover:bg-surface-100 rounded-lg group transition-colors">
                                <span className="text-[13px] font-semibold text-primary truncate pr-2">
                                    {e.students?.first_name} {e.students?.last_name}
                                </span>
                                <button 
                                    onClick={() => toggleSelect(e.id)}
                                    className="text-muted opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all p-1 rounded-md"
                                    title="Deselect"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="glass-dark rounded-2xl shadow-float px-4 py-2.5 flex items-center gap-1.5">
                <button 
                    onClick={() => setShowList(!showList)}
                    className={`flex items-center justify-center px-3 py-1.5 text-[13px] font-bold text-white max-w-[40px] leading-none rounded-lg transition-colors ${showList ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
                    title="View selected list"
                >
                    {selectedCount}
                </button>

                <div className="w-px h-5 bg-white/10 ml-0.5" />

                <CustomTooltip content="Copy Emails">
                    <button
                        onClick={handleCopySelectedEmails}
                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
                    >
                        <Copy size={15} />
                    </button>
                </CustomTooltip>

                <CustomTooltip content="Requested">
                    <button
                        onClick={() => bulkUpdateStatus('requested')}
                        className="p-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-sm"
                    >
                        <Clock size={15} />
                    </button>
                </CustomTooltip>

                <CustomTooltip content="Invite">
                    <button
                        onClick={() => bulkUpdateStatus('invited')}
                        className="p-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-all shadow-sm"
                    >
                        <Send size={15} />
                    </button>
                </CustomTooltip>

                <CustomTooltip content="Confirm">
                    <button
                        onClick={() => bulkUpdateStatus('confirmed')}
                        className="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-sm"
                    >
                        <CheckCircle size={15} />
                    </button>
                </CustomTooltip>

                <CustomTooltip content="Complete">
                    <button
                        onClick={() => bulkUpdateStatus('completed')}
                        className="p-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white transition-all shadow-sm"
                    >
                        <GraduationCap size={15} />
                    </button>
                </CustomTooltip>

                <div className="w-px h-5 bg-white/10" />

                <CustomTooltip content="Rejected">
                    <button
                        onClick={() => setConfirmRejectOpen(true)}
                        className="p-2 rounded-lg bg-red-500/80 hover:bg-red-600 text-white transition-all shadow-sm"
                    >
                        <Ban size={15} />
                    </button>
                </CustomTooltip>

                <div className="w-px h-5 bg-white/10" />

                <CustomTooltip content="Generate Docs">
                    <button
                        onClick={handleGenerateDocuments}
                        disabled={generatingDocs}
                        className={`p-2 rounded-lg ${generatingDocs ? 'bg-amber-500/50 cursor-wait' : 'bg-amber-500 hover:bg-amber-600'} text-white transition-all shadow-sm`}
                    >
                        {generatingDocs ? <Loader2 size={15} className="animate-spin" /> : <FileArchive size={15} />}
                    </button>
                </CustomTooltip>

                <CustomTooltip content="Delete Selected">
                    <button
                        onClick={() => setBulkDeleteOpen(true)}
                        className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all shadow-sm"
                    >
                        <Trash2 size={15} />
                    </button>
                </CustomTooltip>

                <div className="w-px h-5 bg-white/10" />

                <CustomTooltip content="Clear Selection">
                    <button
                        onClick={clearSelection}
                        className="text-white/50 hover:text-white transition-all p-1.5 hover:bg-white/10 rounded-lg"
                    >
                        <X size={15} />
                    </button>
                </CustomTooltip>
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

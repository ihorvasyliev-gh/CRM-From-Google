import { Copy, Clock, Send, CheckCircle, GraduationCap, Ban, Loader2, FileArchive, Trash2, X } from 'lucide-react';

interface BulkActionBarProps {
    selectedCount: number;
    generatingDocs: boolean;
    handleCopySelectedEmails: () => void;
    bulkUpdateStatus: (status: string) => void;
    handleGenerateDocuments: () => void;
    setBulkDeleteOpen: (open: boolean) => void;
    clearSelection: () => void;
}

export default function BulkActionBar({
    selectedCount,
    generatingDocs,
    handleCopySelectedEmails,
    bulkUpdateStatus,
    handleGenerateDocuments,
    setBulkDeleteOpen,
    clearSelection
}: BulkActionBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slideUp">
            <div className="glass-dark rounded-2xl shadow-float px-4 py-2.5 flex items-center gap-1.5">
                <span className="text-xs font-semibold text-white mr-1">
                    {selectedCount}
                </span>

                <div className="w-px h-5 bg-white/10" />

                <button
                    onClick={handleCopySelectedEmails}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
                    title="Copy Emails"
                >
                    <Copy size={15} />
                </button>

                <button
                    onClick={() => bulkUpdateStatus('requested')}
                    className="p-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-sm"
                    title="Requested"
                >
                    <Clock size={15} />
                </button>

                <button
                    onClick={() => bulkUpdateStatus('invited')}
                    className="p-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-all shadow-sm"
                    title="Invite"
                >
                    <Send size={15} />
                </button>

                <button
                    onClick={() => bulkUpdateStatus('confirmed')}
                    className="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-sm"
                    title="Confirm"
                >
                    <CheckCircle size={15} />
                </button>

                <button
                    onClick={() => bulkUpdateStatus('completed')}
                    className="p-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white transition-all shadow-sm"
                    title="Complete"
                >
                    <GraduationCap size={15} />
                </button>

                <div className="w-px h-5 bg-white/10" />

                <button
                    onClick={() => bulkUpdateStatus('rejected')}
                    className="p-2 rounded-lg bg-red-500/80 hover:bg-red-600 text-white transition-all shadow-sm"
                    title="Rejected"
                >
                    <Ban size={15} />
                </button>

                <div className="w-px h-5 bg-white/10" />

                <button
                    onClick={handleGenerateDocuments}
                    disabled={generatingDocs}
                    className={`p-2 rounded-lg ${generatingDocs ? 'bg-amber-500/50 cursor-wait' : 'bg-amber-500 hover:bg-amber-600'} text-white transition-all shadow-sm`}
                    title="Generate Docs"
                >
                    {generatingDocs ? <Loader2 size={15} className="animate-spin" /> : <FileArchive size={15} />}
                </button>

                <button
                    onClick={() => setBulkDeleteOpen(true)}
                    className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all shadow-sm"
                    title="Delete Selected"
                >
                    <Trash2 size={15} />
                </button>

                <div className="w-px h-5 bg-white/10" />

                <button
                    onClick={clearSelection}
                    className="text-white/50 hover:text-white transition-all p-1.5 hover:bg-white/10 rounded-lg"
                    title="Clear Selection"
                >
                    <X size={15} />
                </button>
            </div>
        </div>
    );
}

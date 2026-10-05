import { FileText } from 'lucide-react';

interface EditNoteModalProps {
    open: boolean;
    text: string;
    onTextChange: (text: string) => void;
    onSave: () => void;
    onClose: () => void;
}

/** Edits the note of one enrollment. */
export default function EditNoteModal({ open, text, onTextChange, onSave, onClose }: EditNoteModalProps) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fadeIn" onClick={() => onClose()}>
            <div
                className="bg-surface rounded-2xl shadow-float border border-border-subtle p-6 w-full max-w-sm mx-4 animate-scaleIn"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 bg-brand-500/10 rounded-xl text-brand-600 dark:text-brand-400">
                        <FileText size={22} />
                    </div>
                    <div>
                        <h3 className="font-bold text-primary">Enrollment Note</h3>
                        <p className="text-xs text-muted mt-0.5">
                            Add or edit note for this student
                        </p>
                    </div>
                </div>

                <textarea
                    id="edit-note"
                    name="editNote"
                    value={text}
                    onChange={e => onTextChange(e.target.value)}
                    placeholder="Enter note here..."
                    onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            onSave();
                        }
                    }}
                    className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm text-primary focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 bg-surface min-h-[120px] resize-none"
                    autoFocus
                />
                <p className="text-[10px] text-muted mt-1.5 text-right">Ctrl + Enter to save</p>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={() => onClose()}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-muted hover:text-primary bg-surface-elevated hover:bg-surface border border-border-subtle rounded-xl transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-xs"
                    >
                        Save Note
                    </button>
                </div>
            </div>
        </div>
    );
}

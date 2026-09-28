import { AlertTriangle, CheckCircle2, FileUp, MoveRight, PlusCircle, XCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { calloutCls } from '../ui/styles';
import type { AnchorStatus, ReanchorResult } from '../../lib/pdfForms/reanchor';

const STATUS: Record<AnchorStatus, { label: string; icon: typeof CheckCircle2; cls: string }> = {
    same: { label: 'Unchanged', icon: CheckCircle2, cls: 'text-status-confirmed' },
    moved: { label: 'Moved with the form', icon: MoveRight, cls: 'text-status-invited' },
    check: { label: 'Check the position', icon: AlertTriangle, cls: 'text-status-requested' },
    missing: { label: 'Not found', icon: XCircle, cls: 'text-status-rejected' },
};

interface RevisionModalProps {
    revision: ReanchorResult | null;
    fileName: string;
    onCancel: () => void;
    onApply: () => void;
}

/** What happened to each field when moving them onto a new revision of the PDF */
export default function RevisionModal({ revision, fileName, onCancel, onApply }: RevisionModalProps) {
    const counts = { same: 0, moved: 0, check: 0, missing: 0 } as Record<AnchorStatus, number>;
    revision?.items.forEach(i => counts[i.status]++);
    const problems = revision?.items.filter(i => i.status === 'check' || i.status === 'missing') ?? [];

    return (
        <Modal
            open={!!revision}
            onClose={onCancel}
            title="New revision of the PDF"
            subtitle={fileName}
            icon={FileUp}
            size="xl"
            footer={
                <>
                    <Button variant="ghost" onClick={onCancel}>Cancel</Button>
                    <Button variant="primary" onClick={onApply}>Use the new PDF</Button>
                </>
            }
        >
            {revision && (
                <div className="space-y-4">
                    <p className="text-sm text-muted">
                        Fields follow the text around them, so they move with the form when lines are added or reworded.
                        Nothing is saved until you click Save in the editor.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(Object.keys(STATUS) as AnchorStatus[]).map(s => {
                            const { label, icon: Icon, cls } = STATUS[s];
                            return (
                                <div key={s} className="rounded-xl border border-border-subtle p-3">
                                    <Icon size={16} className={cls} />
                                    <p className="text-lg font-bold text-primary tabular-nums mt-1">{counts[s]}</p>
                                    <p className="text-[11px] text-muted">{label}</p>
                                </div>
                            );
                        })}
                    </div>
                    {problems.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-primary mb-1.5">Look at these after applying (they are marked in the editor):</p>
                            <ul className="rounded-xl border border-border-subtle divide-y divide-border-subtle max-h-64 overflow-y-auto">
                                {problems.map(i => {
                                    const { icon: Icon, cls } = STATUS[i.status];
                                    return (
                                        <li key={`${i.fieldId}-${i.optionId ?? ''}`} className="flex items-start gap-2 px-3 py-2 text-xs">
                                            <Icon size={14} className={`${cls} shrink-0 mt-0.5`} />
                                            <span className="min-w-0">
                                                <span className="block font-medium text-primary break-words">{i.name}</span>
                                                {i.note && <span className="block text-muted">{i.note}</span>}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                    {revision.newCheckboxes.length > 0 && (
                        <div className={`${calloutCls.info} p-3 text-xs`}>
                            <p className="font-semibold flex items-center gap-1.5 mb-1">
                                <PlusCircle size={14} /> New checkboxes in this revision ({revision.newCheckboxes.length})
                            </p>
                            <p className="text-muted mb-1.5">Add them to a checkbox field if the spreadsheet has answers for them.</p>
                            <p className="break-words">{revision.newCheckboxes.map(c => c.label || '(no label)').join(' · ')}</p>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}

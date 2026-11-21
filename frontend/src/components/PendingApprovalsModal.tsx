import { useEffect, useState } from 'react';
import { usePendingApprovalsList, useApproveCompletion, useRejectCompletion } from '../hooks/useApprovals';
import { PendingCompletionRequest, cleanVariant } from '../lib/types';
import { notify } from '../lib/toast';
import DialogLayer from './ui/DialogLayer';
import ConfirmDialog from './ConfirmDialog';
import { ErrorState } from './ui/States';
import { formatDisplayDate } from '../lib/dateUtils';
import {
    X, CheckCircle, XCircle, Clock, GraduationCap,
    Calendar, CheckSquare, Square, Loader2, AlertCircle
} from 'lucide-react';
import { errorMessage } from '../lib/errors';

interface PendingApprovalsModalProps {
    open: boolean;
    onClose: () => void;
}

function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    // Date-only values must not shift a day in negative UTC offsets
    return formatDisplayDate(dateStr) || dateStr;
}

function formatDateTime(dateTimeStr: string | null | undefined) {
    if (!dateTimeStr) return null;
    try {
        const d = new Date(dateTimeStr);
        return `${formatDisplayDate(dateTimeStr)} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
        return dateTimeStr;
    }
}

export default function PendingApprovalsModal({ open, onClose }: PendingApprovalsModalProps) {
    const { data: pendingList = [], isLoading, error, refetch } = usePendingApprovalsList(open);
    const approveMutation = useApproveCompletion();
    const rejectMutation = useRejectCompletion();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // One request (its Reject button) or the whole selection
    const [rejectionTargets, setRejectionTargets] = useState<string[] | null>(null);
    const [rejectionReason, setRejectionReason] = useState<string>('');
    // Approving is not undoable, so a batch approval asks first
    const [batchToConfirm, setBatchToConfirm] = useState<string[] | null>(null);

    // Forget selections for requests that are no longer pending (approved elsewhere, list refreshed)
    useEffect(() => {
        setSelectedIds(prev => {
            const live = new Set(pendingList.map(p => p.enrollment_id));
            const next = new Set([...prev].filter(id => live.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [pendingList]);

    const isAllSelected = pendingList.length > 0 && pendingList.every(p => selectedIds.has(p.enrollment_id));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(pendingList.map(p => p.enrollment_id)));
        }
    };

    const toggleSelectItem = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleApproveSingle = async (item: PendingCompletionRequest) => {
        try {
            await approveMutation.mutateAsync({ enrollmentIds: [item.enrollment_id] });
            notify({
                message: `Approved course completion for ${item.student_name} (${item.course_name})`,
                type: 'success',
            });
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(item.enrollment_id);
                return next;
            });
            refetch();
        } catch (err) {
            notify({ message: errorMessage(err, 'Failed to approve request'), type: 'error' });
        }
    };

    const handleApproveBatch = async (ids: string[]) => {
        if (ids.length === 0) return;
        try {
            await approveMutation.mutateAsync({ enrollmentIds: ids });
            notify({
                message: `Approved ${ids.length} course completion(s)`,
                type: 'success',
            });
            setSelectedIds(new Set());
            refetch();
        } catch (err) {
            notify({ message: errorMessage(err, 'Failed to approve requests'), type: 'error' });
        }
    };

    const handleReject = async () => {
        if (!rejectionTargets?.length) return;
        const ids = rejectionTargets;
        try {
            await rejectMutation.mutateAsync({
                enrollmentIds: ids,
                reason: rejectionReason.trim() || undefined,
            });
            notify({
                message: ids.length === 1 ? 'Completion request rejected' : `Rejected ${ids.length} completion requests`,
                type: 'info',
            });
            setRejectionTargets(null);
            setRejectionReason('');
            setSelectedIds(prev => {
                const next = new Set(prev);
                ids.forEach(id => next.delete(id));
                return next;
            });
            refetch();
        } catch (err) {
            notify({ message: errorMessage(err, 'Failed to reject request'), type: 'error' });
        }
    };

    return (
        <>
            <DialogLayer
                open={open}
                onClose={onClose}
                label="Pending approvals"
                className="z-50 flex items-center justify-center p-3 sm:p-6"
                backdropClassName="bg-background/80 backdrop-blur-xs"
                panelClassName="bg-surface rounded-3xl border border-border-subtle shadow-card max-w-4xl w-full max-h-[90dvh] flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-border-subtle flex items-start sm:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 bg-amber-500/10 text-status-requested rounded-2xl flex items-center justify-center">
                            <Clock size={22} className="animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-base sm:text-lg font-bold text-primary tracking-tight">
                                    Pending Course Completions
                                </h2>
                                <span className="text-xs font-bold text-status-requested bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                    {isLoading ? 'Loading…' : `${pendingList.length} pending`}
                                </span>
                            </div>
                            <p className="text-xs text-muted">
                                Review course completion requests submitted by viewers
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="p-2 text-muted hover:text-primary hover:bg-surface-elevated rounded-xl transition-all"
                        title="Close modal"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Batch Action Toolbar */}
                {pendingList.length > 0 && (
                    <div className="px-4 sm:px-5 py-3 border-b border-border-subtle/70 bg-surface-elevated/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={toggleSelectAll}
                            aria-pressed={isAllSelected}
                            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-brand-500 transition-colors"
                        >
                            {isAllSelected ? <CheckSquare size={16} className="text-brand-500" /> : <Square size={16} />}
                            <span>Select All ({pendingList.length})</span>
                        </button>

                        <div className="flex items-center gap-2">
                            {selectedIds.size > 0 ? (
                                <>
                                <button
                                    onClick={() => { setRejectionTargets(Array.from(selectedIds)); setRejectionReason(''); }}
                                    disabled={approveMutation.isPending || rejectMutation.isPending}
                                    className="px-3.5 py-1.5 text-xs font-semibold text-status-rejected bg-danger/10 hover:bg-danger/20 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <XCircle size={14} />
                                    <span>Reject Selected ({selectedIds.size})</span>
                                </button>
                                <button
                                    onClick={() => setBatchToConfirm(Array.from(selectedIds))}
                                    disabled={approveMutation.isPending}
                                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                                >
                                    {approveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                                    <span>Approve Selected ({selectedIds.size})</span>
                                </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setBatchToConfirm(pendingList.map(p => p.enrollment_id))}
                                    disabled={approveMutation.isPending}
                                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                                >
                                    {approveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <GraduationCap size={14} />}
                                    <span>Approve All ({pendingList.length})</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Content List */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
                            <Loader2 size={32} className="animate-spin text-brand-500" />
                            <span className="text-xs font-semibold">Loading pending approvals...</span>
                        </div>
                    ) : error ? (
                        <ErrorState title="Couldn't load the requests" error={error} onRetry={() => refetch()} />
                    ) : pendingList.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="w-14 h-14 bg-emerald-500/10 text-status-confirmed rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <CheckCircle size={28} />
                            </div>
                            <h3 className="text-base font-bold text-primary">All caught up!</h3>
                            <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                                There are no pending course completion requests waiting for approval.
                            </p>
                        </div>
                    ) : (
                        pendingList.map(item => {
                            const isSelected = selectedIds.has(item.enrollment_id);
                            return (
                                <div
                                    key={item.enrollment_id}
                                    className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                                        isSelected
                                            ? 'bg-brand-500/5 border-brand-500 shadow-xs'
                                            : 'bg-surface border-border-subtle hover:border-border-strong'
                                    }`}
                                >
                                    {/* Left: Checkbox + Student details */}
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                        <button
                                            type="button"
                                            onClick={() => toggleSelectItem(item.enrollment_id)}
                                            aria-pressed={isSelected}
                                            aria-label={`Select ${item.student_name}`}
                                            className="mt-1 text-muted hover:text-brand-500 transition-colors shrink-0"
                                        >
                                            {isSelected ? <CheckSquare size={18} className="text-brand-500" /> : <Square size={18} />}
                                        </button>

                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="font-bold text-primary text-sm">
                                                    {item.student_name}
                                                </h4>
                                                <span className="text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md">
                                                    {item.course_name}
                                                </span>
                                                {item.course_variant && (
                                                    <span className="text-xs bg-surface-elevated text-muted px-1.5 py-0.5 rounded-sm border border-border-subtle">
                                                        {cleanVariant(item.course_name, item.course_variant)}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                                                <span>{item.student_email}</span>
                                                {item.student_phone && <span>• <a href={`tel:${item.student_phone.replace(/[^\d+]/g, '')}`} className="hover:text-brand-500 underline-offset-2 hover:underline">{item.student_phone}</a></span>}
                                            </div>

                                            {/* Request Info Bar */}
                                            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                                                <span className="text-status-confirmed font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                                                    <Calendar size={12} />
                                                    Requested Completion Date: <strong>{formatDate(item.pending_completion_date)}</strong>
                                                </span>
                                                <span className="text-muted">
                                                    Submitted by: <strong className="text-primary font-medium">{item.completion_requested_by || 'Viewer'}</strong> on {formatDateTime(item.completion_requested_at)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="flex items-center gap-2 shrink-0 sm:self-center [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center">
                                        <button
                                            onClick={() => handleApproveSingle(item)}
                                            disabled={approveMutation.isPending || rejectMutation.isPending}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all flex items-center gap-1.5 shadow-xs active:scale-95"
                                            title="Approve completion"
                                        >
                                            <CheckCircle size={14} />
                                            <span>Approve</span>
                                        </button>

                                        <button
                                            onClick={() => {
                                                setRejectionTargets([item.enrollment_id]);
                                                setRejectionReason('');
                                            }}
                                            disabled={approveMutation.isPending || rejectMutation.isPending}
                                            className="px-3 py-1.5 text-xs font-semibold text-status-rejected bg-danger/10 hover:bg-danger/20 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
                                            title="Reject completion request"
                                        >
                                            <XCircle size={14} />
                                            <span>Reject</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 sm:p-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] border-t border-border-subtle bg-surface-elevated/40 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 text-xs text-muted shrink-0">
                    <span>Approving marks the student <strong className="text-teal-600 dark:text-teal-400 font-bold">Completed</strong> with the date the viewer gave.</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 sm:py-1.5 bg-surface border border-border-subtle hover:bg-surface-elevated text-primary font-semibold rounded-xl transition-all"
                    >
                        Close
                    </button>
                </div>
            </DialogLayer>

            <ConfirmDialog
                open={!!batchToConfirm}
                variant="warning"
                title={`Approve ${batchToConfirm?.length ?? 0} completion${batchToConfirm?.length === 1 ? '' : 's'}?`}
                message="Each student will be marked Completed with the date the viewer gave. This can't be undone from here."
                confirmLabel="Approve"
                onCancel={() => setBatchToConfirm(null)}
                onConfirm={async () => {
                    const ids = batchToConfirm ?? [];
                    setBatchToConfirm(null);
                    await handleApproveBatch(ids);
                }}
            />

            {/* Rejection Prompt Modal */}
            <DialogLayer
                open={!!rejectionTargets}
                onClose={() => setRejectionTargets(null)}
                label="Reject Completion Request"
                className="z-60 flex items-center justify-center p-4"
                backdropClassName="bg-background/80 backdrop-blur-xs"
                panelClassName="bg-surface rounded-2xl border border-border-subtle shadow-card max-w-sm w-full p-5 space-y-3"
            >
                <div className="flex items-center gap-2.5 text-red-500">
                    <AlertCircle size={20} />
                    <h3 className="font-bold text-sm text-primary">
                        {rejectionTargets && rejectionTargets.length > 1 ? `Reject ${rejectionTargets.length} Completion Requests` : 'Reject Completion Request'}
                    </h3>
                </div>
                <p className="text-xs text-muted">
                    Provide an optional reason for rejecting. The requester will see this note.
                </p>
                <textarea
                    autoFocus
                    placeholder="Reason (optional, e.g. Student missed final test)..."
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    rows={3}
                    className="w-full p-2.5 bg-surface-elevated border border-border-strong rounded-xl text-xs text-primary focus:outline-hidden focus:ring-2 focus:ring-red-500/50"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                        onClick={() => setRejectionTargets(null)}
                        className="px-3 py-1.5 text-xs text-muted hover:text-primary rounded-xl"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleReject}
                        disabled={rejectMutation.isPending}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all flex items-center gap-1 shadow-xs"
                    >
                        {rejectMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                        <span>Confirm Rejection</span>
                    </button>
                </div>
            </DialogLayer>
        </>
    );
}

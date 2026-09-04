import { useState } from 'react';
import { usePendingApprovalsList, useApproveCompletion, useRejectCompletion } from '../hooks/useApprovals';
import { PendingCompletionRequest, cleanVariant } from '../lib/types';
import Toast, { ToastData } from './Toast';
import {
    X, CheckCircle, XCircle, Clock, GraduationCap,
    Calendar, CheckSquare, Square, Loader2, AlertCircle
} from 'lucide-react';

interface PendingApprovalsModalProps {
    open: boolean;
    onClose: () => void;
}

function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    try {
        return new Date(dateStr).toLocaleDateString('en-IE');
    } catch {
        return dateStr;
    }
}

function formatDateTime(dateTimeStr: string | null | undefined) {
    if (!dateTimeStr) return null;
    try {
        const d = new Date(dateTimeStr);
        return `${d.toLocaleDateString('en-IE')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
        return dateTimeStr;
    }
}

export default function PendingApprovalsModal({ open, onClose }: PendingApprovalsModalProps) {
    const { data: pendingList = [], isLoading, refetch } = usePendingApprovalsList(open);
    const approveMutation = useApproveCompletion();
    const rejectMutation = useRejectCompletion();

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [rejectionTargetId, setRejectionTargetId] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState<string>('');
    const [toast, setToast] = useState<ToastData | null>(null);

    if (!open) return null;

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
            setToast({
                message: `Approved course completion for ${item.student_name} (${item.course_name})`,
                type: 'success',
            });
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(item.enrollment_id);
                return next;
            });
            refetch();
        } catch (err: any) {
            setToast({ message: err.message || 'Failed to approve request', type: 'error' });
        }
    };

    const handleApproveBatch = async (ids: string[]) => {
        if (ids.length === 0) return;
        try {
            await approveMutation.mutateAsync({ enrollmentIds: ids });
            setToast({
                message: `Approved ${ids.length} course completion(s)`,
                type: 'success',
            });
            setSelectedIds(new Set());
            refetch();
        } catch (err: any) {
            setToast({ message: err.message || 'Failed to approve requests', type: 'error' });
        }
    };

    const handleRejectSingle = async () => {
        if (!rejectionTargetId) return;
        try {
            await rejectMutation.mutateAsync({
                enrollmentIds: [rejectionTargetId],
                reason: rejectionReason.trim() || undefined,
            });
            setToast({
                message: 'Completion request rejected',
                type: 'info',
            });
            setRejectionTargetId(null);
            setRejectionReason('');
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(rejectionTargetId);
                return next;
            });
            refetch();
        } catch (err: any) {
            setToast({ message: err.message || 'Failed to reject request', type: 'error' });
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
            <div className="bg-surface rounded-3xl border border-border-subtle shadow-card max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn">
                {/* Header */}
                <div className="p-5 border-b border-border-subtle flex items-center justify-between flex-shrink-0 bg-surface-elevated/40">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center">
                            <Clock size={22} className="animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base sm:text-lg font-bold text-primary tracking-tight">
                                    Pending Course Completions
                                </h2>
                                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                    {pendingList.length} pending
                                </span>
                            </div>
                            <p className="text-xs text-muted">
                                Review course completion requests submitted by viewers and coordinators
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-primary hover:bg-surface-elevated rounded-xl transition-all"
                        title="Close modal"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Batch Action Toolbar */}
                {pendingList.length > 0 && (
                    <div className="px-5 py-3 border-b border-border-subtle/70 bg-surface-elevated/20 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
                        <button
                            onClick={toggleSelectAll}
                            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-brand-500 transition-colors"
                        >
                            {isAllSelected ? <CheckSquare size={16} className="text-brand-500" /> : <Square size={16} />}
                            <span>Select All ({pendingList.length})</span>
                        </button>

                        <div className="flex items-center gap-2">
                            {selectedIds.size > 0 ? (
                                <button
                                    onClick={() => handleApproveBatch(Array.from(selectedIds))}
                                    disabled={approveMutation.isPending}
                                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                >
                                    {approveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                                    <span>Approve Selected ({selectedIds.size})</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleApproveBatch(pendingList.map(p => p.enrollment_id))}
                                    disabled={approveMutation.isPending}
                                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                >
                                    {approveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <GraduationCap size={14} />}
                                    <span>Approve All ({pendingList.length})</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Content List */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
                            <Loader2 size={32} className="animate-spin text-brand-500" />
                            <span className="text-xs font-semibold">Loading pending approvals...</span>
                        </div>
                    ) : pendingList.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="w-14 h-14 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
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
                                            ? 'bg-brand-500/5 border-brand-500 shadow-sm'
                                            : 'bg-surface border-border-subtle hover:border-border-strong'
                                    }`}
                                >
                                    {/* Left: Checkbox + Student details */}
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                        <button
                                            onClick={() => toggleSelectItem(item.enrollment_id)}
                                            className="mt-1 text-muted hover:text-brand-500 transition-colors flex-shrink-0"
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
                                                    <span className="text-[10px] bg-surface-elevated text-muted px-1.5 py-0.5 rounded border border-border-subtle">
                                                        {cleanVariant(item.course_name, item.course_variant)}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                                                <span>{item.student_email}</span>
                                                {item.student_phone && <span>• {item.student_phone}</span>}
                                            </div>

                                            {/* Request Info Bar */}
                                            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                                                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
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
                                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                                        <button
                                            onClick={() => handleApproveSingle(item)}
                                            disabled={approveMutation.isPending || rejectMutation.isPending}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                            title="Approve completion"
                                        >
                                            <CheckCircle size={14} />
                                            <span>Approve</span>
                                        </button>

                                        <button
                                            onClick={() => {
                                                setRejectionTargetId(item.enrollment_id);
                                                setRejectionReason('');
                                            }}
                                            disabled={approveMutation.isPending || rejectMutation.isPending}
                                            className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
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
                <div className="p-4 border-t border-border-subtle bg-surface-elevated/40 flex items-center justify-between text-xs text-muted flex-shrink-0">
                    <span>Approving updates student status to <strong className="text-teal-600 dark:text-teal-400 font-bold">Completed</strong> with the specified date.</span>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 bg-surface border border-border-subtle hover:bg-surface-elevated text-primary font-semibold rounded-xl transition-all"
                    >
                        Close
                    </button>
                </div>
            </div>

            {/* Rejection Prompt Modal */}
            {rejectionTargetId && (
                <div className="fixed inset-0 z-60 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-surface rounded-2xl border border-border-subtle shadow-card max-w-sm w-full p-5 space-y-3 animate-scaleIn">
                        <div className="flex items-center gap-2.5 text-red-500">
                            <AlertCircle size={20} />
                            <h3 className="font-bold text-sm text-primary">Reject Completion Request</h3>
                        </div>
                        <p className="text-xs text-muted">
                            Provide an optional reason for rejecting this request. The requester will see this note.
                        </p>
                        <textarea
                            placeholder="Reason (optional, e.g. Student missed final test)..."
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                            rows={3}
                            className="w-full p-2.5 bg-surface-elevated border border-border-strong rounded-xl text-xs text-primary focus:outline-none focus:ring-2 focus:ring-red-500/50"
                        />
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                onClick={() => setRejectionTargetId(null)}
                                className="px-3 py-1.5 text-xs text-muted hover:text-primary rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRejectSingle}
                                disabled={rejectMutation.isPending}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all flex items-center gap-1 shadow-sm"
                            >
                                {rejectMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                                <span>Confirm Rejection</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}

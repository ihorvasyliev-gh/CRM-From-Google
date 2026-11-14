import { Archive, Copy, Pencil, Phone, RotateCcw, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import { fullName, getCoursePill, SECONDARY_STATUSES } from '../../lib/types';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import { formatPhoneDisplay, formatPhoneForCall } from '../../lib/contactUtils';
import { formatDisplayDate } from '../../lib/dateUtils';

interface SecondaryPanelProps {
    open: boolean;
    onClose: () => void;
    /** Withdrawn and rejected enrollments left by the board's filters, keyed by status */
    byStatus: Record<string, EnrollmentRow[]>;
    /** Older ones are still loading */
    loading?: boolean;
    onRestore: (enrollment: EnrollmentRow) => void;
    onDelete: (enrollment: EnrollmentRow) => void;
    onShowDetail: (enrollment: EnrollmentRow) => void;
    onCopyEmails: (items: EnrollmentRow[], label: string) => void;
}

/**
 * Withdrawn and rejected enrollments, in a dialog of their own (a sheet on a phone) so the board
 * keeps its height. Each person can be opened, called, put back in the queue or removed.
 */
export default function SecondaryPanel({ open, onClose, byStatus, loading = false, onRestore, onDelete, onShowDetail, onCopyEmails }: SecondaryPanelProps) {
    const total = SECONDARY_STATUSES.reduce((sum, s) => sum + (byStatus[s]?.length || 0), 0);
    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Withdrawn & Rejected"
            subtitle={`${total} ${total === 1 ? 'enrollment' : 'enrollments'}${loading ? ', loading older ones…' : ''} · follows the board's filters`}
            icon={Archive}
            size="2xl"
            sheetOnMobile
            labelId="secondary-panel-title"
            bodyClassName="grid grid-cols-1 md:grid-cols-2 auto-rows-max gap-4 items-start"
        >
            {SECONDARY_STATUSES.map(status => {
                const cfg = STATUS_CONFIG[status];
                const items = byStatus[status] || [];
                return (
                    <section key={status} aria-label={cfg.label} className="rounded-2xl border border-border-subtle overflow-hidden">
                        <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${cfg.border} ${cfg.bg}`}>
                            <span className={cfg.color}>{cfg.icon}</span>
                            <h3 className="text-sm font-bold text-primary">{cfg.label}</h3>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.pillBg}`}>{items.length}</span>
                            {items.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => onCopyEmails(items, cfg.label)}
                                    aria-label={`Copy ${cfg.label} emails`}
                                    title={`Copy ${cfg.label} emails`}
                                    className="ml-auto w-9 h-9 inline-flex items-center justify-center text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-colors"
                                >
                                    <Copy size={14} />
                                </button>
                            )}
                        </div>
                        {items.length === 0 ? (
                            <p className="px-3 py-6 text-center text-xs text-muted">Nobody here</p>
                        ) : (
                            <ul className="p-2 space-y-1.5">
                                {items.map(enrollment => {
                                    const name = fullName(enrollment.students) || 'Unknown student';
                                    const phone = enrollment.students?.phone;
                                    const tel = phone ? formatPhoneForCall(phone) : null;
                                    return (
                                        <li key={enrollment.id} className="cv-auto-card p-2.5 rounded-xl border border-border-subtle bg-surface flex items-start gap-2">
                                            <div className="flex-1 min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => onShowDetail(enrollment)}
                                                    title="Open student details"
                                                    className="max-w-full font-semibold text-primary text-sm text-left truncate block hover:text-brand-600 dark:hover:text-brand-400 hover:underline"
                                                >
                                                    {name}
                                                </button>
                                                <p className={`text-xs font-semibold break-words ${cfg.color}`}>{getCoursePill(enrollment)}</p>
                                                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted tabular-nums">
                                                    {phone && (tel ? (
                                                        <a href={tel} className="inline-flex items-center gap-1 text-primary hover:underline">
                                                            <Phone size={11} className="text-primary/50" />{formatPhoneDisplay(phone)}
                                                        </a>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1"><Phone size={11} />{formatPhoneDisplay(phone)}</span>
                                                    ))}
                                                    <span>Added {formatDisplayDate(enrollment.created_at)}</span>
                                                </p>
                                                {enrollment.notes && (
                                                    <p className="mt-1.5 flex items-start gap-1 text-xs italic text-status-requested bg-amber-500/10 px-1.5 py-1 rounded-sm break-words">
                                                        <Pencil size={10} className="shrink-0 mt-0.5" />
                                                        <span className="min-w-0">{enrollment.notes}</span>
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => onRestore(enrollment)}
                                                    title="Back to Requested"
                                                    className="inline-flex items-center gap-1 h-9 px-2.5 text-xs font-semibold text-muted hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors whitespace-nowrap"
                                                >
                                                    <RotateCcw size={13} /> Restore
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDelete(enrollment)}
                                                    aria-label={`Delete ${name}'s enrollment`}
                                                    title="Delete"
                                                    className="w-9 h-9 inline-flex items-center justify-center text-muted hover:text-red-500 hover:bg-danger/10 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                );
            })}
        </Modal>
    );
}

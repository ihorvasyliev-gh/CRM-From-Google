import { useState, useEffect, useMemo } from 'react';
import { Archive, Check, Copy, Mail, MailX, MessageSquare, Pencil, Phone, RotateCcw, Trash2, X, AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ConfirmDialog';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import { fullName, getCoursePill, SECONDARY_STATUSES } from '../../lib/types';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import { formatPhoneDisplay, formatPhoneForCall, formatPhoneForWhatsApp } from '../../lib/contactUtils';
import { formatDisplayDate } from '../../lib/dateUtils';
import { useIsMobile } from '../../hooks/useScreenSize';
import { normalizeEmail } from '../../lib/emailOptOut';

const INITIAL_LIMIT = 25;
const LOAD_STEP = 25;
const EMPTY_OPTED_OUT: ReadonlySet<string> = new Set();

function hasMouse(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

interface SecondaryPanelProps {
    open: boolean;
    onClose: () => void;
    /** Withdrawn and rejected enrollments left by the board's filters, keyed by status */
    byStatus: Record<string, EnrollmentRow[]>;
    /** Older ones are still loading */
    loading?: boolean;
    optedOutEmails?: ReadonlySet<string>;
    onRestore: (enrollment: EnrollmentRow) => void;
    onDelete: (enrollment: EnrollmentRow) => void;
    onShowDetail: (enrollment: EnrollmentRow) => void;
    onCopyEmails: (items: EnrollmentRow[], label: string) => void;
    onUpdateNote?: (id: string, noteText: string) => Promise<boolean>;
    onRestoreMany?: (items: EnrollmentRow[]) => void;
    onDeleteMany?: (items: EnrollmentRow[]) => void;
}

function SecondaryRow({
    enrollment,
    colorCls,
    selectable,
    selected,
    emailOptedOut,
    copiesContact,
    onToggleSelect,
    onShowDetail,
    onRestore,
    onDelete,
    onUpdateNote,
}: {
    enrollment: EnrollmentRow;
    colorCls: string;
    selectable: boolean;
    selected: boolean;
    emailOptedOut: boolean;
    copiesContact: boolean;
    onToggleSelect: (id: string) => void;
    onShowDetail: (enrollment: EnrollmentRow) => void;
    onRestore: (enrollment: EnrollmentRow) => void;
    onDelete: (enrollment: EnrollmentRow) => void;
    onUpdateNote?: (id: string, noteText: string) => Promise<boolean>;
}) {
    const [phoneCopied, setPhoneCopied] = useState(false);
    const [emailCopied, setEmailCopied] = useState(false);
    const [editingNote, setEditingNote] = useState(false);
    const [noteDraft, setNoteDraft] = useState(enrollment.notes || '');
    const [savingNote, setSavingNote] = useState(false);

    useEffect(() => {
        if (!phoneCopied) return;
        const t = setTimeout(() => setPhoneCopied(false), 1500);
        return () => clearTimeout(t);
    }, [phoneCopied]);

    useEffect(() => {
        if (!emailCopied) return;
        const t = setTimeout(() => setEmailCopied(false), 1500);
        return () => clearTimeout(t);
    }, [emailCopied]);

    const name = fullName(enrollment.students) || 'Unknown student';
    const phone = enrollment.students?.phone;
    const tel = phone ? formatPhoneForCall(phone) : null;
    const wa = phone ? formatPhoneForWhatsApp(phone) : null;
    const email = enrollment.students?.email?.trim() || '';

    const handleSaveNote = async () => {
        if (!onUpdateNote || savingNote) return;
        setSavingNote(true);
        try {
            const ok = await onUpdateNote(enrollment.id, noteDraft.trim());
            if (ok) setEditingNote(false);
        } finally {
            setSavingNote(false);
        }
    };

    return (
        <li className={`cv-auto-card p-2.5 rounded-xl border transition-colors flex items-start gap-2 ${
            selected ? 'border-brand-500 bg-brand-500/5' : 'border-border-subtle bg-surface'
        }`}>
            {selectable && (
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    aria-label={`Select ${name}`}
                    onClick={() => onToggleSelect(enrollment.id)}
                    className={`mt-0.5 w-4 h-4 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        selected
                            ? 'bg-brand-500 border-brand-500 text-white'
                            : 'border-border-strong hover:border-brand-500'
                    }`}
                >
                    {selected && <Check size={10} strokeWidth={3} />}
                </button>
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <button
                        type="button"
                        onClick={() => onShowDetail(enrollment)}
                        title="Open student details"
                        className="max-w-full font-semibold text-primary text-sm text-left truncate block hover:text-brand-600 dark:hover:text-brand-400 hover:underline cursor-pointer"
                    >
                        {name}
                    </button>
                    {!email && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-warning/15 text-status-requested text-[10px] font-bold leading-none shrink-0" title="No email address on file">
                            <AlertCircle size={10} /> No email
                        </span>
                    )}
                    {email && emailOptedOut && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-danger/10 text-status-rejected text-[10px] font-bold leading-none shrink-0" title="Unsubscribed from emails">
                            <MailX size={10} /> Unsub
                        </span>
                    )}
                </div>
                <p className={`text-xs font-semibold break-words ${colorCls}`}>{getCoursePill(enrollment)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted tabular-nums">
                    {phone && (tel ? (
                        <a
                            href={tel}
                            onClick={e => {
                                if (copiesContact) {
                                    e.preventDefault();
                                    navigator.clipboard?.writeText(formatPhoneDisplay(phone)).then(() => setPhoneCopied(true)).catch(() => {});
                                }
                            }}
                            title={copiesContact ? 'Click to copy phone number' : 'Click to call'}
                            className={`inline-flex items-center gap-1 hover:underline ${phoneCopied ? 'text-status-confirmed font-semibold' : 'text-primary'}`}
                        >
                            <Phone size={11} className="text-primary/50" />
                            <span>{phoneCopied ? 'Copied' : formatPhoneDisplay(phone)}</span>
                        </a>
                    ) : (
                        <span className="inline-flex items-center gap-1"><Phone size={11} />{formatPhoneDisplay(phone)}</span>
                    ))}
                    {wa && (
                        <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Chat with ${name} on WhatsApp`}
                            title="Chat on WhatsApp"
                            className="inline-flex items-center justify-center w-5 h-5 rounded-md text-status-confirmed hover:bg-emerald-500/15 transition-colors"
                        >
                            <MessageSquare size={12} />
                        </a>
                    )}
                    {email && (
                        <a
                            href={`mailto:${email}`}
                            onClick={e => {
                                if (copiesContact) {
                                    e.preventDefault();
                                    navigator.clipboard?.writeText(email).then(() => setEmailCopied(true)).catch(() => {});
                                }
                            }}
                            aria-label={copiesContact ? `Copy email ${email}` : `Send email to ${email}`}
                            title={emailCopied ? 'Copied!' : copiesContact ? `${email} (click to copy)` : email}
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-md transition-colors ${emailCopied ? 'text-status-confirmed bg-success/10' : 'text-muted hover:text-brand-500 hover:bg-surface-elevated'}`}
                        >
                            {emailCopied ? <Check size={12} /> : <Mail size={12} />}
                        </a>
                    )}
                    <span>Added {formatDisplayDate(enrollment.created_at)}</span>
                </div>

                {editingNote ? (
                    <div className="mt-1.5 space-y-1.5 p-2 rounded-lg bg-surface-elevated border border-amber-500/40">
                        <textarea
                            value={noteDraft}
                            onChange={e => setNoteDraft(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSaveNote(); }
                                if (e.key === 'Escape') { e.preventDefault(); setEditingNote(false); setNoteDraft(enrollment.notes || ''); }
                            }}
                            placeholder="Add note…"
                            rows={2}
                            autoFocus
                            className="w-full text-xs p-1.5 bg-background border border-border-subtle rounded-md text-primary resize-none focus:outline-hidden focus:border-brand-500"
                        />
                        <div className="flex justify-end gap-1.5">
                            <button
                                type="button"
                                disabled={savingNote}
                                onClick={() => { setEditingNote(false); setNoteDraft(enrollment.notes || ''); }}
                                className="px-2 py-1 text-xs text-muted hover:text-primary rounded-md"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={savingNote}
                                onClick={() => void handleSaveNote()}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-md disabled:opacity-50"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                ) : enrollment.notes ? (
                    onUpdateNote ? (
                        <button
                            type="button"
                            onClick={() => { setNoteDraft(enrollment.notes || ''); setEditingNote(true); }}
                            title="Click to edit note"
                            className="mt-1.5 w-full flex items-start gap-1 text-xs italic text-status-requested bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-1 rounded-sm break-words text-left transition-colors cursor-pointer"
                        >
                            <Pencil size={10} className="shrink-0 mt-0.5" />
                            <span className="min-w-0">{enrollment.notes}</span>
                        </button>
                    ) : (
                        <p className="mt-1.5 flex items-start gap-1 text-xs italic text-status-requested bg-amber-500/10 px-1.5 py-1 rounded-sm break-words">
                            <Pencil size={10} className="shrink-0 mt-0.5" />
                            <span className="min-w-0">{enrollment.notes}</span>
                        </p>
                    )
                ) : null}
            </div>
            <div className="flex items-center shrink-0">
                {onUpdateNote && !enrollment.notes && !editingNote && (
                    <button
                        type="button"
                        onClick={() => { setNoteDraft(''); setEditingNote(true); }}
                        aria-label={`Add note for ${name}`}
                        title="Add note"
                        className="w-8 h-9 inline-flex items-center justify-center text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-colors"
                    >
                        <Pencil size={13} />
                    </button>
                )}
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
}

/**
 * Withdrawn and rejected enrollments, in a dialog of their own (a sheet on a phone) so the board
 * keeps its height. Supports click-to-copy contacts, WhatsApp, inline notes, bulk Restore/Delete,
 * mobile tabs, and lazy rendering for long lists.
 */
export default function SecondaryPanel({
    open,
    onClose,
    byStatus,
    loading = false,
    optedOutEmails = EMPTY_OPTED_OUT,
    onRestore,
    onDelete,
    onShowDetail,
    onCopyEmails,
    onUpdateNote,
    onRestoreMany,
    onDeleteMany,
}: SecondaryPanelProps) {
    const isMobile = useIsMobile();
    const copiesContact = !isMobile && hasMouse();
    const [mobileTab, setMobileTab] = useState<'withdrawn' | 'rejected'>('withdrawn');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
    const [limits, setLimits] = useState<Record<string, number>>({ withdrawn: INITIAL_LIMIT, rejected: INITIAL_LIMIT });

    const allItems = useMemo(
        () => SECONDARY_STATUSES.flatMap(s => byStatus[s] || []),
        [byStatus],
    );
    const total = allItems.length;
    const bulkEnabled = !!(onRestoreMany || onDeleteMany);

    // Keep selection clean when panel closes or items leave
    useEffect(() => {
        if (!open) {
            setSelectedIds(new Set());
            setLimits({ withdrawn: INITIAL_LIMIT, rejected: INITIAL_LIMIT });
        }
    }, [open]);

    useEffect(() => {
        const visible = new Set(allItems.map(e => e.id));
        setSelectedIds(prev => {
            if (prev.size === 0) return prev;
            const next = new Set([...prev].filter(id => visible.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [allItems]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectSection = (items: EnrollmentRow[]) => {
        setSelectedIds(prev => {
            const allSel = items.every(i => prev.has(i.id));
            const next = new Set(prev);
            items.forEach(i => allSel ? next.delete(i.id) : next.add(i.id));
            return next;
        });
    };

    const selectedItems = useMemo(
        () => allItems.filter(e => selectedIds.has(e.id)),
        [allItems, selectedIds],
    );

    const footer = selectedItems.length > 0 ? (
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-primary tabular-nums">{selectedItems.length} selected</span>
            <div className="flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onCopyEmails(selectedItems, `${selectedItems.length} selected`)}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border-strong bg-surface-elevated text-xs font-semibold text-primary hover:border-brand-500 transition-colors cursor-pointer"
                >
                    <Copy size={13} /> Emails
                </button>
                {onRestoreMany && (
                    <button
                        type="button"
                        onClick={() => {
                            onRestoreMany(selectedItems);
                            setSelectedIds(new Set());
                        }}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                        <RotateCcw size={13} /> Restore ({selectedItems.length})
                    </button>
                )}
                {onDeleteMany && (
                    <button
                        type="button"
                        onClick={() => setConfirmBulkDelete(true)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                        <Trash2 size={13} /> Delete
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    aria-label="Clear selection"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-elevated transition-colors"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    ) : undefined;

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                title="Withdrawn & Rejected"
                subtitle={`${total} ${total === 1 ? 'enrollment' : 'enrollments'}${loading ? ', loading older ones…' : ''} · follows the board's filters`}
                icon={Archive}
                size="2xl"
                sheetOnMobile
                labelId="secondary-panel-title"
                bodyClassName="space-y-3"
                footer={footer}
            >
                {/* Mobile section switcher so Rejected isn't buried below a long Withdrawn list */}
                <div className="md:hidden grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-elevated border border-border-subtle">
                    {SECONDARY_STATUSES.map(status => {
                        const cfg = STATUS_CONFIG[status];
                        const count = (byStatus[status] || []).length;
                        const active = mobileTab === status;
                        return (
                            <button
                                key={status}
                                type="button"
                                onClick={() => setMobileTab(status)}
                                aria-pressed={active}
                                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                                    active ? 'bg-surface text-primary shadow-xs' : 'text-muted'
                                }`}
                            >
                                <span className={cfg.color}>{cfg.icon}</span>
                                <span>{cfg.label}</span>
                                <span className="font-mono text-[11px] opacity-80">({count})</span>
                            </button>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-max gap-4 items-start">
                    {SECONDARY_STATUSES.map(status => {
                        const cfg = STATUS_CONFIG[status];
                        const items = byStatus[status] || [];
                        const limit = limits[status] ?? INITIAL_LIMIT;
                        const visible = items.slice(0, limit);
                        const remaining = items.length - visible.length;
                        const allSectionSel = items.length > 0 && items.every(e => selectedIds.has(e.id));
                        const someSectionSel = items.some(e => selectedIds.has(e.id));

                        return (
                            <section
                                key={status}
                                aria-label={cfg.label}
                                className={`rounded-2xl border border-border-subtle overflow-hidden ${mobileTab !== status ? 'hidden md:block' : ''}`}
                            >
                                <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${cfg.border} ${cfg.bg}`}>
                                    <span className={cfg.color}>{cfg.icon}</span>
                                    <h3 className="text-sm font-bold text-primary">{cfg.label}</h3>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.pillBg}`}>{items.length}</span>
                                    <div className="ml-auto flex items-center gap-1">
                                        {items.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => onCopyEmails(items, cfg.label)}
                                                aria-label={`Copy ${cfg.label} emails`}
                                                title={`Copy ${cfg.label} emails`}
                                                className="w-9 h-9 inline-flex items-center justify-center text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-colors"
                                            >
                                                <Copy size={14} />
                                            </button>
                                        )}
                                        {bulkEnabled && items.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => toggleSelectSection(items)}
                                                aria-label={allSectionSel ? `Deselect all ${cfg.label}` : `Select all ${cfg.label}`}
                                                title={allSectionSel ? `Deselect all ${cfg.label}` : `Select all ${cfg.label}`}
                                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer ${
                                                    allSectionSel
                                                        ? 'bg-brand-500 border-brand-500 text-white'
                                                        : someSectionSel
                                                            ? 'bg-brand-500/20 border-brand-500/50 text-brand-500'
                                                            : 'border-border-strong hover:border-brand-500'
                                                }`}
                                            >
                                                {(allSectionSel || someSectionSel) && <Check size={11} strokeWidth={3} />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {items.length === 0 ? (
                                    <p className="px-3 py-6 text-center text-xs text-muted">Nobody here</p>
                                ) : (
                                    <div className="p-2 space-y-1.5">
                                        <ul className="space-y-1.5">
                                            {visible.map(enrollment => {
                                                const emailNorm = normalizeEmail(enrollment.students?.email);
                                                return (
                                                    <SecondaryRow
                                                        key={enrollment.id}
                                                        enrollment={enrollment}
                                                        colorCls={cfg.color}
                                                        selectable={bulkEnabled}
                                                        selected={selectedIds.has(enrollment.id)}
                                                        emailOptedOut={!!emailNorm && optedOutEmails.has(emailNorm)}
                                                        copiesContact={copiesContact}
                                                        onToggleSelect={toggleSelect}
                                                        onShowDetail={onShowDetail}
                                                        onRestore={onRestore}
                                                        onDelete={onDelete}
                                                        onUpdateNote={onUpdateNote}
                                                    />
                                                );
                                            })}
                                        </ul>
                                        {remaining > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setLimits(prev => ({ ...prev, [status]: (prev[status] ?? INITIAL_LIMIT) + LOAD_STEP }))}
                                                className="w-full py-2 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-surface-elevated rounded-xl transition-colors cursor-pointer"
                                            >
                                                Show {Math.min(LOAD_STEP, remaining)} more ({remaining} remaining)
                                            </button>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            </Modal>

            <ConfirmDialog
                open={confirmBulkDelete}
                title="Delete Selected Enrollments"
                message={`Delete ${selectedItems.length} selected enrollment(s)? This cannot be undone.`}
                confirmLabel="Delete All"
                onConfirm={() => {
                    onDeleteMany?.(selectedItems);
                    setSelectedIds(new Set());
                    setConfirmBulkDelete(false);
                }}
                onCancel={() => setConfirmBulkDelete(false)}
            />
        </>
    );
}

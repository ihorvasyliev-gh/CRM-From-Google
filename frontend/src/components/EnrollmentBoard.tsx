import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, GraduationCap, Copy, Trash2, Send, CheckCircle, Mail, FileText } from 'lucide-react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../hooks/useDebounce';

import { useEnrollments, type EnrollmentRow } from '../hooks/useEnrollments';
import { useBulkActions, getCoursePill } from '../hooks/useBulkActions';
import { useInviteFlow } from '../hooks/useInviteFlow';
import { formatDateLong } from '../lib/dateUtils';
import { ALL_STATUSES, SECONDARY_STATUSES, STATUS_CONFIG, PIPELINE_STATUSES } from '../lib/statusConfig';

import FilterBar from './EnrollmentBoard/FilterBar';
import StatusColumn from './EnrollmentBoard/StatusColumn';
import EnrollmentCard from './EnrollmentBoard/EnrollmentCard';
import BulkActionBar from './EnrollmentBoard/BulkActionBar';
import EnrollmentModal from './EnrollmentModal';
import ConfirmDialog from './ConfirmDialog';
import Toast, { ToastData } from './Toast';
import { matchesSearch } from '../lib/searchUtils';


function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

export default function EnrollmentBoard({ initialCourseFilter }: { initialCourseFilter?: string }) {
    const [toast, setToast] = useState<ToastData | null>(null);
    const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

    // Modals
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<EnrollmentRow | null>(null);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [confirmDateTarget, setConfirmDateTarget] = useState<{ ids: string[]; bulk: boolean } | null>(null);
    const [confirmDate, setConfirmDate] = useState(todayISO());
    const [editNoteTarget, setEditNoteTarget] = useState<{ id: string; note: string } | null>(null);
    const [editNoteText, setEditNoteText] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);

    // Filters
    const [selectedCourse, setSelectedCourse] = useState<string>(initialCourseFilter || 'all');
    const [selectedVariant, setSelectedVariant] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showSecondary, setShowSecondary] = useState(false);
    const [sortOrder, setSortOrder] = useState<'date-asc' | 'date-desc' | 'name'>('date-asc');

    useEffect(() => {
        if (initialCourseFilter) setSelectedCourse(initialCourseFilter);
    }, [initialCourseFilter]);

    const enrollmentsHook = useEnrollments({
        showToast,
        openInviteModal: (ids, bulk) => inviteFlow.openInviteModal(ids, bulk),
        openConfirmModal: (id, defDate) => { setConfirmDateTarget({ ids: [id], bulk: false }); setConfirmDate(defDate); }
    });

    const bulkActions = useBulkActions({
        enrollments: enrollmentsHook.enrollments,
        setEnrollments: enrollmentsHook.setEnrollments,
        showToast,
        openInviteModal: (ids, bulk) => inviteFlow.openInviteModal(ids, bulk),
        openConfirmModal: (ids, defDate) => { setConfirmDateTarget({ ids, bulk: true }); setConfirmDate(defDate); }
    });

    const inviteFlow = useInviteFlow({
        enrollments: enrollmentsHook.enrollments,
        setEnrollments: enrollmentsHook.setEnrollments,
        clearSelection: bulkActions.clearSelection,
        showToast
    });

    const enrollments = enrollmentsHook.enrollments;

    // Filters derivation
    const filteredEnrollments = useMemo(() => {
        let result = enrollments;
        if (selectedCourse !== 'all') result = result.filter(e => e.course_id === selectedCourse);
        if (selectedVariant !== 'all') {
            result = result.filter(e => (e.course_variant || '').trim().toLowerCase() === selectedVariant.toLowerCase());
        }
        if (debouncedSearchQuery.trim()) {
            result = result.filter(e =>
                matchesSearch({
                    firstName: e.students?.first_name,
                    lastName: e.students?.last_name,
                    email: e.students?.email,
                    phone: e.students?.phone,
                    notes: e.notes,
                }, debouncedSearchQuery)
            );
        }
        if (dateFrom) {
            const from = new Date(dateFrom);
            result = result.filter(e => new Date(e.created_at) >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setSeconds(59, 999);
            result = result.filter(e => new Date(e.created_at) <= to);
        }
        return result;
    }, [enrollments, selectedCourse, selectedVariant, debouncedSearchQuery, dateFrom, dateTo]);

    // Data grouped by status
    const byStatus = useMemo(() => {
        const map: Record<string, EnrollmentRow[]> = {};
        ALL_STATUSES.forEach(s => { map[s] = []; });
        filteredEnrollments.forEach(e => {
            if (map[e.status]) map[e.status].push(e);
            else map[e.status] = [e];
        });

        Object.values(map).forEach(arr => {
            arr.sort((a, b) => {
                if (a.is_priority !== b.is_priority) {
                    return a.is_priority ? -1 : 1;
                }
                if (sortOrder === 'name') {
                    const aName = `${a.students?.last_name || ''} ${a.students?.first_name || ''}`.toLowerCase();
                    const bName = `${b.students?.last_name || ''} ${b.students?.first_name || ''}`.toLowerCase();
                    return aName.localeCompare(bName);
                } else {
                    const aDate = new Date(a.created_at).getTime();
                    const bDate = new Date(b.created_at).getTime();
                    return sortOrder === 'date-asc' ? aDate - bDate : bDate - aDate;
                }
            });
        });
        return map;
    }, [filteredEnrollments, sortOrder]);

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        ALL_STATUSES.forEach(s => { counts[s] = 0; });
        enrollments.forEach(e => { counts[e.status] = (counts[e.status] || 0) + 1; });
        return counts;
    }, [enrollments]);

    const queuePositions = useMemo(() => {
        const positions = new Map<string, number>();
        const requested = enrollments.filter(e => e.status === 'requested');
        const groups = new Map<string, EnrollmentRow[]>();

        requested.forEach(e => {
            const key = `${e.course_id}_${(e.course_variant || '').toLowerCase().trim()}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(e);
        });

        groups.forEach(group => {
            group.sort((a, b) => {
                if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
            group.forEach((e, index) => {
                positions.set(e.id, index + 1);
            });
        });
        return positions;
    }, [enrollments]);

    const uniqueCourses = useMemo(() => {
        const seen = new Map<string, string>();
        enrollments.forEach(e => {
            if (e.course_id && e.courses?.name && !seen.has(e.course_id)) {
                seen.set(e.course_id, e.courses.name);
            }
        });
        return Array.from(seen.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [enrollments]);

    const uniqueVariants = useMemo(() => {
        if (selectedCourse === 'all') return [];
        const seen = new Map<string, string>();
        enrollments
            .filter(e => e.course_id === selectedCourse)
            .forEach(e => {
                const v = (e.course_variant || '').trim();
                if (v && !seen.has(v.toLowerCase())) {
                    seen.set(v.toLowerCase(), v.charAt(0).toUpperCase() + v.slice(1).toLowerCase());
                }
            });
        return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
    }, [enrollments, selectedCourse]);

    const secondaryCount = (byStatus['withdrawn']?.length || 0) + (byStatus['rejected']?.length || 0);

    // Handlers
    function openEditNote(enrollment: EnrollmentRow) {
        setEditNoteTarget({ id: enrollment.id, note: enrollment.notes || '' });
        setEditNoteText(enrollment.notes || '');
    }

    async function handleConfirmWithDate() {
        if (!confirmDateTarget) return;
        const firstId = confirmDateTarget.ids[0];
        const first = enrollments.find(e => e.id === firstId);
        if (first && confirmDate) {
            await supabase.from('invite_dates').upsert(
                { course_id: first.course_id, invite_date: confirmDate },
                { onConflict: 'course_id,invite_date' }
            );
        }

        if (confirmDateTarget.bulk) {
            await bulkActions.bulkUpdateStatus('confirmed', confirmDate);
        } else {
            await enrollmentsHook.updateStatus(confirmDateTarget.ids[0], 'confirmed', confirmDate);
        }
        setConfirmDateTarget(null);
    }

    async function handleSaveNote() {
        if (!editNoteTarget) return;
        await enrollmentsHook.updateNote(editNoteTarget.id, editNoteText);
        setEditNoteTarget(null);
    }

    async function handleDeleteEnrollment() {
        if (!deleteTarget) return;
        const ok = await enrollmentsHook.deleteEnrollment(deleteTarget.id);
        if (ok) {
            bulkActions.toggleSelect(deleteTarget.id); // clear if selected
        }
        setDeleteTarget(null);
    }

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
    );

    async function handleDragEnd(event: DragEndEvent) {
        setActiveId(null);
        const { active, over } = event;
        if (!over) return;
        
        const enrollmentId = active.id as string;
        const oldStatus = active.data.current?.status;
        const newStatus = over.id as string;
        
        if (oldStatus && newStatus && oldStatus !== newStatus) {
            await enrollmentsHook.updateStatus(enrollmentId, newStatus);
        }
    }

    function handleDragStart(event: DragStartEvent) {
        setActiveId(event.active.id as string);
    }

    function handleDragCancel() {
        setActiveId(null);
    }

    return (
        <div className="h-full flex flex-col space-y-4 pb-8">
            <FilterBar
                enrollmentCount={enrollments.length}
                filteredCount={filteredEnrollments.length}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                setEnrollModalOpen={setEnrollModalOpen}
                selectedCourse={selectedCourse}
                setSelectedCourse={setSelectedCourse}
                uniqueCourses={uniqueCourses}
                selectedVariant={selectedVariant}
                setSelectedVariant={setSelectedVariant}
                uniqueVariants={uniqueVariants}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                statusCounts={statusCounts}
            />

            <DndContext 
                sensors={sensors} 
                collisionDetection={closestCenter} 
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {PIPELINE_STATUSES.map(status => (
                        <StatusColumn
                        key={status}
                        status={status}
                        items={byStatus[status] || []}
                        selectedIds={bulkActions.selectedIds}
                        selectAllInColumn={(s) => bulkActions.selectAllInList(byStatus[s] || [])}
                        handleCopyEmails={bulkActions.handleCopyEmails}
                        toggleSelect={bulkActions.toggleSelect}
                        togglePriority={enrollmentsHook.togglePriority}
                        openEditNote={openEditNote}
                        queuePositions={queuePositions}
                    />
                ))}
                </div>

                <DragOverlay>
                    {activeId ? (() => {
                        const activeEnrollment = enrollments.find(e => e.id === activeId);
                        if (!activeEnrollment) return null;
                        return (
                            <EnrollmentCard
                                enrollment={activeEnrollment}
                                status={activeEnrollment.status}
                                isSelected={bulkActions.selectedIds.has(activeId)}
                                toggleSelect={bulkActions.toggleSelect}
                                togglePriority={enrollmentsHook.togglePriority}
                                openEditNote={openEditNote}
                                queuePosition={queuePositions.get(activeId)}
                                isOverlay
                            />
                        );
                    })() : null}
                </DragOverlay>
            </DndContext>

            {/* Secondary Statuses */}
            {secondaryCount > 0 && (
                <div>
                    <button
                        onClick={() => setShowSecondary(!showSecondary)}
                        className="flex items-center gap-2 text-sm font-medium text-muted hover:text-primary transition-all mb-3"
                    >
                        <ChevronDown size={16} className={`transition-transform ${showSecondary ? 'rotate-180' : ''}`} />
                        Withdrawn & Rejected ({secondaryCount})
                    </button>

                    {showSecondary && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-slideDown">
                            {SECONDARY_STATUSES.map(status => {
                                const cfg = STATUS_CONFIG[status];
                                const items = byStatus[status] || [];
                                if (items.length === 0) return null;

                                return (
                                    <div key={status} className="bg-surface-elevated rounded-2xl shadow-card border border-border-subtle overflow-hidden opacity-75">
                                        <div className={`p-3 border-b ${cfg.border} ${cfg.bg}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={cfg.color}>{cfg.icon}</span>
                                                <h3 className="text-sm font-bold text-primary">{cfg.label}</h3>
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.pillBg}`}>
                                                    {items.length}
                                                </span>
                                                <button
                                                    onClick={() => bulkActions.handleCopyEmails(items, cfg.label)}
                                                    className="ml-auto p-1.5 text-muted hover:text-muted hover:bg-surface-100 rounded-lg transition-all"
                                                    title={`Copy ${cfg.label} emails`}
                                                >
                                                    <Copy size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto">
                                            {items.map(enrollment => (
                                                <div
                                                    key={enrollment.id}
                                                    className="group p-3 rounded-xl border border-border-subtle bg-surface-elevated hover:shadow-sm transition-all flex items-center gap-3"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-primary text-[13px] truncate">
                                                            {enrollment.students?.first_name} {enrollment.students?.last_name}
                                                        </p>
                                                        <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${cfg.pillBg}`}>
                                                            {getCoursePill(enrollment)}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => enrollmentsHook.updateStatus(enrollment.id, 'requested')}
                                                        className="text-[11px] font-medium text-muted hover:text-brand-600 hover:bg-brand-50 px-2 py-1 rounded-lg transition-all whitespace-nowrap"
                                                    >
                                                        Restore
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteTarget(enrollment)}
                                                        className="text-muted hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {filteredEnrollments.length === 0 && (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <GraduationCap size={28} className="text-muted" />
                    </div>
                    <p className="text-lg font-semibold text-primary">No enrollments found</p>
                    <p className="text-sm text-muted mt-1">Try adjusting your filters or add a new enrollment</p>
                </div>
            )}

            <BulkActionBar
                selectedCount={bulkActions.selectedIds.size}
                selectedEnrollments={enrollments.filter(e => bulkActions.selectedIds.has(e.id))}
                generatingDocs={bulkActions.generatingDocs}
                handleCopySelectedEmails={() => bulkActions.handleCopySelectedEmails(filteredEnrollments)}
                bulkUpdateStatus={bulkActions.bulkUpdateStatus}
                handleGenerateDocuments={bulkActions.handleGenerateDocuments}
                setBulkDeleteOpen={setBulkDeleteOpen}
                clearSelection={bulkActions.clearSelection}
                toggleSelect={bulkActions.toggleSelect}
            />

            {/* Modals go here */}
            {inviteFlow.inviteDateTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => inviteFlow.setInviteDateTarget(null)}>
                    <div
                        className="bg-surface-elevated rounded-2xl shadow-2xl border border-border-subtle p-6 w-full max-w-sm mx-4 animate-scaleIn"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                                <Send size={22} />
                            </div>
                            <div>
                                <h3 className="font-bold text-primary">Invite to Course</h3>
                                <p className="text-xs text-muted mt-0.5">
                                    {inviteFlow.inviteDateTarget.ids.length === 1
                                        ? 'Select the date for this invitation'
                                        : `Select the date for ${inviteFlow.inviteDateTarget.ids.length} invitations`
                                    }
                                </p>
                            </div>
                        </div>

                        {inviteFlow.savedInviteDates.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-xs font-medium text-muted mb-2">Saved dates</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {inviteFlow.savedInviteDates.map(d => (
                                        <button
                                            key={d}
                                            onClick={() => inviteFlow.setInviteDate(d)}
                                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${inviteFlow.inviteDate === d
                                                ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                                                : 'bg-surface-elevated text-muted border-border-subtle hover:border-blue-300 hover:text-blue-600'
                                                }`}
                                        >
                                            {formatDateLong(d)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <label className="block text-sm font-medium text-primary mb-1.5">
                            {inviteFlow.savedInviteDates.length > 0 ? 'Or pick a new date' : 'Invitation Date'}
                        </label>
                        <input
                            type="date"
                            value={inviteFlow.inviteDate}
                            min={todayISO()}
                            onChange={e => inviteFlow.setInviteDate(e.target.value)}
                            className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-surface"
                        />

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => inviteFlow.setInviteDateTarget(null)}
                                className="px-4 py-2.5 text-sm font-medium text-muted bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={inviteFlow.handleInviteWithDate}
                                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl transition-all shadow-sm"
                            >
                                <Send size={14} /> Just Invite
                            </button>
                            <button
                                onClick={inviteFlow.handleInviteAndEmail}
                                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 rounded-xl transition-all shadow-sm"
                            >
                                <Mail size={14} /> Invite & Email
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDateTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => setConfirmDateTarget(null)}>
                    <div
                        className="bg-surface-elevated rounded-2xl shadow-2xl border border-border-subtle p-6 w-full max-w-sm mx-4 animate-scaleIn"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                                <CheckCircle size={22} />
                            </div>
                            <div>
                                <h3 className="font-bold text-primary">Confirm Enrollment</h3>
                                <p className="text-xs text-muted mt-0.5">
                                    {confirmDateTarget.ids.length === 1
                                        ? 'Set the confirmation date for this enrollment'
                                        : `Set the confirmation date for ${confirmDateTarget.ids.length} enrollments`
                                    }
                                </p>
                            </div>
                        </div>

                        {inviteFlow.savedInviteDates.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-xs font-medium text-muted mb-2">Saved Course Dates</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {inviteFlow.savedInviteDates.map(d => (
                                        <button
                                            key={d}
                                            onClick={() => setConfirmDate(d)}
                                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${confirmDate === d
                                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                                : 'bg-surface-elevated text-muted border-border-subtle hover:border-emerald-300 hover:text-emerald-600'
                                                }`}
                                        >
                                            {formatDateLong(d)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <label className="block text-sm font-medium text-primary mb-1.5">
                            {inviteFlow.savedInviteDates.length > 0 ? 'Or pick a new date' : 'Confirmation Date'}
                        </label>
                        <input
                            type="date"
                            value={confirmDate}
                            onChange={e => setConfirmDate(e.target.value)}
                            className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 bg-surface"
                        />

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setConfirmDateTarget(null)}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-muted bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmWithDate}
                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl transition-all shadow-sm"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <EnrollmentModal
                open={enrollModalOpen}
                onSave={() => {
                    enrollmentsHook.fetchEnrollments();
                    showToast('Enrollment created', 'success');
                }}
                onClose={() => setEnrollModalOpen(false)}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Enrollment"
                message={`Remove ${deleteTarget?.students?.first_name || ''} ${deleteTarget?.students?.last_name || ''} from ${deleteTarget?.courses?.name || 'this course'}?`}
                confirmLabel="Remove"
                onConfirm={handleDeleteEnrollment}
                onCancel={() => setDeleteTarget(null)}
            />

            <ConfirmDialog
                open={bulkDeleteOpen}
                title="Delete Selected Enrollments"
                message={`Delete ${bulkActions.selectedIds.size} selected enrollment(s)? This cannot be undone.`}
                confirmLabel="Delete All"
                onConfirm={() => { bulkActions.handleBulkDelete(); setBulkDeleteOpen(false); }}
                onCancel={() => setBulkDeleteOpen(false)}
            />

            {editNoteTarget && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => setEditNoteTarget(null)}>
                    <div
                        className="bg-surface-elevated rounded-2xl shadow-2xl border border-border-subtle p-6 w-full max-w-sm mx-4 animate-scaleIn"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 bg-brand-50 rounded-xl text-brand-600">
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
                            value={editNoteText}
                            onChange={e => setEditNoteText(e.target.value)}
                            placeholder="Enter note here..."
                            className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 bg-surface min-h-[120px] resize-none"
                            autoFocus
                        />

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setEditNoteTarget(null)}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-muted bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveNote}
                                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-sm"
                            >
                                Save Note
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}

import { useState, useMemo, useEffect, useCallback, useRef, startTransition } from 'react';
import { ChevronDown, GraduationCap, Copy, Trash2, Send, CheckCircle, Mail, FileText, AlertTriangle, X, RotateCcw } from 'lucide-react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, MeasuringStrategy, defaultDropAnimationSideEffects } from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../hooks/useDebounce';

import { useEnrollments, type EnrollmentRow } from '../hooks/useEnrollments';
import { useBulkActions, getCoursePill } from '../hooks/useBulkActions';
import { useInviteFlow } from '../hooks/useInviteFlow';
import { useStudentFlags } from '../hooks/useStudentFlags';
import { cleanVariant, Student } from '../lib/types';
import StudentDetail from './StudentDetail';
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

const EMPTY_FLAGS: import('../lib/types').StudentFlag[] = [];
const EMPTY_COMPLETED_COURSES: Array<{id: string, name: string}> = [];


function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

export default function EnrollmentBoard({ initialCourseFilter }: { initialCourseFilter?: string }) {
    const [toast, setToast] = useState<ToastData | null>(null);
    const showToast = useCallback((message: string, type: 'success' | 'error') => setToast({ message, type }), []);

    // Modals
    const [enrollModalOpen, setEnrollModalOpen] = useState(false);
    const queryClient = useQueryClient();
    const [detailStudent, setDetailStudent] = useState<Student | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<EnrollmentRow | null>(null);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [confirmDateTarget, setConfirmDateTarget] = useState<{ ids: string[]; bulk: boolean } | null>(null);
    const [confirmDate, setConfirmDate] = useState(todayISO());
    const [editNoteTarget, setEditNoteTarget] = useState<{ id: string; note: string } | null>(null);
    const [editNoteText, setEditNoteText] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [undoData, setUndoData] = useState<{ id: string; oldStatus: string; newStatus: string; name: string } | null>(null);
    const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Student Flags
    const [flagModalTarget, setFlagModalTarget] = useState<{ studentId: string; studentName: string } | null>(null);
    const [flagCourseId, setFlagCourseId] = useState('');
    const [flagComment, setFlagComment] = useState('');

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

    const inviteFlowRef = useRef<{ openInviteModal: (ids: string[], bulk: boolean) => void } | null>(null);
    const openInviteModalProxy = useCallback((ids: string[], bulk: boolean) => {
        inviteFlowRef.current?.openInviteModal(ids, bulk);
    }, []);

    const openConfirmModalSingle = useCallback((id: string, defDate: string) => { setConfirmDateTarget({ ids: [id], bulk: false }); setConfirmDate(defDate); }, []);
    const openConfirmModalBulk = useCallback((ids: string[], defDate: string) => { setConfirmDateTarget({ ids, bulk: true }); setConfirmDate(defDate); }, []);

    const enrollmentsHook = useEnrollments({
        showToast,
        openInviteModal: openInviteModalProxy,
        openConfirmModal: openConfirmModalSingle
    });

    const bulkActions = useBulkActions({
        enrollments: enrollmentsHook.enrollments,
        setEnrollments: enrollmentsHook.setEnrollments,
        showToast,
        openInviteModal: openInviteModalProxy,
        openConfirmModal: openConfirmModalBulk
    });

    const inviteFlow = useInviteFlow({
        enrollments: enrollmentsHook.enrollments,
        setEnrollments: enrollmentsHook.setEnrollments,
        clearSelection: bulkActions.clearSelection,
        showToast
    });
    
    useEffect(() => {
        inviteFlowRef.current = inviteFlow;
    }, [inviteFlow]);

    const studentFlagsHook = useStudentFlags(showToast);

    const enrollments = enrollmentsHook.enrollments;

    // Filters derivation
    const filteredEnrollments = useMemo(() => {
        let result = enrollments;
        if (selectedCourse !== 'all') result = result.filter(e => e.course_id === selectedCourse);
        if (selectedVariant !== 'all') {
            result = result.filter(e => cleanVariant(e.courses?.name || '', e.course_variant).toLowerCase() === selectedVariant.toLowerCase());
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
                const cleaned = cleanVariant(e.courses?.name || '', e.course_variant);
                if (cleaned && !seen.has(cleaned.toLowerCase())) {
                    seen.set(cleaned.toLowerCase(), cleaned);
                }
            });
        return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
    }, [enrollments, selectedCourse]);

    const completedCoursesByStudentId = useMemo(() => {
        const map = new Map<string, Array<{id: string, name: string}>>();
        enrollments.forEach(e => {
            if (e.status === 'completed' && e.courses?.name) {
                const studentId = e.student_id;
                const courses = map.get(studentId) || [];
                if (!courses.some(c => c.id === e.course_id)) {
                    courses.push({ id: e.course_id, name: e.courses.name });
                }
                map.set(studentId, courses);
            }
        });
        return map;
    }, [enrollments]);

    const secondaryCount = (byStatus['withdrawn']?.length || 0) + (byStatus['rejected']?.length || 0);

    // Handlers
    const openEditNote = useCallback((enrollment: EnrollmentRow) => {
        setEditNoteTarget({ id: enrollment.id, note: enrollment.notes || '' });
        setEditNoteText(enrollment.notes || '');
    }, []);

    const handleShowDetail = useCallback((enrollment: EnrollmentRow) => {
        if (enrollment.students) {
            setDetailStudent(enrollment.students);
        }
    }, []);

    const openFlagModal = useCallback((enrollment: EnrollmentRow) => {
        const name = [enrollment.students?.first_name, enrollment.students?.last_name].filter(Boolean).join(' ');
        setFlagModalTarget({ studentId: enrollment.student_id, studentName: name });
        setFlagCourseId('');
        setFlagComment('');
    }, []);

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

    const mouseSensorOpts = useMemo(() => ({ activationConstraint: { distance: 5 } }), []);
    const touchSensorOpts = useMemo(() => ({ activationConstraint: { delay: 250, tolerance: 5 } }), []);
    
    const mouseSensor = useSensor(MouseSensor, mouseSensorOpts);
    const touchSensor = useSensor(TouchSensor, touchSensorOpts);
    
    const sensors = useSensors(mouseSensor, touchSensor);

    const measuringConfig = useMemo(() => ({
        droppable: {
            strategy: MeasuringStrategy.BeforeDragging
        }
    }), []);

    // п.8: drop animation config
    const dropAnimation = useMemo(() => ({
        sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: '0.4' } }
        })
    }), []);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        
        startTransition(() => {
            setActiveId(null);
            if (!over) return;
            
            const enrollmentId = active.id as string;
            const oldStatus = active.data.current?.status;
            const newStatus = over.id as string;
            
            if (oldStatus && newStatus && oldStatus !== newStatus) {
                enrollmentsHook.updateStatus(enrollmentId, newStatus);

                // п.11: undo-toast for dangerous status transitions
                if (newStatus === 'rejected' || newStatus === 'withdrawn') {
                    const enrollment = enrollmentsHook.enrollments.find(e => e.id === enrollmentId);
                    const name = [enrollment?.students?.first_name, enrollment?.students?.last_name].filter(Boolean).join(' ') || 'Student';
                    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
                    setUndoData({ id: enrollmentId, oldStatus, newStatus, name });
                    undoTimerRef.current = setTimeout(() => setUndoData(null), 6000);
                }
            }
        });
    }, [enrollmentsHook]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    }, []);

    const handleDragCancel = useCallback(() => {
        setActiveId(null);
    }, []);

    const bulkActionBar = useMemo(() => {
        const selectedEnrollments = enrollments.filter(e => bulkActions.selectedIds.has(e.id));
        return (
            <BulkActionBar
                selectedCount={bulkActions.selectedIds.size}
                selectedEnrollments={selectedEnrollments}
                generatingDocs={bulkActions.generatingDocs}
                handleCopySelectedEmails={() => bulkActions.handleCopySelectedEmails(filteredEnrollments)}
                bulkUpdateStatus={bulkActions.bulkUpdateStatus}
                handleGenerateDocuments={bulkActions.handleGenerateDocuments}
                setBulkDeleteOpen={setBulkDeleteOpen}
                clearSelection={bulkActions.clearSelection}
                toggleSelect={bulkActions.toggleSelect}
            />
        );
    }, [enrollments, filteredEnrollments, bulkActions]);

    // п.9: scroll-to-column handler
    const handleStatusBadgeClick = useCallback((status: string) => {
        const el = columnRefs.current[status];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, []);

    // Total pipeline count for progress bars — п.1
    const totalPipelineCount = useMemo(() => {
        return PIPELINE_STATUSES.reduce((sum, s) => sum + (byStatus[s]?.length || 0), 0);
    }, [byStatus]);

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
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
                onStatusBadgeClick={handleStatusBadgeClick}
            />

            <DndContext 
                sensors={sensors} 
                collisionDetection={closestCenter} 
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
                measuring={measuringConfig}
            >
                <div className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden md:overflow-hidden md:grid md:grid-cols-2 xl:grid-cols-4 gap-4 snap-x snap-mandatory scrollbar-none pb-2">
                    {PIPELINE_STATUSES.map(status => (
                        <div
                            key={status}
                            ref={el => { columnRefs.current[status] = el; }}
                            className="min-h-0 flex flex-col w-[calc(100vw-4.5rem)] sm:w-[350px] md:w-auto shrink-0 md:shrink snap-center md:snap-align-none"
                        >
                            <StatusColumn
                                status={status}
                                items={byStatus[status] || []}
                                selectedIds={bulkActions.selectedIds}
                                selectAllInList={bulkActions.selectAllInList}
                                handleCopyEmails={bulkActions.handleCopyEmails}
                                toggleSelect={bulkActions.toggleSelect}
                                togglePriority={enrollmentsHook.togglePriority}
                                openEditNote={openEditNote}
                                queuePositions={queuePositions}
                                flagsByStudentId={studentFlagsHook.flagsByStudentId}
                                completedCoursesByStudentId={completedCoursesByStudentId}
                                onFlagClick={openFlagModal}
                                emptyFlags={EMPTY_FLAGS}
                                emptyCompletedCourses={EMPTY_COMPLETED_COURSES}
                                totalCount={totalPipelineCount}
                                onShowDetail={handleShowDetail}
                            />
                        </div>
                    ))}
                </div>

                {/* п.8: drop animation enabled */}
                <DragOverlay dropAnimation={dropAnimation}>
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
                                studentFlags={studentFlagsHook.flagsByStudentId.get(activeEnrollment.student_id) || EMPTY_FLAGS}
                                completedCourses={completedCoursesByStudentId.get(activeEnrollment.student_id) || EMPTY_COMPLETED_COURSES}
                                onFlagClick={openFlagModal}
                                isOverlay
                                onShowDetail={handleShowDetail}
                            />
                        );
                    })() : null}
                </DragOverlay>
            </DndContext>

            {/* п.11: Undo-toast for dangerous drag-and-drop */}
            {undoData && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[80] animate-slideUp">
                    <div className="glass-dark rounded-2xl shadow-float px-4 py-3 flex items-center gap-3 min-w-[280px]">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                        <p className="text-sm text-white/90 flex-1">
                            <span className="font-semibold">{undoData.name}</span>
                            {' '}moved to <span className="font-medium text-orange-300 capitalize">{undoData.newStatus}</span>
                        </p>
                        <button
                            onClick={() => {
                                enrollmentsHook.updateStatus(undoData.id, undoData.oldStatus);
                                if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
                                setUndoData(null);
                            }}
                            className="flex items-center gap-1.5 text-xs font-bold text-orange-400 hover:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap"
                        >
                            <RotateCcw size={12} /> Undo
                        </button>
                        <button
                            onClick={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndoData(null); }}
                            className="text-white/40 hover:text-white/80 transition-colors p-1"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

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

            {bulkActionBar}

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
                            id="invite-date"
                            name="inviteDate"
                            value={inviteFlow.inviteDate}
                            min={todayISO()}
                            onChange={e => inviteFlow.setInviteDate(e.target.value)}
                            className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-surface"
                        />

                        <div className="mt-4">
                            <label className="block text-sm font-medium text-primary mb-1.5">
                                Response Deadline
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    id="response-days"
                                    name="responseDays"
                                    value={inviteFlow.responseDays}
                                    min={1}
                                    max={90}
                                    onChange={e => inviteFlow.setResponseDays(Math.max(1, parseInt(e.target.value) || 7))}
                                    className="w-24 px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-surface text-center"
                                />
                                <span className="text-sm text-muted">days to confirm</span>
                            </div>
                            <p className="text-xs text-muted mt-1.5 opacity-70">
                                The participant will see this deadline in the invitation email
                            </p>
                        </div>

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
                            id="confirm-date"
                            name="confirmDate"
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
                            id="edit-note"
                            name="editNote"
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

            {/* Student Flag Modal */}
            {flagModalTarget && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => setFlagModalTarget(null)}>
                    <div
                        className="bg-surface-elevated rounded-2xl shadow-2xl border border-border-subtle p-6 w-full max-w-md mx-4 animate-scaleIn"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 bg-orange-50 rounded-xl text-orange-500">
                                <AlertTriangle size={22} />
                            </div>
                            <div>
                                <h3 className="font-bold text-primary">Student Flags</h3>
                                <p className="text-xs text-muted mt-0.5">
                                    Manage flags for {flagModalTarget.studentName}
                                </p>
                            </div>
                        </div>

                        {/* Existing flags */}
                        {(() => {
                            const existing = studentFlagsHook.flagsByStudentId.get(flagModalTarget.studentId) || [];
                            if (existing.length === 0) return null;
                            return (
                                <div className="mb-5">
                                    <label className="block text-xs font-medium text-muted mb-2">Existing flags</label>
                                    <div className="space-y-1.5">
                                        {existing.map(flag => (
                                            <div key={flag.id} className="flex items-start gap-2 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
                                                <AlertTriangle size={13} className="text-orange-400 mt-0.5 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-primary">{flag.courses?.name || 'Unknown course'}</p>
                                                    {flag.comment && (
                                                        <p className="text-[11px] text-muted mt-0.5">{flag.comment}</p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => studentFlagsHook.removeFlag(flag.id)}
                                                    className="p-1 text-muted hover:text-red-500 hover:bg-red-50 rounded-md transition-all flex-shrink-0"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Add new flag */}
                        <div className="border-t border-border-subtle pt-4">
                            <label className="block text-xs font-medium text-muted mb-2">Add new flag</label>
                            <select
                                id="flag-course"
                                name="flagCourse"
                                value={flagCourseId}
                                onChange={e => setFlagCourseId(e.target.value)}
                                className="w-full px-4 py-2.5 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 bg-surface mb-2"
                            >
                                <option value="">Select course...</option>
                                {uniqueCourses.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>

                            <textarea
                                id="flag-comment"
                                name="flagComment"
                                value={flagComment}
                                onChange={e => setFlagComment(e.target.value)}
                                placeholder="Reason (optional)..."
                                className="w-full px-4 py-3 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 bg-surface min-h-[80px] resize-none"
                            />

                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => setFlagModalTarget(null)}
                                    className="flex-1 px-4 py-2.5 text-sm font-medium text-muted bg-surface-100 hover:bg-surface-200 rounded-xl transition-all"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => {
                                        if (!flagCourseId) return;
                                        studentFlagsHook.addFlag(flagModalTarget.studentId, flagCourseId, flagComment);
                                        setFlagCourseId('');
                                        setFlagComment('');
                                    }}
                                    disabled={!flagCourseId}
                                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Add Flag
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Student Detail Drawer */}
            {detailStudent && (
                <StudentDetail
                    student={detailStudent}
                    onClose={() => setDetailStudent(null)}
                    onStudentUpdated={(updatedStudent) => {
                        setDetailStudent(updatedStudent);
                        queryClient.invalidateQueries({ queryKey: ['enrollments'] });
                    }}
                />
            )}
        </div>
    );
}

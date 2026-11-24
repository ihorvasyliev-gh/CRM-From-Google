import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    AlertCircle,
    ArrowUpRight,
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    ClipboardList,
    Download,
    Eye,
    FileArchive,
    FileSpreadsheet,
    FileText,
    FlaskConical,
    FolderTree,
    History,
    Layers,
    MapPin,
    Printer,
    SlidersHorizontal,
    Square,
    Tag,
    UserCheck,
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Tabs';
import Switch from '../ui/Switch';
import SearchInput from '../ui/SearchInput';
import { EmptyState, ErrorState, SkeletonRows } from '../ui/States';
import { calloutCls, panelCls, tableCls, tbodyCls, tdCls, thCls, theadCls, trCls } from '../ui/styles';
import CoursePicker from './CoursePicker';
import GenerationReport from './GenerationReport';
import DocxLivePreview from './DocxLivePreview';
import ArchiveTreePreview from './ArchiveTreePreview';
import RecentRunsPanel from './RecentRunsPanel';
import { StepHeader } from './shared';
import { formatRelativeTime, plural, type ShowToast } from './helpers';
import type { DocumentsTabKey, PreviewModalTarget, PreviewTarget } from './types';
import type { DocumentSetup } from './useDocumentSetup';
import { PHASE_LABELS, useArchiveRunner } from './useArchiveRunner';
import { usePersistentState } from '../../hooks/usePersistentState';
import { formatDisplayDate } from '../../lib/dateUtils';
import { formatPhoneDisplay } from '../../lib/contactUtils';
import { cleanVariant, templateLabel, type Course } from '../../lib/types';
import {
    archiveFileName,
    coursePreset,
    courseRun,
    defaultSessionKey,
    fetchDocContext,
    groupSessions,
    planArchivePaths,
    sortBySurname,
    summarizeGeneration,
    type EnrollmentWithRelations,
    type GenerationStatus,
} from '../../lib/documentUtils';

export interface GenerateTabProps {
    courses: Course[];
    enrollments: EnrollmentWithRelations[];
    enrollmentsLoading: boolean;
    enrollmentsError: unknown;
    onRetryEnrollments?: () => void;
    setup: DocumentSetup;
    showToast: ShowToast;
    onNavigateTab: (tab: DocumentsTabKey, focusCourseId?: string) => void;
    onOpenPreviewModal: (preview: PreviewModalTarget) => void;
    onOpenSettingsGeneral?: () => void;
}

const STATUS_OPTIONS: { value: GenerationStatus; label: string; title: string }[] = [
    { value: 'confirmed', label: 'Confirmed', title: 'People confirmed for a course date — letters, attendance sheets, labels, SICAP form' },
    { value: 'completed', label: 'Completed', title: 'People who finished the course — certificates' },
];

type StudioRightTab = 'preview' | 'tree';

export default function GenerateTab({
    courses,
    enrollments,
    enrollmentsLoading,
    enrollmentsError,
    onRetryEnrollments,
    setup,
    showToast,
    onNavigateTab,
    onOpenPreviewModal,
    onOpenSettingsGeneral,
}: GenerateTabProps) {
    const {
        templates,
        attTemplate,
        labelTemplate,
        sicapTemplate,
        archiveVariables,
        excelColumns,
        generations,
        generationsReady,
    } = setup;

    const [status, setStatus] = usePersistentState<GenerationStatus>('doc_gen_status', 'confirmed', {
        validate: (v): v is GenerationStatus => v === 'confirmed' || v === 'completed',
    });
    const [courseId, setCourseId] = useState('');
    const [sessionKey, setSessionKey] = useState<string | null>(null);
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const [participantQuery, setParticipantQuery] = useState('');
    const [variantFilter, setVariantFilter] = useState<string>('all');
    const lastClickedIdxRef = useRef<number | null>(null);

    // Per-run output overrides
    const [disabledWordIds, setDisabledWordIds] = useState<Set<string>>(new Set());
    const [includeAtt, setIncludeAtt] = useState(true);
    const [includeLbl, setIncludeLbl] = useState(true);
    const [includeSicap, setIncludeSicap] = useState(true);
    const [includeExcel, setIncludeExcel] = useState(true);
    const [combined, setCombined] = usePersistentState('doc_gen_combined', false, { storage: 'local' });

    // Right studio pane state
    const [studioTab, setStudioTab] = useState<StudioRightTab>('preview');
    const [previewKey, setPreviewKey] = useState<string>('');
    const [previewParticipantIdx, setPreviewParticipantIdx] = useState(0);

    // Apply smart defaults when switching Confirmed vs Completed
    const applySmartDefaults = (nextStatus: GenerationStatus) => {
        setDisabledWordIds(new Set());
        const isConfirmed = nextStatus === 'confirmed';
        setIncludeAtt(isConfirmed);
        setIncludeLbl(isConfirmed);
        setIncludeSicap(isConfirmed);
        setIncludeExcel(true);
    };

    // ─── Cohort & participants ──────────────────────────────
    const withStatus = useMemo(
        () => enrollments.filter(e => e.status === status && e.students),
        [enrollments, status],
    );
    const counts = useMemo(() => {
        const map = new Map<string, number>();
        for (const e of withStatus) map.set(e.course_id, (map.get(e.course_id) || 0) + 1);
        return map;
    }, [withStatus]);
    const coursesWithPeople = useMemo(() => courses.filter(c => counts.has(c.id)), [courses, counts]);
    const course = courses.find(c => c.id === courseId);

    // Clear stale courseId if realtime removed all participants for that course
    useEffect(() => {
        if (courseId && !enrollmentsLoading && !counts.has(courseId)) {
            setCourseId('');
            setSessionKey(null);
            setExcluded(new Set());
        }
    }, [courseId, counts, enrollmentsLoading]);

    const sessions = useMemo(
        () => groupSessions(withStatus.filter(e => e.course_id === courseId)),
        [withStatus, courseId],
    );
    const session = sessions.find(s => s.key === sessionKey) ?? sessions.find(s => s.key === defaultSessionKey(sessions, status));
    const allRows = useMemo(() => sortBySurname(session?.enrollments ?? []), [session]);

    // Distinct language variants in this session
    const sessionVariants = useMemo(() => {
        const set = new Set<string>();
        for (const e of allRows) {
            const v = cleanVariant(course?.name || '', e.course_variant);
            if (v) set.add(v);
        }
        return [...set];
    }, [allRows, course?.name]);

    const visibleRows = useMemo(() => {
        const q = participantQuery.trim().toLowerCase();
        return allRows.filter(e => {
            if (variantFilter !== 'all') {
                const v = cleanVariant(course?.name || '', e.course_variant);
                if (v !== variantFilter) return false;
            }
            if (!q) return true;
            const name = `${e.students?.first_name || ''} ${e.students?.last_name || ''}`.toLowerCase();
            const email = (e.students?.email || '').toLowerCase();
            const phone = (e.students?.phone || '').toLowerCase();
            return name.includes(q) || email.includes(q) || phone.includes(q);
        });
    }, [allRows, participantQuery, variantFilter, course?.name]);

    const selected = useMemo(() => allRows.filter(e => !excluded.has(e.id)), [allRows, excluded]);
    const visibleSelectedCount = useMemo(
        () => visibleRows.filter(e => !excluded.has(e.id)).length,
        [visibleRows, excluded],
    );

    // Fetch course schedule & signed-in staff member for the active session
    const docContextQuery = useQuery({
        queryKey: ['doc_context', courseId, session?.key, allRows.length],
        queryFn: () => fetchDocContext(allRows),
        enabled: !!courseId && allRows.length > 0,
        staleTime: 60_000,
    });
    const docContext = docContextQuery.data;
    const sessionRun = useMemo(
        () => (allRows.length > 0 ? courseRun(allRows, docContext?.sessions) : null),
        [allRows, docContext?.sessions],
    );

    // Matching recent generation for this course + session date
    const lastSessionRun = useMemo(() => {
        if (!courseId || !generations.length) return null;
        const dateKey = session?.date ?? null;
        return generations.find(g => g.course_id === courseId && g.session_date === dateKey) ?? null;
    }, [courseId, session?.date, generations]);

    const toggleParticipant = (id: string, indexInVisible?: number, shiftKey?: boolean) => {
        setExcluded(prev => {
            const next = new Set(prev);
            const currentlyIncluded = !next.has(id);
            const shouldInclude = !currentlyIncluded;

            if (shiftKey && indexInVisible !== undefined && lastClickedIdxRef.current !== null) {
                const start = Math.min(lastClickedIdxRef.current, indexInVisible);
                const end = Math.max(lastClickedIdxRef.current, indexInVisible);
                for (let i = start; i <= end; i++) {
                    const rowId = visibleRows[i]?.id;
                    if (!rowId) continue;
                    if (shouldInclude) next.delete(rowId);
                    else next.add(rowId);
                }
            } else {
                if (shouldInclude) next.delete(id);
                else next.add(id);
            }
            return next;
        });
        if (indexInVisible !== undefined) lastClickedIdxRef.current = indexInVisible;
    };

    const allChecked = visibleRows.length > 0 && visibleSelectedCount === visibleRows.length;
    const toggleAll = () => {
        setExcluded(prev => {
            if (visibleRows.length === allRows.length) {
                return allChecked ? new Set(allRows.map(e => e.id)) : new Set();
            }
            const next = new Set(prev);
            for (const r of visibleRows) {
                if (allChecked) next.add(r.id);
                else next.delete(r.id);
            }
            return next;
        });
    };

    // ─── What goes into the archive ─────────────────────────
    const preset = useMemo(() => coursePreset(templates, course?.template_ids), [templates, course?.template_ids]);
    const presetTemplates = preset.templates;
    const chosenWordTemplates = useMemo(
        () => presetTemplates.filter(t => !disabledWordIds.has(t.id)),
        [presetTemplates, disabledWordIds],
    );

    const toggleWordTemplate = (id: string) => {
        setDisabledWordIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const effectiveAtt = !!attTemplate && includeAtt;
    const effectiveLbl = !!labelTemplate && includeLbl;
    const effectiveSicap = !!sicapTemplate && includeSicap;
    const effectiveExcel = excelColumns.length > 0 && includeExcel;
    const effectiveExcelColumns = useMemo(
        () => (effectiveExcel ? excelColumns : []),
        [effectiveExcel, excelColumns],
    );
    const effectiveCombined = combined && chosenWordTemplates.length > 0;

    const hasConfiguredAny = presetTemplates.length > 0 || !!attTemplate || !!labelTemplate || !!sicapTemplate || excelColumns.length > 0;
    const hasSelectedOutput = chosenWordTemplates.length > 0 || effectiveAtt || effectiveLbl || effectiveSicap || effectiveExcel;
    const canGenerate = !setup.error && selected.length > 0 && hasSelectedOutput;

    const presetNote = { all: 'all active — no course preset', preset: 'course preset', 'preset-off': '' }[preset.state];
    const wordSummaryText = preset.state === 'preset-off'
        ? 'Word documents: every template picked for this course is switched off'
        : `${plural(chosenWordTemplates.length, 'Word template')} per student${
            chosenWordTemplates.length
                ? ` (${presetNote}): ${chosenWordTemplates.map(t => templateLabel(t)).join(', ')}`
                : presetTemplates.length
                    ? ` (0 of ${presetTemplates.length} selected for this run)`
                    : ''
        }`;

    const plannedTree = useMemo(
        () => planArchivePaths({
            enrollments: selected,
            templateNames: chosenWordTemplates.map(t => templateLabel(t)),
            combined: effectiveCombined,
            includeAttendance: effectiveAtt,
            includeLabels: effectiveLbl,
            includeSicap: effectiveSicap,
            includeExcel: effectiveExcel,
            excelColumnCount: excelColumns.length,
            context: docContext,
        }),
        [
            selected,
            chosenWordTemplates,
            effectiveCombined,
            effectiveAtt,
            effectiveLbl,
            effectiveSicap,
            effectiveExcel,
            excelColumns.length,
            docContext,
        ],
    );

    const plannedArchiveName = useMemo(
        () => (selected.length > 0 ? archiveFileName(selected) : `${course?.name || 'Documents'}.zip`),
        [selected, course?.name],
    );

    // ─── Available Live Preview targets ─────────────────────
    const previewOptions = useMemo(() => {
        const items: { key: string; label: string; target: PreviewTarget }[] = [];
        for (const tpl of chosenWordTemplates) {
            items.push({
                key: `word:${tpl.id}`,
                label: templateLabel(tpl),
                target: { kind: 'word', template: tpl },
            });
        }
        if (effectiveCombined && chosenWordTemplates.length > 1) {
            items.push({
                key: 'combined',
                label: `Combined (${chosenWordTemplates.length})`,
                target: { kind: 'combined', templates: chosenWordTemplates },
            });
        }
        if (effectiveAtt && attTemplate) {
            items.push({
                key: 'attendance',
                label: 'Attendance sheet',
                target: { kind: 'attendance', template: attTemplate },
            });
        }
        if (effectiveLbl && labelTemplate) {
            items.push({
                key: 'labels',
                label: 'Address labels',
                target: { kind: 'labels', template: labelTemplate },
            });
        }
        if (effectiveSicap && sicapTemplate) {
            items.push({
                key: 'sicap',
                label: 'SICAP form',
                target: { kind: 'sicap', template: sicapTemplate },
            });
        }
        return items;
    }, [chosenWordTemplates, effectiveCombined, effectiveAtt, attTemplate, effectiveLbl, labelTemplate, effectiveSicap, sicapTemplate]);

    const activePreviewOption = previewOptions.find(o => o.key === previewKey) ?? previewOptions[0] ?? null;

    // Keep previewParticipantIdx within bounds
    const safePreviewIdx = selected.length > 0 ? Math.min(previewParticipantIdx, selected.length - 1) : 0;

    // ─── Generate ───────────────────────────────────────────
    const {
        progress,
        report,
        generating,
        generate,
        cancel,
        clearReport,
    } = useArchiveRunner({
        canGenerate,
        status,
        courseId,
        courseName: course?.name,
        sessionKey: session?.key,
        sessionDate: session?.date,
        selected,
        chosenWordTemplates,
        attendanceTemplatePath: effectiveAtt ? attTemplate?.storage_path : null,
        labelTemplatePath: effectiveLbl ? labelTemplate?.storage_path : null,
        sicapTemplatePath: effectiveSicap ? sicapTemplate?.storage_path : null,
        archiveVariables,
        excelColumns: effectiveExcelColumns,
        combined: effectiveCombined,
        onLogGeneration: setup.logGeneration.mutate,
        showToast,
    });

    const resetSelection = () => {
        setSessionKey(null);
        setExcluded(new Set());
        setParticipantQuery('');
        setVariantFilter('all');
        clearReport();
        setPreviewParticipantIdx(0);
        lastClickedIdxRef.current = null;
    };
    const changeStatus = (value: GenerationStatus) => {
        setStatus(value);
        setCourseId('');
        resetSelection();
        applySmartDefaults(value);
    };
    const changeCourse = (id: string) => {
        setCourseId(id);
        resetSelection();
        setDisabledWordIds(new Set());
    };
    const changeSession = (key: string) => {
        setSessionKey(key);
        setExcluded(new Set());
        setParticipantQuery('');
        setVariantFilter('all');
        clearReport();
        setPreviewParticipantIdx(0);
        lastClickedIdxRef.current = null;
    };

    const statusWord = status === 'confirmed' ? 'confirmed' : 'completed';
    const dateHeader = status === 'confirmed' ? 'Confirmed' : 'Completed';

    const handleRowClick = (e: MouseEvent<HTMLTableRowElement>, id: string, idx: number) => {
        const target = e.target as HTMLElement;
        if (target.closest('input, button, a')) return;
        toggleParticipant(id, idx, e.shiftKey);
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] gap-5 items-start">
            {/* ═══ Left Column: 3-Step Generation Flow & Recent Runs ═══ */}
            <div className="space-y-5 min-w-0">
                <Card
                    title="Generate documents"
                    subtitle="Personalised documents for the participants of one course date"
                    icon={Download}
                    tone="success"
                    divided
                >
                    <div className="space-y-6">
                        {/* Step 1: Course & Status */}
                        <div>
                            <StepHeader
                                n={1}
                                title="Choose a course"
                                done={!!course}
                                hint={`${coursesWithPeople.length} with ${statusWord} students`}
                            />
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Segmented
                                    options={STATUS_OPTIONS}
                                    value={status}
                                    onChange={changeStatus}
                                    ariaLabel="Participants"
                                    className="shrink-0 self-start sm:self-center"
                                />
                                <div className="flex-1 min-w-0">
                                    <CoursePicker
                                        courses={coursesWithPeople}
                                        counts={counts}
                                        countLabel={statusWord}
                                        value={courseId}
                                        onChange={changeCourse}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Step 2: Session Date & Participants */}
                        <div>
                            <StepHeader
                                n={2}
                                title="Choose the date and participants"
                                done={selected.length > 0}
                                hint={course && allRows.length ? `${selected.length} of ${allRows.length} selected` : undefined}
                            />
                            {Boolean(enrollmentsError) && (
                                <div className="mb-3">
                                    <ErrorState
                                        title="Could not load enrollments"
                                        error={enrollmentsError}
                                        onRetry={() => onRetryEnrollments?.()}
                                    />
                                </div>
                            )}

                            {!course ? (
                                enrollmentsLoading && enrollments.length === 0 ? (
                                    <SkeletonRows rows={3} />
                                ) : (
                                    <div className={`${panelCls} border-dashed px-4 py-6 text-center text-xs text-muted`}>
                                        Pick a course above to see who will receive documents.
                                    </div>
                                )
                            ) : allRows.length === 0 ? (
                                <div className={`${panelCls} px-4 py-6 text-center`}>
                                    <AlertCircle size={20} className="mx-auto mb-2 text-muted" />
                                    <p className="text-sm text-muted">No {statusWord} enrollments for this course</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Session date selector + Last generated badge */}
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        {sessions.length > 1 ? (
                                            <div role="radiogroup" aria-label="Course date" className="flex flex-wrap gap-1.5">
                                                {sessions.map(s => {
                                                    const active = s.key === session?.key;
                                                    return (
                                                        <button
                                                            key={s.key}
                                                            type="button"
                                                            role="radio"
                                                            aria-checked={active}
                                                            onClick={() => changeSession(s.key)}
                                                            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                                                                active
                                                                    ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                                                                    : 'bg-surface border-border-subtle text-muted hover:text-primary hover:border-border-strong'
                                                            }`}
                                                        >
                                                            <CalendarDays size={13} />
                                                            {s.date ? formatDisplayDate(s.date) : 'No date'}
                                                            <span className="tabular-nums opacity-70">· {s.enrollments.length}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="flex items-center gap-1.5 text-xs text-muted">
                                                <CalendarDays size={13} />
                                                {session?.date ? `Course date ${formatDisplayDate(session.date)}` : 'No course date set'}
                                            </p>
                                        )}

                                        {lastSessionRun && (
                                            <Badge tone="success" shape="pill" icon={<History size={11} />}>
                                                Generated {formatRelativeTime(lastSessionRun.created_at)}
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Session Context Strip ({venue}, {startDate}-{endDate}, {staffName}) */}
                                    {docContext && (
                                        <div className="rounded-xl border border-border-subtle bg-surface-elevated/45 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                                            {sessionRun?.first && sessionRun?.last && sessionRun.first !== sessionRun.last && (
                                                <span className="inline-flex items-center gap-1.5 text-muted">
                                                    <CalendarDays size={12} className="text-brand-600 dark:text-brand-400" />
                                                    <span>
                                                        Schedule: <strong className="text-primary font-medium">{formatDisplayDate(sessionRun.first)} – {formatDisplayDate(sessionRun.last)}</strong>
                                                    </span>
                                                </span>
                                            )}
                                            <span className="inline-flex items-center gap-1.5 text-muted">
                                                <MapPin size={12} className={sessionRun?.venue ? 'text-status-confirmed' : 'text-muted'} />
                                                {sessionRun?.venue ? (
                                                    <span>Venue: <strong className="text-primary font-medium">{sessionRun.venue}</strong></span>
                                                ) : (
                                                    <span>No venue set for this date</span>
                                                )}
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 text-muted ml-auto">
                                                <UserCheck size={12} className={docContext.staffName ? 'text-status-confirmed' : 'text-status-requested'} />
                                                {docContext.staffName ? (
                                                    <span>Staff: <strong className="text-primary font-medium">{docContext.staffName}</strong></span>
                                                ) : (
                                                    <span className="text-status-requested font-medium">
                                                        {'{staffName}'} is blank
                                                        {onOpenSettingsGeneral && (
                                                            <>
                                                                {' · '}
                                                                <button
                                                                    type="button"
                                                                    onClick={onOpenSettingsGeneral}
                                                                    className="underline hover:no-underline font-semibold"
                                                                >
                                                                    Set in Settings
                                                                </button>
                                                            </>
                                                        )}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    )}

                                    {/* Participant Search & Variant Quick Filter */}
                                    {(allRows.length > 4 || sessionVariants.length > 1 || participantQuery.trim() !== '') && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <SearchInput
                                                value={participantQuery}
                                                onChange={setParticipantQuery}
                                                placeholder="Filter participants by name, email or phone…"
                                                aria-label="Filter participants"
                                                wrapperClassName="flex-1 min-w-[200px]"
                                            />
                                            {sessionVariants.length > 1 && (
                                                <div className="flex flex-wrap items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setVariantFilter('all')}
                                                        className={`h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                                                            variantFilter === 'all'
                                                                ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                                                                : 'bg-surface border-border-subtle text-muted hover:text-primary'
                                                        }`}
                                                    >
                                                        All variants
                                                    </button>
                                                    {sessionVariants.map(v => (
                                                        <button
                                                            key={v}
                                                            type="button"
                                                            onClick={() => setVariantFilter(v)}
                                                            className={`h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                                                                variantFilter === v
                                                                    ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                                                                    : 'bg-surface border-border-subtle text-muted hover:text-primary'
                                                            }`}
                                                        >
                                                            {v}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Participants Table */}
                                    <div className="rounded-xl border border-border-subtle overflow-hidden">
                                        <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                            <table className={tableCls}>
                                                <thead className={`${theadCls} sticky top-0 z-10 bg-surface-elevated!`}>
                                                    <tr>
                                                        <th className={`${thCls} w-10`}>
                                                            <input
                                                                type="checkbox"
                                                                aria-label="Select all participants"
                                                                checked={allChecked}
                                                                ref={el => {
                                                                    if (el) el.indeterminate = visibleSelectedCount > 0 && !allChecked;
                                                                }}
                                                                onChange={toggleAll}
                                                                className="accent-brand-500 cursor-pointer"
                                                            />
                                                        </th>
                                                        <th className={thCls}>Name</th>
                                                        <th className={`${thCls} hidden md:table-cell`}>Phone</th>
                                                        <th className={thCls}>Variant</th>
                                                        <th className={`${thCls} hidden sm:table-cell`}>{dateHeader}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={tbodyCls}>
                                                    {visibleRows.map((e, idx) => {
                                                        const checked = !excluded.has(e.id);
                                                        const name = `${e.students?.first_name || ''} ${e.students?.last_name || ''}`.trim();
                                                        const date = status === 'confirmed'
                                                            ? (e.confirmed_date || e.invited_date)
                                                            : (e.completed_date || e.confirmed_date);
                                                        return (
                                                            <tr
                                                                key={e.id}
                                                                onClick={ev => handleRowClick(ev, e.id, idx)}
                                                                className={`${trCls} cursor-pointer select-none ${
                                                                    checked ? 'bg-brand-500/[0.02]' : 'opacity-50'
                                                                }`}
                                                            >
                                                                <td className={`${tdCls} py-2.5!`}>
                                                                    <input
                                                                        type="checkbox"
                                                                        aria-label={`Include ${name}`}
                                                                        checked={checked}
                                                                        onChange={ev => {
                                                                            const shift = Boolean((ev.nativeEvent as { shiftKey?: boolean }).shiftKey);
                                                                            toggleParticipant(e.id, idx, shift);
                                                                        }}
                                                                        className="accent-brand-500 cursor-pointer"
                                                                    />
                                                                </td>
                                                                <td className={`${tdCls} py-2.5!`}>
                                                                    <p className="font-medium text-primary text-[13px]">{name}</p>
                                                                    <p className="text-xs text-muted truncate max-w-[240px]">{e.students?.email || '—'}</p>
                                                                </td>
                                                                <td className={`${tdCls} py-2.5! text-muted text-xs tabular-nums hidden md:table-cell`}>
                                                                    {formatPhoneDisplay(e.students?.phone) || '—'}
                                                                </td>
                                                                <td className={`${tdCls} py-2.5!`}>
                                                                    {e.course_variant ? <Badge tone="completed">{e.course_variant}</Badge> : <span className="text-muted">—</span>}
                                                                </td>
                                                                <td className={`${tdCls} py-2.5! text-muted text-xs hidden sm:table-cell whitespace-nowrap`}>
                                                                    {date ? formatDisplayDate(date) : '—'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Step 3: Interactive Archive Checklist & Generate */}
                        <div>
                            <StepHeader
                                n={3}
                                title="What goes into the ZIP"
                                done={!!report && summarizeGeneration(report.result).type !== 'error'}
                                hint={plannedTree.totalFiles > 0 ? `${plural(plannedTree.totalFiles, 'file')} planned` : undefined}
                            />

                            <div className="space-y-3 mb-4">
                                {/* Word Templates Section */}
                                <div className="rounded-xl border border-border-subtle bg-surface-elevated/35 p-3 space-y-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {preset.state === 'preset-off' ? (
                                                <AlertCircle size={14} className="text-status-requested shrink-0" />
                                            ) : chosenWordTemplates.length > 0 ? (
                                                <CheckCircle2 size={14} className="text-status-confirmed shrink-0" />
                                            ) : (
                                                <FileText size={14} className="text-muted shrink-0" />
                                            )}
                                            <span
                                                className={`text-xs ${
                                                    preset.state === 'preset-off'
                                                        ? 'text-status-requested font-medium'
                                                        : chosenWordTemplates.length > 0
                                                            ? 'text-primary font-medium'
                                                            : 'text-muted'
                                                }`}
                                            >
                                                {wordSummaryText}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => onNavigateTab('templates', course?.id)}
                                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                                        >
                                            <SlidersHorizontal size={12} />
                                            {course ? 'Edit course preset' : 'Manage templates'}
                                        </button>
                                    </div>

                                    {presetTemplates.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                                            {presetTemplates.map(tpl => {
                                                const active = !disabledWordIds.has(tpl.id);
                                                const label = templateLabel(tpl);
                                                return (
                                                    <label
                                                        key={tpl.id}
                                                        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                                                            active
                                                                ? 'bg-surface border-brand-500/40 text-primary shadow-2xs'
                                                                : 'bg-surface-elevated/40 border-border-subtle text-muted'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={active}
                                                            onChange={() => toggleWordTemplate(tpl.id)}
                                                            className="accent-brand-500 cursor-pointer"
                                                        />
                                                        <span className="truncate max-w-[200px]">{label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Group & Sheet Outputs Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {[
                                        {
                                            key: 'att',
                                            label: 'Attendance sheet',
                                            icon: ClipboardList,
                                            configured: !!attTemplate,
                                            checked: effectiveAtt,
                                            onToggle: () => setIncludeAtt(v => !v),
                                            setupTab: 'templates' as DocumentsTabKey,
                                        },
                                        {
                                            key: 'lbl',
                                            label: 'Address labels',
                                            icon: Tag,
                                            configured: !!labelTemplate,
                                            checked: effectiveLbl,
                                            onToggle: () => setIncludeLbl(v => !v),
                                            setupTab: 'templates' as DocumentsTabKey,
                                        },
                                        {
                                            key: 'sicap',
                                            label: 'SICAP course form',
                                            icon: ClipboardCheck,
                                            configured: !!sicapTemplate,
                                            checked: effectiveSicap,
                                            onToggle: () => setIncludeSicap(v => !v),
                                            setupTab: 'templates' as DocumentsTabKey,
                                        },
                                        {
                                            key: 'xlsx',
                                            label: `Participants.xlsx (${plural(excelColumns.length, 'column')})`,
                                            icon: FileSpreadsheet,
                                            configured: excelColumns.length > 0,
                                            checked: effectiveExcel,
                                            onToggle: () => setIncludeExcel(v => !v),
                                            setupTab: 'variables' as DocumentsTabKey,
                                        },
                                    ].map(item => {
                                        const Icon = item.icon;
                                        return (
                                            <div
                                                key={item.key}
                                                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs transition-colors ${
                                                    item.checked
                                                        ? 'bg-surface border-border-subtle text-primary'
                                                        : 'bg-surface-elevated/35 border-border-subtle text-muted'
                                                }`}
                                            >
                                                {item.configured ? (
                                                    <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={item.checked}
                                                            onChange={item.onToggle}
                                                            className="accent-brand-500 cursor-pointer shrink-0"
                                                        />
                                                        <Icon size={13} className={item.checked ? 'text-status-confirmed shrink-0' : 'text-muted shrink-0'} />
                                                        <span className="truncate font-medium">{item.label}</span>
                                                    </label>
                                                ) : (
                                                    <>
                                                        <span className="flex items-center gap-2 min-w-0 truncate">
                                                            <Icon size={13} className="text-muted shrink-0" />
                                                            <span className="truncate">{item.label}</span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => onNavigateTab(item.setupTab)}
                                                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                                                        >
                                                            Set up <ArrowUpRight size={11} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Combined per-student file toggle */}
                                <div className="rounded-xl border border-border-subtle bg-surface-elevated/30 px-3 py-2.5">
                                    <Switch
                                        size="sm"
                                        checked={effectiveCombined}
                                        disabled={chosenWordTemplates.length === 0 || generating}
                                        onChange={setCombined}
                                        label={
                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                                                <Printer size={13} />
                                                Also one combined file per student
                                            </span>
                                        }
                                        description="All templates for each person in a single .docx, one after another on new pages — for printing. Saved in the Combined folder of the ZIP."
                                    />
                                </div>
                            </div>

                            {progress ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between text-xs text-muted mb-1">
                                                <span>
                                                    {progress.sample ? 'Generating a sample… ' : ''}
                                                    {PHASE_LABELS[progress.phase]}
                                                </span>
                                                {progress.total > 0 && (
                                                    <span className="tabular-nums">{progress.done} / {progress.total} files</span>
                                                )}
                                            </div>
                                            <div
                                                className="h-1.5 rounded-full bg-surface-elevated overflow-hidden"
                                                role="progressbar"
                                                aria-valuemin={0}
                                                aria-valuemax={progress.total || 1}
                                                aria-valuenow={progress.done}
                                            >
                                                <div
                                                    className="h-full bg-success transition-all"
                                                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 12}%` }}
                                                />
                                            </div>
                                        </div>
                                        <Button variant="secondary" size="sm" onClick={cancel}>
                                            <Square size={12} />
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <Button
                                        variant={canGenerate ? 'success' : 'secondary'}
                                        size="lg"
                                        className="w-full h-11!"
                                        onClick={() => generate()}
                                        disabled={!canGenerate}
                                    >
                                        <FileArchive size={17} className="shrink-0" />
                                        <span className="truncate">
                                            Generate & Download ZIP{' '}
                                            <span className="hidden sm:inline">
                                                ({plural(selected.length, 'student')} × {plural(chosenWordTemplates.length, 'template')})
                                            </span>
                                        </span>
                                    </Button>
                                    {canGenerate && (
                                        <div className="mt-2 flex justify-center">
                                            <Button variant="ghost" size="sm" onClick={() => generate(true)}>
                                                <FlaskConical size={14} />
                                                Try with one participant first
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}

                            {!hasConfiguredAny && (
                                <p className="mt-2 text-xs text-status-requested text-center font-medium flex items-center justify-center gap-1.5">
                                    <AlertCircle size={13} />
                                    Upload a Word template, an attendance, label or SICAP form template, or add Excel columns first
                                </p>
                            )}
                            {hasConfiguredAny && !hasSelectedOutput && (
                                <p className={`mt-2 ${calloutCls.warning} px-3 py-2 text-xs text-center font-medium`}>
                                    Tick at least one output above to generate an archive.
                                </p>
                            )}
                            {report && (
                                <GenerationReport
                                    result={report.result}
                                    fileName={report.fileName}
                                    onDismiss={clearReport}
                                />
                            )}
                        </div>
                    </div>
                </Card>

                <RecentRunsPanel
                    records={generations}
                    ready={generationsReady}
                    currentCourseId={courseId || undefined}
                    currentSessionDate={session?.date}
                />
            </div>

            {/* ═══ Right Column (Sticky Studio): Live .docx Preview & Archive Tree ═══ */}
            <div className="xl:sticky xl:top-5 space-y-4 min-w-0">
                <Card
                    title={studioTab === 'preview' ? 'Live document preview' : 'Archive manifest'}
                    subtitle={
                        studioTab === 'preview'
                            ? 'Inspect filled pages as Word lays them out, check placeholder health or download a single file'
                            : 'Exact folders and files that will be packaged into the downloaded ZIP'
                    }
                    icon={studioTab === 'preview' ? Eye : FolderTree}
                    tone="brand"
                    divided
                    action={
                        <Segmented<StudioRightTab>
                            size="sm"
                            ariaLabel="Studio view"
                            value={studioTab}
                            onChange={setStudioTab}
                            options={[
                                { value: 'preview', label: 'Live Preview', icon: <Eye size={12} /> },
                                {
                                    value: 'tree',
                                    label: 'Archive Tree',
                                    icon: <FolderTree size={12} />,
                                    count: plannedTree.totalFiles,
                                },
                            ]}
                        />
                    }
                >
                    {studioTab === 'tree' ? (
                        <ArchiveTreePreview
                            archiveName={plannedArchiveName}
                            enrollments={selected}
                            templateNames={chosenWordTemplates.map(t => templateLabel(t))}
                            combined={effectiveCombined}
                            includeAttendance={effectiveAtt}
                            includeLabels={effectiveLbl}
                            includeSicap={effectiveSicap}
                            includeExcel={effectiveExcel}
                            excelColumnCount={excelColumns.length}
                            context={docContext}
                        />
                    ) : previewOptions.length === 0 ? (
                        <EmptyState
                            bare
                            icon={<Layers size={22} />}
                            title="No Word document enabled to preview"
                            description="Enable at least one Word template, attendance sheet, label template or SICAP form on the left to preview it here."
                        />
                    ) : (
                        <div className="space-y-3">
                            {/* Document selector pills when >1 output is enabled */}
                            {previewOptions.length > 1 && (
                                <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Document to preview">
                                    {previewOptions.map(opt => {
                                        const active = opt.key === activePreviewOption?.key;
                                        return (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                role="tab"
                                                aria-selected={active}
                                                onClick={() => setPreviewKey(opt.key)}
                                                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                                                    active
                                                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                                                        : 'bg-surface border-border-subtle text-muted hover:text-primary hover:border-border-strong'
                                                }`}
                                            >
                                                <FileText size={12} />
                                                <span className="truncate max-w-[180px]">{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <DocxLivePreview
                                target={activePreviewOption?.target ?? null}
                                enrollments={selected}
                                participantIndex={safePreviewIdx}
                                onParticipantChange={setPreviewParticipantIdx}
                                context={docContext}
                                customVariables={archiveVariables.customVariables}
                                dateVariables={archiveVariables.dateVariables}
                                showToast={showToast}
                                isSampleData={selected.length === 0}
                                onExpand={
                                    activePreviewOption
                                        ? () => onOpenPreviewModal({
                                            target: activePreviewOption.target,
                                            enrollments: selected.length > 0 ? selected : undefined,
                                            courseName: course?.name,
                                        })
                                        : undefined
                                }
                            />
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}

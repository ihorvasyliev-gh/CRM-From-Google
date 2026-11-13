import { useState, useMemo, useCallback, useDeferredValue, startTransition, memo, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, BookOpen, Eye, EyeOff, FileSpreadsheet, FileText, LayoutDashboard } from 'lucide-react';
import { fetchEmploymentStatuses, setExcludedFromReports } from '../lib/queries';
import { toast } from '../lib/toast';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { usePersistentState } from '../hooks/usePersistentState';
import { useEnrollmentList } from '../hooks/useEnrollments';
import { useLastPresent } from '../hooks/usePresence';
import type { EnrollmentWithRelations } from '../lib/documentUtils';
import type { EmploymentStatusRow, Student } from '../lib/types';
import StudentDetail from './StudentDetail';
import { Button } from './ui/Button';
import { Segmented, UnderlineTabs, type UnderlineTab } from './ui/Tabs';
import { DateInput } from './ui/DatePicker';
import { fieldCls } from './ui/styles';
import { SelectField } from './Viewer/ViewerUI';
import DrillDownModal from './Analytics/DrillDownModal';
import Overview from './Analytics/Overview';
import { courseRunKey, isReportable, listCourseRuns } from './Analytics/courseRuns';
import { buildInsights, completedIn, dataSpan, registeredIn } from './Analytics/insights';
import { buildNarrative } from './Analytics/narrative';
import {
    REPORT_PRESETS, formatPeriodLabel, presetPeriod, toDayKey,
    type ReportPeriod, type ReportPresetId,
} from './Analytics/summaryReport';

// memo(): opening a drill-down or the student drawer re-renders Analytics; the combinations
// tool only needs to re-render when its data changes
const MultiCourseCompletersTab = memo(lazyWithRetry(() => import('./Analytics/MultiCourseCompletersTab')));
const SummaryReportModal = lazyWithRetry(() => import('./Analytics/SummaryReportModal'));

const EMPTY_ENROLLMENTS: EnrollmentWithRelations[] = [];
const EMPTY_STATUSES: EmploymentStatusRow[] = [];

export type AnalyticsView = 'overview' | 'combinations';
type PresetId = ReportPresetId | 'all' | 'custom';

const PRESET_IDS: PresetId[] = [...REPORT_PRESETS.map(p => p.id), 'all', 'custom'];
const PRESET_OPTIONS = [...REPORT_PRESETS.map(p => ({ value: p.id as PresetId, label: p.label })), { value: 'all' as PresetId, label: 'All time' }];

const VIEWS: UnderlineTab<AnalyticsView>[] = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    { value: 'combinations', label: 'Course combinations', icon: Award },
];

export default function Analytics() {
    const [view, setView] = usePersistentState<AnalyticsView>('analytics.view', 'overview', {
        validate: (v): v is AnalyticsView => v === 'overview' || v === 'combinations',
    });
    const [preset, setPreset] = usePersistentState<PresetId>('analytics.period', 'ytd', {
        validate: (v): v is PresetId => typeof v === 'string' && PRESET_IDS.includes(v as PresetId) && v !== 'custom',
    });
    const [custom, setCustom] = useState<ReportPeriod>(() => presetPeriod('ytd'));
    const [courseId, setCourseId] = useState('all');

    const [drillDown, setDrillDown] = useState<{
        isOpen: boolean;
        title: string;
        data: EnrollmentWithRelations[];
        /** Set when the list is the graduates of a course run */
        runKey?: string;
    }>({ isOpen: false, title: '', data: [] });
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const shownStudent = useLastPresent(selectedStudent);
    const [isExporting, setIsExporting] = useState(false);
    // The report dialog's chunk loads on first open and stays mounted after, so it can animate out
    const [reportOpen, setReportOpen] = useState(false);
    const [reportLoaded, setReportLoaded] = useState(false);

    // Every enrollment: the figures wait for older history, which loads after the current ones
    const enrollmentList = useEnrollmentList();
    const allEnrollments = enrollmentList.complete ? enrollmentList.data ?? EMPTY_ENROLLMENTS : EMPTY_ENROLLMENTS;
    const loading = !enrollmentList.complete;

    const { data: employmentStatuses = EMPTY_STATUSES } = useQuery({
        queryKey: ['analytics_employment_statuses_v1'],
        queryFn: fetchEmploymentStatuses,
        // Realtime sync refreshes it on changes; the page stays mounted between visits, and a
        // short staleTime re-read every status on each return
    });

    const courses = useMemo(() => {
        const names = new Map<string, string>();
        for (const e of allEnrollments) {
            if (e.courses?.id && e.courses.name) names.set(e.courses.id, e.courses.name);
        }
        return [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [allEnrollments]);
    const courseName = courseId === 'all' ? null : courses.find(c => c.id === courseId)?.name ?? null;

    // The chosen course(s): every enrollment (to list ignored course runs), and the counted ones
    const scoped = useMemo(
        () => (courseId === 'all' ? allEnrollments : allEnrollments.filter(e => e.course_id === courseId)),
        [allEnrollments, courseId],
    );
    const counted = useMemo(() => scoped.filter(isReportable), [scoped]);

    const period = useMemo<ReportPeriod>(() => {
        if (preset === 'custom') return custom;
        if (preset === 'all') return dataSpan(counted) ?? presetPeriod('ytd');
        return presetPeriod(preset);
    }, [preset, custom, counted]);

    // The figures render from deferred copies: the period buttons respond at once while the
    // page re-counts in the background
    const deferredCounted = useDeferredValue(counted);
    const deferredPeriod = useDeferredValue(period);
    const isStale = deferredCounted !== counted || deferredPeriod !== period;

    const insights = useMemo(
        () => buildInsights(deferredCounted, employmentStatuses, deferredPeriod, { compare: preset !== 'all' }),
        [deferredCounted, employmentStatuses, deferredPeriod, preset],
    );
    const narrative = useMemo(() => buildNarrative(insights), [insights]);
    const runs = useMemo(() => listCourseRuns(scoped, e => completedIn(e, deferredPeriod)), [scoped, deferredPeriod]);
    const inPeriod = useMemo(
        () => deferredCounted.filter(e => registeredIn(e, deferredPeriod) || completedIn(e, deferredPeriod)),
        [deferredCounted, deferredPeriod],
    );

    // What the Outcomes page shows: everyone who ever completed a course, ignored runs included
    const everyGraduate = useMemo(() => {
        const people = new Set(allEnrollments.filter(e => e.status === 'completed' && e.student_id).map(e => e.student_id));
        const seen = new Set<string>();
        let working = 0;
        for (const es of employmentStatuses) {
            if (seen.has(es.student_id) || !people.has(es.student_id)) continue;
            seen.add(es.student_id);
            if (es.status === 'responded' && es.is_working) working++;
        }
        return { graduates: people.size, working };
    }, [allEnrollments, employmentStatuses]);

    const choosePreset = (id: PresetId) => startTransition(() => setPreset(id));
    const setStart = (start: string) => {
        if (!start) return;
        setCustom({ start, end: start > period.end ? start : period.end });
        setPreset('custom');
    };
    const setEnd = (end: string) => {
        if (!end) return;
        setCustom({ start: end < period.start ? end : period.start, end });
        setPreset('custom');
    };

    const handleDrillDown = useCallback((title: string, data: EnrollmentWithRelations[], runKey?: string) => {
        setDrillDown({ isOpen: true, title, data, runKey });
    }, []);

    // A whole course run (all its enrollments, whatever the filters) in or out of reports
    const queryClient = useQueryClient();
    const handleSetRunIgnored = useCallback(async (runKey: string, ignore: boolean) => {
        const ids = new Set(allEnrollments.filter(e => courseRunKey(e) === runKey).map(e => e.id));
        if (ids.size === 0) return;
        try {
            await setExcludedFromReports([...ids], ignore);
        } catch {
            toast.error('Could not save. Is migration 82 applied?');
            return;
        }
        queryClient.setQueryData<EnrollmentWithRelations[]>(['enrollments'], old =>
            old?.map(e => (ids.has(e.id) ? { ...e, exclude_from_reports: ignore } : e)),
        );
        toast.success(ignore ? 'Course run left out of Analytics and reports' : 'Course run counted in Analytics and reports again');
    }, [allEnrollments, queryClient]);

    // The course run a drill-down lists: ignored when none of its enrollments is counted
    const drillRunKey = drillDown.runKey;
    const drillRunIgnored = useMemo(() => {
        if (!drillRunKey) return false;
        const run = allEnrollments.filter(e => courseRunKey(e) === drillRunKey);
        return run.length > 0 && !run.some(isReportable);
    }, [allEnrollments, drillRunKey]);
    const [savingDrillRun, setSavingDrillRun] = useState(false);
    const toggleDrillRun = async () => {
        if (!drillRunKey) return;
        setSavingDrillRun(true);
        try {
            await handleSetRunIgnored(drillRunKey, !drillRunIgnored);
        } finally {
            setSavingDrillRun(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const { exportAnalyticsExcel } = await import('./Analytics/analyticsExcel');
            await exportAnalyticsExcel({ insights, narrative, enrollments: inPeriod, employmentStatuses, courseName });
        } catch {
            toast.error('Could not make the Excel file');
        } finally {
            setIsExporting(false);
        }
    };

    const today = toDayKey(new Date());
    const nothingLoaded = !loading && counted.length === 0;

    return (
        <div className="flex-1 flex flex-col gap-4 sm:gap-5 pb-12 max-w-[1400px] mx-auto w-full">
            <UnderlineTabs tabs={VIEWS} value={view} onChange={v => startTransition(() => setView(v))} ariaLabel="Analytics views" />

            {/* Period · course · exports */}
            <div className="rounded-2xl bg-surface border border-border-subtle shadow-card p-3 sm:p-3.5 flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <Segmented options={PRESET_OPTIONS} value={preset} onChange={choosePreset} ariaLabel="Period" className="lg:shrink-0" />
                    <div className="flex items-center gap-1.5 lg:ml-auto">
                        <DateInput id="analytics-start" value={period.start} max={today} onChange={setStart} className={`${fieldCls} flex-1 lg:flex-none lg:w-[9.5rem] text-xs font-semibold whitespace-nowrap`} />
                        <span className="text-muted text-xs" aria-hidden>–</span>
                        <DateInput id="analytics-end" value={period.end} max={today} onChange={setEnd} className={`${fieldCls} flex-1 lg:flex-none lg:w-[9.5rem] text-xs font-semibold whitespace-nowrap`} />
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0 flex-1">
                        <SelectField label="Course" value={courseId} onChange={setCourseId} icon={<BookOpen size={14} />} className="w-full sm:w-60">
                            <option value="all">All courses</option>
                            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </SelectField>
                        <p className="text-xs text-muted" aria-live="polite">
                            Showing <span className="font-semibold text-primary">{formatPeriodLabel(period)}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleExportExcel}
                            loading={isExporting}
                            disabled={loading || nothingLoaded}
                            title="The figures on this page and the people behind them, as an Excel file"
                        >
                            {!isExporting && <FileSpreadsheet size={14} />}
                            Excel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => { setReportLoaded(true); setReportOpen(true); }}
                            disabled={loading || nothingLoaded}
                            title="A one- or two-page A4 report for this period, with the figures explained in words"
                        >
                            <FileText size={14} />
                            PDF report
                        </Button>
                    </div>
                </div>
            </div>

            <div className={`transition-opacity duration-200 ${isStale ? 'opacity-60' : ''}`}>
                {view === 'overview' ? (
                    <Overview
                        insights={insights}
                        narrative={narrative}
                        enrollments={deferredCounted}
                        runs={runs}
                        everyGraduate={courseId === 'all' ? everyGraduate : null}
                        loading={loading}
                        onDrillDown={handleDrillDown}
                        onSetRunIgnored={handleSetRunIgnored}
                    />
                ) : (
                    <Suspense
                        fallback={
                            <div className="flex flex-col items-center justify-center py-24 text-muted gap-3">
                                <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
                            </div>
                        }
                    >
                        <MultiCourseCompletersTab allEnrollments={deferredCounted} filteredEnrollments={inPeriod} onOpenStudent={setSelectedStudent} />
                    </Suspense>
                )}
            </div>

            {reportLoaded && (
                <Suspense fallback={null}>
                    <SummaryReportModal
                        open={reportOpen}
                        onClose={() => setReportOpen(false)}
                        insights={insights}
                        narrative={narrative}
                        courseName={courseName}
                    />
                </Suspense>
            )}

            <DrillDownModal
                isOpen={drillDown.isOpen}
                onClose={() => setDrillDown(prev => ({ ...prev, isOpen: false }))}
                title={drillDown.title}
                data={drillDown.data}
                actions={drillRunKey && (
                    <Button
                        variant={drillRunIgnored ? 'brand-soft' : 'secondary'}
                        size="sm"
                        loading={savingDrillRun}
                        onClick={toggleDrillRun}
                        title={drillRunIgnored
                            ? 'Count this course run in Analytics and the PDF report again'
                            : 'Leave this course run out of Analytics and the PDF report'}
                    >
                        {!savingDrillRun && (drillRunIgnored ? <Eye size={14} /> : <EyeOff size={14} />)}
                        {drillRunIgnored ? 'Ignored · Count again' : 'Ignore in reports'}
                    </Button>
                )}
                onSelectStudent={setSelectedStudent}
            />

            {shownStudent && (
                <StudentDetail
                    open={!!selectedStudent}
                    student={shownStudent}
                    onClose={() => setSelectedStudent(null)}
                    onStudentUpdated={setSelectedStudent}
                />
            )}
        </div>
    );
}

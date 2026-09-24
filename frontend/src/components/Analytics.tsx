import { useState, useMemo, useCallback, useDeferredValue, startTransition, memo, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { usePersistentState } from '../hooks/usePersistentState';
import { 
    Users, 
    GraduationCap, 
    Download, 
    FileSpreadsheet, 
    Zap, 
    Clock, 
    Briefcase, 
    CheckCircle2, 
    MapPin, 
    BookOpen, 
    Search,
    Award
} from 'lucide-react';

import { fetchAllEnrollments } from '../hooks/useEnrollments';
import type { EnrollmentWithRelations } from '../lib/documentUtils';
import type { Student } from '../lib/types';
import { cleanVariant } from '../lib/types';
import StudentDetail from './StudentDetail';
import StatTile from './ui/StatTile';
import { Button } from './ui/Button';
import { UnderlineTabs, type UnderlineTab } from './ui/Tabs';

import GlobalFilterBar, { type AnalyticsFilterState } from './Analytics/GlobalFilterBar';
// memo(): opening a drill-down or the student drawer re-renders Analytics; the tabs (charts +
// aggregations) only need to re-render when their data actually changes.
const PipelineVelocityTab = memo(lazyWithRetry(() => import('./Analytics/PipelineVelocityTab')));
const GeographyDemographicsTab = memo(lazyWithRetry(() => import('./Analytics/GeographyDemographicsTab')));
const CourseMatrixTab = memo(lazyWithRetry(() => import('./Analytics/CourseMatrixTab')));
const OutcomesTab = memo(lazyWithRetry(() => import('./Analytics/OutcomesTab')));
const DataExplorerTab = memo(lazyWithRetry(() => import('./Analytics/DataExplorerTab')));
const MultiCourseCompletersTab = memo(lazyWithRetry(() => import('./Analytics/MultiCourseCompletersTab')));

const EMPTY_ENROLLMENTS: EnrollmentWithRelations[] = [];
const EMPTY_STATUSES: any[] = [];
import DrillDownModal from './Analytics/DrillDownModal';
import { 
    calculateSpeedMetrics, 
    calculateFunnelAnalysis, 
    exportExecutiveExcelReport, 
    exportCustomCSV 
} from './Analytics/analyticsUtils';

export type AnalyticsTabId = 'pipeline' | 'geography' | 'courses' | 'outcomes' | 'explorer' | 'multi-course';

export default function Analytics() {
    // 1. Global Filter State
    const [filters, setFilters] = useState<AnalyticsFilterState>({
        datePreset: 'all',
        customStartDate: '',
        customEndDate: '',
        courseId: 'all',
        variant: 'all',
        priorityOnly: false
    });

    // 2. Active Tab State
    const [activeTab, setActiveTab] = usePersistentState<AnalyticsTabId>('analytics.activeTab', 'pipeline', {
        validate: (v): v is AnalyticsTabId => typeof v === 'string' && ['pipeline', 'geography', 'courses', 'outcomes', 'explorer', 'multi-course'].includes(v),
    });

    // 3. DrillDown & Student Detail State
    const [drillDownModal, setDrillDownModal] = useState<{
        isOpen: boolean;
        title: string;
        data: EnrollmentWithRelations[];
    }>({
        isOpen: false,
        title: '',
        data: []
    });

    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [isExportingExcel, setIsExportingExcel] = useState(false);

    // 4. TanStack Data Queries
    const { data: allEnrollments = EMPTY_ENROLLMENTS, isLoading: isEnrollmentsLoading } = useQuery<EnrollmentWithRelations[]>({
        queryKey: ['enrollments'],
        queryFn: fetchAllEnrollments as any,
    });

    const { data: employmentStatuses = EMPTY_STATUSES } = useQuery({
        queryKey: ['analytics_employment_statuses_v1'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('employment_status')
                .select('*');
            if (error) throw error;
            return data || [];
        },
        staleTime: 60_000,
    });

    // 5. Apply Global Filters
    const filteredEnrollments = useMemo(() => {
        let result = allEnrollments;

        // Date Filter
        if (filters.datePreset !== 'all') {
            const now = new Date();
            let startDate: Date | null = null;
            let endDate: Date | null = null;

            if (filters.datePreset === '30') {
                startDate = new Date(now.getTime() - 30 * 86400000);
            } else if (filters.datePreset === '90') {
                startDate = new Date(now.getTime() - 90 * 86400000);
            } else if (filters.datePreset === '180') {
                startDate = new Date(now.getTime() - 180 * 86400000);
            } else if (filters.datePreset === '365') {
                startDate = new Date(now.getTime() - 365 * 86400000);
            } else if (filters.datePreset === 'custom' && filters.customStartDate && filters.customEndDate) {
                // Parse as local dates (plain YYYY-MM-DD would be UTC midnight and shift a day west of GMT)
                startDate = new Date(`${filters.customStartDate}T00:00:00`);
                endDate = new Date(`${filters.customEndDate}T00:00:00`);
                endDate.setHours(23, 59, 59, 999);
            }

            if (startDate) {
                result = result.filter(e => {
                    const d = new Date(e.created_at);
                    if (endDate) {
                        return d >= startDate! && d <= endDate;
                    }
                    return d >= startDate!;
                });
            }
        }

        // Course Filter
        if (filters.courseId !== 'all') {
            result = result.filter(e => e.course_id === filters.courseId);
        }

        // Variant Filter
        if (filters.variant !== 'all') {
            result = result.filter(e => cleanVariant(e.courses?.name || '', e.course_variant).toLowerCase() === filters.variant.toLowerCase());
        }

        // Priority Filter
        if (filters.priorityOnly) {
            result = result.filter(e => !!e.is_priority);
        }

        return result;
    }, [allEnrollments, filters]);

    // Tabs render from deferred copies: filter controls and KPI cards update instantly while the
    // heavier chart/aggregation re-render happens in the background (and can be interrupted).
    const deferredFiltered = useDeferredValue(filteredEnrollments);
    const deferredAll = useDeferredValue(allEnrollments);
    const isTabStale = deferredFiltered !== filteredEnrollments || deferredAll !== allEnrollments;

    // Switching tabs may download a chunk and mount heavy charts — keep the current view
    // interactive meanwhile instead of flashing the Suspense fallback.
    const selectTab = useCallback((tab: AnalyticsTabId) => {
        startTransition(() => setActiveTab(tab));
    }, [setActiveTab]);

    // 6. High-level KPI Summary Calculations
    const kpiSummary = useMemo(() => {
        const total = filteredEnrollments.length;
        const requested = filteredEnrollments.filter(e => e.status === 'requested').length;
        const invited = filteredEnrollments.filter(e => e.status === 'invited').length;
        const confirmed = filteredEnrollments.filter(e => e.status === 'confirmed').length;
        const completed = filteredEnrollments.filter(e => e.status === 'completed').length;
        const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        const speed = calculateSpeedMetrics(filteredEnrollments);
        const funnel = calculateFunnelAnalysis(filteredEnrollments);

        // Employed among graduates
        const completedStudentIds = new Set(
            filteredEnrollments.filter(e => e.status === 'completed' && e.student_id).map(e => e.student_id)
        );
        const respondedStatuses = employmentStatuses.filter(
            (es: any) => completedStudentIds.has(es.student_id) && es.status === 'responded'
        );
        const workingCount = respondedStatuses.filter((es: any) => es.is_working === true).length;
        const employmentRate = respondedStatuses.length > 0 ? Math.round((workingCount / respondedStatuses.length) * 100) : 0;

        return {
            total,
            requested,
            invited,
            confirmed,
            completed,
            successRate,
            speed,
            funnel,
            workingCount,
            employmentRate,
            respondedCount: respondedStatuses.length
        };
    }, [filteredEnrollments, employmentStatuses]);

    // Handlers
    const handleDrillDown = useCallback((title: string, data: EnrollmentWithRelations[]) => {
        setDrillDownModal({
            isOpen: true,
            title,
            data
        });
    }, []);

    const handleOpenStudentDetail = useCallback((student: Student) => {
        setSelectedStudent(student);
    }, []);

    const handleExportExcel = async () => {
        try {
            setIsExportingExcel(true);
            const periodLabel = filters.datePreset === 'all' 
                ? 'All Time' 
                : (filters.datePreset === 'custom' ? `${filters.customStartDate} to ${filters.customEndDate}` : `Last ${filters.datePreset} Days`);
            await exportExecutiveExcelReport(filteredEnrollments, employmentStatuses, periodLabel);
        } finally {
            setIsExportingExcel(false);
        }
    };

    const handleExportActiveCSV = () => {
        exportCustomCSV(filteredEnrollments, `crm_analytics_export_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const navTabs: UnderlineTab<AnalyticsTabId>[] = [
        { value: 'pipeline', label: 'Pipeline & velocity', icon: Zap },
        { value: 'geography', label: 'Geography & demographics', icon: MapPin },
        { value: 'courses', label: 'Courses & cohorts', icon: BookOpen },
        { value: 'outcomes', label: 'Graduate outcomes', icon: Briefcase },
        { value: 'explorer', label: 'Data explorer', icon: Search },
        { value: 'multi-course', label: 'Multi-course completers', icon: Award },
    ];

    const loadingView = (label: string) => (
        <div className="flex flex-col items-center justify-center py-24 text-muted gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
            <p className="text-xs font-medium">{label}</p>
        </div>
    );

    return (
        <div className="flex-1 flex flex-col gap-5 sm:gap-6 pb-12 animate-fadeIn max-w-[1600px] mx-auto w-full">
            {/* Filters + exports */}
            <GlobalFilterBar
                filters={filters}
                onFiltersChange={setFilters}
                allEnrollments={allEnrollments}
                filteredEnrollments={filteredEnrollments}
                actions={
                    <>
                        <Button variant="secondary" size="sm" onClick={handleExportActiveCSV} disabled={filteredEnrollments.length === 0} title="Export the current scope as CSV">
                            <Download size={14} />
                            CSV
                        </Button>
                        <Button variant="success" size="sm" onClick={handleExportExcel} loading={isExportingExcel} disabled={filteredEnrollments.length === 0} title="Executive Excel report (.xlsx)">
                            {!isExportingExcel && <FileSpreadsheet size={14} />}
                            {isExportingExcel ? 'Generating…' : 'Excel report'}
                        </Button>
                    </>
                }
            />

            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                <StatTile
                    label="Total pipeline"
                    icon={Users}
                    tone="brand"
                    value={kpiSummary.total}
                    hint={`${kpiSummary.completed + kpiSummary.confirmed} confirmed or graduated`}
                    loading={isEnrollmentsLoading}
                    onClick={() => handleDrillDown('All Active Scope Applications', filteredEnrollments)}
                />
                <StatTile
                    label="Waiting queue"
                    icon={Clock}
                    tone="warning"
                    value={kpiSummary.requested}
                    hint={`Avg ${kpiSummary.speed.avgDaysToInvite}d to invite`}
                    loading={isEnrollmentsLoading}
                    onClick={() => handleDrillDown('Candidates In Waiting Queue', filteredEnrollments.filter(e => e.status === 'requested'))}
                />
                <StatTile
                    label="In course"
                    icon={CheckCircle2}
                    tone="info"
                    value={kpiSummary.confirmed}
                    hint="Confirmed attendees"
                    loading={isEnrollmentsLoading}
                    onClick={() => handleDrillDown('Confirmed Students', filteredEnrollments.filter(e => e.status === 'confirmed'))}
                />
                <StatTile
                    label="Graduates"
                    icon={GraduationCap}
                    tone="success"
                    value={kpiSummary.completed}
                    hint={`${kpiSummary.successRate}% success rate`}
                    hintTone="positive"
                    loading={isEnrollmentsLoading}
                    onClick={() => handleDrillDown('Graduated Course Completers', filteredEnrollments.filter(e => e.status === 'completed'))}
                />
                <StatTile
                    label="Avg full cycle"
                    icon={Zap}
                    tone="neutral"
                    value={<>{kpiSummary.speed.avgTotalCycleDays}<span className="text-sm font-semibold text-muted ml-0.5">d</span></>}
                    hint="Application → graduation"
                    loading={isEnrollmentsLoading}
                    onClick={() => selectTab('pipeline')}
                />
                <StatTile
                    label="Employed"
                    icon={Briefcase}
                    tone="completed"
                    value={`${kpiSummary.employmentRate}%`}
                    hint={`${kpiSummary.workingCount} of ${kpiSummary.respondedCount} who responded`}
                    loading={isEnrollmentsLoading}
                    onClick={() => selectTab('outcomes')}
                />
            </div>

            {/* Report navigation */}
            <UnderlineTabs tabs={navTabs} value={activeTab} onChange={selectTab} ariaLabel="Analytics reports" className="-mb-1" />

            {/* Active report */}
            <div className={`min-h-[500px] transition-opacity duration-200 ${isTabStale ? 'opacity-60' : ''}`}>
                {isEnrollmentsLoading ? (
                    loadingView('Aggregating CRM data…')
                ) : (
                    <Suspense fallback={loadingView('Loading report…')}>
                        {activeTab === 'pipeline' && (
                            <PipelineVelocityTab
                                enrollments={deferredFiltered}
                                onDrillDown={handleDrillDown}
                            />
                        )}

                        {activeTab === 'geography' && (
                            <GeographyDemographicsTab
                                enrollments={deferredFiltered}
                                onDrillDown={handleDrillDown}
                            />
                        )}

                        {activeTab === 'courses' && (
                            <CourseMatrixTab
                                enrollments={deferredFiltered}
                                onDrillDown={handleDrillDown}
                            />
                        )}

                        {activeTab === 'outcomes' && (
                            <OutcomesTab
                                enrollments={deferredFiltered}
                                employmentStatuses={employmentStatuses}
                                onDrillDown={handleDrillDown}
                            />
                        )}

                        {activeTab === 'explorer' && (
                            <DataExplorerTab
                                enrollments={deferredFiltered}
                                onOpenStudent={handleOpenStudentDetail}
                            />
                        )}

                        {activeTab === 'multi-course' && (
                            <MultiCourseCompletersTab
                                allEnrollments={deferredAll}
                                filteredEnrollments={deferredFiltered}
                                onOpenStudent={handleOpenStudentDetail}
                            />
                        )}
                    </Suspense>
                )}
            </div>

            {/* Universal Drill-down Modal */}
            <DrillDownModal
                isOpen={drillDownModal.isOpen}
                onClose={() => setDrillDownModal(prev => ({ ...prev, isOpen: false }))}
                title={drillDownModal.title}
                data={drillDownModal.data}
                onSelectStudent={handleOpenStudentDetail}
            />

            {/* Student Detail Slide-Over Drawer */}
            {selectedStudent && (
                <StudentDetail
                    student={selectedStudent}
                    onClose={() => setSelectedStudent(null)}
                    onStudentUpdated={setSelectedStudent}
                />
            )}
        </div>
    );
}

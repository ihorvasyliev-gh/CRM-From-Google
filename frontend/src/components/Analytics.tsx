import { useState, useMemo, useCallback, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { 
    Users, 
    GraduationCap, 
    Download, 
    FileSpreadsheet, 
    Zap, 
    Clock, 
    TrendingUp, 
    Briefcase, 
    CheckCircle2, 
    MapPin, 
    BookOpen, 
    Search 
} from 'lucide-react';

import { fetchAllEnrollments } from '../hooks/useEnrollments';
import type { EnrollmentWithRelations } from '../lib/documentUtils';
import type { Student } from '../lib/types';
import { cleanVariant } from '../lib/types';
import StudentDetail from './StudentDetail';

import GlobalFilterBar, { type AnalyticsFilterState } from './Analytics/GlobalFilterBar';
const PipelineVelocityTab = lazyWithRetry(() => import('./Analytics/PipelineVelocityTab'));
const GeographyDemographicsTab = lazyWithRetry(() => import('./Analytics/GeographyDemographicsTab'));
const CourseMatrixTab = lazyWithRetry(() => import('./Analytics/CourseMatrixTab'));
const OutcomesTab = lazyWithRetry(() => import('./Analytics/OutcomesTab'));
const DataExplorerTab = lazyWithRetry(() => import('./Analytics/DataExplorerTab'));
import DrillDownModal from './Analytics/DrillDownModal';
import { 
    calculateSpeedMetrics, 
    calculateFunnelAnalysis, 
    exportExecutiveExcelReport, 
    exportCustomCSV 
} from './Analytics/analyticsUtils';

export type AnalyticsTabId = 'pipeline' | 'geography' | 'courses' | 'outcomes' | 'explorer';

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
    const [activeTab, setActiveTab] = useState<AnalyticsTabId>('pipeline');

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
    const { data: allEnrollments = [], isLoading: isEnrollmentsLoading } = useQuery<EnrollmentWithRelations[]>({
        queryKey: ['enrollments'],
        queryFn: fetchAllEnrollments as any,
    });

    const { data: employmentStatuses = [] } = useQuery({
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
                startDate = new Date(filters.customStartDate);
                endDate = new Date(filters.customEndDate);
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

    const navTabs = [
        { id: 'pipeline', label: '1. Pipeline & Velocity', icon: Zap },
        { id: 'geography', label: '2. Geography & Demographics', icon: MapPin },
        { id: 'courses', label: '3. Courses & Cohorts', icon: BookOpen },
        { id: 'outcomes', label: '4. Graduate Outcomes', icon: Briefcase },
        { id: 'explorer', label: '5. Data Explorer', icon: Search },
    ] as const;

    return (
        <div className="flex-1 flex flex-col space-y-6 pb-12 animate-fadeIn max-w-[1600px] mx-auto w-full">
            {/* Top Header: Title & Global Export Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface border border-border-subtle rounded-2xl p-5 shadow-sm">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold flex-shrink-0">
                            <TrendingUp size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl sm:text-2xl font-black text-primary tracking-tight">
                                    Analytics & Operational Intelligence
                                </h1>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                    Live CRM Data
                                </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                                End-to-end applicant conversions, Cork geographic territorial heat, course performance & graduate employment tracking
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 self-stretch sm:self-auto flex-wrap">
                    <button
                        onClick={handleExportActiveCSV}
                        disabled={filteredEnrollments.length === 0}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-border-subtle bg-surface-elevated hover:bg-surface-elevated/80 disabled:opacity-40 transition-colors shadow-sm"
                    >
                        <Download size={14} />
                        <span>Export CSV</span>
                    </button>
                    
                    <button
                        onClick={handleExportExcel}
                        disabled={isExportingExcel || filteredEnrollments.length === 0}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                        <FileSpreadsheet size={14} />
                        <span>{isExportingExcel ? 'Generating Workbook...' : 'Executive Excel (.xlsx)'}</span>
                    </button>
                </div>
            </div>

            {/* Global Filter Bar */}
            <GlobalFilterBar
                filters={filters}
                onFiltersChange={setFilters}
                allEnrollments={allEnrollments}
                filteredEnrollments={filteredEnrollments}
            />

            {/* Executive KPI Pulse Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. Total Applications */}
                <div 
                    onClick={() => handleDrillDown('All Active Scope Applications', filteredEnrollments)}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 cursor-pointer hover:border-brand-500/40 hover:shadow-md transition-all group"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Total Pipeline</span>
                        <div className="p-1 rounded-lg bg-brand-500/10 text-brand-500"><Users size={14} /></div>
                    </div>
                    <p className="text-xl sm:text-2xl font-black font-mono text-primary mt-1.5 leading-none">
                        {kpiSummary.total}
                    </p>
                    <span className="text-[10px] text-muted mt-1 block">100% Inflow Stream</span>
                </div>

                {/* 2. Waiting Queue */}
                <div 
                    onClick={() => handleDrillDown('Candidates In Waiting Queue', filteredEnrollments.filter(e => e.status === 'requested'))}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 cursor-pointer hover:border-amber-500/40 hover:shadow-md transition-all group"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Waiting Queue</span>
                        <div className="p-1 rounded-lg bg-amber-500/10 text-amber-500"><Clock size={14} /></div>
                    </div>
                    <p className="text-xl sm:text-2xl font-black font-mono text-amber-500 mt-1.5 leading-none">
                        {kpiSummary.requested}
                    </p>
                    <span className="text-[10px] text-muted mt-1 block">Avg {kpiSummary.speed.avgDaysToInvite}d to invite</span>
                </div>

                {/* 3. Confirmed Attendees */}
                <div 
                    onClick={() => handleDrillDown('Confirmed Students', filteredEnrollments.filter(e => e.status === 'confirmed'))}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 cursor-pointer hover:border-sky-500/40 hover:shadow-md transition-all group"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">In-Course</span>
                        <div className="p-1 rounded-lg bg-sky-500/10 text-sky-500"><CheckCircle2 size={14} /></div>
                    </div>
                    <p className="text-xl sm:text-2xl font-black font-mono text-sky-500 mt-1.5 leading-none">
                        {kpiSummary.confirmed}
                    </p>
                    <span className="text-[10px] text-muted mt-1 block">Confirmed attendees</span>
                </div>

                {/* 4. Completed Graduates */}
                <div 
                    onClick={() => handleDrillDown('Graduated Course Completers', filteredEnrollments.filter(e => e.status === 'completed'))}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 cursor-pointer hover:border-emerald-500/40 hover:shadow-md transition-all group"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Graduates</span>
                        <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-500"><GraduationCap size={14} /></div>
                    </div>
                    <p className="text-xl sm:text-2xl font-black font-mono text-emerald-500 mt-1.5 leading-none">
                        {kpiSummary.completed}
                    </p>
                    <span className="text-[10px] text-muted mt-1 block font-mono">{kpiSummary.successRate}% Success Rate</span>
                </div>

                {/* 5. Median Turnaround Speed */}
                <div 
                    onClick={() => setActiveTab('pipeline')}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 cursor-pointer hover:border-indigo-500/40 hover:shadow-md transition-all group"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Avg Full Cycle</span>
                        <div className="p-1 rounded-lg bg-indigo-500/10 text-indigo-500"><Zap size={14} /></div>
                    </div>
                    <p className="text-xl sm:text-2xl font-black font-mono text-primary mt-1.5 leading-none">
                        {kpiSummary.speed.avgTotalCycleDays}<span className="text-xs font-normal text-muted ml-0.5">d</span>
                    </p>
                    <span className="text-[10px] text-muted mt-1 block">App → Graduation</span>
                </div>

                {/* 6. Graduate Employment */}
                <div 
                    onClick={() => setActiveTab('outcomes')}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 cursor-pointer hover:border-violet-500/40 hover:shadow-md transition-all group"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">Employed Rate</span>
                        <div className="p-1 rounded-lg bg-violet-500/10 text-violet-500"><Briefcase size={14} /></div>
                    </div>
                    <p className="text-xl sm:text-2xl font-black font-mono text-violet-500 mt-1.5 leading-none">
                        {kpiSummary.employmentRate}%
                    </p>
                    <span className="text-[10px] text-muted mt-1 block font-mono">{kpiSummary.workingCount} employed</span>
                </div>
            </div>

            {/* Modular Navigation Tabs Bar */}
            <div className="bg-surface border border-border-subtle rounded-2xl p-1.5 flex items-center gap-1.5 overflow-x-auto shadow-sm">
                {navTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as AnalyticsTabId)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                isActive
                                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20 scale-[1.01]'
                                    : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                        >
                            <Icon size={15} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Active Sub-Tab View */}
            <div className="min-h-[500px]">
                {isEnrollmentsLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-muted space-y-3">
                        <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs font-semibold">Aggregating CRM intelligence & calculating metrics...</p>
                    </div>
                ) : (
                    <Suspense fallback={
                        <div className="flex flex-col items-center justify-center py-24 text-muted space-y-3">
                            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs font-semibold">Loading analytics view...</p>
                        </div>
                    }>
                        {activeTab === 'pipeline' && (
                            <PipelineVelocityTab
                                enrollments={filteredEnrollments}
                                onDrillDown={handleDrillDown}
                            />
                        )}

                        {activeTab === 'geography' && (
                            <GeographyDemographicsTab
                                enrollments={filteredEnrollments}
                                onDrillDown={handleDrillDown}
                            />
                        )}

                        {activeTab === 'courses' && (
                            <CourseMatrixTab
                                enrollments={filteredEnrollments}
                                onDrillDown={handleDrillDown}
                            />
                        )}

                        {activeTab === 'outcomes' && (
                            <OutcomesTab
                                enrollments={filteredEnrollments}
                                employmentStatuses={employmentStatuses}
                                onDrillDown={handleDrillDown}
                            />
                        )}

                        {activeTab === 'explorer' && (
                            <DataExplorerTab
                                enrollments={filteredEnrollments}
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
                />
            )}
        </div>
    );
}

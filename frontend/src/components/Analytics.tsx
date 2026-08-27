import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
    Users, 
    Clock, 
    TrendingUp, 
    GraduationCap, 
    UserCheck, 
    Zap, 
    Download, 
    FileText
} from 'lucide-react';
import type { EnrollmentWithRelations } from '../lib/documentUtils';
import type { Student } from '../lib/types';
import { fetchAllEnrollments } from '../hooks/useEnrollments';
import { cleanVariant } from '../lib/types';

import GlobalFilterBar, { AnalyticsFilterState } from './Analytics/GlobalFilterBar';
import PipelineFlowCard from './Analytics/PipelineFlowCard';
import CourseMatrixCard from './Analytics/CourseMatrixCard';
import AddressFunnelCard from './Analytics/AddressFunnelCard';
import OutcomesTrackerCard from './Analytics/OutcomesTrackerCard';
import DrillDownModal from './Analytics/DrillDownModal';
import StudentDetail from './StudentDetail';
import { exportExecutiveExcelReport, exportCustomCSV, calculateSpeedMetrics } from './Analytics/analyticsUtils';

// Helper to fetch employment statuses
async function fetchEmploymentStatuses() {
    let allData: any[] = [];
    let from = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('employment_status')
            .select('*')
            .range(from, from + limit - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = [...allData, ...data];
        if (data.length < limit) break;
        from += limit;
    }
    return allData;
}

export default function Analytics() {
    // Global Filter State
    const [filters, setFilters] = useState<AnalyticsFilterState>({
        datePreset: 'all',
        customStartDate: '',
        customEndDate: '',
        courseId: 'all',
        variant: 'all',
        priorityOnly: false
    });
    
    // DrillDown Modal State
    const [modalData, setModalData] = useState<{
        isOpen: boolean;
        title: string;
        data: EnrollmentWithRelations[];
    }>({
        isOpen: false,
        title: '',
        data: []
    });

    // Student Detail Side-over State
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [isExportingQuickReport, setIsExportingQuickReport] = useState(false);

    // Queries
    const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery({
        queryKey: ['analytics_enrollments_v2'],
        queryFn: fetchAllEnrollments,
        staleTime: 60_000,
    });

    const { data: employmentStatuses = [], isLoading: outcomesLoading } = useQuery({
        queryKey: ['analytics_employment_statuses_v1'],
        queryFn: fetchEmploymentStatuses,
        staleTime: 60_000,
    });

    const isLoading = enrollmentsLoading || outcomesLoading;

    // Apply Global Filters
    const filteredEnrollments = useMemo(() => {
        return enrollments.filter(e => {
            // 1. Course Filter
            if (filters.courseId !== 'all' && e.course_id !== filters.courseId) {
                return false;
            }

            // 2. Variant Filter
            if (filters.variant !== 'all') {
                const cleanV = cleanVariant(e.courses?.name || '', e.course_variant);
                if (cleanV !== filters.variant) return false;
            }

            // 3. Priority Filter
            if (filters.priorityOnly && !e.is_priority) {
                return false;
            }

            // 4. Date Preset / Custom Range Filter
            if (filters.datePreset === 'all') return true;

            const createdTime = new Date(e.created_at).getTime();

            if (filters.datePreset === 'custom') {
                if (filters.customStartDate) {
                    const startTime = new Date(filters.customStartDate).getTime();
                    if (createdTime < startTime) return false;
                }
                if (filters.customEndDate) {
                    const endTime = new Date(filters.customEndDate).getTime() + 86400000;
                    if (createdTime > endTime) return false;
                }
                return true;
            }

            const now = Date.now();
            const days = parseInt(filters.datePreset, 10);
            if (isNaN(days)) return true;
            const cutoff = now - (days * 86400000);
            return createdTime >= cutoff;
        });
    }, [enrollments, filters]);

    const activeFilterLabel = useMemo(() => {
        if (filters.datePreset === '30') return 'Last 30 Days';
        if (filters.datePreset === '90') return 'Last 90 Days';
        if (filters.datePreset === '180') return 'Last 6 Months';
        if (filters.datePreset === '365') return 'Last 12 Months';
        if (filters.datePreset === 'custom') {
            return `${filters.customStartDate || 'Start'} to ${filters.customEndDate || 'End'}`;
        }
        return 'All Time';
    }, [filters]);

    // Top Summary KPI Metrics
    const kpis = useMemo(() => {
        const total = filteredEnrollments.length;
        const requested = filteredEnrollments.filter(e => e.status === 'requested').length;
        const invited = filteredEnrollments.filter(e => e.status === 'invited').length;
        const confirmed = filteredEnrollments.filter(e => e.status === 'confirmed').length;
        const completed = filteredEnrollments.filter(e => e.status === 'completed').length;
        const queue = requested + invited;
        const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const speed = calculateSpeedMetrics(filteredEnrollments);

        return {
            total,
            queue,
            confirmed,
            completed,
            successRate,
            avgCycleDays: speed.avgTotalCycleDays
        };
    }, [filteredEnrollments]);

    const handleDrillDown = (title: string, data: EnrollmentWithRelations[]) => {
        setModalData({ isOpen: true, title, data });
    };

    const handleSelectStudentFromDrillDown = (student: Student) => {
        setSelectedStudent(student);
    };

    const handleQuickExecutiveExport = async () => {
        try {
            setIsExportingQuickReport(true);
            await exportExecutiveExcelReport(filteredEnrollments, employmentStatuses, activeFilterLabel);
        } catch (err) {
            console.error('Failed to export report:', err);
        } finally {
            setIsExportingQuickReport(false);
        }
    };

    const handleExportCSV = () => {
        exportCustomCSV(filteredEnrollments, `crm_analytics_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col gap-6 p-2 animate-fadeIn">
                <div className="h-16 w-full skeleton rounded-2xl"></div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-24 skeleton rounded-2xl"></div>)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="h-96 skeleton rounded-2xl"></div>
                    <div className="h-96 skeleton rounded-2xl"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12 animate-fadeIn">
            {/* Header & Export Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border-subtle p-4 sm:p-5 rounded-2xl shadow-sm">
                <div>
                    <h1 className="text-lg sm:text-xl font-bold text-primary flex items-center gap-2">
                        Analytics & Operational Intelligence
                    </h1>
                    <p className="text-xs text-muted mt-0.5">
                        Clean unified metrics on student pipeline, normalized Cork geography, courses, and graduate outcomes
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                        onClick={handleExportCSV}
                        disabled={filteredEnrollments.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-primary bg-surface-elevated hover:bg-black/5 dark:hover:bg-white/5 border border-border-subtle transition-all disabled:opacity-50 shadow-sm"
                        title="Export current filtered view to CSV"
                    >
                        <FileText size={14} />
                        <span>Export CSV</span>
                    </button>

                    <button 
                        onClick={handleQuickExecutiveExport}
                        disabled={isExportingQuickReport || filteredEnrollments.length === 0}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-all shadow-sm flex-shrink-0"
                        title="Download multi-sheet Executive Excel report"
                    >
                        <Download size={14} />
                        <span>{isExportingQuickReport ? 'Exporting...' : 'Executive Excel'}</span>
                    </button>
                </div>
            </div>

            {/* Global Dynamic Filter Bar */}
            <GlobalFilterBar
                filters={filters}
                onFiltersChange={setFilters}
                allEnrollments={enrollments}
                filteredEnrollments={filteredEnrollments}
            />

            {/* Top 6 KPI Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {/* Total Pipeline */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => handleDrillDown('All Pipeline Applications', filteredEnrollments)}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-indigo-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Total Pipeline</p>
                            <p className="text-xl sm:text-2xl font-mono font-bold text-primary">{kpis.total}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                            <Users size={16} />
                        </div>
                    </div>
                </div>

                {/* Active Queue */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => handleDrillDown('Active Waiting Queue (Requested & Invited)', filteredEnrollments.filter(e => e.status === 'requested' || e.status === 'invited'))}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Active Queue</p>
                            <p className="text-xl sm:text-2xl font-mono font-bold text-primary">{kpis.queue}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Clock size={16} />
                        </div>
                    </div>
                </div>

                {/* Confirmed Students */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => handleDrillDown('Confirmed Students', filteredEnrollments.filter(e => e.status === 'confirmed'))}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 to-blue-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Confirmed</p>
                            <p className="text-xl sm:text-2xl font-mono font-bold text-primary">{kpis.confirmed}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            <UserCheck size={16} />
                        </div>
                    </div>
                </div>

                {/* Completed Graduates */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => handleDrillDown('Completed Graduates', filteredEnrollments.filter(e => e.status === 'completed'))}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Graduates</p>
                            <p className="text-xl sm:text-2xl font-mono font-bold text-primary">{kpis.completed}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            <GraduationCap size={16} />
                        </div>
                    </div>
                </div>

                {/* Success Rate */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => handleDrillDown('Graduates vs Pipeline Applications', filteredEnrollments.filter(e => e.status === 'completed'))}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Success Rate</p>
                            <p className="text-xl sm:text-2xl font-mono font-bold text-primary">{kpis.successRate}%</p>
                        </div>
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <TrendingUp size={16} />
                        </div>
                    </div>
                </div>

                {/* Processing Velocity */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-3.5 relative overflow-hidden group card-hover">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Avg Cycle</p>
                            <p className="text-xl sm:text-2xl font-mono font-bold text-primary">
                                {kpis.avgCycleDays} <span className="text-xs font-normal text-muted">days</span>
                            </p>
                        </div>
                        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                            <Zap size={16} />
                        </div>
                    </div>
                </div>
            </div>

            {/* 4 Core Intelligence Blocks */}
            <div className="space-y-6">
                {/* 1. Pipeline & Velocity Flow */}
                <PipelineFlowCard
                    enrollments={filteredEnrollments}
                    onDrillDown={handleDrillDown}
                />

                {/* 2. Granular Address Intelligence & Funnel */}
                <AddressFunnelCard
                    enrollments={filteredEnrollments}
                    onDrillDown={handleDrillDown}
                />

                {/* 3. Course Matrix & Variants */}
                <CourseMatrixCard
                    enrollments={filteredEnrollments}
                    onDrillDown={handleDrillDown}
                />

                {/* 4. Outcomes & Employment Tracker */}
                <OutcomesTrackerCard
                    enrollments={filteredEnrollments}
                    employmentStatuses={employmentStatuses}
                    onDrillDown={handleDrillDown}
                />
            </div>

            {/* Drill Down Modal */}
            <DrillDownModal 
                isOpen={modalData.isOpen}
                onClose={() => setModalData({ ...modalData, isOpen: false })}
                title={modalData.title}
                data={modalData.data}
                onSelectStudent={handleSelectStudentFromDrillDown}
            />

            {/* Student Detail Slide-Over Modal */}
            {selectedStudent && (
                <StudentDetail
                    student={selectedStudent}
                    onClose={() => setSelectedStudent(null)}
                    onStudentUpdated={(updatedStudent) => {
                        setSelectedStudent(updatedStudent);
                    }}
                />
            )}
        </div>
    );
}

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
    LayoutDashboard, 
    BookOpen, 
    Users, 
    Briefcase, 
    FileSpreadsheet, 
    Download
} from 'lucide-react';
import type { EnrollmentWithRelations } from '../lib/documentUtils';
import type { Student } from '../lib/types';
import { fetchAllEnrollments } from '../hooks/useEnrollments';
import { cleanVariant } from '../lib/types';

import GlobalFilterBar, { AnalyticsFilterState } from './Analytics/GlobalFilterBar';
import OverviewTab from './Analytics/OverviewTab';
import CoursePerformanceTab from './Analytics/CoursePerformanceTab';
import DemographicsTab from './Analytics/DemographicsTab';
import OutcomesTab from './Analytics/OutcomesTab';
import ReportsTab from './Analytics/ReportsTab';
import DrillDownModal from './Analytics/DrillDownModal';
import StudentDetail from './StudentDetail';
import { exportExecutiveExcelReport } from './Analytics/analyticsUtils';

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

type TabType = 'overview' | 'courses' | 'demographics' | 'outcomes' | 'reports';

export default function Analytics() {
    const [activeTab, setActiveTab] = useState<TabType>('overview');

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
                    const endTime = new Date(filters.customEndDate).getTime() + 86400000; // end of day
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

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col gap-6 p-1 animate-fadeIn">
                <div className="h-14 w-full skeleton rounded-2xl"></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-[120px] skeleton rounded-2xl"></div>)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="h-[350px] skeleton rounded-2xl"></div>
                    <div className="h-[350px] skeleton rounded-2xl lg:col-span-2"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10 animate-fadeIn">
            {/* Top Bar: Tabs & Quick Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border-subtle p-2 rounded-2xl shadow-sm">
                
                {/* 5 Modular Tabs Switcher */}
                <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl overflow-x-auto hide-scrollbar">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                            activeTab === 'overview' 
                            ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle' 
                            : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <LayoutDashboard size={15} /> Overview & Pipeline
                    </button>
                    <button
                        onClick={() => setActiveTab('courses')}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                            activeTab === 'courses' 
                            ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle' 
                            : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <BookOpen size={15} /> Course Performance
                    </button>
                    <button
                        onClick={() => setActiveTab('demographics')}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                            activeTab === 'demographics' 
                            ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle' 
                            : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <Users size={15} /> Demographics & Geography
                    </button>
                    <button
                        onClick={() => setActiveTab('outcomes')}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                            activeTab === 'outcomes' 
                            ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle' 
                            : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <Briefcase size={15} /> Outcomes & Employment
                    </button>
                    <button
                        onClick={() => setActiveTab('reports')}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                            activeTab === 'reports' 
                            ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle' 
                            : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <FileSpreadsheet size={15} /> Reports & Data Explorer
                    </button>
                </div>

                {/* Right Action Button */}
                <div className="flex items-center gap-2 px-2">
                    <button 
                        onClick={handleQuickExecutiveExport}
                        disabled={isExportingQuickReport || filteredEnrollments.length === 0}
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-all shadow-sm flex-shrink-0"
                        title="Download formatted multi-sheet Excel report"
                    >
                        <Download size={14} />
                        <span>{isExportingQuickReport ? 'Exporting...' : 'Executive Report'}</span>
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

            {/* Active Tab Content */}
            <div className="transition-all duration-300">
                {activeTab === 'overview' && (
                    <OverviewTab
                        enrollments={filteredEnrollments}
                        onDrillDown={handleDrillDown}
                    />
                )}
                {activeTab === 'courses' && (
                    <CoursePerformanceTab
                        enrollments={filteredEnrollments}
                        onDrillDown={handleDrillDown}
                    />
                )}
                {activeTab === 'demographics' && (
                    <DemographicsTab
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
                {activeTab === 'reports' && (
                    <ReportsTab
                        enrollments={filteredEnrollments}
                        employmentStatuses={employmentStatuses}
                        onSelectStudent={setSelectedStudent}
                        activeFilterLabel={activeFilterLabel}
                    />
                )}
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

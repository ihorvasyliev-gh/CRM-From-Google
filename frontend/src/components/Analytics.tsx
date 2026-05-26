import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, Users, Calendar, Download, Briefcase } from 'lucide-react';
import type { EnrollmentWithRelations } from '../lib/documentUtils';
import { fetchAllEnrollments } from '../hooks/useEnrollments';

import OverviewTab from './Analytics/OverviewTab';
import DemographicsTab from './Analytics/DemographicsTab';
import OutcomesTab from './Analytics/OutcomesTab';
import DrillDownModal from './Analytics/DrillDownModal';



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
    const [activeTab, setActiveTab] = useState<'overview' | 'demographics' | 'outcomes'>('overview');
    const [dateFilter, setDateFilter] = useState<'all' | '30' | '90' | '365'>('all');
    
    // DrillDown Modal State
    const [modalData, setModalData] = useState<{isOpen: boolean, title: string, data: EnrollmentWithRelations[]}>({
        isOpen: false,
        title: '',
        data: []
    });

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

    const filteredEnrollments = useMemo(() => {
        if (dateFilter === 'all') return enrollments;
        
        const now = new Date().getTime();
        const days = parseInt(dateFilter);
        const cutoff = now - (days * 24 * 60 * 60 * 1000);

        return enrollments.filter(e => {
            const created = new Date(e.created_at).getTime();
            return created >= cutoff;
        });
    }, [enrollments, dateFilter]);

    const handleDrillDown = (title: string, data: EnrollmentWithRelations[]) => {
        setModalData({ isOpen: true, title, data });
    };

    const handleExport = () => {
        if (filteredEnrollments.length === 0) return;
        
        const headers = ['Student Name', 'Email', 'Course', 'Status', 'Date Registered'];
        const csvRows = [headers.join(',')];
        
        filteredEnrollments.forEach(e => {
            const name = `${e.students?.first_name || ''} ${e.students?.last_name || ''}`.replace(/,/g, ' ');
            const email = e.students?.email || '';
            const course = (e.courses?.name || '').replace(/,/g, ' ');
            const status = e.status;
            const date = new Date(e.created_at).toLocaleDateString();
            
            csvRows.push(`${name},${email},${course},${status},${date}`);
        });
        
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_export_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col gap-6 p-1 animate-fadeIn">
                <div className="h-14 w-full sm:w-2/3 lg:w-1/2 skeleton rounded-2xl"></div>
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
        <div className="space-y-6 pb-8 animate-fadeIn">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border-subtle p-2 rounded-2xl shadow-sm">
                
                {/* Tabs */}
                <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl overflow-x-auto hide-scrollbar">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                            activeTab === 'overview' 
                            ? 'bg-surface-elevated text-primary shadow-sm border border-border-subtle' 
                            : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <LayoutDashboard size={16} /> Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('demographics')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                            activeTab === 'demographics' 
                            ? 'bg-surface-elevated text-primary shadow-sm border border-border-subtle' 
                            : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <Users size={16} /> Demographics
                    </button>
                    <button
                        onClick={() => setActiveTab('outcomes')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                            activeTab === 'outcomes' 
                            ? 'bg-surface-elevated text-primary shadow-sm border border-border-subtle' 
                            : 'text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <Briefcase size={16} /> Outcomes
                    </button>
                </div>

                {/* Filters & Actions */}
                <div className="flex items-center gap-3 px-2 sm:px-3">
                    <div className="flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-muted" />
                        <select 
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as any)}
                            className="bg-transparent border-none text-primary font-medium focus:ring-0 cursor-pointer outline-none"
                        >
                            <option value="all">All Time</option>
                            <option value="365">Last 12 Months</option>
                            <option value="90">Last 90 Days</option>
                            <option value="30">Last 30 Days</option>
                        </select>
                    </div>

                    <div className="w-px h-6 bg-border-subtle mx-1" />

                    <button 
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 dark:bg-brand-500/10 dark:hover:bg-brand-500/20 transition-colors"
                    >
                        <Download size={16} /> Export
                    </button>
                </div>
            </div>

            {/* Active Tab Content */}
            <div className="mt-4 transition-all duration-300">
                {activeTab === 'overview' && (
                    <OverviewTab enrollments={filteredEnrollments} onDrillDown={handleDrillDown} />
                )}
                {activeTab === 'demographics' && (
                    <DemographicsTab enrollments={filteredEnrollments} onDrillDown={handleDrillDown} />
                )}
                {activeTab === 'outcomes' && (
                    <OutcomesTab enrollments={filteredEnrollments} employmentStatuses={employmentStatuses} onDrillDown={handleDrillDown} />
                )}
            </div>

            {/* Drill Down Modal */}
            <DrillDownModal 
                isOpen={modalData.isOpen}
                onClose={() => setModalData({ ...modalData, isOpen: false })}
                title={modalData.title}
                data={modalData.data}
            />
        </div>
    );
}

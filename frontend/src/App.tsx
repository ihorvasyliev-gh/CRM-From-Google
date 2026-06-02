/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, Suspense } from 'react';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Users, BookOpen, GraduationCap, FileText, LogOut, Loader2, Menu, X, Sparkles, Sun, Moon, Settings as SettingsIcon, Bell, Briefcase, PieChart } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import { useConfirmationNotifier } from './hooks/useConfirmationNotifier';
import { useGlobalRealtimeSync } from './hooks/useGlobalRealtimeSync';
import { isNotificationSupported, requestNotificationPermission, getNotificationPermission } from './lib/notifications';
import { supabase } from './lib/supabase';

import { TooltipProvider } from './components/ui/Tooltip';

// Lazy load heavy route components with retry logic to prevent "Failed to fetch dynamically imported module" errors
const Dashboard = lazyWithRetry(() => import('./components/Dashboard'));
const StudentList = lazyWithRetry(() => import('./components/StudentList'));
const CourseList = lazyWithRetry(() => import('./components/CourseList'));
const EnrollmentBoard = lazyWithRetry(() => import('./components/EnrollmentBoard'));
const DocumentGenerator = lazyWithRetry(() => import('./components/DocumentGenerator'));
const OutcomesList = lazyWithRetry(() => import('./components/OutcomesList'));
const Settings = lazyWithRetry(() => import('./components/Settings'));
const Analytics = lazyWithRetry(() => import('./components/Analytics'));

const NAV_ITEMS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Overview & metrics' },
    { key: 'students', label: 'Students', icon: Users, desc: 'Manage students' },
    { key: 'courses', label: 'Courses', icon: BookOpen, desc: 'Course catalog' },
    { key: 'enrollments', label: 'Enrollments', icon: GraduationCap, desc: 'Registration board' },
    { key: 'outcomes', label: 'Outcomes', icon: Briefcase, desc: 'Graduate tracking' },
    { key: 'documents', label: 'Documents', icon: FileText, desc: 'Generate forms' },
    { key: 'analytics', label: 'Analytics', icon: PieChart, desc: 'Insights & Stats' },
    { key: 'settings', label: 'Settings', icon: SettingsIcon, desc: 'App configuration' },
];

const PAGE_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    students: 'Students',
    courses: 'Courses',
    enrollments: 'Enrollments',
    outcomes: 'Outcomes',
    documents: 'Documents',
    analytics: 'Analytics & Insights',
    settings: 'Settings',
};

function App() {
    const { user, loading, signOut } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showNotifBanner, setShowNotifBanner] = useState(false);

    // Fire browser notifications for enrollment confirmations
    useConfirmationNotifier();
    useGlobalRealtimeSync();

    // Show notification permission banner once if not yet decided
    useEffect(() => {
        if (isNotificationSupported() && getNotificationPermission() === 'default') {
            setShowNotifBanner(true);
        }
    }, []);

    const location = useLocation();
    const navigateFn = useNavigate();
    const activeTab = location.pathname.split('/')[1] || 'dashboard';

    const [darkMode, setDarkMode] = useState(() => {
        // Initialize from local storage or system preference
        if (typeof window !== 'undefined') {
            const saved = window.localStorage.getItem('theme');
            if (saved) return saved === 'dark';
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return true; // Default to dark as requested
    });

    // Apply dark mode class to root element
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            window.localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            window.localStorage.setItem('theme', 'light');
        }
    }, [darkMode]);

    const toggleDarkMode = () => {
        if (typeof document !== 'undefined' && 'startViewTransition' in document) {
            (document as any).startViewTransition(() => {
                setDarkMode(prev => !prev);
            });
        } else {
            setDarkMode(prev => !prev);
        }
    };

    const queryClient = useQueryClient();

    // Prefetch data for a tab on hover so it's ready when the user clicks
    const prefetchForTab = useCallback((tab: string) => {
        switch (tab) {
            case 'dashboard':
                queryClient.prefetchQuery({
                    queryKey: ['dashboard_stats'],
                    queryFn: async () => {
                        const [s, c, e] = await Promise.all([
                            supabase.from('students').select('*', { count: 'exact', head: true }),
                            supabase.from('courses').select('*', { count: 'exact', head: true }),
                            supabase.from('enrollments').select('*', { count: 'exact', head: true }),
                        ]);
                        return { students: s.count || 0, courses: c.count || 0, enrollments: e.count || 0 };
                    },
                    staleTime: 30_000,
                });
                break;
            case 'students':
                queryClient.prefetchInfiniteQuery({
                    queryKey: ['students', ''],
                    queryFn: async ({ pageParam = 0 }: any) => {
                        const limit = 30; // Matches PAGE_SIZE in StudentList.tsx
                        const from = pageParam * limit;
                        const to = from + limit - 1;
                        const { data, count, error } = await supabase
                            .from('students')
                            .select('*', { count: 'exact' })
                            .order('created_at', { ascending: false })
                            .range(from, to);
                        if (error) throw error;
                        return {
                            data: (data || []) as any[],
                            count: count || 0,
                            nextPage: (data && data.length === limit) ? pageParam + 1 : undefined
                        };
                    },
                    initialPageParam: 0,
                });
                break;
            case 'courses':
                queryClient.prefetchQuery({
                    queryKey: ['courses'],
                    queryFn: async () => {
                        const { data } = await supabase.from('courses').select('*').order('name');
                        return data || [];
                    },
                });
                queryClient.prefetchQuery({
                    queryKey: ['course_enrollment_counts'],
                    queryFn: async () => {
                        const { data: enrollments } = await supabase.from('enrollments').select('course_id, status');
                        if (!enrollments) return {};
                        const counts: Record<string, any> = {};
                        for (const e of enrollments) {
                            if (!counts[e.course_id]) {
                                counts[e.course_id] = { course_id: e.course_id, total: 0, requested: 0, invited: 0, confirmed: 0, rejected: 0 };
                            }
                            counts[e.course_id].total++;
                            const stat = e.status;
                            if (stat in counts[e.course_id]) {
                                counts[e.course_id][stat]++;
                            }
                        }
                        return counts;
                    },
                });
                break;
            case 'analytics':
                queryClient.prefetchQuery({
                    queryKey: ['analytics_enrollments_v2'],
                    queryFn: async () => {
                        let allData: any[] = [];
                        let from = 0;
                        const limit = 1000;
                        while (true) {
                            const { data, error } = await supabase
                                .from('enrollments')
                                .select('*, students(id, first_name, last_name, email, dob, address, eircode), courses(id, name)')
                                .order('created_at', { ascending: true })
                                .range(from, from + limit - 1);
                            if (error) throw error;
                            if (!data || data.length === 0) break;
                            allData = [...allData, ...data];
                            if (data.length < limit) break;
                            from += limit;
                        }
                        return allData;
                    },
                    staleTime: 60_000,
                });
                queryClient.prefetchQuery({
                    queryKey: ['analytics_employment_statuses_v1'],
                    queryFn: async () => {
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
                    },
                    staleTime: 60_000,
                });
                break;
            case 'enrollments':
            case 'documents':
                // Both share the ['enrollments'] cache
                queryClient.prefetchQuery({
                    queryKey: ['enrollments'],
                    queryFn: async () => {
                        let all: any[] = []; let from = 0;
                        while (true) {
                            const { data, error } = await supabase
                                .from('enrollments')
                                .select('*, students(id, first_name, last_name, email, phone, address, eircode, dob), courses(id, name)')
                                .order('created_at', { ascending: false })
                                .range(from, from + 999);
                            if (error) throw error;
                            if (!data || data.length === 0) break;
                            all = [...all, ...data]; if (data.length < 1000) break; from += 1000;
                        }
                        return all;
                    },
                });
                break;
            case 'outcomes':
                queryClient.prefetchQuery({
                    queryKey: ['outcomes_graduates'],
                    queryFn: async () => {
                        let enrollments: any[] = [];
                        let from = 0;
                        const limit = 1000;
                        while (true) {
                            const { data, error } = await supabase
                                .from('enrollments')
                                .select('student_id, course_id, courses(name), students(id, first_name, last_name, email)')
                                .eq('status', 'completed')
                                .range(from, from + limit - 1);
                            if (error) throw error;
                            if (!data || data.length === 0) break;
                            enrollments = [...enrollments, ...data];
                            if (data.length < limit) break;
                            from += limit;
                        }

                        let empStatuses: any[] = [];
                        from = 0;
                        while (true) {
                            const { data, error } = await supabase
                                .from('employment_status')
                                .select('*')
                                .range(from, from + limit - 1);
                            if (error) break;
                            if (!data || data.length === 0) break;
                            empStatuses = [...empStatuses, ...data];
                            if (data.length < limit) break;
                            from += limit;
                        }

                        const studentMap = new Map<string, any>();
                        for (const e of enrollments) {
                            const student = e.students;
                            const course = e.courses;
                            if (!student || !student.id) continue;

                            if (!studentMap.has(student.id)) {
                                const empStatus = empStatuses?.find(es => es.student_id === student.id);
                                let trackingStatus = 'not_contacted';
                                if (empStatus) {
                                    trackingStatus = empStatus.status;
                                }

                                studentMap.set(student.id, {
                                    student_id: student.id,
                                    first_name: student.first_name || '',
                                    last_name: student.last_name || '',
                                    email: student.email || '',
                                    courses: [course?.name || 'Unknown'],
                                    is_working: empStatus?.is_working ?? null,
                                    started_month: empStatus?.started_month ?? null,
                                    field_of_work: empStatus?.field_of_work ?? null,
                                    employment_type: empStatus?.employment_type ?? null,
                                    status_updated_at: empStatus?.last_responded_at ?? null,
                                    tracking_status: trackingStatus,
                                    last_sent_at: empStatus?.last_invited_at ?? null,
                                });
                            } else {
                                const existing = studentMap.get(student.id)!;
                                const courseName = course?.name || 'Unknown';
                                if (!existing.courses.includes(courseName)) {
                                    existing.courses.push(courseName);
                                }
                            }
                        }

                        return Array.from(studentMap.values()).sort(
                            (a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
                        );
                    },
                });
                break;
        }
    }, [queryClient]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background text-primary flex items-center justify-center transition-colors duration-300 ease-in-out">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center animate-pulse-subtle">
                        <Sparkles size={24} className="text-white" />
                    </div>
                    <Loader2 size={20} className="animate-spin text-brand-500" />
                </div>
            </div>
        );
    }

    if (!user) {
        return <LoginPage />;
    }

    function navigate(tab: string) {
        setSidebarOpen(false);
        navigateFn(`/${tab}`);
    }

    // Called from child components (e.g., StudentDetail) to navigate with filters
    function handleNavigate(tab: string, filter?: { courseId?: string }) {
        setSidebarOpen(false);
        if (tab === 'enrollments' && filter?.courseId) {
            navigateFn(`/${tab}`, { state: { courseId: filter.courseId } });
        } else {
            navigateFn(`/${tab}`);
        }
    }

    return (
        <TooltipProvider delayDuration={100}>
            <div className="h-screen w-full bg-background text-primary flex transition-colors duration-300 ease-in-out relative overflow-hidden">
                {/* Subtle radial glow in Dark Mode */}
                {darkMode && (
                    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-500/10 rounded-full blur-[120px] opacity-50" />
                    </div>
                )}

                {/* Mobile overlay */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden animate-fadeIn"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Sidebar */}
                <aside className={`
                    fixed lg:sticky top-0 left-0 h-screen w-[200px] z-40
                    flex flex-col transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
                    bg-surface border-r border-border-subtle shadow-[2px_0_24px_-10px_rgba(0,0,0,0.1)]
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}>
                    {/* Logo */}
                    <div className="h-16 px-4 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 bg-gradient-to-br from-brand-500 via-brand-600 to-accent-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-500/25 animate-glow flex-shrink-0">
                                C
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-sm font-bold text-primary tracking-tight truncate">
                                    Course CRM
                                </h1>
                                <p className="text-[9px] text-muted font-medium -mt-0.5 tracking-wide truncate">MANAGEMENT SYSTEM</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="lg:hidden text-muted hover:text-primary p-1 rounded-lg hover:bg-surface-elevated transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Nav */}
                    <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
                        <p className="px-2.5 text-[9px] font-bold text-muted uppercase tracking-wider mb-2">Navigation</p>
                        {NAV_ITEMS.map(item => {
                            const Icon = item.icon;
                            const isActive = activeTab === item.key;
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => navigate(item.key)}
                                    onMouseEnter={() => prefetchForTab(item.key)}
                                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 group relative
                                        ${isActive
                                            ? 'bg-brand-500/10 text-brand-500 dark:text-brand-400'
                                            : 'text-muted hover:text-primary hover:bg-surface-elevated'
                                        }
                                    `}
                                >
                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-brand-500 rounded-full" />
                                    )}
                                    <div className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${isActive
                                        ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                                        : 'bg-surface-elevated text-muted group-hover:bg-background group-hover:text-primary border border-transparent group-hover:border-border-subtle transform group-hover:scale-105'
                                        }`}>
                                        <Icon size={16} />
                                    </div>
                                    <div className="text-left min-w-0">
                                        <span className="block leading-tight truncate">{item.label}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </nav>

                    {/* User / Settings / Sign Out */}
                    <div className="p-2 border-t border-border-subtle flex-shrink-0 space-y-2">
                        {/* Theme Toggle */}
                        <button
                            onClick={toggleDarkMode}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium text-muted hover:text-primary hover:bg-surface-elevated transition-all group"
                        >
                            <div className="p-1.5 rounded-lg bg-surface-elevated text-muted group-hover:bg-background group-hover:text-primary border border-transparent group-hover:border-border-subtle transition-all transform group-hover:scale-105 flex-shrink-0">
                                {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                            </div>
                            <span className="flex-1 text-left truncate">Theme</span>
                            <span className="text-xs text-muted flex-shrink-0">{darkMode ? 'Dark' : 'Light'}</span>
                        </button>

                        <div className="flex items-center gap-2 px-2 py-1.5 bg-surface-elevated rounded-lg border border-border-subtle/50">
                            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-background shadow-sm flex-shrink-0">
                                {(user.email?.[0] || 'A').toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-primary truncate">{user.email}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span className="text-[9px] text-muted font-medium uppercase tracking-wider">Admin</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={signOut}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium text-muted hover:text-red-500 hover:bg-red-500/10 transition-all"
                        >
                            <LogOut size={16} className="flex-shrink-0" /> <span className="truncate">Sign Out</span>
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <div className={`flex-1 flex flex-col h-screen relative z-10 min-w-0 ${
                    activeTab === 'enrollments'
                        ? 'overflow-hidden'
                        : activeTab === 'dashboard'
                            ? 'overflow-y-auto lg:overflow-hidden'
                            : 'overflow-y-auto'
                }`}>
                    {/* Notification Permission Banner */}
                    {showNotifBanner && (
                        <div className="bg-brand-500/10 border-b border-brand-500/20 px-4 py-2.5 flex items-center justify-between gap-3 animate-fadeIn">
                            <div className="flex items-center gap-2 text-sm">
                                <Bell size={16} className="text-brand-500 flex-shrink-0" />
                                <span className="text-primary">Enable notifications to be alerted when students confirm courses</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={async () => {
                                        await requestNotificationPermission();
                                        setShowNotifBanner(false);
                                    }}
                                    className="px-3 py-1 text-xs font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                                >
                                    Enable
                                </button>
                                <button
                                    onClick={() => setShowNotifBanner(false)}
                                    className="text-muted hover:text-primary transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                    {/* Mobile Header (Glassmorphism) */}
                    <header className="lg:hidden h-12 bg-background/70 backdrop-blur-xl border-b border-border-subtle px-3 flex items-center justify-between sticky top-0 z-30 transition-colors">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="text-muted hover:text-primary transition p-1 rounded-lg hover:bg-surface-elevated"
                        >
                            <Menu size={20} />
                        </button>
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-brand-500/20">
                                C
                            </div>
                            <span className="font-bold text-sm text-primary tracking-tight">{PAGE_TITLES[activeTab]}</span>
                        </div>
                        <div className="w-8" />
                    </header>

                    {/* Desktop Floating Header (Glassmorphism) */}
                    <header className="hidden lg:block sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border-subtle/60 px-4 sm:px-6 lg:px-8 py-3 transition-colors">
                        <div className="w-full flex flex-row items-center justify-between">
                            <div className="animate-fadeIn flex items-center gap-3">
                                <h2 className="text-xl font-bold text-primary tracking-tight">
                                    {PAGE_TITLES[activeTab]}
                                </h2>
                                <div className="h-4 w-px bg-border-strong hidden sm:block"></div>
                                <p className="text-sm text-muted font-medium hidden sm:block">
                                    {activeTab === 'dashboard' && 'Welcome back — here\'s your overview'}
                                    {activeTab === 'students' && 'Manage your student database'}
                                    {activeTab === 'courses' && 'View and manage course catalog'}
                                    {activeTab === 'enrollments' && 'Track and manage enrollments'}
                                    {activeTab === 'outcomes' && 'Track graduate employment status'}
                                    {activeTab === 'documents' && 'Generate personalized documents'}
                                    {activeTab === 'analytics' && 'Course and enrollment statistics'}
                                    {activeTab === 'settings' && 'Configure email templates and preferences'}
                                </p>
                            </div>
                        </div>
                    </header>

                    {/* Page Content */}
                    <main className={`flex-1 w-full flex flex-col min-h-0 ${
                        activeTab === 'enrollments'
                            ? 'px-2 py-2 sm:px-6 lg:px-8 sm:py-4 overflow-hidden'
                            : 'px-3 py-3 sm:px-6 lg:px-8 py-4'
                    }`}>
                        <Suspense fallback={
                            <div className="w-full h-full flex items-center justify-center min-h-[50vh]">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center animate-pulse-subtle">
                                        <Sparkles size={24} className="text-white" />
                                    </div>
                                    <Loader2 size={20} className="animate-spin text-brand-500" />
                                </div>
                            </div>
                        }>
                            <Routes>
                                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                <Route path="/dashboard" element={<Dashboard onNavigate={navigate} />} />
                                <Route path="/students" element={<StudentList onNavigate={handleNavigate} />} />
                                <Route path="/courses" element={<CourseList />} />
                                <Route path="/enrollments" element={<EnrollmentBoard initialCourseFilter={location.state?.courseId} />} />
                                <Route path="/outcomes" element={<OutcomesList />} />
                                <Route path="/documents" element={<DocumentGenerator />} />
                                <Route path="/analytics" element={<Analytics />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="*" element={<Navigate to="/dashboard" replace />} />
                            </Routes>
                        </Suspense>
                    </main>
                </div>
            </div>
        </TooltipProvider>
    );
}

export default App;

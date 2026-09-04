import { useState, useEffect, useCallback, Suspense, useTransition, useRef } from 'react';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Users, BookOpen, GraduationCap, FileText, LogOut, Loader2, Menu, X, Sparkles, Sun, Moon, Settings as SettingsIcon, Bell, Briefcase, PieChart, Clock, Rows3, Search, HelpCircle } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import { useConfirmationNotifier } from './hooks/useConfirmationNotifier';
import { useGlobalRealtimeSync } from './hooks/useGlobalRealtimeSync';
import { fetchAllEnrollments } from './hooks/useEnrollments';
import { fetchGraduatesFn } from './hooks/useOutcomes';
import { isNotificationSupported, getNotificationPermission } from './lib/notifications';
import { isUserSubscribed, subscribeUserToPush } from './lib/pushNotifications';
import { supabase } from './lib/supabase';
import { Student, StudentFormData } from './lib/types';
import CommandPalette from './components/CommandPalette';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import StudentModal from './components/StudentModal';
import StudentDetail from './components/StudentDetail';
import EnrollmentModal from './components/EnrollmentModal';
import MobileBottomNav from './components/MobileBottomNav';
import MobileFloatingActions from './components/MobileFloatingActions';

import { TooltipProvider } from './components/ui/Tooltip';
import NetworkStatusIndicator from './components/ui/NetworkStatusIndicator';

// Lazy load heavy route components with retry logic to prevent "Failed to fetch dynamically imported module" errors
const Dashboard = lazyWithRetry(() => import('./components/Dashboard'));
const StudentList = lazyWithRetry(() => import('./components/StudentList'));
const CourseList = lazyWithRetry(() => import('./components/CourseList'));
const EnrollmentBoard = lazyWithRetry(() => import('./components/EnrollmentBoard'));
const DocumentGenerator = lazyWithRetry(() => import('./components/DocumentGenerator'));
const OutcomesList = lazyWithRetry(() => import('./components/OutcomesList'));
const Settings = lazyWithRetry(() => import('./components/Settings'));
const Analytics = lazyWithRetry(() => import('./components/Analytics'));
const StudentLookup = lazyWithRetry(() => import('./components/StudentLookup'));
const ViewerCourses = lazyWithRetry(() => import('./components/ViewerCourses'));
const PendingApprovalsModal = lazyWithRetry(() => import('./components/PendingApprovalsModal'));
import { usePendingApprovalsCount } from './hooks/useApprovals';

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

    // Show notification permission banner once if not yet decided/subscribed
    useEffect(() => {
        const checkPushSubscription = async () => {
            if (isNotificationSupported() && getNotificationPermission() === 'default') {
                const isSubscribed = await isUserSubscribed();
                if (!isSubscribed) {
                    setShowNotifBanner(true);
                }
            }
        };
        checkPushSubscription();
    }, []);

    // Prewarm heavy route component chunks during browser idle time so tab clicks have zero delay
    useEffect(() => {
        if (!user) return;
        const prewarm = () => {
            import('./components/Dashboard');
            import('./components/EnrollmentBoard');
            import('./components/StudentList');
            import('./components/CourseList');
        };
        if (typeof window !== 'undefined') {
            if ('requestIdleCallback' in window) {
                const handle = (window as any).requestIdleCallback(prewarm, { timeout: 2000 });
                return () => (window as any).cancelIdleCallback(handle);
            } else {
                const timer = setTimeout(prewarm, 1000);
                return () => clearTimeout(timer);
            }
        }
    }, [user]);

    const location = useLocation();
    const navigateFn = useNavigate();
    const [, startTransition] = useTransition();
    const isViewer = user?.app_metadata?.role === 'viewer';
    const viewerTab = location.pathname.startsWith('/courses') ? 'courses' : 'lookup';
    const activeTab = isViewer ? viewerTab : (location.pathname.split('/')[1] || 'dashboard');
    const [approvalsModalOpen, setApprovalsModalOpen] = useState(false);
    const { count: pendingApprovalsCount } = usePendingApprovalsCount(!isViewer);

    // Global Modal & Palette States
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
    const [globalAddStudentOpen, setGlobalAddStudentOpen] = useState(false);
    const [globalEnrollModalOpen, setGlobalEnrollModalOpen] = useState(false);
    const [globalStudentDetail, setGlobalStudentDetail] = useState<Student | null>(null);

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

    const toggleDarkMode = useCallback(() => {
        if (typeof document !== 'undefined' && 'startViewTransition' in document) {
            (document as any).startViewTransition(() => {
                setDarkMode(prev => !prev);
            });
        } else {
            setDarkMode(prev => !prev);
        }
    }, []);

    const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
        if (typeof window !== 'undefined') {
            const saved = window.localStorage.getItem('view_density');
            if (saved === 'compact' || saved === 'comfortable') return saved;
        }
        return 'comfortable';
    });

    useEffect(() => {
        if (density === 'compact') {
            document.documentElement.classList.add('density-compact');
            window.localStorage.setItem('view_density', 'compact');
        } else {
            document.documentElement.classList.remove('density-compact');
            window.localStorage.setItem('view_density', 'comfortable');
        }
    }, [density]);

    useEffect(() => {
        const handleDensityChange = (e: Event) => {
            const customEvent = e as CustomEvent<'comfortable' | 'compact'>;
            if (customEvent.detail && customEvent.detail !== density) {
                setDensity(customEvent.detail);
            }
        };
        window.addEventListener('densitychange', handleDensityChange);
        return () => window.removeEventListener('densitychange', handleDensityChange);
    }, [density]);

    const toggleDensity = useCallback(() => {
        setDensity(prev => {
            const next = prev === 'comfortable' ? 'compact' : 'comfortable';
            window.dispatchEvent(new CustomEvent('densitychange', { detail: next }));
            return next;
        });
    }, []);

    const queryClient = useQueryClient();
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                queryClient.prefetchQuery({
                    queryKey: ['enrollments'],
                    queryFn: fetchAllEnrollments,
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
                    staleTime: 30_000,
                });
                break;
            case 'courses':
                queryClient.prefetchQuery({
                    queryKey: ['courses'],
                    queryFn: async () => {
                        const { data } = await supabase.from('courses').select('*').order('name');
                        return data || [];
                    },
                    staleTime: 30_000,
                });
                queryClient.prefetchQuery({
                    queryKey: ['enrollments'],
                    queryFn: fetchAllEnrollments,
                    staleTime: 30_000,
                });
                break;
            case 'analytics':
                queryClient.prefetchQuery({
                    queryKey: ['enrollments'],
                    queryFn: fetchAllEnrollments,
                    staleTime: 30_000,
                });
                queryClient.prefetchQuery({
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
                break;
            case 'enrollments':
                queryClient.prefetchQuery({
                    queryKey: ['enrollments'],
                    queryFn: fetchAllEnrollments,
                    staleTime: 30_000,
                });
                break;
            case 'documents':
                queryClient.prefetchQuery({
                    queryKey: ['enrollments'],
                    queryFn: fetchAllEnrollments,
                    staleTime: 30_000,
                });
                queryClient.prefetchQuery({
                    queryKey: ['doc_courses'],
                    queryFn: async () => {
                        const { data } = await supabase.from('courses').select('*').order('name');
                        return data || [];
                    },
                    staleTime: 30_000,
                });
                break;
            case 'outcomes':
                queryClient.prefetchQuery({
                    queryKey: ['outcomes_graduates'],
                    queryFn: fetchGraduatesFn,
                    staleTime: 30_000,
                });
                break;
        }
    }, [queryClient]);

    const handleTabMouseEnter = useCallback((tab: string) => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            prefetchForTab(tab);
            // Intent-based chunk prewarming: load heavy components only when hovered with intent
            switch (tab) {
                case 'documents':
                    import('./components/DocumentGenerator');
                    break;
                case 'analytics':
                    import('./components/Analytics');
                    break;
                case 'settings':
                    import('./components/Settings');
                    break;
                case 'outcomes':
                    import('./components/OutcomesList');
                    break;
                case 'courses':
                    import('./components/CourseList');
                    break;
            }
        }, 150); // 150ms debounce prevents hover-storm when cursor sweeps past tabs
    }, [prefetchForTab]);

    const handleTabMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    }, []);

    const navigate = useCallback((tab: string) => {
        setSidebarOpen(false);
        startTransition(() => {
            navigateFn(`/${tab}`);
        });
    }, [navigateFn]);

    // Called from child components (e.g., StudentDetail, Dashboard) to navigate with filters
    const handleNavigate = useCallback((tab: string, filter?: any) => {
        setSidebarOpen(false);
        startTransition(() => {
            if (tab === 'enrollments' && filter) {
                navigateFn(`/${tab}`, { state: filter });
            } else {
                navigateFn(`/${tab}`);
            }
        });
    }, [navigateFn]);

    const handleOpenStudentDetail = useCallback(async (studentId: string) => {
        try {
            const { data, error } = await supabase.from('students').select('*').eq('id', studentId).single();
            if (!error && data) {
                setGlobalStudentDetail(data);
            }
        } catch (e) {
            console.error('Failed to load student details', e);
        }
    }, []);

    // Global Keyboard Shortcuts Listener
    useEffect(() => {
        if (!user) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                target.classList.contains('ql-editor')
            );

            // Ctrl+K or Cmd+K: Open Command Palette
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(prev => !prev);
                return;
            }

            // Non-input hotkeys
            if (!isInput) {
                // ? or Shift+/ -> Open Shortcuts Modal
                if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                    e.preventDefault();
                    setShortcutsModalOpen(prev => !prev);
                    return;
                }

                // / -> Focus Search Input
                if (e.key === '/') {
                    e.preventDefault();
                    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.select();
                    }
                    return;
                }

                // N -> Add Student (admin only)
                if (!isViewer && (e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    setGlobalAddStudentOpen(true);
                    return;
                }

                // 1-8 -> Tab Navigation (admin only)
                if (!isViewer && !e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '8') {
                    const idx = parseInt(e.key, 10) - 1;
                    if (NAV_ITEMS[idx]) {
                        e.preventDefault();
                        navigate(NAV_ITEMS[idx].key);
                    }
                    return;
                }
            }

            // Ctrl+Shift+D -> Toggle Theme
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                toggleDarkMode();
                return;
            }

            // Ctrl+Shift+C -> Toggle Density
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                toggleDensity();
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [user, isViewer, toggleDarkMode, toggleDensity, navigate]);

    const handleSaveNewStudent = async (formData: StudentFormData) => {
        const { id: _id, ...rest } = formData;
        const { error } = await supabase.from('students').insert([rest]);
        if (error) throw new Error(error.message);
        queryClient.invalidateQueries({ queryKey: ['students'] });
        setGlobalAddStudentOpen(false);
    };

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
                {sidebarOpen && !isViewer && (
                    <div
                        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden animate-fadeIn"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Sidebar */}
                {!isViewer && (
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
                    <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
                        <button
                            onClick={() => setCommandPaletteOpen(true)}
                            className="w-full mb-3 flex items-center justify-between px-2.5 py-2 bg-surface-elevated/70 hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/40 rounded-xl text-xs font-medium text-muted hover:text-primary transition-all group shadow-xs"
                            title="Quick search (Ctrl+K)"
                        >
                            <div className="flex items-center gap-2">
                                <Search size={14} className="text-muted group-hover:text-brand-500 transition-colors" />
                                <span>Quick Search</span>
                            </div>
                            <kbd className="px-1.5 py-0.2 text-[9px] font-mono font-bold text-muted bg-surface border border-border-subtle rounded group-hover:border-brand-500/30">
                                ⌘K
                            </kbd>
                        </button>

                        <p className="px-2.5 text-[9px] font-bold text-muted uppercase tracking-wider mb-2">Navigation</p>
                        {NAV_ITEMS.map(item => {
                            const Icon = item.icon;
                            const isActive = activeTab === item.key;
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => navigate(item.key)}
                                    onMouseEnter={() => handleTabMouseEnter(item.key)}
                                    onMouseLeave={handleTabMouseLeave}
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
                    <div className="p-2 border-t border-border-subtle flex-shrink-0 space-y-1.5">
                        {/* Theme Toggle */}
                        <button
                            onClick={toggleDarkMode}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-primary hover:bg-surface-elevated transition-all group"
                        >
                            <div className="p-1.5 rounded-lg bg-surface-elevated text-muted group-hover:bg-background group-hover:text-primary border border-transparent group-hover:border-border-subtle transition-all transform group-hover:scale-105 flex-shrink-0">
                                {darkMode ? <Sun size={14} /> : <Moon size={14} />}
                            </div>
                            <span className="flex-1 text-left truncate">Theme</span>
                            <span className="text-[10px] text-muted flex-shrink-0">{darkMode ? 'Dark' : 'Light'}</span>
                        </button>

                        {/* Density Toggle */}
                        <button
                            onClick={toggleDensity}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-primary hover:bg-surface-elevated transition-all group"
                        >
                            <div className="p-1.5 rounded-lg bg-surface-elevated text-muted group-hover:bg-background group-hover:text-primary border border-transparent group-hover:border-border-subtle transition-all transform group-hover:scale-105 flex-shrink-0">
                                <Rows3 size={14} />
                            </div>
                            <span className="flex-1 text-left truncate">Density</span>
                            <span className="text-[10px] text-muted flex-shrink-0 capitalize">{density}</span>
                        </button>

                        {/* Shortcuts helper */}
                        <button
                            onClick={() => setShortcutsModalOpen(true)}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-primary hover:bg-surface-elevated transition-all group"
                        >
                            <div className="p-1.5 rounded-lg bg-surface-elevated text-muted group-hover:bg-background group-hover:text-primary border border-transparent group-hover:border-border-subtle transition-all transform group-hover:scale-105 flex-shrink-0">
                                <HelpCircle size={14} />
                            </div>
                            <span className="flex-1 text-left truncate">Shortcuts</span>
                            <kbd className="text-[10px] font-mono font-bold text-muted px-1.5 py-0.2 bg-surface border border-border-subtle rounded flex-shrink-0">?</kbd>
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
                )}

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
                                        if (user) {
                                            await subscribeUserToPush(user.id);
                                        }
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
                    {/* Viewer Top Header (Glassmorphism) */}
                    {isViewer && (
                        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border-subtle/60 px-4 sm:px-6 py-3 flex items-center justify-between transition-colors">
                            <div className="flex items-center gap-3 sm:gap-6">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 bg-gradient-to-br from-brand-500 via-brand-600 to-accent-500 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-brand-500/25 flex-shrink-0 animate-glow">
                                        C
                                    </div>
                                    <div className="min-w-0">
                                        <h1 className="text-sm font-bold text-primary tracking-tight truncate">
                                            Course CRM
                                        </h1>
                                        <p className="text-[9px] text-muted font-semibold tracking-wide uppercase">Viewer Portal</p>
                                    </div>
                                </div>

                                {/* Viewer Navigation Switcher */}
                                <div className="flex items-center gap-1 bg-surface-elevated/70 p-1 rounded-xl border border-border-subtle">
                                    <button
                                        onClick={() => navigate('lookup')}
                                        onMouseEnter={() => handleTabMouseEnter('students')}
                                        onMouseLeave={handleTabMouseLeave}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            activeTab === 'lookup'
                                                ? 'bg-brand-500 text-white shadow-sm'
                                                : 'text-muted hover:text-primary hover:bg-surface'
                                        }`}
                                    >
                                        <Users size={14} />
                                        <span>Students Lookup</span>
                                    </button>
                                    <button
                                        onClick={() => navigate('courses')}
                                        onMouseEnter={() => handleTabMouseEnter('courses')}
                                        onMouseLeave={handleTabMouseLeave}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            activeTab === 'courses'
                                                ? 'bg-brand-500 text-white shadow-sm'
                                                : 'text-muted hover:text-primary hover:bg-surface'
                                        }`}
                                    >
                                        <BookOpen size={14} />
                                        <span>Courses Catalog</span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3">
                                <button
                                    onClick={() => setCommandPaletteOpen(true)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-elevated hover:bg-surface border border-border-subtle hover:border-brand-500/40 text-muted hover:text-primary rounded-xl text-xs font-medium transition-all shadow-xs group"
                                    title="Quick search (Ctrl+K)"
                                >
                                    <Search size={14} className="text-muted group-hover:text-brand-500 transition-colors" />
                                    <span className="hidden sm:inline">Search</span>
                                    <kbd className="px-1.5 py-0.2 text-[9px] font-mono font-bold text-muted bg-surface border border-border-subtle rounded group-hover:border-brand-500/30">Ctrl K</kbd>
                                </button>

                                <NetworkStatusIndicator />

                                <button
                                    onClick={() => setShortcutsModalOpen(true)}
                                    className="p-2 rounded-xl text-muted hover:text-primary hover:bg-surface-elevated transition-all border border-transparent hover:border-border-subtle"
                                    title="Keyboard Shortcuts (?)"
                                >
                                    <HelpCircle size={17} />
                                </button>

                                <button
                                    onClick={toggleDensity}
                                    className={`p-2 rounded-xl text-muted hover:text-primary hover:bg-surface-elevated transition-all border ${density === 'compact' ? 'border-brand-500/30 bg-brand-500/10 text-brand-500' : 'border-transparent hover:border-border-subtle'}`}
                                    title={density === 'compact' ? 'Switch to Comfortable View' : 'Switch to Compact View'}
                                >
                                    <Rows3 size={17} />
                                </button>

                                <button
                                    onClick={toggleDarkMode}
                                    className="p-2 rounded-xl text-muted hover:text-primary hover:bg-surface-elevated transition-all border border-transparent hover:border-border-subtle"
                                    title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                                >
                                    {darkMode ? <Sun size={17} /> : <Moon size={17} />}
                                </button>

                                <div className="hidden md:flex items-center gap-2 px-2.5 py-1 bg-surface-elevated rounded-xl border border-border-subtle/50">
                                    <div className="w-6 h-6 bg-gradient-to-br from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-background shadow-sm">
                                        {(user?.email?.[0] || 'V').toUpperCase()}
                                    </div>
                                    <span className="text-xs font-semibold text-primary/80 truncate max-w-[120px]">{user?.email}</span>
                                    <span className="text-[9px] bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold px-1.5 py-0.5 rounded uppercase">Viewer</span>
                                </div>

                                <button
                                    onClick={signOut}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all shadow-sm"
                                    title="Sign Out"
                                >
                                    <LogOut size={14} />
                                    <span className="hidden sm:inline">Sign Out</span>
                                </button>
                            </div>
                        </header>
                    )}

                    {/* Mobile Header (Glassmorphism) */}
                    {!isViewer && (
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
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCommandPaletteOpen(true)}
                                    className="p-1.5 text-muted hover:text-primary hover:bg-surface-elevated rounded-lg transition-colors"
                                    title="Search (Ctrl+K)"
                                >
                                    <Search size={17} />
                                </button>
                                <NetworkStatusIndicator />
                                {pendingApprovalsCount > 0 ? (
                                    <button
                                        onClick={() => setApprovalsModalOpen(true)}
                                        className="p-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1 animate-pulse"
                                        title="Pending Approvals"
                                    >
                                        <Clock size={13} />
                                        <span>{pendingApprovalsCount}</span>
                                    </button>
                                ) : null}
                            </div>
                        </header>
                    )}

                    {/* Desktop Floating Header (Glassmorphism) */}
                    {!isViewer && (
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

                                {/* Header Right Controls: Search, Approvals & Notifications */}
                                <div className="flex items-center gap-2.5">
                                    <button
                                        onClick={() => setCommandPaletteOpen(true)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated hover:bg-surface border border-border-subtle hover:border-brand-500/40 text-muted hover:text-primary rounded-xl text-xs font-medium transition-all shadow-xs group"
                                        title="Quick search (Ctrl+K)"
                                    >
                                        <Search size={14} className="text-muted group-hover:text-brand-500 transition-colors" />
                                        <span>Quick search...</span>
                                        <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-muted bg-surface border border-border-subtle rounded-md group-hover:border-brand-500/30">
                                            Ctrl K
                                        </kbd>
                                    </button>

                                    <NetworkStatusIndicator showLabel />

                                    <button
                                        onClick={() => setShortcutsModalOpen(true)}
                                        className="p-2 rounded-xl text-muted hover:text-primary hover:bg-surface-elevated transition-all border border-transparent hover:border-border-subtle"
                                        title="Keyboard Shortcuts (?)"
                                    >
                                        <HelpCircle size={17} />
                                    </button>

                                    <button
                                        onClick={toggleDensity}
                                        className={`p-2 rounded-xl text-muted hover:text-primary hover:bg-surface-elevated transition-all border ${density === 'compact' ? 'border-brand-500/30 bg-brand-500/10 text-brand-500' : 'border-transparent hover:border-border-subtle'}`}
                                        title={density === 'compact' ? 'Switch to Comfortable View' : 'Switch to Compact View'}
                                    >
                                        <Rows3 size={17} />
                                    </button>

                                    {pendingApprovalsCount > 0 && (
                                        <button
                                            onClick={() => setApprovalsModalOpen(true)}
                                            className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold transition-all shadow-sm animate-pulse active:scale-95 cursor-pointer"
                                            title="Review pending course completion requests"
                                        >
                                            <Clock size={14} className="animate-spin-slow" />
                                            <span>{pendingApprovalsCount} Pending Approval{pendingApprovalsCount > 1 ? 's' : ''}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </header>
                    )}

                    {/* Page Content */}
                    <main className={`flex-1 w-full flex flex-col min-h-0 ${
                        activeTab === 'enrollments'
                            ? 'px-2 py-2 sm:px-6 lg:px-8 sm:py-4 pb-[max(calc(env(safe-area-inset-bottom)+4.25rem),4.25rem)] lg:pb-4 overflow-hidden'
                            : 'px-3 py-3 sm:px-6 lg:px-8 py-4 pb-[max(calc(env(safe-area-inset-bottom)+5rem),5rem)] lg:pb-4'
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
                                {isViewer ? (
                                    <>
                                        <Route path="/lookup" element={<StudentLookup />} />
                                        <Route path="/courses" element={<ViewerCourses />} />
                                        <Route path="*" element={<Navigate to="/lookup" replace />} />
                                    </>
                                ) : (
                                    <>
                                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                        <Route
                                            path="/dashboard"
                                            element={
                                                <Dashboard
                                                    onNavigate={handleNavigate}
                                                    onOpenStudentDetail={handleOpenStudentDetail}
                                                    pendingApprovalsCount={pendingApprovalsCount}
                                                    onOpenApprovals={() => setApprovalsModalOpen(true)}
                                                />
                                            }
                                        />
                                        <Route path="/students" element={<StudentList onNavigate={handleNavigate} />} />
                                        <Route path="/courses" element={<CourseList />} />
                                        <Route path="/enrollments" element={<EnrollmentBoard initialCourseFilter={location.state?.courseId} initialCourseDate={location.state?.courseDate} />} />
                                        <Route path="/outcomes" element={<OutcomesList />} />
                                        <Route path="/documents" element={<DocumentGenerator />} />
                                        <Route path="/analytics" element={<Analytics />} />
                                        <Route path="/settings" element={<Settings />} />
                                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                                    </>
                                )}
                            </Routes>
                        </Suspense>
                    </main>
                </div>
            </div>

            {/* Mobile Bottom Navigation Dock */}
            <MobileBottomNav
                activeTab={activeTab}
                onNavigate={navigate}
                isViewer={isViewer}
                pendingApprovalsCount={pendingApprovalsCount}
                darkMode={darkMode}
                toggleDarkMode={toggleDarkMode}
                density={density}
                toggleDensity={toggleDensity}
                onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                onOpenShortcuts={() => setShortcutsModalOpen(true)}
                onOpenApprovals={() => setApprovalsModalOpen(true)}
                onSignOut={signOut}
                userEmail={user.email}
            />

            {/* Mobile Floating Actions (FAB) */}
            <MobileFloatingActions
                onOpenAddStudent={() => setGlobalAddStudentOpen(true)}
                onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                onOpenEnrollment={isViewer ? undefined : () => setGlobalEnrollModalOpen(true)}
                isViewer={isViewer}
            />

            {/* Admin Approvals Modal */}
            <PendingApprovalsModal
                open={approvalsModalOpen}
                onClose={() => setApprovalsModalOpen(false)}
            />

            {/* Global Command Palette */}
            <CommandPalette
                open={commandPaletteOpen}
                onClose={() => setCommandPaletteOpen(false)}
                onNavigate={handleNavigate}
                onOpenStudentDetail={student => setGlobalStudentDetail(student)}
                onOpenAddStudent={() => setGlobalAddStudentOpen(true)}
                onOpenApprovals={() => setApprovalsModalOpen(true)}
                onOpenShortcuts={() => setShortcutsModalOpen(true)}
                darkMode={darkMode}
                toggleDarkMode={toggleDarkMode}
                density={density}
                toggleDensity={toggleDensity}
                isViewer={isViewer}
                pendingApprovalsCount={pendingApprovalsCount}
            />

            {/* Global Keyboard Shortcuts Modal */}
            <KeyboardShortcutsModal
                open={shortcutsModalOpen}
                onClose={() => setShortcutsModalOpen(false)}
            />

            {/* Global Add Student Modal */}
            {globalAddStudentOpen && (
                <StudentModal
                    open={true}
                    student={null}
                    onSave={handleSaveNewStudent}
                    onClose={() => setGlobalAddStudentOpen(false)}
                />
            )}

            {/* Global New Enrollment Modal */}
            {globalEnrollModalOpen && (
                <EnrollmentModal
                    open={true}
                    onSave={() => {
                        queryClient.invalidateQueries({ queryKey: ['enrollments'] });
                        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
                        queryClient.invalidateQueries({ queryKey: ['courses'] });
                    }}
                    onClose={() => setGlobalEnrollModalOpen(false)}
                />
            )}

            {/* Global Student Detail Modal */}
            {globalStudentDetail && (
                <StudentDetail
                    student={globalStudentDetail}
                    onClose={() => setGlobalStudentDetail(null)}
                    onNavigate={handleNavigate}
                />
            )}
        </TooltipProvider>
    );
}

export default App;

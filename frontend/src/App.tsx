import { useState, useEffect, useCallback, Suspense, useTransition, useRef } from 'react';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { flushSync } from 'react-dom';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Users, BookOpen, GraduationCap, FileText, LogOut, Menu, X, Sun, Moon, Settings as SettingsIcon, Bell, Briefcase, PieChart, Clock, Rows3, Search, HelpCircle } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import { useConfirmationNotifier } from './hooks/useConfirmationNotifier';
import { useGlobalRealtimeSync } from './hooks/useGlobalRealtimeSync';
import { fetchAllEnrollments } from './hooks/useEnrollments';
import { fetchGraduatesFn } from './hooks/useOutcomes';
import { isNotificationSupported, getNotificationPermission } from './lib/notifications';
import { isUserSubscribed, subscribeUserToPush } from './lib/pushNotifications';
import { supabase } from './lib/supabase';
import { fetchCourses, fetchDashboardStats, fetchEmploymentStatuses, fetchStudentsPage } from './lib/queries';
import { Student, StudentPayload } from './lib/types';
import CommandPalette from './components/CommandPalette';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import StudentModal from './components/StudentModal';
import StudentDetail from './components/StudentDetail';
import EnrollmentModal from './components/EnrollmentModal';
import MobileBottomNav from './components/MobileBottomNav';
import MobileFloatingActions from './components/MobileFloatingActions';
import OutreachShell from './components/OutreachShell';
import { getUserRole } from './lib/roles';

import { TooltipProvider } from './components/ui/Tooltip';
import { AppFallback } from './components/ui/PageFallbacks';
import { IconButton } from './components/ui/Button';
import NetworkStatusIndicator from './components/ui/NetworkStatusIndicator';
import { NetworkStatusProvider } from './contexts/NetworkStatusContext';
import { GlobalToaster } from './components/Toast';
import { toast } from './lib/toast';
import { isAnyModalOpen, useModalBehavior } from './hooks/useModalBehavior';

// Lazy load heavy route components with retry logic to prevent "Failed to fetch dynamically imported module" errors
const Dashboard = lazyWithRetry(() => import('./components/Dashboard'));
const StudentList = lazyWithRetry(() => import('./components/StudentList'));
const CourseList = lazyWithRetry(() => import('./components/CourseList'));
const EnrollmentBoard = lazyWithRetry(() => import('./components/EnrollmentBoard'));
const DocumentGenerator = lazyWithRetry(() => import('./components/DocumentGenerator'));
const OutcomesList = lazyWithRetry(() => import('./components/OutcomesList'));
const Settings = lazyWithRetry(() => import('./components/Settings'));
type Density = 'comfortable' | 'compact';
const Analytics = lazyWithRetry(() => import('./components/Analytics'));
const ViewerStudentsDirectory = lazyWithRetry(() => import('./components/ViewerStudentsDirectory'));
const ViewerCourses = lazyWithRetry(() => import('./components/ViewerCourses'));
const ViewerHome = lazyWithRetry(() => import('./components/ViewerHome'));
const OutreachLists = lazyWithRetry(() => import('./components/OutreachLists'));
const StudentDetailDrawer = lazyWithRetry(() => import('./components/StudentDetailDrawer'));
const PendingApprovalsModal = lazyWithRetry(() => import('./components/PendingApprovalsModal'));
import ViewerHeader from './components/Viewer/ViewerHeader';
import { VIEWER_TABS, type ViewerTab } from './components/Viewer/viewerMeta';
import { useStudentDrawer, useVisibleStudentIds } from './components/Viewer/studentDrawer';
import { usePendingApprovalsCount } from './hooks/useApprovals';

// `title` (page header) defaults to `label` (sidebar)
const NAV_ITEMS: { key: string; label: string; title?: string; icon: typeof Users; subtitle: string; group: string }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, subtitle: 'Welcome back — here\'s your overview', group: 'Workspace' },
    { key: 'students', label: 'Students', icon: Users, subtitle: 'Manage your student database', group: 'Workspace' },
    { key: 'courses', label: 'Courses', icon: BookOpen, subtitle: 'View and manage the course catalog', group: 'Workspace' },
    { key: 'enrollments', label: 'Enrollments', icon: GraduationCap, subtitle: 'Track and manage enrollments', group: 'Workspace' },
    { key: 'outcomes', label: 'Outcomes', icon: Briefcase, subtitle: 'Track graduate employment status', group: 'Insights' },
    { key: 'documents', label: 'Documents', icon: FileText, subtitle: 'Generate personalised documents from templates', group: 'Insights' },
    { key: 'analytics', label: 'Analytics', title: 'Analytics & Insights', icon: PieChart, subtitle: 'Course, enrollment and outcome statistics', group: 'Insights' },
    { key: 'settings', label: 'Settings', icon: SettingsIcon, subtitle: 'Email templates, data quality and preferences', group: 'System' },
];
const NAV_GROUPS = ['Workspace', 'Insights', 'System'] as const;

// Hover prefetch per tab: its data, plus its chunk (idle prewarm skips heavy chunks on slow connections)
const enrollmentsQuery = { queryKey: ['enrollments'], queryFn: fetchAllEnrollments };
const TAB_PREFETCH: Record<string, { queries?: { queryKey: string[]; queryFn: () => Promise<unknown> }[]; chunk?: () => Promise<unknown> }> = {
    dashboard: { queries: [{ queryKey: ['dashboard_stats'], queryFn: fetchDashboardStats }, enrollmentsQuery] },
    courses: { queries: [{ queryKey: ['courses'], queryFn: fetchCourses }, enrollmentsQuery], chunk: () => import('./components/CourseList') },
    enrollments: { queries: [enrollmentsQuery] },
    outcomes: { queries: [{ queryKey: ['outcomes_graduates'], queryFn: fetchGraduatesFn }], chunk: () => import('./components/OutcomesList') },
    documents: { queries: [enrollmentsQuery, { queryKey: ['doc_courses'], queryFn: fetchCourses }], chunk: () => import('./components/DocumentGenerator') },
    analytics: { queries: [enrollmentsQuery, { queryKey: ['analytics_employment_statuses_v1'], queryFn: fetchEmploymentStatuses }], chunk: () => import('./components/Analytics') },
    settings: { chunk: () => import('./components/Settings') },
};

const NOTIF_BANNER_DISMISSED_KEY = 'notif_banner_dismissed_at';
const NOTIF_BANNER_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function App() {
    const { user, loading, signOut } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showNotifBanner, setShowNotifBanner] = useState(false);

    // Fire browser notifications for enrollment confirmations
    useConfirmationNotifier();
    useGlobalRealtimeSync();

    // Show notification permission banner once if not yet decided/subscribed (and not dismissed recently)
    useEffect(() => {
        const checkPushSubscription = async () => {
            let dismissedAt = 0;
            try {
                dismissedAt = parseInt(localStorage.getItem(NOTIF_BANNER_DISMISSED_KEY) || '0', 10) || 0;
            } catch {
                // storage unavailable — just show the banner
            }
            if (Date.now() - dismissedAt < NOTIF_BANNER_SNOOZE_MS) return;
            if (isNotificationSupported() && getNotificationPermission() === 'default') {
                const isSubscribed = await isUserSubscribed();
                if (!isSubscribed) {
                    setShowNotifBanner(true);
                }
            }
        };
        checkPushSubscription();
    }, []);

    // Viewers: prewarm their route chunks during idle time (admin tabs are warmed further below)
    useEffect(() => {
        if (getUserRole(user) !== 'viewer') return;
        const prewarm = () => {
            import('./components/ViewerHome');
            import('./components/ViewerStudentsDirectory');
            import('./components/ViewerCourses');
            import('./components/StudentDetailDrawer');
        };
        if ('requestIdleCallback' in window) {
            const handle = requestIdleCallback(prewarm, { timeout: 2000 });
            return () => cancelIdleCallback(handle);
        }
        const timer = setTimeout(prewarm, 1000);
        return () => clearTimeout(timer);
    }, [user]);

    const location = useLocation();
    const navigateFn = useNavigate();
    const [, startTransition] = useTransition();
    const role = getUserRole(user);
    const isViewer = role === 'viewer';
    // External Lists only (migration 65): gets its own minimal shell below
    const isOutreach = role === 'outreach';
    const viewerTab: ViewerTab = VIEWER_TABS.find(t => location.pathname.startsWith(`/${t.key}`))?.key ?? 'home';
    const activeTab = isViewer ? viewerTab : (location.pathname.split('/')[1] || 'dashboard');
    const activeNav = NAV_ITEMS.find(n => n.key === activeTab);
    const pageTitle = activeNav?.title ?? activeNav?.label;
    const [approvalsModalOpen, setApprovalsModalOpen] = useState(false);
    const { count: pendingApprovalsCount } = usePendingApprovalsCount(!!user && role === 'admin');

    // Browser tab title follows the current page (and shows pending approvals)
    useEffect(() => {
        if (!user) {
            document.title = 'CCP CRM';
            return;
        }
        const page = isOutreach
            ? 'External Lists'
            : isViewer
                ? (VIEWER_TABS.find(t => t.key === activeTab)?.label || 'Home')
                : (pageTitle || 'Dashboard');
        const prefix = !isViewer && pendingApprovalsCount > 0 ? `(${pendingApprovalsCount}) ` : '';
        document.title = `${prefix}${page} · CCP CRM`;
    }, [user, isViewer, isOutreach, activeTab, pageTitle, pendingApprovalsCount]);

    // Escape closes the mobile sidebar drawer
    useModalBehavior(sidebarOpen, () => setSidebarOpen(false));

    // Global Modal & Palette States
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
    const [globalAddStudentOpen, setGlobalAddStudentOpen] = useState(false);
    const [globalEnrollModalOpen, setGlobalEnrollModalOpen] = useState(false);
    const [globalEnrollStudentId, setGlobalEnrollStudentId] = useState<string | undefined>();
    const [globalStudentDetail, setGlobalStudentDetail] = useState<Student | null>(null);
    const viewerDrawer = useStudentDrawer();
    const viewerListIds = useVisibleStudentIds();

    const [darkMode, setDarkMode] = useState(() => {
        // Initialize from local storage or system preference
        const saved = window.localStorage.getItem('theme');
        if (saved) return saved === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    // Apply dark mode class to root element (+ keep the mobile browser chrome colour in sync)
    useEffect(() => {
        document.documentElement.classList.toggle('dark', darkMode);
        // index.html pins a light boot background for light-theme users; React owns theming from here
        document.documentElement.removeAttribute('data-boot-theme');
        document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#09090b' : '#f3f5f8');
        try {
            window.localStorage.setItem('theme', darkMode ? 'dark' : 'light');
        } catch {
            // ignore storage errors (private mode)
        }
    }, [darkMode]);

    const toggleDarkMode = useCallback(() => {
        const root = document.documentElement;
        const next = !root.classList.contains('dark');
        // Swap the class synchronously so the view transition snapshots the finished theme
        // (a plain setState would commit after the snapshot and cross-fade to the old one).
        const apply = () => {
            root.classList.toggle('dark', next);
            flushSync(() => setDarkMode(next));
        };
        // Suppress the per-element colour transitions while the theme flips
        root.classList.add('theme-switching');
        const done = () => requestAnimationFrame(() => root.classList.remove('theme-switching'));
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
        if (doc.startViewTransition && !reduceMotion) {
            doc.startViewTransition(apply).finished.finally(done);
        } else {
            apply();
            done();
        }
    }, []);

    // Owned here; Settings gets it as props
    const [density, setDensity] = useState<Density>(() =>
        window.localStorage.getItem('view_density') === 'compact' ? 'compact' : 'comfortable'
    );

    useEffect(() => {
        document.documentElement.classList.toggle('density-compact', density === 'compact');
        try {
            window.localStorage.setItem('view_density', density);
        } catch {
            // ignore storage errors (private mode)
        }
    }, [density]);

    const toggleDensity = useCallback(() => {
        setDensity(prev => prev === 'comfortable' ? 'compact' : 'comfortable');
    }, []);

    const queryClient = useQueryClient();
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Hover intent (debounced so a cursor sweeping past tabs doesn't fire them all)
    const handleTabMouseEnter = useCallback((tab: string) => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            const { queries = [], chunk } = TAB_PREFETCH[tab] ?? {};
            queries.forEach(q => queryClient.prefetchQuery({ ...q, staleTime: 30_000 }));
            if (tab === 'students') {
                queryClient.prefetchInfiniteQuery({ queryKey: ['students', ''], queryFn: fetchStudentsPage, initialPageParam: 0, staleTime: 30_000 });
            }
            chunk?.();
        }, 150);
    }, [queryClient]);

    const handleTabMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    }, []);

    // Warm the code of the other admin tabs once the browser is idle, so the first visit to a
    // tab doesn't wait on a chunk download (touch devices never get the hover prefetch above).
    // Heavy chunks (charts, docx) are skipped on data-saver / slow connections.
    useEffect(() => {
        if (!user || isViewer || isOutreach) return;
        const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
        if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return;
        const slow = conn?.effectiveType === '3g';
        const loaders: Array<() => Promise<unknown>> = [
            () => import('./components/Dashboard'),
            () => import('./components/StudentList'),
            () => import('./components/EnrollmentBoard'),
            () => import('./components/CourseList'),
            () => import('./components/OutcomesList'),
            () => import('./components/StudentDetailDrawer'),
            ...(slow ? [] : [
                () => import('./components/Settings'),
                () => import('./components/Analytics'),
                () => import('./components/DocumentGenerator'),
            ]),
        ];
        const w = window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
        };
        let cancelled = false;
        let handle: number | undefined;
        const schedule = (cb: () => void) => {
            handle = w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 4000 }) : window.setTimeout(cb, 1500);
        };
        // One chunk per idle slot so prewarming never competes with user interaction
        const next = () => {
            const load = loaders.shift();
            if (cancelled || !load) return;
            load().catch(() => { /* real navigation retries via lazyWithRetry */ }).finally(() => {
                if (!cancelled) schedule(next);
            });
        };
        const start = window.setTimeout(() => schedule(next), 2500);
        return () => {
            cancelled = true;
            window.clearTimeout(start);
            if (handle !== undefined) {
                if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
                else window.clearTimeout(handle);
            }
        };
    }, [user, isViewer, isOutreach]);

    const navigate = useCallback((tab: string, state?: any) => {
        setSidebarOpen(false);
        startTransition(() => {
            navigateFn(`/${tab}`, state ? { state } : undefined);
        });
    }, [navigateFn]);


    const handleOpenStudentDetail = useCallback(async (studentId: string) => {
        try {
            const { data, error } = await supabase.from('students').select('*').eq('id', studentId).single();
            if (error || !data) throw error || new Error('Student not found');
            setGlobalStudentDetail(data);
        } catch (e) {
            console.error('Failed to load student details', e);
            toast.error('Could not open student details');
        }
    }, []);

    // Global Keyboard Shortcuts Listener
    useEffect(() => {
        if (!user || isOutreach) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable ||
                target.classList?.contains('ql-editor')
            );

            // Ctrl+K or Cmd+K: Open Command Palette
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(prev => !prev);
                return;
            }

            // Non-input hotkeys (disabled while a modal/drawer is open so they can't act "behind" it)
            if (!isInput && !isAnyModalOpen() && !e.repeat) {
                // ? or Shift+/ -> Open Shortcuts Modal
                if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                    e.preventDefault();
                    setShortcutsModalOpen(prev => !prev);
                    return;
                }

                // / -> Focus the current page's search input (falls back to the first visible text input)
                if (e.key === '/') {
                    const isVisible = (el: HTMLElement) => el.offsetParent !== null || el.getClientRects().length > 0;
                    const candidates = [
                        ...Array.from(document.querySelectorAll<HTMLInputElement>('main input[data-page-search]')),
                        ...Array.from(document.querySelectorAll<HTMLInputElement>('main input[type="text"], main input[type="search"]')),
                    ];
                    const searchInput = candidates.find(isVisible);
                    if (searchInput) {
                        e.preventDefault();
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

                // 1-4 -> Viewer tab navigation
                if (isViewer && !e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= String(VIEWER_TABS.length)) {
                    e.preventDefault();
                    navigate(VIEWER_TABS[parseInt(e.key, 10) - 1].key);
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
    }, [user, isViewer, isOutreach, toggleDarkMode, toggleDensity, navigate]);

    const handleSaveNewStudent = async (formData: StudentPayload) => {
        const { id: _id, ...rest } = formData;
        const { error } = await supabase.from('students').insert([rest]);
        if (error) {
            if (error.message.includes('duplicate') || error.message.includes('unique')) {
                throw new Error('A student with this name and email already exists');
            }
            throw new Error(error.message);
        }
        queryClient.invalidateQueries({ queryKey: ['students'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
        toast.success(`${rest.first_name} ${rest.last_name} added`);
        setGlobalAddStudentOpen(false);
    };

    if (loading) {
        return <AppFallback />;
    }

    if (!user) {
        return <LoginPage />;
    }

    if (isOutreach) {
        return (
            <NetworkStatusProvider>
                <TooltipProvider delayDuration={100}>
                    <OutreachShell darkMode={darkMode} toggleDarkMode={toggleDarkMode} userEmail={user.email} onSignOut={signOut} />
                </TooltipProvider>
            </NetworkStatusProvider>
        );
    }

    return (
        <NetworkStatusProvider>
        <TooltipProvider delayDuration={100}>
            <div className="h-screen w-full bg-background text-primary flex relative overflow-hidden">
                {/* Subtle radial glow in Dark Mode */}
                {darkMode && (
                    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                        <div className="orb absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[1100px] max-w-[160vw] max-h-[160vw] text-brand-500/[0.05]" />
                    </div>
                )}

                {/* Mobile overlay */}
                {sidebarOpen && !isViewer && (
                    <div
                        className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[35] lg:hidden animate-fadeIn"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Sidebar */}
                {!isViewer && (
                    <aside className={`
                    fixed lg:sticky top-0 left-0 h-screen w-[224px] z-40
                    flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
                    bg-surface border-r border-border-subtle
                    ${sidebarOpen ? 'translate-x-0 shadow-float' : '-translate-x-full lg:translate-x-0'}
                `}>
                    {/* Logo */}
                    <div className="h-14 px-4 flex items-center justify-between flex-shrink-0 border-b border-border-subtle">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 via-brand-600 to-violet-500 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-brand-500/25 ring-1 ring-inset ring-white/15 flex-shrink-0">
                                C
                            </div>
                            <div className="min-w-0 leading-tight">
                                <h1 className="text-sm font-bold text-primary tracking-tight truncate">CCP CRM</h1>
                                <p className="text-[10px] text-muted font-medium truncate">Management system</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            aria-label="Close menu"
                            className="lg:hidden text-muted hover:text-primary p-1.5 rounded-lg hover:bg-surface-elevated transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Nav */}
                    <nav className="flex-1 px-3 py-3 overflow-y-auto" aria-label="Main">
                        <button
                            onClick={() => setCommandPaletteOpen(true)}
                            className="w-full mb-4 flex items-center justify-between h-9 px-2.5 bg-surface-elevated/60 hover:bg-surface-elevated border border-border-subtle hover:border-border-strong rounded-xl text-xs font-medium text-muted hover:text-primary transition-colors group"
                            title="Quick search (Ctrl+K)"
                        >
                            <span className="flex items-center gap-2">
                                <Search size={14} className="group-hover:text-brand-500 transition-colors" />
                                Quick search
                            </span>
                            <kbd className="px-1.5 h-5 inline-flex items-center text-[10px] font-mono font-semibold text-muted bg-surface border border-border-subtle rounded-md">
                                ⌘K
                            </kbd>
                        </button>

                        {NAV_GROUPS.map(group => (
                            <div key={group} className="mb-4 last:mb-0">
                                <p className="px-2.5 mb-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">{group}</p>
                                <div className="space-y-0.5">
                                    {NAV_ITEMS.filter(item => item.group === group).map(item => {
                                        const Icon = item.icon;
                                        const isActive = activeTab === item.key;
                                        const shortcut = NAV_ITEMS.indexOf(item) + 1;
                                        return (
                                            <button
                                                key={item.key}
                                                onClick={() => navigate(item.key)}
                                                onMouseEnter={() => handleTabMouseEnter(item.key)}
                                                onMouseLeave={handleTabMouseLeave}
                                                aria-current={isActive ? 'page' : undefined}
                                                className={`w-full flex items-center gap-2.5 h-9 px-2.5 rounded-xl text-[13px] transition-colors group relative ${
                                                    isActive
                                                        ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 font-semibold'
                                                        : 'text-muted font-medium hover:text-primary hover:bg-surface-elevated'
                                                }`}
                                            >
                                                {isActive && (
                                                    <span aria-hidden className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-500 rounded-r-full" />
                                                )}
                                                <Icon size={17} className="flex-shrink-0" />
                                                <span className="flex-1 text-left truncate">{item.label}</span>
                                                <span aria-hidden className="hidden lg:inline text-[10px] font-mono text-muted/70 opacity-0 group-hover:opacity-100 transition-opacity">{shortcut}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>

                    {/* Preferences / user */}
                    <div className="p-3 border-t border-border-subtle flex-shrink-0 space-y-2">
                        <div className="flex items-center gap-1">
                            <IconButton size="sm" label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleDarkMode}>
                                {darkMode ? <Sun size={15} /> : <Moon size={15} />}
                            </IconButton>
                            <IconButton
                                size="sm"
                                label={density === 'compact' ? 'Switch to comfortable view' : 'Switch to compact view'}
                                onClick={toggleDensity}
                                active={density === 'compact'}
                            >
                                <Rows3 size={15} />
                            </IconButton>
                            <IconButton size="sm" label="Keyboard shortcuts (?)" onClick={() => setShortcutsModalOpen(true)}>
                                <HelpCircle size={15} />
                            </IconButton>
                            <span className="flex-1" />
                            <IconButton size="sm" tone="danger" label="Sign out" onClick={signOut}>
                                <LogOut size={15} />
                            </IconButton>
                        </div>
                        <div className="flex items-center gap-2.5 px-2 py-2 bg-surface-elevated/60 rounded-xl border border-border-subtle">
                            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-violet-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {(user.email?.[0] || 'A').toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-primary truncate" title={user.email ?? undefined}>{user.email}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                    <span className="text-[10px] text-muted font-medium">Administrator</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
                )}

                {/* Main Content */}
                {/* Only the board manages its own (per-column) scrolling; every other page scrolls here.
                    (The dashboard used to be overflow-hidden on desktop, cutting off everything below the fold.) */}
                {/* No z-index on this column: page-level dialogs and drawers must layer above the sidebar */}
                <div className={`flex-1 flex flex-col h-screen relative min-w-0 ${
                    activeTab === 'enrollments' ? 'overflow-hidden' : 'overflow-y-auto'
                }`}>
                    {/* Notification Permission Banner */}
                    {showNotifBanner && (
                        <div className="bg-brand-500/[0.07] border-b border-brand-500/20 px-4 lg:px-8 py-2 flex items-center justify-between gap-3 animate-fadeIn">
                            <div className="flex items-center gap-2 text-sm">
                                <Bell size={16} className="text-brand-500 flex-shrink-0" />
                                <span className="text-primary">Enable notifications to be alerted when students confirm courses</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={async () => {
                                        setShowNotifBanner(false);
                                        if (user) {
                                            const ok = await subscribeUserToPush(user.id);
                                            if (ok) toast.success('Notifications enabled');
                                            else toast.error('Notifications were not enabled (permission denied or unsupported)');
                                        }
                                    }}
                                    className="h-7 px-3 text-xs font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                                >
                                    Enable
                                </button>
                                <button
                                    onClick={() => {
                                        setShowNotifBanner(false);
                                        try {
                                            localStorage.setItem(NOTIF_BANNER_DISMISSED_KEY, String(Date.now()));
                                        } catch {
                                            // ignore
                                        }
                                    }}
                                    aria-label="Dismiss"
                                    title="Remind me later"
                                    className="text-muted hover:text-primary transition-colors p-1 rounded-md"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                    {isViewer && (
                        <ViewerHeader
                            activeTab={viewerTab}
                            onNavigate={tab => navigate(tab)}
                            onOpenSearch={() => setCommandPaletteOpen(true)}
                            onOpenShortcuts={() => setShortcutsModalOpen(true)}
                            darkMode={darkMode}
                            toggleDarkMode={toggleDarkMode}
                            density={density}
                            toggleDensity={toggleDensity}
                            userEmail={user.email}
                            onSignOut={signOut}
                        />
                    )}

                    {/* Mobile Header */}
                    {!isViewer && (
                        <header className="lg:hidden h-14 bg-background/90 backdrop-blur-md backdrop-saturate-150 border-b border-border-subtle px-2 flex items-center justify-between gap-2 sticky top-0 z-30">
                            <IconButton label="Open menu" onClick={() => setSidebarOpen(true)}>
                                <Menu size={20} />
                            </IconButton>
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 bg-gradient-to-br from-brand-500 via-brand-600 to-violet-500 rounded-lg flex items-center justify-center text-white font-bold text-[11px] shadow-sm shadow-brand-500/20 flex-shrink-0">
                                    C
                                </div>
                                <span className="font-semibold text-sm text-primary tracking-tight truncate">{pageTitle}</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                                <IconButton label="Search (Ctrl+K)" onClick={() => setCommandPaletteOpen(true)}>
                                    <Search size={18} />
                                </IconButton>
                                <NetworkStatusIndicator />
                                {pendingApprovalsCount > 0 ? (
                                    <button
                                        onClick={() => setApprovalsModalOpen(true)}
                                        className="h-8 px-2 bg-warning/15 border border-warning/30 text-status-requested rounded-lg text-xs font-bold flex items-center gap-1"
                                        title="Pending Approvals"
                                    >
                                        <Clock size={13} />
                                        <span>{pendingApprovalsCount}</span>
                                    </button>
                                ) : null}
                            </div>
                        </header>
                    )}

                    {/* Desktop Header */}
                    {!isViewer && (
                        <header className="hidden lg:flex sticky top-0 z-20 h-14 bg-background/85 backdrop-blur-md backdrop-saturate-150 border-b border-border-subtle px-8 items-center justify-between gap-4">
                            <div className="flex items-baseline gap-3 min-w-0">
                                <h2 className="text-lg font-semibold text-primary tracking-tight">{pageTitle}</h2>
                                {activeNav && (
                                    <p className="text-[13px] text-muted truncate">{activeNav.subtitle}</p>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                {pendingApprovalsCount > 0 && (
                                    <button
                                        onClick={() => setApprovalsModalOpen(true)}
                                        className="flex items-center gap-2 h-8 px-3 mr-1 bg-warning/10 hover:bg-warning/20 border border-warning/30 text-status-requested rounded-xl text-xs font-semibold transition-colors"
                                        title="Review pending course completion requests"
                                    >
                                        <span className="relative flex w-2 h-2">
                                            <span className="absolute inline-flex h-full w-full rounded-full bg-warning opacity-75 animate-ping-few" />
                                            <span className="relative inline-flex w-2 h-2 rounded-full bg-warning" />
                                        </span>
                                        {pendingApprovalsCount} pending approval{pendingApprovalsCount > 1 ? 's' : ''}
                                    </button>
                                )}

                                <button
                                    onClick={() => setCommandPaletteOpen(true)}
                                    className="flex items-center gap-2 h-8 pl-2.5 pr-1.5 w-56 bg-surface hover:bg-surface-elevated border border-border-subtle hover:border-border-strong text-muted hover:text-primary rounded-xl text-xs font-medium transition-colors group"
                                    title="Quick search (Ctrl+K)"
                                >
                                    <Search size={14} className="group-hover:text-brand-500 transition-colors" />
                                    <span className="flex-1 text-left">Search…</span>
                                    <kbd className="px-1.5 h-5 inline-flex items-center text-[10px] font-mono font-semibold text-muted bg-surface-elevated border border-border-subtle rounded-md">
                                        Ctrl K
                                    </kbd>
                                </button>

                                <NetworkStatusIndicator showLabel />

                                <IconButton label="Keyboard shortcuts (?)" onClick={() => setShortcutsModalOpen(true)}>
                                    <HelpCircle size={17} />
                                </IconButton>
                                <IconButton
                                    label={density === 'compact' ? 'Switch to comfortable view' : 'Switch to compact view'}
                                    onClick={toggleDensity}
                                    active={density === 'compact'}
                                >
                                    <Rows3 size={17} />
                                </IconButton>
                                <IconButton label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleDarkMode}>
                                    {darkMode ? <Sun size={17} /> : <Moon size={17} />}
                                </IconButton>
                            </div>
                        </header>
                    )}

                    {/* Page Content */}
                    <main className={`flex-1 w-full flex flex-col min-h-0 ${
                        activeTab === 'enrollments'
                            ? 'px-2 py-2 sm:px-6 lg:px-8 sm:py-4 pb-[max(calc(env(safe-area-inset-bottom)+4.25rem),4.25rem)] lg:pb-4 overflow-hidden'
                            : 'px-3 pt-3 sm:px-6 sm:pt-5 lg:px-8 lg:pt-6 pb-[max(calc(env(safe-area-inset-bottom)+5rem),5rem)] lg:pb-8'
                    }`}>
                        <Suspense fallback={
                            <div className="w-full flex-1 flex items-center justify-center min-h-[50vh]">
                                <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
                            </div>
                        }>
                            <Routes>
                                {isViewer ? (
                                    <>
                                        <Route path="/home" element={<ViewerHome onOpenSearch={() => setCommandPaletteOpen(true)} />} />
                                        <Route path="/students" element={<ViewerStudentsDirectory />} />
                                        <Route path="/courses" element={<ViewerCourses />} />
                                        <Route path="/courses/:courseId" element={<ViewerCourses />} />
                                        <Route path="/external-lists" element={<OutreachLists />} />
                                        <Route path="/lookup" element={<Navigate to="/students" replace />} />
                                        <Route path="*" element={<Navigate to="/home" replace />} />
                                    </>
                                ) : (
                                    <>
                                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                        <Route
                                            path="/dashboard"
                                            element={
                                                <Dashboard
                                                    onNavigate={navigate}
                                                    onOpenStudentDetail={handleOpenStudentDetail}
                                                    pendingApprovalsCount={pendingApprovalsCount}
                                                    onOpenApprovals={() => setApprovalsModalOpen(true)}
                                                    onAddStudent={() => setGlobalAddStudentOpen(true)}
                                                    onAddEnrollment={() => setGlobalEnrollModalOpen(true)}
                                                />
                                            }
                                        />
                                        <Route path="/students" element={<StudentList onNavigate={navigate} />} />
                                        <Route path="/courses" element={<CourseList />} />
                                        <Route path="/enrollments" element={<EnrollmentBoard initialCourseFilter={location.state?.courseId} initialCourseDate={location.state?.courseDate} />} />
                                        <Route path="/outcomes" element={<OutcomesList />} />
                                        <Route path="/documents" element={<DocumentGenerator />} />
                                        <Route path="/analytics" element={<Analytics />} />
                                        <Route path="/settings" element={<Settings density={density} onDensityChange={setDensity} />} />
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

            {/* Admin Approvals Modal (lazy chunk — only mounted when opened so it never suspends the whole app) */}
            {approvalsModalOpen && (
                <Suspense fallback={null}>
                    <PendingApprovalsModal
                        open={true}
                        onClose={() => setApprovalsModalOpen(false)}
                    />
                </Suspense>
            )}

            <GlobalToaster />

            {/* Global Command Palette */}
            <CommandPalette
                open={commandPaletteOpen}
                onClose={() => setCommandPaletteOpen(false)}
                onNavigate={navigate}
                onOpenStudentDetail={student => {
                    if (isViewer) {
                        viewerDrawer.open(student.id);
                    } else {
                        setGlobalStudentDetail(student);
                    }
                }}
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
                isViewer={isViewer}
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
                        toast.success('Enrollment created');
                    }}
                    preselectedStudentId={globalEnrollStudentId}
                    onClose={() => {
                        setGlobalEnrollModalOpen(false);
                        setGlobalEnrollStudentId(undefined);
                    }}
                />
            )}

            {/* Viewer Student Detail Drawer (URL driven: ?student=<id>) */}
            {isViewer && viewerDrawer.currentId && (() => {
                const idx = viewerListIds.indexOf(viewerDrawer.currentId);
                const prevId = idx > 0 ? viewerListIds[idx - 1] : undefined;
                const nextId = idx >= 0 && idx < viewerListIds.length - 1 ? viewerListIds[idx + 1] : undefined;
                return (
                    <Suspense fallback={null}>
                        <StudentDetailDrawer
                            studentId={viewerDrawer.currentId}
                            onClose={viewerDrawer.close}
                            onPrev={prevId ? () => viewerDrawer.open(prevId) : undefined}
                            onNext={nextId ? () => viewerDrawer.open(nextId) : undefined}
                            position={idx >= 0 ? { index: idx, total: viewerListIds.length } : undefined}
                            onOpenCourse={(courseId: string) => navigateFn(`/courses/${courseId}`)}
                        />
                    </Suspense>
                );
            })()}

            {/* Global Student Detail Modal */}
            {!isViewer && globalStudentDetail && (
                <StudentDetail
                    student={globalStudentDetail}
                    onClose={() => setGlobalStudentDetail(null)}
                    onNavigate={navigate}
                    onStudentUpdated={setGlobalStudentDetail}
                    onEnroll={() => {
                        setGlobalEnrollStudentId(globalStudentDetail.id);
                        setGlobalEnrollModalOpen(true);
                    }}
                />
            )}
        </TooltipProvider>
        </NetworkStatusProvider>
    );
}

export default App;

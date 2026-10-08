import { useState, useEffect, useLayoutEffect, useCallback, useRef, Suspense, useTransition, Activity, ViewTransition, type ReactNode } from 'react';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Users, BookOpen, GraduationCap, FileText, FileInput, LogOut, Menu, X, Sun, Moon, Settings as SettingsIcon, Bell, Briefcase, PieChart, Clock, Rows3, Search, HelpCircle } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import { useConfirmationNotifier } from './hooks/useConfirmationNotifier';
import { useGlobalRealtimeSync } from './hooks/useGlobalRealtimeSync';
import { fullName, Student, StudentPayload } from './lib/types';
import { createStudent, fetchStudent } from './lib/students';
import MobileBottomNav from './components/MobileBottomNav';
import MobileFloatingActions from './components/MobileFloatingActions';
import { canManagePdfForms, getUserRole } from './lib/roles';

import { TooltipProvider } from './components/ui/Tooltip';
import { AppFallback } from './components/ui/PageFallbacks';
import ErrorBoundary from './components/ErrorBoundary';
import { IconButton } from './components/ui/Button';
import NetworkStatusIndicator from './components/ui/NetworkStatusIndicator';
import { NetworkStatusProvider } from './contexts/NetworkStatusContext';
import { GlobalToaster } from './components/Toast';
import { toast } from './lib/toast';
import { useModalBehavior } from './hooks/useModalBehavior';
import { useDialogMount, useLastPresent, usePresence } from './hooks/usePresence';
import { useTheme } from './hooks/useTheme';
import { useDensity } from './hooks/useDensity';
import { useTabPrefetch } from './hooks/useTabPrefetch';
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys';
import { useNotificationBanner } from './hooks/useNotificationBanner';
import type { NavigateFn, NavState } from './lib/navigation';

// Lazy load heavy route components with retry logic to prevent "Failed to fetch dynamically imported module" errors
const Dashboard = lazyWithRetry(() => import('./components/Dashboard'));
const StudentList = lazyWithRetry(() => import('./components/StudentList'));
const CourseList = lazyWithRetry(() => import('./components/CourseList'));
const EnrollmentBoard = lazyWithRetry(() => import('./components/EnrollmentBoard'));
const DocumentGenerator = lazyWithRetry(() => import('./components/DocumentGenerator'));
const OutcomesList = lazyWithRetry(() => import('./components/OutcomesList'));
const Settings = lazyWithRetry(() => import('./components/Settings'));
const Analytics = lazyWithRetry(() => import('./components/Analytics'));
const ViewerStudentsDirectory = lazyWithRetry(() => import('./components/ViewerStudentsDirectory'));
const ViewerCourses = lazyWithRetry(() => import('./components/ViewerCourses'));
const ViewerHome = lazyWithRetry(() => import('./components/ViewerHome'));
const OutreachLists = lazyWithRetry(() => import('./components/OutreachLists'));
const PdfForms = lazyWithRetry(() => import('./components/PdfForms'));
const StudentDetailDrawer = lazyWithRetry(() => import('./components/StudentDetailDrawer'));
const PendingApprovalsModal = lazyWithRetry(() => import('./components/PendingApprovalsModal'));
// Dialogs opened on demand, and the External Lists / PDF Forms shell: not part of the first load
// (useTabPrefetch warms them while the browser is idle)
const CommandPalette = lazyWithRetry(() => import('./components/CommandPalette'));
const KeyboardShortcutsModal = lazyWithRetry(() => import('./components/KeyboardShortcutsModal'));
const StudentModal = lazyWithRetry(() => import('./components/StudentModal'));
const StudentDetail = lazyWithRetry(() => import('./components/StudentDetail'));
const EnrollmentModal = lazyWithRetry(() => import('./components/EnrollmentModal'));
const OutreachShell = lazyWithRetry(() => import('./components/OutreachShell'));
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
    // Last in the list so the 1–8 shortcuts above keep their keys; shown under Insights
    { key: 'pdf-forms', label: 'PDF Forms', icon: FileInput, subtitle: 'Fill PDF forms from a spreadsheet', group: 'Insights' },
];
const NAV_GROUPS = ['Workspace', 'Insights', 'System'] as const;

/**
 * Admin pages kept alive once visited (React <Activity>): coming back shows them at once, with
 * their filters, search, drafts and scroll position. Pages that take their start from the
 * navigation (the board's course filter…) or the URL are mounted fresh each time instead.
 */
const KEPT_PAGES = new Set(['dashboard', 'students', 'analytics', 'documents', 'settings']);

const PAGE_SPINNER = (
    <div className="w-full flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
    </div>
);

/**
 * One page of the shell. A tab switch runs as a view transition: the old page fades out and the
 * new one fades in, rising a little (index.css, .page-exit / .page-enter). A page that crashes
 * shows its error here; the sidebar and other tabs keep working.
 */
function PageView({ children }: { children: ReactNode }) {
    return (
        <ViewTransition default="none" enter="page-enter" exit="page-exit">
            <div className="flex-1 w-full min-h-0 flex flex-col">
                <ErrorBoundary inline>
                    <Suspense fallback={PAGE_SPINNER}>{children}</Suspense>
                </ErrorBoundary>
            </div>
        </ViewTransition>
    );
}

function App() {
    const { user, loading, signOut } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Fire browser notifications for enrollment confirmations
    useConfirmationNotifier();
    useGlobalRealtimeSync();

    const location = useLocation();
    const navState = location.state as NavState | null;
    const navigateFn = useNavigate();
    const [, startTransition] = useTransition();
    const role = getUserRole(user);
    const isViewer = role === 'viewer';
    // External Lists (migration 65) and PDF Forms (migration 75) users get their own minimal shell below
    const isOutreach = role === 'outreach' || role === 'forms';
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
            ? (role === 'forms' ? 'PDF Forms' : 'External Lists')
            : isViewer
                ? (VIEWER_TABS.find(t => t.key === activeTab)?.label || 'Home')
                : (pageTitle || 'Dashboard');
        const prefix = !isViewer && pendingApprovalsCount > 0 ? `(${pendingApprovalsCount}) ` : '';
        document.title = `${prefix}${page} · CCP CRM`;
    }, [user, role, isViewer, isOutreach, activeTab, pageTitle, pendingApprovalsCount]);

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

    // Dialogs (lazy chunks) mount on their first opening and stay while they animate out;
    // the key gives each opening a fresh dialog
    const approvalsMount = useDialogMount(approvalsModalOpen);
    const paletteMount = useDialogMount(commandPaletteOpen);
    const shortcutsMount = useDialogMount(shortcutsModalOpen);
    const addStudentMount = useDialogMount(globalAddStudentOpen);
    const enrollMount = useDialogMount(globalEnrollModalOpen);
    const viewerDrawerMount = useDialogMount(!!viewerDrawer.currentId);
    const shownStudentDetail = useLastPresent(globalStudentDetail);
    const { mounted: overlayMounted, closing: overlayClosing, ref: overlayRef } = usePresence(sidebarOpen && !isViewer);

    // Kept pages: mounted on the first visit, then hidden and shown
    const keptPage = !isViewer && KEPT_PAGES.has(activeTab);
    const [visitedPages, setVisitedPages] = useState<string[]>([]);
    if (keptPage && !visitedPages.includes(activeTab)) setVisitedPages([...visitedPages, activeTab]);

    // Every page scrolls in the same column: a kept page comes back where it was left, any
    // other page starts at the top
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollPositions = useRef(new Map<string, number>());
    const scrolledTab = useRef(activeTab);
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el || scrolledTab.current === activeTab) return;
        scrolledTab.current = activeTab;
        el.scrollTop = keptPage ? scrollPositions.current.get(activeTab) ?? 0 : 0;
    }, [activeTab, keptPage]);
    const rememberScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        scrollPositions.current.set(scrolledTab.current, e.currentTarget.scrollTop);
    }, []);

    const { darkMode, toggleDarkMode } = useTheme();
    // Owned here; Settings gets it as props
    const { density, setDensity, toggleDensity } = useDensity();

    const queryClient = useQueryClient();
    const { handleTabMouseEnter, handleTabMouseLeave } = useTabPrefetch(!user || isOutreach ? null : isViewer ? 'viewer' : 'admin', activeTab);
    const notifBanner = useNotificationBanner(user?.id);

    const navigate: NavigateFn = useCallback((tab: string, state?: NavState) => {
        setSidebarOpen(false);
        startTransition(() => {
            navigateFn(`/${tab}`, state ? { state } : undefined);
        });
    }, [navigateFn]);


    const handleOpenStudentDetail = useCallback(async (studentId: string) => {
        try {
            setGlobalStudentDetail(await fetchStudent(studentId));
        } catch (e) {
            console.error('Failed to load student details', e);
            toast.error('Could not open student details');
        }
    }, []);

    useGlobalHotkeys(!!user && !isOutreach, {
        tabKeys: isViewer ? VIEWER_TABS.map(t => t.key) : NAV_ITEMS.map(n => n.key),
        canAddStudent: !isViewer,
        navigate,
        toggleCommandPalette: () => setCommandPaletteOpen(prev => !prev),
        toggleShortcuts: () => setShortcutsModalOpen(prev => !prev),
        openAddStudent: () => setGlobalAddStudentOpen(true),
        toggleDarkMode,
        toggleDensity,
    });

    const handleSaveNewStudent = async (formData: StudentPayload) => {
        await createStudent(formData);
        queryClient.invalidateQueries({ queryKey: ['students'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
        toast.success(`${fullName(formData)} added`);
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
                    <Suspense fallback={<AppFallback />}>
                        <OutreachShell role={role === 'forms' ? 'forms' : 'outreach'} darkMode={darkMode} toggleDarkMode={toggleDarkMode} userEmail={user.email} onSignOut={signOut} />
                    </Suspense>
                </TooltipProvider>
            </NetworkStatusProvider>
        );
    }

    // Routes of the pages mounted per visit, and the redirects ("/", unknown paths). Kept pages
    // render above (KEPT_PAGES), so their routes are empty here.
    const routes = (
        <Routes>
            {isViewer ? (
                <>
                    <Route path="/home" element={<ViewerHome onOpenSearch={() => setCommandPaletteOpen(true)} />} />
                    <Route path="/students" element={<ViewerStudentsDirectory />} />
                    <Route path="/courses" element={<ViewerCourses />} />
                    <Route path="/courses/:courseId" element={<ViewerCourses />} />
                    <Route path="/external-lists" element={<OutreachLists />} />
                    <Route path="/pdf-forms" element={<PdfForms canManage={canManagePdfForms(role)} />} />
                    <Route path="/lookup" element={<Navigate to="/students" replace />} />
                    <Route path="*" element={<Navigate to="/home" replace />} />
                </>
            ) : (
                <>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={null} />
                    <Route path="/students" element={null} />
                    <Route path="/courses" element={<CourseList />} />
                    <Route path="/enrollments" element={<EnrollmentBoard initialCourseFilter={navState?.courseId} initialCourseDate={navState?.courseDate} initialInviteFilter={navState?.inviteFilter} initialStatus={navState?.status} />} />
                    <Route path="/outcomes" element={<OutcomesList />} />
                    <Route path="/documents" element={null} />
                    <Route path="/analytics" element={null} />
                    <Route path="/pdf-forms" element={<PdfForms canManage={canManagePdfForms(role)} admin={role === 'admin'} />} />
                    <Route path="/settings" element={null} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </>
            )}
        </Routes>
    );

    return (
        <NetworkStatusProvider>
        <TooltipProvider delayDuration={100}>
            <div className="h-screen w-full bg-background text-primary flex relative overflow-hidden">
                {/* Subtle radial glow in Dark Mode */}
                {darkMode && (
                    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                        <div className="orb absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[1100px] max-w-[160vw] max-h-[160vw] text-brand-500/5" />
                    </div>
                )}

                {/* Mobile overlay */}
                {overlayMounted && (
                    <div
                        ref={overlayRef}
                        className={`fixed inset-0 bg-black/40 dark:bg-black/60 z-35 lg:hidden ${overlayClosing ? 'animate-fadeOut pointer-events-none' : 'animate-fadeIn'}`}
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
                    <div className="h-14 px-4 flex items-center justify-between shrink-0 border-b border-border-subtle">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 bg-linear-to-br from-brand-500 via-brand-600 to-violet-500 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs shadow-brand-500/25 ring-1 ring-inset ring-white/15 shrink-0">
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
                                                <Icon size={17} className="shrink-0" />
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
                    <div className="p-3 border-t border-border-subtle shrink-0 space-y-2">
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
                            <div className="w-8 h-8 bg-linear-to-br from-brand-500 to-violet-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
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
                <div ref={scrollRef} onScroll={rememberScroll} className={`flex-1 flex flex-col h-screen relative min-w-0 ${
                    activeTab === 'enrollments' ? 'overflow-hidden' : 'overflow-y-auto'
                }`}>
                    {/* Notification Permission Banner */}
                    {notifBanner.visible && (
                        <div className="bg-brand-500/[0.07] border-b border-brand-500/20 px-4 lg:px-8 py-2 flex items-center justify-between gap-3 animate-fadeIn">
                            <div className="flex items-center gap-2 text-sm">
                                <Bell size={16} className="text-brand-500 shrink-0" />
                                <span className="text-primary">Enable notifications to be alerted when students confirm courses</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={notifBanner.enable}
                                    className="h-7 px-3 text-xs font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                                >
                                    Enable
                                </button>
                                <button
                                    onClick={notifBanner.dismiss}
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
                                <div className="w-7 h-7 bg-linear-to-br from-brand-500 via-brand-600 to-violet-500 rounded-lg flex items-center justify-center text-white font-bold text-[11px] shadow-xs shadow-brand-500/20 shrink-0">
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

                            <div className="flex items-center gap-1.5 shrink-0">
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
                        {!isViewer && visitedPages.map(tab => (
                            <Activity key={tab} mode={tab === activeTab ? 'visible' : 'hidden'}>
                                <PageView>
                                    {tab === 'dashboard' && (
                                        <Dashboard
                                            onNavigate={navigate}
                                            onOpenStudentDetail={handleOpenStudentDetail}
                                            pendingApprovalsCount={pendingApprovalsCount}
                                            onOpenApprovals={() => setApprovalsModalOpen(true)}
                                            onAddStudent={() => setGlobalAddStudentOpen(true)}
                                            onAddEnrollment={() => setGlobalEnrollModalOpen(true)}
                                        />
                                    )}
                                    {tab === 'students' && <StudentList onNavigate={navigate} />}
                                    {tab === 'analytics' && <Analytics />}
                                    {tab === 'documents' && <DocumentGenerator />}
                                    {tab === 'settings' && <Settings density={density} onDensityChange={setDensity} />}
                                </PageView>
                            </Activity>
                        ))}
                        {keptPage ? routes : <PageView key={activeTab}>{routes}</PageView>}
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
            {approvalsMount.mounted && (
                <Suspense fallback={null}>
                    <PendingApprovalsModal
                        key={approvalsMount.key}
                        open={approvalsModalOpen}
                        onClose={() => setApprovalsModalOpen(false)}
                    />
                </Suspense>
            )}

            <GlobalToaster />

            {/* Global Command Palette */}
            {paletteMount.mounted && (
                <Suspense fallback={null}>
                    <CommandPalette
                        key={paletteMount.key}
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
                </Suspense>
            )}

            {/* Global Keyboard Shortcuts Modal */}
            {shortcutsMount.mounted && (
                <Suspense fallback={null}>
                    <KeyboardShortcutsModal
                        key={shortcutsMount.key}
                        open={shortcutsModalOpen}
                        onClose={() => setShortcutsModalOpen(false)}
                        isViewer={isViewer}
                    />
                </Suspense>
            )}

            {/* Global Add Student Modal */}
            {addStudentMount.mounted && (
                <Suspense fallback={null}>
                    <StudentModal
                        key={addStudentMount.key}
                        open={globalAddStudentOpen}
                        student={null}
                        onSave={handleSaveNewStudent}
                        onClose={() => setGlobalAddStudentOpen(false)}
                    />
                </Suspense>
            )}

            {/* Global New Enrollment Modal */}
            {enrollMount.mounted && (
                <Suspense fallback={null}>
                    <EnrollmentModal
                        key={enrollMount.key}
                        open={globalEnrollModalOpen}
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
                </Suspense>
            )}

            {/* Viewer Student Detail Drawer (URL driven: ?student=<id>) */}
            {isViewer && viewerDrawerMount.mounted && (() => {
                const idx = viewerDrawer.currentId ? viewerListIds.indexOf(viewerDrawer.currentId) : -1;
                const prevId = idx > 0 ? viewerListIds[idx - 1] : undefined;
                const nextId = idx >= 0 && idx < viewerListIds.length - 1 ? viewerListIds[idx + 1] : undefined;
                return (
                    <Suspense fallback={null}>
                        <StudentDetailDrawer
                            key={viewerDrawerMount.key}
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
            {!isViewer && shownStudentDetail && (
                <Suspense fallback={null}>
                    <StudentDetail
                        open={!!globalStudentDetail}
                        student={shownStudentDetail}
                        onClose={() => setGlobalStudentDetail(null)}
                        onNavigate={navigate}
                        onStudentUpdated={setGlobalStudentDetail}
                        onEnroll={() => {
                            setGlobalEnrollStudentId(shownStudentDetail.id);
                            setGlobalEnrollModalOpen(true);
                        }}
                    />
                </Suspense>
            )}
        </TooltipProvider>
        </NetworkStatusProvider>
    );
}

export default App;

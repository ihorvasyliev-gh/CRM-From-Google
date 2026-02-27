import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, BookOpen, GraduationCap, FileText, LogOut, Loader2, Menu, X, Sparkles, Sun, Moon } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import StudentList from './components/StudentList';
import CourseList from './components/CourseList';
import EnrollmentBoard from './components/EnrollmentBoard';
import LoginPage from './components/LoginPage';
import DocumentGenerator from './components/DocumentGenerator';

const NAV_ITEMS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Overview & metrics' },
    { key: 'students', label: 'Students', icon: Users, desc: 'Manage students' },
    { key: 'courses', label: 'Courses', icon: BookOpen, desc: 'Course catalog' },
    { key: 'enrollments', label: 'Enrollments', icon: GraduationCap, desc: 'Registration board' },
    { key: 'documents', label: 'Documents', icon: FileText, desc: 'Generate forms' },
];

const PAGE_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    students: 'Students',
    courses: 'Courses',
    enrollments: 'Enrollments',
    documents: 'Documents',
};

function App() {
    const { user, loading, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [enrollmentFilter, setEnrollmentFilter] = useState<{ courseId?: string }>({});

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
        setActiveTab(tab);
        setSidebarOpen(false);
        // Clear enrollment filter when navigating away via sidebar
        if (tab !== 'enrollments') setEnrollmentFilter({});
    }

    // Called from child components (e.g., StudentDetail) to navigate with filters
    function handleNavigate(tab: string, filter?: { courseId?: string }) {
        setActiveTab(tab);
        setSidebarOpen(false);
        if (tab === 'enrollments' && filter?.courseId) {
            setEnrollmentFilter({ courseId: filter.courseId });
        } else {
            setEnrollmentFilter({});
        }
    }

    return (
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
                fixed lg:sticky top-0 left-0 h-screen w-[260px] z-40
                flex flex-col transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
                bg-surface border-r border-border-subtle shadow-[2px_0_24px_-10px_rgba(0,0,0,0.1)]
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Logo */}
                <div className="h-16 px-5 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-brand-500 via-brand-600 to-accent-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-500/25 animate-glow">
                            C
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-primary tracking-tight">
                                Course CRM
                            </h1>
                            <p className="text-[10px] text-muted font-medium -mt-0.5 tracking-wide">MANAGEMENT SYSTEM</p>
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
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    <p className="px-3 text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Navigation</p>
                    {NAV_ITEMS.map(item => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.key;
                        return (
                            <button
                                key={item.key}
                                onClick={() => navigate(item.key)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative
                                    ${isActive
                                        ? 'bg-brand-500/10 text-brand-500 dark:text-brand-400'
                                        : 'text-muted hover:text-primary hover:bg-surface-elevated'
                                    }
                                `}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-brand-500 rounded-full" />
                                )}
                                <div className={`p-1.5 rounded-lg transition-all ${isActive
                                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                                    : 'bg-surface-elevated text-muted group-hover:bg-background group-hover:text-primary border border-transparent group-hover:border-border-subtle transform group-hover:scale-105'
                                    }`}>
                                    <Icon size={16} />
                                </div>
                                <div className="text-left">
                                    <span className="block leading-tight">{item.label}</span>
                                </div>
                            </button>
                        );
                    })}
                </nav>

                {/* User / Settings / Sign Out */}
                <div className="p-3 border-t border-border-subtle flex-shrink-0 space-y-2">
                    {/* Theme Toggle */}
                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-primary hover:bg-surface-elevated transition-all group"
                    >
                        <div className="p-1.5 rounded-lg bg-surface-elevated text-muted group-hover:bg-background group-hover:text-primary border border-transparent group-hover:border-border-subtle transition-all transform group-hover:scale-105">
                            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                        </div>
                        <span className="flex-1 text-left">Theme</span>
                        <span className="text-xs text-muted">{darkMode ? 'Dark' : 'Light'}</span>
                    </button>

                    <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-elevated rounded-xl border border-border-subtle/50">
                        <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-background shadow-sm">
                            {(user.email?.[0] || 'A').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-primary truncate">{user.email}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[10px] text-muted font-medium uppercase tracking-wider">Admin</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={signOut}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-muted hover:text-red-500 hover:bg-red-500/10 transition-all"
                    >
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-screen overflow-y-auto relative z-10 min-w-0">
                {/* Mobile Header (Glassmorphism) */}
                <header className="lg:hidden h-14 bg-background/70 backdrop-blur-xl border-b border-border-subtle px-4 flex items-center justify-between sticky top-0 z-30 transition-colors">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="text-muted hover:text-primary transition p-1.5 rounded-lg hover:bg-surface-elevated"
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
                <header className="hidden lg:block sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border-subtle/60 px-8 py-5 transition-colors">
                    <div className="max-w-7xl mx-auto flex items-end justify-between">
                        <div className="animate-fadeIn">
                            <h2 className="text-2xl font-bold text-primary tracking-tight">
                                {PAGE_TITLES[activeTab]}
                            </h2>
                            <p className="text-sm text-muted mt-1 font-medium">
                                {activeTab === 'dashboard' && 'Welcome back — here\'s your overview'}
                                {activeTab === 'students' && 'Manage your student database'}
                                {activeTab === 'courses' && 'View and manage course catalog'}
                                {activeTab === 'enrollments' && 'Track and manage enrollments'}
                                {activeTab === 'documents' && 'Generate personalized documents'}
                            </p>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="animate-fadeIn mt-2 lg:mt-0">
                        {activeTab === 'dashboard' && <Dashboard onNavigate={navigate} />}
                        {activeTab === 'students' && <StudentList onNavigate={handleNavigate} />}
                        {activeTab === 'courses' && <CourseList />}
                        {activeTab === 'enrollments' && <EnrollmentBoard initialCourseFilter={enrollmentFilter.courseId} />}
                        {activeTab === 'documents' && <DocumentGenerator />}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;

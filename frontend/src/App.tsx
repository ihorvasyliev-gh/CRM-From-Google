import { useState } from 'react';
import { LayoutDashboard, Users, BookOpen, GraduationCap, LogOut, Loader2, Menu, X, Sparkles } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import StudentList from './components/StudentList';
import CourseList from './components/CourseList';
import EnrollmentBoard from './components/EnrollmentBoard';
import LoginPage from './components/LoginPage';

const NAV_ITEMS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Overview & metrics' },
    { key: 'students', label: 'Students', icon: Users, desc: 'Manage students' },
    { key: 'courses', label: 'Courses', icon: BookOpen, desc: 'Course catalog' },
    { key: 'enrollments', label: 'Enrollments', icon: GraduationCap, desc: 'Registration board' },
];

const PAGE_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    students: 'Students',
    courses: 'Courses',
    enrollments: 'Enrollments',
};

function App() {
    const { user, loading, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    if (loading) {
        return (
            <div className="min-h-screen bg-surface-50 flex items-center justify-center">
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
    }

    return (
        <div className="min-h-screen bg-surface-50 font-sans text-surface-900 flex">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-surface-950/40 backdrop-blur-sm z-30 lg:hidden animate-fadeIn"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed lg:sticky top-0 left-0 h-screen w-[260px] z-40
                flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
                bg-white border-r border-surface-200/80
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Logo */}
                <div className="h-16 px-5 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-brand-500 via-brand-600 to-accent-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-500/25 animate-glow">
                            C
                        </div>
                        <div>
                            <h1 className="text-base font-bold gradient-text">
                                Course CRM
                            </h1>
                            <p className="text-[10px] text-surface-400 font-medium -mt-0.5">Management System</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden text-surface-400 hover:text-surface-600 p-1 rounded-lg hover:bg-surface-100"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    <p className="px-3 text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2">Navigation</p>
                    {NAV_ITEMS.map(item => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.key;
                        return (
                            <button
                                key={item.key}
                                onClick={() => navigate(item.key)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative
                                    ${isActive
                                        ? 'bg-gradient-to-r from-brand-50 to-brand-100/50 text-brand-700'
                                        : 'text-surface-500 hover:text-surface-800 hover:bg-surface-50'
                                    }
                                `}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-gradient-to-b from-brand-500 to-brand-600 rounded-full" />
                                )}
                                <div className={`p-1.5 rounded-lg transition-all ${isActive
                                    ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/25'
                                    : 'bg-surface-100 text-surface-500 group-hover:bg-surface-200 group-hover:text-surface-700'
                                    }`}>
                                    <Icon size={16} />
                                </div>
                                <div className="text-left">
                                    <span className="block leading-tight">{item.label}</span>
                                    <span className={`text-[10px] font-normal leading-tight ${isActive ? 'text-brand-500' : 'text-surface-400'}`}>
                                        {item.desc}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </nav>

                {/* User / Sign Out */}
                <div className="p-3 border-t border-surface-100 flex-shrink-0">
                    <div className="flex items-center gap-3 px-3 py-2.5 mb-2 bg-surface-50 rounded-xl">
                        <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white shadow-sm">
                            {(user.email?.[0] || 'A').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-surface-700 truncate">{user.email}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[10px] text-surface-400 font-medium">Admin</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={signOut}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-surface-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Mobile Header */}
                <header className="lg:hidden h-14 bg-white/80 backdrop-blur-lg border-b border-surface-200/60 px-4 flex items-center justify-between sticky top-0 z-20">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="text-surface-500 hover:text-surface-800 transition p-1.5 rounded-lg hover:bg-surface-100"
                    >
                        <Menu size={20} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm">
                            C
                        </div>
                        <span className="font-bold text-sm gradient-text">Course CRM</span>
                    </div>
                    <div className="w-8" />
                </header>

                {/* Page Content */}
                <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    {/* Page Header */}
                    <div className="mb-6 animate-fadeIn">
                        <h2 className="text-2xl font-bold text-surface-900">
                            {PAGE_TITLES[activeTab]}
                        </h2>
                        <p className="text-sm text-surface-400 mt-0.5">
                            {activeTab === 'dashboard' && 'Welcome back — here\'s your overview'}
                            {activeTab === 'students' && 'Manage your student database'}
                            {activeTab === 'courses' && 'View and manage course catalog'}
                            {activeTab === 'enrollments' && 'Track and manage enrollments'}
                        </p>
                    </div>

                    <div className="animate-fadeIn">
                        {activeTab === 'dashboard' && <Dashboard onNavigate={navigate} />}
                        {activeTab === 'students' && <StudentList />}
                        {activeTab === 'courses' && <CourseList />}
                        {activeTab === 'enrollments' && <EnrollmentBoard />}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;

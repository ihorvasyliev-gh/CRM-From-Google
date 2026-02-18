import { useState } from 'react';
import { LayoutDashboard, Users, BookOpen, GraduationCap, LogOut, Loader2, Menu, X } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import StudentList from './components/StudentList';
import CourseList from './components/CourseList';
import EnrollmentBoard from './components/EnrollmentBoard';
import LoginPage from './components/LoginPage';

const NAV_ITEMS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'students', label: 'Students', icon: Users },
    { key: 'courses', label: 'Courses', icon: BookOpen },
    { key: 'enrollments', label: 'Enrollments', icon: GraduationCap },
];

function App() {
    const { user, loading, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-blue-600" />
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
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-30 lg:hidden animate-fadeIn"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-slate-200 z-40
                flex flex-col transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Logo */}
                <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-600/20">
                            C
                        </div>
                        <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                            Course CRM
                        </h1>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden text-slate-400 hover:text-slate-600"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {NAV_ITEMS.map(item => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.key;
                        return (
                            <button
                                key={item.key}
                                onClick={() => navigate(item.key)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                                    ${isActive
                                        ? 'bg-blue-50 text-blue-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                    }
                                `}
                            >
                                <Icon size={18} className={isActive ? 'text-blue-600' : ''} />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>

                {/* User / Sign Out */}
                <div className="p-3 border-t border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-3 px-3 py-2 mb-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-slate-600 to-slate-800 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {(user.email?.[0] || 'A').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">{user.email}</p>
                            <p className="text-[10px] text-slate-400">Admin</p>
                        </div>
                    </div>
                    <button
                        onClick={signOut}
                        className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                        <LogOut size={18} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Mobile Header */}
                <header className="lg:hidden h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between sticky top-0 z-20">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="text-slate-500 hover:text-slate-800 transition"
                    >
                        <Menu size={22} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                            C
                        </div>
                        <span className="font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                            Course CRM
                        </span>
                    </div>
                    <div className="w-8" /> {/* spacer */}
                </header>

                {/* Page Content */}
                <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
                    {activeTab === 'dashboard' && <Dashboard onNavigate={navigate} />}
                    {activeTab === 'students' && <StudentList />}
                    {activeTab === 'courses' && <CourseList />}
                    {activeTab === 'enrollments' && <EnrollmentBoard />}
                </main>
            </div>
        </div>
    );
}

export default App;

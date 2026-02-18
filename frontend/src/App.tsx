import { useState } from 'react';
import { LayoutDashboard, Users, BookOpen, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import StudentList from './components/StudentList';
import EnrollmentBoard from './components/EnrollmentBoard';
import LoginPage from './components/LoginPage';

function App() {
    const { user, loading, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');

    // Show loading spinner while checking auth state
    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-blue-600" />
            </div>
        );
    }

    // Show login page if not authenticated
    if (!user) {
        return <LoginPage />;
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            {/* Sidebar / Navigation */}
            <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">C</div>
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">Course CRM</h1>
                </div>
                <div className="flex gap-6 items-center">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <LayoutDashboard size={18} /> Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab('students')}
                        className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'students' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <Users size={18} /> Students
                    </button>
                    <button
                        onClick={() => setActiveTab('enrollments')}
                        className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'enrollments' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <BookOpen size={18} /> Enrollments
                    </button>
                    <div className="w-px h-6 bg-slate-200" />
                    <button
                        onClick={signOut}
                        className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-red-500 transition-colors"
                        title="Sign Out"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {activeTab === 'dashboard' && <Dashboard />}
                {activeTab === 'students' && <StudentList />}
                {activeTab === 'enrollments' && <EnrollmentBoard />}
            </main>
        </div>
    );
}

export default App;

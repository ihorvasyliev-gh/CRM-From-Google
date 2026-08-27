import { useState } from 'react';
import { 
    LayoutDashboard, 
    GraduationCap, 
    Users, 
    BookOpen, 
    MoreHorizontal, 
    FileText, 
    Briefcase, 
    PieChart, 
    Settings as SettingsIcon, 
    Sun, 
    Moon, 
    Rows3, 
    HelpCircle, 
    Clock, 
    LogOut, 
    X,
    Search
} from 'lucide-react';

interface MobileBottomNavProps {
    activeTab: string;
    onNavigate: (tab: string) => void;
    isViewer: boolean;
    pendingApprovalsCount?: number;
    darkMode: boolean;
    toggleDarkMode: () => void;
    density: 'comfortable' | 'compact';
    toggleDensity: () => void;
    onOpenCommandPalette: () => void;
    onOpenShortcuts: () => void;
    onOpenApprovals?: () => void;
    onSignOut: () => void;
    userEmail?: string;
}

export default function MobileBottomNav({
    activeTab,
    onNavigate,
    isViewer,
    pendingApprovalsCount = 0,
    darkMode,
    toggleDarkMode,
    density,
    toggleDensity,
    onOpenCommandPalette,
    onOpenShortcuts,
    onOpenApprovals,
    onSignOut,
    userEmail
}: MobileBottomNavProps) {
    const [moreOpen, setMoreOpen] = useState(false);

    if (isViewer) {
        return (
            <>
                <nav 
                    aria-label="Mobile Navigation"
                    className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-border-subtle/80 px-3 py-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
                >
                    <div className="flex items-center justify-around max-w-md mx-auto">
                        <button
                            onClick={() => onNavigate('lookup')}
                            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 min-w-[64px] ${
                                activeTab === 'lookup'
                                    ? 'text-brand-600 dark:text-brand-400 font-bold'
                                    : 'text-muted hover:text-primary'
                            }`}
                        >
                            <div className={`p-1 rounded-lg transition-transform ${activeTab === 'lookup' ? 'bg-brand-500/10 scale-110' : ''}`}>
                                <Users size={19} />
                            </div>
                            <span className="text-[10px] tracking-tight mt-0.5">Lookup</span>
                        </button>

                        <button
                            onClick={() => onNavigate('courses')}
                            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 min-w-[64px] ${
                                activeTab === 'courses'
                                    ? 'text-brand-600 dark:text-brand-400 font-bold'
                                    : 'text-muted hover:text-primary'
                            }`}
                        >
                            <div className={`p-1 rounded-lg transition-transform ${activeTab === 'courses' ? 'bg-brand-500/10 scale-110' : ''}`}>
                                <BookOpen size={19} />
                            </div>
                            <span className="text-[10px] tracking-tight mt-0.5">Courses</span>
                        </button>

                        <button
                            onClick={onOpenCommandPalette}
                            className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-muted hover:text-primary transition-all duration-200 min-w-[64px]"
                        >
                            <div className="p-1">
                                <Search size={19} />
                            </div>
                            <span className="text-[10px] tracking-tight mt-0.5">Search</span>
                        </button>

                        <button
                            onClick={() => setMoreOpen(true)}
                            className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-muted hover:text-primary transition-all duration-200 min-w-[64px]"
                        >
                            <div className="p-1">
                                <MoreHorizontal size={19} />
                            </div>
                            <span className="text-[10px] tracking-tight mt-0.5">More</span>
                        </button>
                    </div>
                </nav>

                {/* More Drawer for Viewer */}
                {moreOpen && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs animate-fadeIn lg:hidden" onClick={() => setMoreOpen(false)}>
                        <div 
                            className="w-full max-w-lg bg-surface-elevated border-t border-border-subtle rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] shadow-2xl animate-slideUp"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="w-10 h-1 bg-border-strong rounded-full mx-auto mb-4" />
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-subtle">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Viewer Portal</p>
                                    <p className="text-sm font-semibold text-primary truncate">{userEmail}</p>
                                </div>
                                <button onClick={() => setMoreOpen(false)} className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-surface transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <button
                                    onClick={toggleDarkMode}
                                    className="flex items-center gap-2 p-3 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-xs font-medium text-primary transition-all"
                                >
                                    {darkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-400" />}
                                    <span>Theme: {darkMode ? 'Dark' : 'Light'}</span>
                                </button>
                                <button
                                    onClick={toggleDensity}
                                    className="flex items-center gap-2 p-3 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-xs font-medium text-primary transition-all capitalize"
                                >
                                    <Rows3 size={16} className="text-brand-500" />
                                    <span>{density} View</span>
                                </button>
                            </div>

                            <button
                                onClick={onSignOut}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl text-xs transition-all"
                            >
                                <LogOut size={16} />
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </div>
                )}
            </>
        );
    }

    const isMainTab = ['dashboard', 'enrollments', 'students', 'courses'].includes(activeTab);

    return (
        <>
            <nav 
                aria-label="Mobile Navigation"
                className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-border-subtle/80 px-2 py-1 pb-[max(env(safe-area-inset-bottom),0.375rem)] shadow-[0_-4px_24px_rgba(0,0,0,0.1)] transition-colors"
            >
                <div className="flex items-center justify-around max-w-lg mx-auto">
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-200 min-w-[56px] ${
                            activeTab === 'dashboard'
                                ? 'text-brand-600 dark:text-brand-400 font-bold'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        <div className={`p-1 rounded-lg transition-transform ${activeTab === 'dashboard' ? 'bg-brand-500/10 scale-110' : ''}`}>
                            <LayoutDashboard size={18} />
                        </div>
                        <span className="text-[10px] tracking-tight mt-0.5">Overview</span>
                    </button>

                    <button
                        onClick={() => onNavigate('enrollments')}
                        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-200 min-w-[56px] relative ${
                            activeTab === 'enrollments'
                                ? 'text-brand-600 dark:text-brand-400 font-bold'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        <div className={`p-1 rounded-lg transition-transform ${activeTab === 'enrollments' ? 'bg-brand-500/10 scale-110' : ''}`}>
                            <GraduationCap size={18} />
                        </div>
                        <span className="text-[10px] tracking-tight mt-0.5">Board</span>
                    </button>

                    <button
                        onClick={() => onNavigate('students')}
                        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-200 min-w-[56px] ${
                            activeTab === 'students'
                                ? 'text-brand-600 dark:text-brand-400 font-bold'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        <div className={`p-1 rounded-lg transition-transform ${activeTab === 'students' ? 'bg-brand-500/10 scale-110' : ''}`}>
                            <Users size={18} />
                        </div>
                        <span className="text-[10px] tracking-tight mt-0.5">Students</span>
                    </button>

                    <button
                        onClick={() => onNavigate('courses')}
                        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-200 min-w-[56px] ${
                            activeTab === 'courses'
                                ? 'text-brand-600 dark:text-brand-400 font-bold'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        <div className={`p-1 rounded-lg transition-transform ${activeTab === 'courses' ? 'bg-brand-500/10 scale-110' : ''}`}>
                            <BookOpen size={18} />
                        </div>
                        <span className="text-[10px] tracking-tight mt-0.5">Courses</span>
                    </button>

                    <button
                        onClick={() => setMoreOpen(true)}
                        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-200 min-w-[56px] relative ${
                            !isMainTab
                                ? 'text-brand-600 dark:text-brand-400 font-bold'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        <div className={`p-1 rounded-lg transition-transform relative ${!isMainTab ? 'bg-brand-500/10 scale-110' : ''}`}>
                            <MoreHorizontal size={18} />
                            {pendingApprovalsCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-surface animate-pulse" />
                            )}
                        </div>
                        <span className="text-[10px] tracking-tight mt-0.5">More</span>
                    </button>
                </div>
            </nav>

            {/* More Drawer Sheet */}
            {moreOpen && (
                <div 
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs animate-fadeIn lg:hidden"
                    onClick={() => setMoreOpen(false)}
                >
                    <div 
                        className="w-full max-w-lg bg-surface-elevated border-t border-border-subtle rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] shadow-2xl animate-slideUp max-h-[85vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Pull handle */}
                        <div className="w-10 h-1 bg-border-strong rounded-full mx-auto mb-3" />

                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-subtle">
                            <div>
                                <h3 className="font-bold text-sm text-primary">All Sections & Tools</h3>
                                <p className="text-[11px] text-muted">{userEmail}</p>
                            </div>
                            <button 
                                onClick={() => setMoreOpen(false)} 
                                className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-surface transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Pending Approvals Notice if any */}
                        {pendingApprovalsCount > 0 && (
                            <button
                                onClick={() => {
                                    setMoreOpen(false);
                                    onOpenApprovals?.();
                                }}
                                className="w-full mb-3 flex items-center justify-between p-3 bg-amber-500/15 border border-amber-500/30 rounded-2xl text-amber-700 dark:text-amber-300 transition-all active:scale-[0.99] shadow-xs"
                            >
                                <div className="flex items-center gap-2.5">
                                    <Clock size={16} className="text-amber-600 dark:text-amber-400 animate-spin-slow" />
                                    <span className="text-xs font-bold">
                                        {pendingApprovalsCount} Course Completion{pendingApprovalsCount > 1 ? 's' : ''} Pending
                                    </span>
                                </div>
                                <span className="text-[11px] font-bold underline">Review</span>
                            </button>
                        )}

                        {/* Navigation Grid */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <button
                                onClick={() => { setMoreOpen(false); onNavigate('analytics'); }}
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                                    activeTab === 'analytics'
                                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                                        : 'bg-surface hover:bg-surface-elevated border-border-subtle text-primary'
                                }`}
                            >
                                <div className="p-1.5 rounded-lg bg-brand-500/10 text-brand-500">
                                    <PieChart size={15} />
                                </div>
                                <span>Analytics</span>
                            </button>

                            <button
                                onClick={() => { setMoreOpen(false); onNavigate('outcomes'); }}
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                                    activeTab === 'outcomes'
                                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                                        : 'bg-surface hover:bg-surface-elevated border-border-subtle text-primary'
                                }`}
                            >
                                <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-500">
                                    <Briefcase size={15} />
                                </div>
                                <span>Outcomes</span>
                            </button>

                            <button
                                onClick={() => { setMoreOpen(false); onNavigate('documents'); }}
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                                    activeTab === 'documents'
                                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                                        : 'bg-surface hover:bg-surface-elevated border-border-subtle text-primary'
                                }`}
                            >
                                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                                    <FileText size={15} />
                                </div>
                                <span>Documents</span>
                            </button>

                            <button
                                onClick={() => { setMoreOpen(false); onNavigate('settings'); }}
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                                    activeTab === 'settings'
                                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                                        : 'bg-surface hover:bg-surface-elevated border-border-subtle text-primary'
                                }`}
                            >
                                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500">
                                    <SettingsIcon size={15} />
                                </div>
                                <span>Settings</span>
                            </button>
                        </div>

                        {/* Quick Preferences & Utilities */}
                        <div className="grid grid-cols-3 gap-2 mb-4 pt-3 border-t border-border-subtle">
                            <button
                                onClick={toggleDarkMode}
                                className="flex flex-col items-center justify-center p-2.5 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-[11px] font-medium text-primary transition-all"
                            >
                                {darkMode ? <Sun size={16} className="text-amber-400 mb-1" /> : <Moon size={16} className="text-indigo-400 mb-1" />}
                                <span>{darkMode ? 'Dark' : 'Light'}</span>
                            </button>

                            <button
                                onClick={toggleDensity}
                                className="flex flex-col items-center justify-center p-2.5 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-[11px] font-medium text-primary transition-all capitalize"
                            >
                                <Rows3 size={16} className="text-brand-500 mb-1" />
                                <span>{density}</span>
                            </button>

                            <button
                                onClick={() => { setMoreOpen(false); onOpenShortcuts(); }}
                                className="flex flex-col items-center justify-center p-2.5 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-[11px] font-medium text-primary transition-all"
                            >
                                <HelpCircle size={16} className="text-blue-400 mb-1" />
                                <span>Shortcuts</span>
                            </button>
                        </div>

                        {/* Sign Out */}
                        <button
                            onClick={onSignOut}
                            className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl text-xs transition-all active:scale-[0.99]"
                        >
                            <LogOut size={16} />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

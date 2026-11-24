import { useState } from 'react';
import DialogLayer from './ui/DialogLayer';
import { 
    LayoutDashboard, 
    GraduationCap, 
    Users, 
    BookOpen, 
    MoreHorizontal, 
    FileInput, 
    Sun, 
    Moon, 
    Rows3, 
    LogOut, 
    X,
    Search,
    ListChecks,
    Home,
    CheckSquare
} from 'lucide-react';

interface MobileBottomNavProps {
    activeTab: string;
    onNavigate: (tab: string) => void;
    isViewer: boolean;
    darkMode: boolean;
    toggleDarkMode: () => void;
    density: 'comfortable' | 'compact';
    toggleDensity: () => void;
    onOpenCommandPalette: () => void;
    onSignOut: () => void;
    userEmail?: string;
    /** Admins: course completion requests waiting for approval (badge on the Dashboard tab) */
    pendingApprovalsCount?: number;
    /** Admins: open team to-do count (badge on the To-Do tab) */
    todoOpenCount?: number;
    /** Admins: overdue team to-do count (turns the To-Do badge red) */
    todoOverdueCount?: number;
}

export default function MobileBottomNav({
    activeTab,
    onNavigate,
    isViewer,
    darkMode,
    toggleDarkMode,
    density,
    toggleDensity,
    onOpenCommandPalette,
    onSignOut,
    userEmail,
    pendingApprovalsCount = 0,
    todoOpenCount = 0,
    todoOverdueCount = 0,
}: MobileBottomNavProps) {
    const [moreOpen, setMoreOpen] = useState(false);
    const closeMore = () => setMoreOpen(false);
    // The More tab lights up while one of the pages inside it is open
    const moreActive = activeTab === 'external-lists' || activeTab === 'pdf-forms';

    if (isViewer) {
        return (
            <>
                <nav 
                    aria-label="Mobile Navigation"
                    className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/97 border-t border-border-subtle/80 px-3 py-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
                >
                    <div className="flex items-center justify-around max-w-md mx-auto">
                        {([
                            { key: 'home', label: 'Home', icon: Home },
                            { key: 'students', label: 'Students', icon: Users },
                            { key: 'courses', label: 'Courses', icon: BookOpen },
                        ] as const).map(item => {
                            const Icon = item.icon;
                            const active = activeTab === item.key || (item.key === 'students' && activeTab === 'lookup');
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => onNavigate(item.key)}
                                    aria-current={active ? 'page' : undefined}
                                    className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-200 min-w-[60px] ${
                                        active ? 'text-brand-600 dark:text-brand-400 font-bold' : 'text-muted hover:text-primary'
                                    }`}
                                >
                                    <div className={`p-1 rounded-lg transition-transform ${active ? 'bg-brand-500/10 scale-110' : ''}`}>
                                        <Icon size={19} />
                                    </div>
                                    <span className="text-xs tracking-tight mt-0.5">{item.label}</span>
                                </button>
                            );
                        })}

                        <button
                            onClick={onOpenCommandPalette}
                            aria-label="Search"
                            className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-muted hover:text-primary transition-all duration-200 min-w-[60px]"
                        >
                            <div className="p-1">
                                <Search size={19} />
                            </div>
                            <span className="text-xs tracking-tight mt-0.5">Search</span>
                        </button>

                        <button
                            onClick={() => setMoreOpen(true)}
                            aria-label="More"
                            aria-haspopup="dialog"
                            aria-expanded={moreOpen}
                            aria-current={moreActive ? 'page' : undefined}
                            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all duration-200 min-w-[60px] ${
                                moreActive ? 'text-brand-600 dark:text-brand-400 font-bold' : 'text-muted hover:text-primary'
                            }`}
                        >
                            <div className={`p-1 rounded-lg transition-transform ${moreActive ? 'bg-brand-500/10 scale-110' : ''}`}>
                                <MoreHorizontal size={19} />
                            </div>
                            <span className="text-xs tracking-tight mt-0.5">More</span>
                        </button>
                    </div>
                </nav>

                {/* More Drawer for Viewer */}
                <DialogLayer
                    open={moreOpen}
                    onClose={closeMore}
                    label="More"
                    className="z-50 flex items-end justify-center lg:hidden"
                    backdropClassName="bg-black/50"
                    panelClassName="w-full max-w-lg bg-surface border-t border-border-subtle rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] shadow-float"
                    enter="animate-slideUp"
                    exit="animate-sheetSlideDown"
                >
                    <div className="w-10 h-1 bg-border-strong rounded-full mx-auto mb-4" />
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-subtle">
                        <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-wider text-muted">Viewer Portal</p>
                            <p className="text-sm font-semibold text-primary truncate">{userEmail}</p>
                        </div>
                        <button onClick={closeMore} aria-label="Close menu" className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-surface transition-colors">
                            <X size={18} />
                        </button>
                    </div>

                    <button
                        onClick={() => { setMoreOpen(false); onNavigate('external-lists'); }}
                        aria-current={activeTab === 'external-lists' ? 'page' : undefined}
                        className="w-full flex items-center gap-2 p-3 mb-2 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-xs font-semibold text-primary transition-all"
                    >
                        <ListChecks size={16} className="text-emerald-500" />
                        <span>External Lists</span>
                    </button>

                    <button
                        onClick={() => { setMoreOpen(false); onNavigate('pdf-forms'); }}
                        aria-current={activeTab === 'pdf-forms' ? 'page' : undefined}
                        className="w-full flex items-center gap-2 p-3 mb-2 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-xs font-semibold text-primary transition-all"
                    >
                        <FileInput size={16} className="text-violet-500" />
                        <span>PDF Forms</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <button
                            onClick={toggleDarkMode}
                            className="flex items-center gap-2 p-3 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-xs font-medium text-primary transition-all"
                        >
                            {darkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-brand-500" />}
                            <span>Theme: {darkMode ? 'Dark' : 'Light'}</span>
                        </button>
                        <button
                            onClick={toggleDensity}
                            className="flex items-center gap-2 p-3 bg-surface hover:bg-surface-elevated border border-border-subtle rounded-xl text-xs font-medium text-primary transition-all"
                        >
                            <Rows3 size={16} className="text-brand-500" />
                            <span>{density === 'compact' ? 'Compact view' : 'Comfortable view'}</span>
                        </button>
                    </div>

                    <button
                        onClick={onSignOut}
                        className="w-full flex items-center justify-center gap-2 p-3 bg-danger/10 hover:bg-danger/20 text-status-rejected font-bold rounded-xl text-xs transition-all"
                    >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                    </button>
                </DialogLayer>
            </>
        );
    }

    // Every other section and tool is in the burger menu (the sidebar drawer); the names match the sidebar's
    const todoBadgeCount = Math.max(todoOpenCount, todoOverdueCount);
    const todoAriaLabel =
        todoBadgeCount > 0
            ? todoOverdueCount > 0
                ? `To-Do, ${todoBadgeCount} open, ${todoOverdueCount} overdue`
                : `To-Do, ${todoBadgeCount} open`
            : undefined;

    return (
        <nav 
            aria-label="Mobile Navigation"
            className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/97 border-t border-border-subtle/80 px-1.5 py-1 pb-[max(env(safe-area-inset-bottom),0.375rem)] shadow-[0_-4px_24px_rgba(0,0,0,0.1)] transition-colors"
        >
            <div className="flex items-center justify-around max-w-lg mx-auto">
                <button
                    onClick={() => onNavigate('dashboard')}
                    aria-current={activeTab === 'dashboard' ? 'page' : undefined}
                    aria-label={pendingApprovalsCount > 0 ? `Dashboard, ${pendingApprovalsCount} approval${pendingApprovalsCount > 1 ? 's' : ''} waiting` : undefined}
                    className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-all duration-200 min-w-[52px] ${
                        activeTab === 'dashboard'
                            ? 'text-brand-600 dark:text-brand-400 font-bold'
                            : 'text-muted hover:text-primary'
                    }`}
                >
                    <div className={`relative p-1 rounded-lg transition-transform ${activeTab === 'dashboard' ? 'bg-brand-500/10 scale-110' : ''}`}>
                        <LayoutDashboard size={18} />
                        {pendingApprovalsCount > 0 && (
                            <span
                                aria-hidden
                                className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-4 text-center"
                            >
                                {pendingApprovalsCount > 99 ? '99+' : pendingApprovalsCount}
                            </span>
                        )}
                    </div>
                    <span className="text-xs tracking-tight mt-0.5">Dashboard</span>
                </button>

                <button
                    onClick={() => onNavigate('enrollments')}
                    aria-current={activeTab === 'enrollments' ? 'page' : undefined}
                    className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-all duration-200 min-w-[52px] relative ${
                        activeTab === 'enrollments'
                            ? 'text-brand-600 dark:text-brand-400 font-bold'
                            : 'text-muted hover:text-primary'
                    }`}
                >
                    <div className={`p-1 rounded-lg transition-transform ${activeTab === 'enrollments' ? 'bg-brand-500/10 scale-110' : ''}`}>
                        <GraduationCap size={18} />
                    </div>
                    <span className="text-xs tracking-tight mt-0.5">Enrollments</span>
                </button>

                <button
                    onClick={() => onNavigate('students')}
                    aria-current={activeTab === 'students' ? 'page' : undefined}
                    className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-all duration-200 min-w-[52px] ${
                        activeTab === 'students'
                            ? 'text-brand-600 dark:text-brand-400 font-bold'
                            : 'text-muted hover:text-primary'
                    }`}
                >
                    <div className={`p-1 rounded-lg transition-transform ${activeTab === 'students' ? 'bg-brand-500/10 scale-110' : ''}`}>
                        <Users size={18} />
                    </div>
                    <span className="text-xs tracking-tight mt-0.5">Students</span>
                </button>

                <button
                    onClick={() => onNavigate('courses')}
                    aria-current={activeTab === 'courses' ? 'page' : undefined}
                    className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-all duration-200 min-w-[52px] ${
                        activeTab === 'courses'
                            ? 'text-brand-600 dark:text-brand-400 font-bold'
                            : 'text-muted hover:text-primary'
                    }`}
                >
                    <div className={`p-1 rounded-lg transition-transform ${activeTab === 'courses' ? 'bg-brand-500/10 scale-110' : ''}`}>
                        <BookOpen size={18} />
                    </div>
                    <span className="text-xs tracking-tight mt-0.5">Courses</span>
                </button>

                <button
                    onClick={() => onNavigate('todos')}
                    aria-current={activeTab === 'todos' ? 'page' : undefined}
                    aria-label={todoAriaLabel}
                    className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-all duration-200 min-w-[52px] ${
                        activeTab === 'todos'
                            ? 'text-brand-600 dark:text-brand-400 font-bold'
                            : 'text-muted hover:text-primary'
                    }`}
                >
                    <div className={`relative p-1 rounded-lg transition-transform ${activeTab === 'todos' ? 'bg-brand-500/10 scale-110' : ''}`}>
                        <CheckSquare size={18} />
                        {todoBadgeCount > 0 && (
                            <span
                                aria-hidden
                                className={`absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold leading-4 text-center tabular-nums ${
                                    todoOverdueCount > 0 ? 'bg-danger' : 'bg-brand-500'
                                }`}
                            >
                                {todoBadgeCount > 99 ? '99+' : todoBadgeCount}
                            </span>
                        )}
                    </div>
                    <span className="text-xs tracking-tight mt-0.5">To-Do</span>
                </button>
            </div>
        </nav>
    );
}

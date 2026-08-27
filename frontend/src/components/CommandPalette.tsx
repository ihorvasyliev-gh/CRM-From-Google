import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Student, Course, getAvatarGradient } from '../lib/types';
import { matchesSearch } from '../lib/searchUtils';
import {
    Search, LayoutDashboard, Users, BookOpen, GraduationCap,
    Briefcase, FileText, PieChart, Settings as SettingsIcon,
    Moon, Sun, Rows3, CheckCircle, UserPlus, HelpCircle,
    X, CornerDownLeft, Sparkles, Loader2
} from 'lucide-react';

export interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    onNavigate: (tab: string, filter?: { courseId?: string }) => void;
    onOpenStudentDetail?: (student: Student) => void;
    onOpenAddStudent?: () => void;
    onOpenApprovals?: () => void;
    onOpenShortcuts?: () => void;
    darkMode: boolean;
    toggleDarkMode: () => void;
    density: 'comfortable' | 'compact';
    toggleDensity: () => void;
    isViewer?: boolean;
    pendingApprovalsCount?: number;
}

interface PaletteItem {
    id: string;
    title: string;
    subtitle?: string;
    category: 'Navigation' | 'Actions' | 'Courses' | 'Students';
    icon: React.ReactNode;
    badge?: string;
    shortcut?: string;
    onSelect: () => void;
}

export default function CommandPalette({
    open,
    onClose,
    onNavigate,
    onOpenStudentDetail,
    onOpenAddStudent,
    onOpenApprovals,
    onOpenShortcuts,
    darkMode,
    toggleDarkMode,
    density,
    toggleDensity,
    isViewer = false,
    pendingApprovalsCount = 0,
}: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [students, setStudents] = useState<Student[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset query & focus input on open
    useEffect(() => {
        if (open) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Load initial courses and recent students
    useEffect(() => {
        if (!open) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoadingData(true);
            try {
                const [coursesRes, studentsRes] = await Promise.all([
                    supabase.from('courses').select('*').order('name').limit(50),
                    supabase.from('students').select('*').order('created_at', { ascending: false }).limit(30),
                ]);

                if (isMounted) {
                    if (coursesRes.data) setCourses(coursesRes.data as Course[]);
                    if (studentsRes.data) setStudents(studentsRes.data as Student[]);
                }
            } catch (err) {
                console.error('Error fetching data for CommandPalette:', err);
            } finally {
                if (isMounted) setLoadingData(false);
            }
        };

        fetchData();
        return () => {
            isMounted = false;
        };
    }, [open]);

    // Debounced student search when user types a specific query
    useEffect(() => {
        if (!open || !query.trim() || query.trim().length < 2) return;

        let active = true;
        const timer = setTimeout(async () => {
            const trimmed = query.trim();
            const parts = trimmed.split(/\s+/);
            let q = supabase.from('students').select('*').limit(20);
            parts.forEach((part: string) => {
                const normalizedEircodePart = part.replace(/\s+/g, '').toUpperCase();
                q = q.or(`first_name.ilike.%${part}%,last_name.ilike.%${part}%,email.ilike.%${part}%,phone.ilike.%${part}%,normalized_eircode.ilike.%${normalizedEircodePart}%`);
            });

            const { data } = await q;
            if (active && data) {
                setStudents(data as Student[]);
            }
        }, 200);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [query, open]);

    // Construct searchable items
    const items: PaletteItem[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        const result: PaletteItem[] = [];

        // 1. Navigation
        if (!isViewer) {
            const navs = [
                { id: 'nav-dash', title: 'Dashboard', subtitle: 'Overview & metrics', tab: 'dashboard', icon: <LayoutDashboard size={17} />, shortcut: '1' },
                { id: 'nav-stud', title: 'Students', subtitle: 'Manage student records', tab: 'students', icon: <Users size={17} />, shortcut: '2' },
                { id: 'nav-cour', title: 'Courses', subtitle: 'Course catalog & statistics', tab: 'courses', icon: <BookOpen size={17} />, shortcut: '3' },
                { id: 'nav-enro', title: 'Enrollments', subtitle: 'Kanban registration board', tab: 'enrollments', icon: <GraduationCap size={17} />, shortcut: '4' },
                { id: 'nav-outc', title: 'Outcomes', subtitle: 'Graduate employment tracking', tab: 'outcomes', icon: <Briefcase size={17} />, shortcut: '5' },
                { id: 'nav-docs', title: 'Documents', subtitle: 'Generate registration forms', tab: 'documents', icon: <FileText size={17} />, shortcut: '6' },
                { id: 'nav-anal', title: 'Analytics', subtitle: 'Stats, funnels & insights', tab: 'analytics', icon: <PieChart size={17} />, shortcut: '7' },
                { id: 'nav-sett', title: 'Settings', subtitle: 'App & email configuration', tab: 'settings', icon: <SettingsIcon size={17} />, shortcut: '8' },
            ];

            navs.forEach(nav => {
                if (!q || nav.title.toLowerCase().includes(q) || nav.subtitle.toLowerCase().includes(q) || nav.tab.includes(q)) {
                    result.push({
                        id: nav.id,
                        title: nav.title,
                        subtitle: nav.subtitle,
                        category: 'Navigation',
                        icon: nav.icon,
                        shortcut: nav.shortcut,
                        onSelect: () => {
                            onNavigate(nav.tab);
                            onClose();
                        },
                    });
                }
            });
        } else {
            const viewerNavs = [
                { id: 'nav-lookup', title: 'Student Lookup', subtitle: 'Search student history & contact info', tab: 'lookup', icon: <Users size={17} /> },
                { id: 'nav-courses', title: 'Course Rosters', subtitle: 'View course attendees & request completions', tab: 'courses', icon: <BookOpen size={17} /> },
            ];
            viewerNavs.forEach(nav => {
                if (!q || nav.title.toLowerCase().includes(q) || nav.subtitle.toLowerCase().includes(q)) {
                    result.push({
                        id: nav.id,
                        title: nav.title,
                        subtitle: nav.subtitle,
                        category: 'Navigation',
                        icon: nav.icon,
                        onSelect: () => {
                            onNavigate(nav.tab);
                            onClose();
                        },
                    });
                }
            });
        }

        // 2. Actions
        const actions: Array<{ id: string; title: string; subtitle?: string; icon: React.ReactNode; badge?: string; shortcut?: string; onSelect: () => void }> = [
            {
                id: 'act-theme',
                title: darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode',
                subtitle: `Current: ${darkMode ? 'Dark' : 'Light'} theme`,
                icon: darkMode ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-indigo-400" />,
                onSelect: () => {
                    toggleDarkMode();
                    onClose();
                },
            },
            {
                id: 'act-density',
                title: density === 'comfortable' ? 'Switch to Compact View' : 'Switch to Comfortable View',
                subtitle: `Current: ${density} layout`,
                icon: <Rows3 size={17} className="text-brand-500" />,
                onSelect: () => {
                    toggleDensity();
                    onClose();
                },
            },
        ];

        if (!isViewer && onOpenAddStudent) {
            actions.unshift({
                id: 'act-add-student',
                title: 'Add New Student',
                subtitle: 'Register a new participant record',
                icon: <UserPlus size={17} className="text-emerald-500" />,
                shortcut: 'N',
                onSelect: () => {
                    onClose();
                    onOpenAddStudent();
                },
            });
        }

        if (!isViewer && onOpenApprovals) {
            actions.push({
                id: 'act-approvals',
                title: 'Pending Approvals',
                subtitle: `${pendingApprovalsCount} pending course completion requests`,
                icon: <CheckCircle size={17} className="text-brand-500" />,
                badge: pendingApprovalsCount > 0 ? `${pendingApprovalsCount} new` : undefined,
                onSelect: () => {
                    onClose();
                    onOpenApprovals();
                },
            });
        }

        if (onOpenShortcuts) {
            actions.push({
                id: 'act-shortcuts',
                title: 'Keyboard Shortcuts',
                subtitle: 'View all keyboard shortcuts and helpers',
                icon: <HelpCircle size={17} className="text-muted" />,
                shortcut: '?',
                onSelect: () => {
                    onClose();
                    onOpenShortcuts();
                },
            });
        }

        actions.forEach(act => {
            if (!q || act.title.toLowerCase().includes(q) || (act.subtitle && act.subtitle.toLowerCase().includes(q))) {
                result.push({
                    id: act.id,
                    title: act.title,
                    subtitle: act.subtitle,
                    category: 'Actions',
                    icon: act.icon,
                    badge: act.badge,
                    shortcut: act.shortcut,
                    onSelect: act.onSelect,
                });
            }
        });

        // 3. Courses
        const filteredCourses = courses.filter(c => !q || c.name.toLowerCase().includes(q));
        filteredCourses.slice(0, 5).forEach(c => {
            result.push({
                id: `course-${c.id}`,
                title: c.name,
                subtitle: 'Course catalog & board',
                category: 'Courses',
                icon: <BookOpen size={17} className="text-brand-400" />,
                onSelect: () => {
                    onNavigate('enrollments', { courseId: c.id });
                    onClose();
                },
            });
        });

        // 4. Students
        const filteredStudents = students.filter(s => {
            if (!q) return true;
            return matchesSearch({
                firstName: s.first_name,
                lastName: s.last_name,
                email: s.email,
                phone: s.phone,
                eircode: s.eircode,
            }, q);
        });

        filteredStudents.slice(0, 8).forEach(s => {
            const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unnamed';
            result.push({
                id: `student-${s.id}`,
                title: fullName,
                subtitle: s.email || s.phone || (s.eircode ? `Eircode: ${s.eircode}` : 'Student record'),
                category: 'Students',
                icon: (
                    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${getAvatarGradient(s.id)} flex items-center justify-center text-[10px] text-white font-bold`}>
                        {(s.first_name?.[0] || 'S').toUpperCase()}
                    </div>
                ),
                onSelect: () => {
                    onClose();
                    if (onOpenStudentDetail) {
                        onOpenStudentDetail(s);
                    } else {
                        onNavigate('students');
                    }
                },
            });
        });

        return result;
    }, [query, isViewer, darkMode, density, courses, students, pendingApprovalsCount, onNavigate, onClose, toggleDarkMode, toggleDensity, onOpenAddStudent, onOpenApprovals, onOpenShortcuts, onOpenStudentDetail]);

    // Keep selected index within bounds
    useEffect(() => {
        setSelectedIndex(0);
    }, [items.length]);

    // Handle Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (items[selectedIndex]) {
                items[selectedIndex].onSelect();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    }, [items, selectedIndex, onClose]);

    // Scroll selected item into view
    useEffect(() => {
        if (!listRef.current) return;
        const selectedElem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedElem && typeof selectedElem.scrollIntoView === 'function') {
            selectedElem.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    if (!open) return null;

    // Group items by category
    const categories = ['Navigation', 'Actions', 'Courses', 'Students'] as const;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 animate-fadeIn"
            onKeyDown={handleKeyDown}
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-background/70 backdrop-blur-md transition-opacity"
                onClick={onClose}
            />

            {/* Modal Dialog */}
            <div className="relative w-full max-w-xl bg-surface-elevated border border-border-subtle rounded-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col max-h-[75vh] animate-scaleIn">
                {/* Search Input Bar */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border-subtle bg-surface/50">
                    <Search size={19} className="text-muted flex-shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search students, courses, navigation, or actions..."
                        className="w-full bg-transparent text-primary placeholder:text-muted/60 text-sm font-medium focus:outline-none"
                    />
                    {loadingData && (
                        <Loader2 size={16} className="animate-spin text-brand-500 flex-shrink-0" />
                    )}
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            className="p-1 rounded-md text-muted hover:text-primary hover:bg-surface-elevated transition-colors"
                        >
                            <X size={15} />
                        </button>
                    )}
                    <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-semibold text-muted bg-surface border border-border-subtle rounded-md">
                        ESC
                    </kbd>
                </div>

                {/* List of Results */}
                <div ref={listRef} className="overflow-y-auto flex-1 p-2 space-y-3 divide-y divide-border-subtle/50">
                    {items.length === 0 ? (
                        <div className="py-12 text-center text-muted">
                            <Sparkles size={28} className="mx-auto mb-2.5 opacity-40 text-brand-500" />
                            <p className="text-sm font-medium text-primary">No results found</p>
                            <p className="text-xs text-muted mt-1">Try searching by student name, email, course, or action.</p>
                        </div>
                    ) : (
                        categories.map(cat => {
                            const catItems = items.filter(item => item.category === cat);
                            if (catItems.length === 0) return null;

                            return (
                                <div key={cat} className="pt-2 first:pt-0">
                                    <div className="px-3 py-1.5 text-[11px] font-bold text-muted uppercase tracking-wider">
                                        {cat}
                                    </div>
                                    <div className="space-y-0.5">
                                        {catItems.map(item => {
                                            const globalIndex = items.findIndex(i => i.id === item.id);
                                            const isSelected = globalIndex === selectedIndex;

                                            return (
                                                <div
                                                    key={item.id}
                                                    data-index={globalIndex}
                                                    onClick={() => item.onSelect()}
                                                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm cursor-pointer transition-all ${
                                                        isSelected
                                                            ? 'bg-brand-500/10 text-brand-500 font-medium'
                                                            : 'hover:bg-surface/80 text-primary'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 pr-2">
                                                        <span className={`flex-shrink-0 ${isSelected ? 'text-brand-500' : 'text-muted'}`}>
                                                            {item.icon}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold truncate flex items-center gap-2">
                                                                <span className={isSelected ? 'text-brand-500' : 'text-primary'}>
                                                                    {item.title}
                                                                </span>
                                                                {item.badge && (
                                                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-brand-500 text-white leading-tight">
                                                                        {item.badge}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {item.subtitle && (
                                                                <p className="text-xs text-muted truncate">
                                                                    {item.subtitle}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        {item.shortcut && (
                                                            <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-muted bg-surface border border-border-subtle rounded-md">
                                                                {item.shortcut}
                                                            </kbd>
                                                        )}
                                                        {isSelected && (
                                                            <CornerDownLeft size={14} className="text-brand-500" />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Tips */}
                <div className="px-4 py-2.5 bg-surface/60 border-t border-border-subtle flex items-center justify-between text-[11px] text-muted">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1 py-0.5 rounded bg-surface border border-border-subtle text-[10px]">↑</kbd>
                            <kbd className="px-1 py-0.5 rounded bg-surface border border-border-subtle text-[10px]">↓</kbd> Navigate
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-[10px]">↵</kbd> Select
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>Quick search</span>
                        <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-[10px]">Ctrl K</kbd>
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { getAvatarGradient } from '../lib/types';
import { cleanVariant } from '../lib/types';
import { 
    Search, LogOut, Sun, Moon, Sparkles, Loader2, Users, Mail, Phone, MapPin, 
    Calendar, Clock, Send, CheckCircle, GraduationCap, XCircle, X, Info,
    Star, AlertTriangle, MessageSquare, Filter
} from 'lucide-react';

interface StudentSearchResult {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    address: string | null;
    eircode: string | null;
    dob: string | null;
    created_at: string;
}

interface EnrollmentDetail {
    id: string;
    status: string;
    course_variant: string | null;
    created_at: string;
    invited_at: string | null;
    invited_date: string | null;
    confirmed_at: string | null;
    confirmed_date: string | null;
    completed_at: string | null;
    completed_date: string | null;
    course_id: string;
    course_name: string;
    queue_position: number | null;
    notes: string | null;
    is_priority: boolean;
}

interface StudentFlag {
    id: string;
    course_id: string;
    course_name: string;
    comment: string | null;
    created_at: string;
}

interface StudentDetailData {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    address: string | null;
    eircode: string | null;
    dob: string | null;
    created_at: string;
    enrollments: EnrollmentDetail[];
    flags: StudentFlag[];
}

const STATUS_BADGE: Record<string, { icon: JSX.Element; className: string; label: string }> = {
    requested: { 
        icon: <Clock size={12} />, 
        className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20', 
        label: 'Requested' 
    },
    invited: { 
        icon: <Send size={12} />, 
        className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20', 
        label: 'Invited' 
    },
    confirmed: { 
        icon: <CheckCircle size={12} />, 
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20', 
        label: 'Confirmed' 
    },
    rejected: { 
        icon: <XCircle size={12} />, 
        className: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20', 
        label: 'Rejected' 
    },
    completed: { 
        icon: <GraduationCap size={12} />, 
        className: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20', 
        label: 'Completed' 
    },
    withdrawn: { 
        icon: <XCircle size={12} />, 
        className: 'bg-muted/10 text-muted border-border-subtle', 
        label: 'Withdrawn' 
    },
};

function InfoField({ icon, label, value }: { icon: JSX.Element; label: string; value: string | null }) {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border-subtle shadow-sm hover:shadow transition-all">
            <span className="text-muted flex-shrink-0">{icon}</span>
            <div className="min-w-0">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider">{label}</p>
                <p className="text-sm text-primary font-medium truncate">{value || <span className="text-muted/50 italic font-normal">Not set</span>}</p>
            </div>
        </div>
    );
}

function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    try {
        return new Date(dateStr).toLocaleDateString('en-IE');
    } catch (e) {
        return dateStr;
    }
}

export default function StudentLookup() {
    const { user, signOut } = useAuth();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'relevance' | 'asc' | 'desc'>('relevance');
    const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return true;
    });

    const toggleDarkMode = () => {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            setDarkMode(false);
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            setDarkMode(true);
        }
    };

    // React Query for student search
    const { data: searchResults, isLoading: isSearching, error: searchError } = useQuery<StudentSearchResult[]>({
        queryKey: ['restricted_students_search', debouncedSearch],
        queryFn: async () => {
            if (debouncedSearch.trim().length < 3) return [];
            const { data, error } = await supabase.rpc('search_students_restricted', {
                p_query: debouncedSearch.trim()
            });
            if (error) throw error;
            return data || [];
        },
        enabled: debouncedSearch.trim().length >= 3
    });

    // React Query for student details + enrollments
    const { data: studentDetail, isLoading: isLoadingDetail, error: detailError } = useQuery<StudentDetailData | null>({
        queryKey: ['restricted_student_detail', selectedStudentId],
        queryFn: async () => {
            if (!selectedStudentId) return null;
            const { data, error } = await supabase.rpc('get_student_detail_restricted', {
                p_student_id: selectedStudentId
            });
            if (error) throw error;
            return data;
        },
        enabled: !!selectedStudentId
    });

    // Reset details and filters if search query changes
    useEffect(() => {
        setSelectedStudentId(null);
        setSelectedLetter(null);
        setSortBy('relevance');
    }, [debouncedSearch]);

    // Compute uppercase letters that exist in results (first letter of first_name or last_name)
    const availableLetters = useMemo(() => {
        const letters = new Set<string>();
        if (!searchResults) return letters;
        
        searchResults.forEach(student => {
            const firstLetter = (student.first_name || '').trim()[0]?.toUpperCase();
            if (firstLetter && /[A-Z]/.test(firstLetter)) {
                letters.add(firstLetter);
            }
            const lastLetter = (student.last_name || '').trim()[0]?.toUpperCase();
            if (lastLetter && /[A-Z]/.test(lastLetter)) {
                letters.add(lastLetter);
            }
        });
        return letters;
    }, [searchResults]);

    // Apply letter filtering and alphabetical sorting to the search results
    const processedResults = useMemo(() => {
        if (!searchResults) return [];
        let results = [...searchResults];

        // 1. Filter by letter (checks first letter of first_name or last_name)
        if (selectedLetter) {
            results = results.filter(student => {
                const firstLetter = (student.first_name || '').trim()[0]?.toUpperCase();
                const lastLetter = (student.last_name || '').trim()[0]?.toUpperCase();
                return firstLetter === selectedLetter || lastLetter === selectedLetter;
            });
        }

        // 2. Sort by selected method
        if (sortBy === 'asc') {
            results.sort((a, b) => {
                const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
                const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
                return nameA.localeCompare(nameB);
            });
        } else if (sortBy === 'desc') {
            results.sort((a, b) => {
                const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
                const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
                return nameB.localeCompare(nameA);
            });
        }

        return results;
    }, [searchResults, selectedLetter, sortBy]);

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background text-primary transition-colors duration-300">
            {/* Lookup Header */}
            <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border-subtle/60 px-4 sm:px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-gradient-to-br from-brand-500 via-brand-600 to-accent-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-500/25 flex-shrink-0 animate-glow">
                        C
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-sm font-bold text-primary tracking-tight truncate">
                            Course CRM
                        </h1>
                        <p className="text-[9px] text-muted font-semibold tracking-wide uppercase">Student Lookup Portal</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                    <button
                        onClick={toggleDarkMode}
                        className="p-2 rounded-xl text-muted hover:text-primary hover:bg-surface-elevated transition-all border border-transparent hover:border-border-subtle"
                        title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>

                    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface-elevated rounded-xl border border-border-subtle/50">
                        <div className="w-6 h-6 bg-gradient-to-br from-brand-500 to-accent-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-background shadow-sm">
                            {(user?.email?.[0] || 'V').toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-primary/80 truncate max-w-[120px]">{user?.email}</span>
                        <span className="text-[9px] bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold px-1.5 py-0.5 rounded uppercase">Viewer</span>
                    </div>

                    <button
                        onClick={signOut}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all shadow-sm"
                        title="Sign Out"
                    >
                        <LogOut size={14} />
                        <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </div>
            </header>

            {/* Main Content Split Area */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 relative overflow-hidden">
                
                {/* Search column */}
                <div className={`flex-1 flex flex-col min-h-0 p-4 sm:p-6 transition-all duration-300 ${selectedStudentId ? 'md:max-w-md xl:max-w-lg border-r border-border-subtle' : 'w-full'}`}>
                    
                    {/* Search Input Box */}
                    <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-4 mb-4">
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={18} />
                            <input
                                type="text"
                                placeholder="Search by name, email, phone or eircode..."
                                className="w-full pl-10 pr-10 py-3 bg-surface-elevated border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 focus:bg-background transition-all placeholder:text-muted/60 text-primary"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {search && (
                                <button 
                                    onClick={() => setSearch('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary rounded-lg transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Alphabet Filter and Sort Bar */}
                    {search.trim().length >= 3 && !isSearching && !searchError && searchResults && searchResults.length > 0 && (
                        <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-4 mb-4 space-y-3 animate-fadeIn flex-shrink-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                                    <Filter size={13} className="text-muted/80" />
                                    Alphabet Filter
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-muted font-bold uppercase tracking-wider">Sort:</span>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value as any)}
                                        className="text-xs font-semibold bg-surface-elevated border border-border-strong rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-primary cursor-pointer hover:border-brand-500 transition-all"
                                    >
                                        <option value="relevance">Relevance</option>
                                        <option value="asc">Name (A-Z)</option>
                                        <option value="desc">Name (Z-A)</option>
                                    </select>
                                </div>
                            </div>
                            
                            {/* Alphabet Scrollable Bar */}
                            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                                <button
                                    onClick={() => setSelectedLetter(null)}
                                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex-shrink-0 border ${
                                        selectedLetter === null
                                            ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                                            : 'bg-surface-elevated hover:bg-surface text-primary border-border-subtle hover:border-border-strong'
                                    }`}
                                >
                                    All
                                </button>
                                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => {
                                    const isAvailable = availableLetters.has(letter);
                                    const isSelected = selectedLetter === letter;
                                    
                                    return (
                                        <button
                                            key={letter}
                                            disabled={!isAvailable}
                                            onClick={() => setSelectedLetter(letter)}
                                            className={`w-7 h-7 text-xs font-bold rounded-lg transition-all flex-shrink-0 flex items-center justify-center border ${
                                                isSelected
                                                    ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                                                    : isAvailable
                                                    ? 'bg-surface-elevated hover:bg-surface text-primary border-border-subtle hover:border-border-strong cursor-pointer'
                                                    : 'bg-surface-elevated/40 text-muted/30 border-border-subtle/20 cursor-not-allowed opacity-40'
                                            }`}
                                            title={isAvailable ? `Filter by name starting with ${letter}` : `No students starting with ${letter}`}
                                        >
                                            {letter}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Active letter quick info / clear button */}
                            {selectedLetter && (
                                <div className="flex items-center justify-between text-xs text-muted bg-surface-elevated border border-border-subtle/80 px-3 py-1.5 rounded-xl animate-fadeIn">
                                    <span>
                                        Showing <strong className="text-primary font-bold">{processedResults.length}</strong> of{' '}
                                        <strong className="text-primary font-bold">{searchResults.length}</strong> students starting with "{selectedLetter}"
                                    </span>
                                    <button
                                        onClick={() => setSelectedLetter(null)}
                                        className="text-brand-500 hover:text-brand-600 font-bold transition-colors text-xs"
                                    >
                                        Clear Filter
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Results Container */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                        {search.trim().length < 3 ? (
                            <div className="text-center py-12 px-4">
                                <div className="w-16 h-16 bg-brand-500/10 text-brand-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                    <Search size={28} />
                                </div>
                                <h3 className="text-lg font-bold text-primary">Student Search</h3>
                                <p className="text-sm text-muted mt-1 max-w-xs mx-auto">
                                    Enter at least 3 characters to search for a student profile.
                                </p>
                            </div>
                        ) : isSearching ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted">
                                <Loader2 size={32} className="animate-spin text-brand-500" />
                                <span className="text-sm font-semibold">Searching student registry...</span>
                            </div>
                        ) : searchError ? (
                            <div className="text-center py-12 px-4 border border-red-500/10 bg-red-500/5 rounded-2xl">
                                <p className="text-sm text-red-500 font-semibold">Search failed</p>
                                <p className="text-xs text-muted mt-1">Please try again or check your connection.</p>
                            </div>
                        ) : searchResults && searchResults.length === 0 ? (
                            <div className="text-center py-12 px-4">
                                <div className="w-16 h-16 bg-surface-elevated border border-border-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Users size={28} className="text-muted" />
                                </div>
                                <h3 className="text-base font-bold text-primary">No students found</h3>
                                <p className="text-xs text-muted mt-1">
                                    Double-check spelling or try searching by email or phone.
                                </p>
                            </div>
                        ) : processedResults && processedResults.length === 0 ? (
                            <div className="text-center py-12 px-4 bg-surface/30 rounded-2xl border border-dashed border-border-subtle">
                                <div className="w-12 h-12 bg-surface-elevated border border-border-subtle rounded-2xl flex items-center justify-center mx-auto mb-3 text-muted shadow-sm">
                                    <Users size={20} />
                                </div>
                                <h3 className="text-sm font-bold text-primary">No students match filter</h3>
                                <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                                    No students start with the letter "{selectedLetter}". Try selecting another letter or clearing the filter.
                                </p>
                                <button
                                    onClick={() => setSelectedLetter(null)}
                                    className="mt-3 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-xl transition-all shadow-sm"
                                >
                                    Show All Students
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2.5 animate-fadeIn">
                                {processedResults.map(student => (
                                    <div
                                        key={student.id}
                                        onClick={() => setSelectedStudentId(student.id)}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 group ${
                                            selectedStudentId === student.id
                                                ? 'bg-brand-500/10 border-brand-500 shadow-sm'
                                                : 'bg-surface hover:bg-brand-50/20 border-border-subtle hover:border-brand-500/30'
                                        }`}
                                    >
                                        <div className={`w-10 h-10 bg-gradient-to-br ${getAvatarGradient(student.id)} rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0`}>
                                            {(student.first_name?.[0] || '').toUpperCase()}{(student.last_name?.[0] || '').toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-primary text-sm group-hover:text-brand-500 transition-colors">
                                                {student.first_name} {student.last_name}
                                            </h4>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Details column */}
                <div className={`
                    absolute md:relative inset-0 md:inset-auto md:flex-1 h-full md:h-auto z-30 md:z-10
                    bg-background p-4 sm:p-6 flex flex-col min-h-0 transition-transform duration-300 md:translate-x-0
                    ${selectedStudentId ? 'translate-x-0' : 'translate-x-full'}
                `}>
                    {selectedStudentId ? (
                        isLoadingDetail ? (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center animate-pulse">
                                        <Sparkles size={24} className="text-white" />
                                    </div>
                                    <Loader2 size={24} className="animate-spin text-brand-500" />
                                </div>
                            </div>
                        ) : detailError || !studentDetail ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                                <XCircle className="text-red-500 mb-2" size={40} />
                                <h3 className="font-bold text-primary">Failed to load details</h3>
                                <button 
                                    onClick={() => setSelectedStudentId(null)}
                                    className="mt-4 px-4 py-2 bg-surface border border-border-subtle rounded-xl text-sm font-semibold hover:bg-surface-elevated"
                                >
                                    Go Back
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col min-h-0 bg-surface-elevated rounded-3xl border border-border-subtle shadow-card overflow-hidden animate-slideInRight transform-gpu">
                                {/* Details Header */}
                                <div className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur-sm border-b border-border-subtle px-5 py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-11 h-11 bg-gradient-to-br ${getAvatarGradient(studentDetail.id)} rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-background shadow-md`}>
                                            {(studentDetail.first_name?.[0] || '').toUpperCase()}{(studentDetail.last_name?.[0] || '').toUpperCase()}
                                        </div>
                                        <div>
                                            <h2 className="font-bold text-primary text-base leading-tight">
                                                {studentDetail.first_name} {studentDetail.last_name}
                                            </h2>
                                            <span className="text-[10px] text-muted font-semibold uppercase tracking-wider bg-brand-500/10 px-2 py-0.5 rounded">Read-only profile</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedStudentId(null)}
                                        className="p-2 text-muted hover:text-primary hover:bg-surface rounded-xl border border-transparent hover:border-border-subtle transition-all"
                                        title="Close details"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Details Body */}
                                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                                    {/* Contact Information */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Contact Information</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <InfoField icon={<Mail size={16} />} label="Email Address" value={studentDetail.email} />
                                            <InfoField icon={<Phone size={16} />} label="Phone Number" value={studentDetail.phone} />
                                            <InfoField icon={<MapPin size={16} />} label="Address" value={studentDetail.address} />
                                            <InfoField icon={<MapPin size={16} />} label="Eircode" value={studentDetail.eircode} />
                                            <InfoField 
                                                icon={<Calendar size={16} />} 
                                                label="Date of Birth" 
                                                value={studentDetail.dob ? new Date(studentDetail.dob).toLocaleDateString('en-IE') : null} 
                                            />
                                        </div>
                                    </div>

                                    {/* Student Flags (Failed Courses) */}
                                    {studentDetail.flags && studentDetail.flags.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-1.5">
                                                <AlertTriangle size={12} />
                                                Course Flags
                                            </h3>
                                            <div className="space-y-2">
                                                {studentDetail.flags.map(flag => (
                                                    <div 
                                                        key={flag.id}
                                                        className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-start gap-3"
                                                    >
                                                        <div className="flex-shrink-0 w-8 h-8 bg-red-100 dark:bg-red-500/20 rounded-lg flex items-center justify-center">
                                                            <XCircle size={16} className="text-red-500" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-bold text-red-700 dark:text-red-400">
                                                                {flag.course_name}
                                                            </p>
                                                            {flag.comment && (
                                                                <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
                                                                    {flag.comment}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Course Registrations & Queues */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Course Registrations</h3>
                                        {studentDetail.enrollments.length === 0 ? (
                                            <div className="text-center py-8 bg-surface rounded-2xl border border-border-subtle">
                                                <p className="text-sm text-muted italic">This student is not registered in any courses.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {studentDetail.enrollments.map(en => (
                                                    <div 
                                                        key={en.id} 
                                                        className="p-4 rounded-2xl bg-surface border border-border-subtle shadow-sm hover:shadow transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-bold text-primary text-sm truncate">
                                                                    {en.course_name}
                                                                </h4>
                                                                {en.is_priority && (
                                                                    <span 
                                                                        className="flex-shrink-0 text-amber-500" 
                                                                        title="Priority enrollment"
                                                                    >
                                                                        <Star size={14} fill="currentColor" />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {en.course_variant && (
                                                                <span className="text-[10px] text-muted block mt-0.5 mb-1.5">
                                                                    Variant: {cleanVariant(en.course_name, en.course_variant)}
                                                                </span>
                                                            )}

                                                            {/* Enrollment Notes */}
                                                            {en.notes && (
                                                                <div className="flex items-start gap-1.5 mt-1.5 mb-1 px-2 py-1.5 bg-brand-500/5 dark:bg-brand-500/10 border border-brand-500/10 dark:border-brand-500/15 rounded-lg">
                                                                    <MessageSquare size={11} className="text-brand-500 flex-shrink-0 mt-0.5" />
                                                                    <p className="text-[11px] text-primary/70 dark:text-primary/60 leading-snug">{en.notes}</p>
                                                                </div>
                                                            )}

                                                            {/* Enrollment Dates */}
                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5 pt-2.5 border-t border-border-subtle/40 text-[10px] text-muted">
                                                                <div>
                                                                    <span className="font-semibold text-primary/70 mr-1">Registered:</span>
                                                                    <span>{formatDate(en.created_at)}</span>
                                                                </div>
                                                                {(en.invited_at || en.invited_date) && (
                                                                    <div>
                                                                        <span className="font-semibold text-primary/70 mr-1">Invited:</span>
                                                                        <span>{formatDate(en.invited_at || en.invited_date)}</span>
                                                                    </div>
                                                                )}
                                                                {(en.confirmed_at || en.confirmed_date) && (
                                                                    <div>
                                                                        <span className="font-semibold text-primary/70 mr-1">Confirmed:</span>
                                                                        <span>{formatDate(en.confirmed_at || en.confirmed_date)}</span>
                                                                    </div>
                                                                )}
                                                                {en.status === 'completed' && (en.completed_at || en.completed_date) && (
                                                                    <div>
                                                                        <span className="font-semibold text-primary/70 mr-1">Completed:</span>
                                                                        <span>{formatDate(en.completed_at || en.completed_date)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {/* Queue position badge for requested state */}
                                                            {en.status === 'requested' && en.queue_position !== null && (
                                                                <div 
                                                                    className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
                                                                    title="Position in queue for this course"
                                                                >
                                                                    <span>Queue Position:</span>
                                                                    <span className="font-mono bg-amber-500 text-white dark:text-background px-1.5 py-0.5 rounded font-bold">
                                                                        #{en.queue_position}
                                                                    </span>
                                                                </div>
                                                            )}

                                                            <span className={`text-[10px] px-2.5 py-1 rounded-xl flex items-center gap-1.5 border font-semibold ${
                                                                STATUS_BADGE[en.status]?.className || 'bg-surface-100 text-muted border-border-subtle'
                                                            }`}>
                                                                {STATUS_BADGE[en.status]?.icon}
                                                                {STATUS_BADGE[en.status]?.label || en.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="hidden md:flex flex-col items-center justify-center flex-1 text-center bg-surface-elevated/40 border border-dashed border-border-subtle rounded-3xl p-8">
                            <div className="w-16 h-16 bg-surface-elevated border border-border-subtle rounded-3xl flex items-center justify-center text-muted mb-3 shadow-inner">
                                <Info size={24} />
                            </div>
                            <h3 className="font-bold text-primary text-sm">No Student Selected</h3>
                            <p className="text-xs text-muted max-w-[200px] mt-1">
                                Search for a student and select them from the list to view their full profile and enrollment status.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

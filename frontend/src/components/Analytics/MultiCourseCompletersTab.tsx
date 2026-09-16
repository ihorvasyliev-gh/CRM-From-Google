import { useState, useMemo, useCallback } from 'react';
import { 
    Search, 
    Copy, 
    Check, 
    ExternalLink, 
    ChevronLeft, 
    ChevronRight, 
    Sparkles, 
    MapPin, 
    GraduationCap, 
    CheckCircle2, 
    FileSpreadsheet, 
    Users, 
    Award,
    Calendar,
    X
} from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import type { Student } from '../../lib/types';
import { getAvatarGradient } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';
import { copyEmailsToClipboard } from './analyticsUtils';
import {
    extractAvailableCompletedCourses,
    buildStudentMultiCourseProfiles,
    filterMultiCourseProfiles,
    exportMultiCourseExcelReport,
    type StudentMultiCourseProfile,
    type AvailableCourseSummary
} from './multiCourseUtils';

interface MultiCourseCompletersTabProps {
    allEnrollments: EnrollmentWithRelations[];
    filteredEnrollments: EnrollmentWithRelations[];
    onOpenStudent: (student: Student) => void;
}

export default function MultiCourseCompletersTab({
    allEnrollments,
    filteredEnrollments,
    onOpenStudent
}: MultiCourseCompletersTabProps) {
    // 1. Filter and Scope States
    const [useAllTimeData, setUseAllTimeData] = useState(true);
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
    const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [districtFilter, setDistrictFilter] = useState<string>('all');
    const [courseSearch, setCourseSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [copied, setCopied] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const itemsPerPage = 12;

    // Source enrollments based on scope toggle
    const sourceEnrollments = useAllTimeData ? allEnrollments : filteredEnrollments;

    // 2. Available Courses for Selection
    const availableCourses: AvailableCourseSummary[] = useMemo(() => {
        return extractAvailableCompletedCourses(sourceEnrollments);
    }, [sourceEnrollments]);

    // 3. Pre-aggregate Student Profiles
    const studentProfiles: StudentMultiCourseProfile[] = useMemo(() => {
        return buildStudentMultiCourseProfiles(sourceEnrollments);
    }, [sourceEnrollments]);

    // 4. Unique Districts for Filter Dropdown
    const availableDistricts = useMemo(() => {
        const set = new Set<string>();
        studentProfiles.forEach(p => {
            if (p.district && p.district !== 'Unknown / Outside Cork') {
                set.add(p.district);
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [studentProfiles]);

    // 5. Filtered Profiles
    const filteredProfiles = useMemo(() => {
        return filterMultiCourseProfiles(studentProfiles, {
            selectedCourseIds,
            matchMode,
            searchQuery,
            districtFilter
        });
    }, [studentProfiles, selectedCourseIds, matchMode, searchQuery, districtFilter]);

    // Pagination
    const totalPages = Math.ceil(filteredProfiles.length / itemsPerPage) || 1;
    const paginatedProfiles = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredProfiles.slice(start, start + itemsPerPage);
    }, [filteredProfiles, currentPage]);

    // Quick Course Toggles
    const toggleCourse = useCallback((courseId: string) => {
        setSelectedCourseIds(prev => {
            const exists = prev.includes(courseId);
            const next = exists ? prev.filter(id => id !== courseId) : [...prev, courseId];
            return next;
        });
        setCurrentPage(1);
    }, []);

    const handleClearCourses = () => {
        setSelectedCourseIds([]);
        setCurrentPage(1);
    };

    // Quick Popular Preset: Security + Safe Pass
    const handleSelectSecurityAndSafePass = () => {
        const matching = availableCourses.filter(c => {
            const name = c.name.toLowerCase();
            return name.includes('security') || name.includes('safe pass') || name.includes('safepass');
        });
        if (matching.length > 0) {
            setSelectedCourseIds(matching.map(m => m.id));
            setMatchMode('all');
            setCurrentPage(1);
        }
    };

    // Filter courses displayed in selector pills
    const displayedCourses = useMemo(() => {
        if (!courseSearch.trim()) return availableCourses;
        const q = courseSearch.toLowerCase();
        return availableCourses.filter(c => c.name.toLowerCase().includes(q));
    }, [availableCourses, courseSearch]);

    // Summary statistics for active selection
    const stats = useMemo(() => {
        const totalMatching = filteredProfiles.length;
        const totalProfiles = studentProfiles.length;
        const percentage = totalProfiles > 0 ? Math.round((totalMatching / totalProfiles) * 100) : 0;

        // District distribution
        const distMap = new Map<string, number>();
        filteredProfiles.forEach(p => {
            if (p.district && p.district !== 'Unknown / Outside Cork') {
                distMap.set(p.district, (distMap.get(p.district) || 0) + 1);
            }
        });
        let topDistrict = 'N/A';
        let topCount = 0;
        distMap.forEach((cnt, dist) => {
            if (cnt > topCount) {
                topCount = cnt;
                topDistrict = dist;
            }
        });

        return {
            totalMatching,
            percentage,
            topDistrict: topCount > 0 ? `${topDistrict} (${topCount})` : 'Varied'
        };
    }, [filteredProfiles, studentProfiles]);

    // Handlers
    const handleCopyEmails = () => {
        const emails = filteredProfiles.map(p => p.email).filter(Boolean);
        copyEmailsToClipboard(emails);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const handleExportExcel = async () => {
        try {
            setIsExporting(true);
            const selectedCoursesInfo = availableCourses.filter(c => selectedCourseIds.includes(c.id));
            await exportMultiCourseExcelReport(filteredProfiles, selectedCoursesInfo, matchMode);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* 1. Header & Course Selection Panel */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex-shrink-0">
                                <Award size={20} />
                            </div>
                            <div>
                                <h3 className="text-base sm:text-lg font-bold text-primary flex items-center gap-2">
                                    Multi-Course Graduate Finder
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20">
                                        Cross-Course Intelligence
                                    </span>
                                </h3>
                                <p className="text-xs text-muted mt-0.5">
                                    Select multiple courses to identify graduates who completed specific combinations (e.g. Safe Pass & Security)
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Scope Switcher & Popular Preset */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={handleSelectSecurityAndSafePass}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 transition-all shadow-sm"
                            title="Quick select Security + Safe Pass combination"
                        >
                            <Sparkles size={13} className="text-indigo-500" />
                            <span>Preset: Security + Safe Pass</span>
                        </button>

                        <button
                            onClick={() => setUseAllTimeData(!useAllTimeData)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors shadow-sm ${
                                useAllTimeData 
                                    ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/30' 
                                    : 'bg-surface-elevated text-muted border-border-subtle hover:text-primary'
                            }`}
                            title="Toggle between all-time CRM records or the global date filter"
                        >
                            <Calendar size={13} />
                            <span>{useAllTimeData ? 'All-Time CRM Records' : 'Using Date Filter'}</span>
                        </button>
                    </div>
                </div>

                {/* Course Selection Area */}
                <div className="space-y-3 pt-2 border-t border-border-subtle/50">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-primary uppercase tracking-wider">
                                Select Courses ({selectedCourseIds.length} Selected):
                            </span>
                            {selectedCourseIds.length > 0 && (
                                <button
                                    onClick={handleClearCourses}
                                    className="text-[11px] text-muted hover:text-rose-500 flex items-center gap-1 transition-colors underline"
                                >
                                    <X size={11} /> Clear All
                                </button>
                            )}
                        </div>

                        {/* Match Mode Switcher (ALL vs ANY) */}
                        <div className="flex items-center bg-surface-elevated border border-border-subtle rounded-xl p-1 shadow-sm">
                            <button
                                onClick={() => { setMatchMode('all'); setCurrentPage(1); }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                    matchMode === 'all'
                                        ? 'bg-brand-500 text-white shadow-sm'
                                        : 'text-muted hover:text-primary'
                                }`}
                                title="Candidates must have completed ALL selected courses"
                            >
                                Completed ALL (AND)
                            </button>
                            <button
                                onClick={() => { setMatchMode('any'); setCurrentPage(1); }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                    matchMode === 'any'
                                        ? 'bg-brand-500 text-white shadow-sm'
                                        : 'text-muted hover:text-primary'
                                }`}
                                title="Candidates who completed AT LEAST ONE selected course"
                            >
                                Completed ANY (OR)
                            </button>
                        </div>
                    </div>

                    {/* Course Search if many courses */}
                    {availableCourses.length > 8 && (
                        <div className="relative max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" size={13} />
                            <input
                                type="text"
                                placeholder="Filter courses list..."
                                value={courseSearch}
                                onChange={(e) => setCourseSearch(e.target.value)}
                                className="w-full pl-7 pr-3 py-1 bg-surface-elevated border border-border-subtle rounded-lg text-xs focus:outline-none focus:border-brand-500 text-primary"
                            />
                        </div>
                    )}

                    {/* Interactive Course Selection Badges */}
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                        {displayedCourses.map(course => {
                            const isSelected = selectedCourseIds.includes(course.id);
                            return (
                                <button
                                    key={course.id}
                                    onClick={() => toggleCourse(course.id)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                                        isSelected
                                            ? 'bg-brand-500 text-white border-brand-600 shadow-md shadow-brand-500/20 scale-[1.02]'
                                            : 'bg-surface-elevated text-primary border-border-subtle hover:border-brand-500/40 hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                                        isSelected ? 'bg-white text-brand-600 border-white' : 'border-border-strong bg-surface'
                                    }`}>
                                        {isSelected && <Check size={11} strokeWidth={3} />}
                                    </div>
                                    <span className="font-semibold">{course.name}</span>
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                                        isSelected
                                            ? 'bg-white/20 text-white'
                                            : 'bg-black/5 dark:bg-white/10 text-muted'
                                    }`}>
                                        {course.completedStudentsCount} grads
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 2. Executive Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Matching Graduates</span>
                        <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <GraduationCap size={15} />
                        </div>
                    </div>
                    <p className="text-2xl font-black font-mono text-primary mt-1">
                        {stats.totalMatching}
                    </p>
                    <span className="text-[10px] text-muted mt-0.5 block">
                        {selectedCourseIds.length === 0 
                            ? 'Students with ≥ 2 completed courses' 
                            : (matchMode === 'all' ? `Completed all ${selectedCourseIds.length} courses` : `Completed at least 1 of ${selectedCourseIds.length}`)}
                    </span>
                </div>

                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Cohort Share</span>
                        <div className="p-1 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
                            <Users size={15} />
                        </div>
                    </div>
                    <p className="text-2xl font-black font-mono text-primary mt-1">
                        {stats.percentage}%
                    </p>
                    <span className="text-[10px] text-muted mt-0.5 block">
                        Of all CRM graduates ({studentProfiles.length} total)
                    </span>
                </div>

                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Top Geographic Hub</span>
                        <div className="p-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            <MapPin size={15} />
                        </div>
                    </div>
                    <p className="text-xl font-black font-mono text-primary mt-1 truncate">
                        {stats.topDistrict}
                    </p>
                    <span className="text-[10px] text-muted mt-0.5 block">
                        Leading district for this combination
                    </span>
                </div>
            </div>

            {/* 3. Filter Bar & Global Actions */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-primary">
                            Graduates Roster ({filteredProfiles.length})
                        </h4>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={handleCopyEmails}
                            disabled={filteredProfiles.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border-subtle bg-surface-elevated hover:bg-surface-elevated/80 disabled:opacity-40 transition-colors shadow-sm"
                        >
                            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                            <span>{copied ? 'Emails Copied!' : 'Copy Emails'}</span>
                        </button>

                        <button
                            onClick={handleExportExcel}
                            disabled={isExporting || filteredProfiles.length === 0}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
                        >
                            <FileSpreadsheet size={13} />
                            <span>{isExporting ? 'Generating Excel...' : 'Export Excel (.xlsx)'}</span>
                        </button>
                    </div>
                </div>

                {/* Search & District Row */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-border-subtle/50">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                        <input
                            type="text"
                            placeholder="Search by student name, email, phone, eircode..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full pl-8 pr-3 py-1.5 bg-surface-elevated border border-border-strong rounded-xl text-xs focus:outline-none focus:border-brand-500 text-primary"
                        />
                    </div>

                    <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-subtle px-3 py-1.5 rounded-xl text-xs shadow-sm">
                        <MapPin size={13} className="text-muted flex-shrink-0" />
                        <select
                            value={districtFilter}
                            onChange={(e) => {
                                setDistrictFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="bg-transparent border-none text-primary font-medium focus:ring-0 cursor-pointer outline-none max-w-[160px] truncate"
                        >
                            <option value="all">All Districts</option>
                            {availableDistricts.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* 4. Interactive Table */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
                {paginatedProfiles.length === 0 ? (
                    <div className="text-center py-16 px-4 space-y-2">
                        <GraduationCap size={36} className="mx-auto text-muted/50" />
                        <p className="text-sm font-bold text-primary">No graduates match this combination</p>
                        <p className="text-xs text-muted max-w-sm mx-auto">
                            {selectedCourseIds.length > 0 && matchMode === 'all'
                                ? 'No student has completed all of the selected courses together. Try switching to "Completed ANY (OR)" mode or selecting different courses.'
                                : 'Try changing your search keywords or district filter.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-border-subtle bg-surface-elevated/50 font-bold text-muted uppercase tracking-wider text-[10px]">
                                    <th className="py-3 px-4">Student</th>
                                    <th className="py-3 px-4">Contact</th>
                                    <th className="py-3 px-4">District / Area</th>
                                    <th className="py-3 px-4">Completed Selected Courses</th>
                                    <th className="py-3 px-4 text-center">Total Completed</th>
                                    <th className="py-3 px-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle/50">
                                {paginatedProfiles.map(profile => {
                                    return (
                                        <tr 
                                            key={profile.studentId}
                                            className="hover:bg-surface-elevated/40 transition-colors group"
                                        >
                                            {/* Student Identity */}
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm bg-gradient-to-tr ${getAvatarGradient(profile.fullName)} flex-shrink-0`}>
                                                        {profile.firstName ? profile.firstName[0] : 'S'}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-primary group-hover:text-brand-500 transition-colors">
                                                            {profile.fullName}
                                                        </p>
                                                        {profile.eircode && (
                                                            <span className="text-[10px] font-mono text-muted">
                                                                {profile.eircode}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Contact */}
                                            <td className="py-3 px-4">
                                                <div className="space-y-0.5">
                                                    <p className="text-primary truncate max-w-[180px]" title={profile.email}>
                                                        {profile.email || '—'}
                                                    </p>
                                                    <p className="text-muted font-mono text-[11px]">
                                                        {profile.phone || '—'}
                                                    </p>
                                                </div>
                                            </td>

                                            {/* District */}
                                            <td className="py-3 px-4">
                                                <div>
                                                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-elevated border border-border-subtle text-primary">
                                                        {profile.district}
                                                    </span>
                                                    {profile.address && (
                                                        <p className="text-[10px] text-muted truncate max-w-[160px] mt-0.5" title={profile.address}>
                                                            {profile.address}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Completed Courses Detail */}
                                            <td className="py-3 px-4">
                                                <div className="flex flex-wrap gap-1.5 max-w-md">
                                                    {Array.from(profile.completedCourses.values()).map(course => {
                                                        const isSelectedMatch = selectedCourseIds.includes(course.courseId);
                                                        const dateStr = course.completedDate ? formatDateDMY(course.completedDate) : 'Completed';
                                                        
                                                        return (
                                                            <div
                                                                key={course.courseId}
                                                                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium border ${
                                                                    isSelectedMatch
                                                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                                                        : 'bg-surface-elevated text-muted border-border-subtle'
                                                                }`}
                                                            >
                                                                <CheckCircle2 size={11} className={isSelectedMatch ? 'text-emerald-500' : 'text-muted'} />
                                                                <span className="font-semibold text-primary">{course.courseName}</span>
                                                                {course.variant && course.variant !== 'Default' && (
                                                                    <span className="text-[9px] opacity-75 font-mono">({course.variant})</span>
                                                                )}
                                                                <span className="text-[9px] opacity-60 font-mono ml-0.5">{dateStr}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>

                                            {/* Total Completed Badge */}
                                            <td className="py-3 px-4 text-center">
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full font-bold font-mono text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                                    {profile.completedCount}
                                                </span>
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    onClick={() => profile.student && onOpenStudent(profile.student)}
                                                    disabled={!profile.student}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 transition-colors"
                                                >
                                                    <span>View</span>
                                                    <ExternalLink size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-border-subtle flex items-center justify-between text-xs text-muted">
                        <div>
                            Showing <span className="font-semibold text-primary">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                            <span className="font-semibold text-primary">{Math.min(currentPage * itemsPerPage, filteredProfiles.length)}</span> of{' '}
                            <span className="font-semibold text-primary">{filteredProfiles.length}</span> graduates
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-border-subtle hover:bg-surface-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="px-2 font-mono text-xs text-primary font-bold">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-border-subtle hover:bg-surface-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

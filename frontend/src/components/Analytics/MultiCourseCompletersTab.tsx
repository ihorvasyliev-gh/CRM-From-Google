import { useState, useMemo, useCallback } from 'react';
import { 
    Copy, 
    Check, 
    ExternalLink, 
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
import Card, { SectionHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import StatTile from '../ui/StatTile';
import { Button } from '../ui/Button';
import SearchInput from '../ui/SearchInput';
import Pagination from '../ui/Pagination';
import { Segmented } from '../ui/Tabs';
import { EmptyState } from '../ui/States';
import { SelectField } from '../Viewer/ViewerUI';
import { tableWrapCls, tableCls, theadCls, thCls, tbodyCls, trCls, tdCls } from '../ui/styles';
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
        <div className="space-y-5 animate-fadeIn">
            <SectionHeader
                icon={Award}
                tone="completed"
                title="Multi-course completers"
                description="Find graduates who completed a specific combination of courses (e.g. Safe Pass and Security)"
                actions={
                    <>
                        <Button variant="brand-soft" onClick={handleSelectSecurityAndSafePass} title="Quick select Security + Safe Pass combination">
                            <Sparkles size={13} />
                            Security + Safe Pass
                        </Button>
                        <Button
                            variant={useAllTimeData ? 'secondary' : 'brand-soft'}
                            onClick={() => setUseAllTimeData(!useAllTimeData)}
                            title="Toggle between all-time CRM records or the global date filter"
                        >
                            <Calendar size={13} />
                            {useAllTimeData ? 'All-time records' : 'Using date filter'}
                        </Button>
                    </>
                }
            />

            {/* Course selection */}
            <Card
                title="Courses"
                icon={CheckCircle2}
                subtitle={`${selectedCourseIds.length} selected · ${availableCourses.length} with graduates`}
                action={
                    <div className="flex items-center gap-2">
                        {selectedCourseIds.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={handleClearCourses}>
                                <X size={13} /> Clear
                            </Button>
                        )}
                        <Segmented<'all' | 'any'>
                            ariaLabel="Match mode"
                            value={matchMode}
                            onChange={v => { setMatchMode(v); setCurrentPage(1); }}
                            options={[
                                { value: 'all', label: 'Completed all', title: 'Candidates must have completed ALL selected courses' },
                                { value: 'any', label: 'Completed any', title: 'Candidates who completed AT LEAST ONE selected course' },
                            ]}
                        />
                    </div>
                }
            >
                {availableCourses.length > 8 && (
                    <SearchInput
                        value={courseSearch}
                        onChange={setCourseSearch}
                        placeholder="Filter courses…"
                        aria-label="Filter courses"
                        wrapperClassName="max-w-xs mb-3"
                    />
                )}
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                    {displayedCourses.map(course => {
                        const isSelected = selectedCourseIds.includes(course.id);
                        return (
                            <button
                                key={course.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggleCourse(course.id)}
                                className={`flex items-center gap-2 h-8 pl-2 pr-2.5 rounded-lg text-xs font-medium border transition-colors ${
                                    isSelected
                                        ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40'
                                        : 'bg-surface text-primary border-border-subtle hover:border-border-strong hover:bg-surface-elevated'
                                }`}
                            >
                                <span className={`w-4 h-4 rounded-sm flex items-center justify-center border transition-colors ${
                                    isSelected ? 'bg-brand-500 border-brand-500 text-white' : 'border-border-strong bg-surface'
                                }`}>
                                    {isSelected && <Check size={11} strokeWidth={3} />}
                                </span>
                                <span className="font-semibold">{course.name}</span>
                                <span className="text-[10px] tabular-nums text-muted">{course.completedStudentsCount}</span>
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <StatTile
                    label="Matching graduates"
                    icon={GraduationCap}
                    tone="success"
                    value={stats.totalMatching}
                    hint={selectedCourseIds.length === 0
                        ? 'Students with 2+ completed courses'
                        : (matchMode === 'all' ? `Completed all ${selectedCourseIds.length} courses` : `Completed at least 1 of ${selectedCourseIds.length}`)}
                />
                <StatTile label="Share of graduates" icon={Users} tone="brand" value={`${stats.percentage}%`} hint={`Of ${studentProfiles.length} graduates in CRM`} />
                <StatTile label="Top district" icon={MapPin} tone="info" value={<span className="text-lg">{stats.topDistrict}</span>} hint="Leading area for this combination" />
            </div>

            {/* Roster */}
            <Card
                title="Graduate roster"
                icon={Users}
                subtitle={`${filteredProfiles.length} graduates`}
                divided
                flush
                className="overflow-hidden"
                action={
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={handleCopyEmails} disabled={filteredProfiles.length === 0}>
                            {copied ? <Check size={13} className="text-status-confirmed" /> : <Copy size={13} />}
                            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy emails'}</span>
                        </Button>
                        <Button variant="success" size="sm" onClick={handleExportExcel} loading={isExporting} disabled={filteredProfiles.length === 0}>
                            {!isExporting && <FileSpreadsheet size={13} />}
                            <span className="hidden sm:inline">{isExporting ? 'Generating…' : 'Export Excel'}</span>
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-wrap items-center gap-2 p-3 sm:p-3.5 border-b border-border-subtle">
                    <SearchInput
                        value={searchQuery}
                        onChange={v => {
                            setSearchQuery(v);
                            setCurrentPage(1);
                        }}
                        placeholder="Search name, email, phone, eircode…"
                        aria-label="Search graduates"
                        wrapperClassName="flex-1 min-w-[220px]"
                    />
                    <SelectField
                        label="District"
                        icon={<MapPin size={14} />}
                        value={districtFilter}
                        onChange={v => {
                            setDistrictFilter(v);
                            setCurrentPage(1);
                        }}
                        className="w-full sm:w-52"
                    >
                        <option value="all">All districts</option>
                        {availableDistricts.map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </SelectField>
                </div>

                {paginatedProfiles.length === 0 ? (
                    <EmptyState
                        bare
                        icon={<GraduationCap size={22} />}
                        title="No graduates match this combination"
                        description={selectedCourseIds.length > 0 && matchMode === 'all'
                            ? 'No student has completed all of the selected courses. Try "Completed any" or pick different courses.'
                            : 'Try changing your search keywords or district filter.'}
                    />
                ) : (
                    <div className={tableWrapCls}>
                        <table className={tableCls}>
                            <thead className={theadCls}>
                                <tr>
                                    <th className={thCls}>Student</th>
                                    <th className={thCls}>Contact</th>
                                    <th className={thCls}>District</th>
                                    <th className={thCls}>Completed courses</th>
                                    <th className={`${thCls} text-right`}>Total</th>
                                    <th className={thCls}><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className={tbodyCls}>
                                {paginatedProfiles.map(profile => (
                                    <tr key={profile.studentId} className={`${trCls} group`}>
                                        <td className={tdCls}>
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[11px] bg-linear-to-br ${getAvatarGradient(profile.fullName)} shrink-0`}>
                                                    {profile.firstName ? profile.firstName[0] : 'S'}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-semibold text-primary truncate">{profile.fullName}</p>
                                                    {profile.eircode && <span className="text-[11px] text-muted">{profile.eircode}</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className={tdCls}>
                                            <p className="text-xs text-primary truncate max-w-[200px]" title={profile.email}>{profile.email || '—'}</p>
                                            <p className="text-[11px] text-muted tabular-nums">{profile.phone || '—'}</p>
                                        </td>
                                        <td className={tdCls}>
                                            <Badge>{profile.district}</Badge>
                                            {profile.address && (
                                                <p className="text-[11px] text-muted truncate max-w-[180px] mt-1" title={profile.address}>{profile.address}</p>
                                            )}
                                        </td>
                                        <td className={tdCls}>
                                            <div className="flex flex-wrap gap-1.5 max-w-md">
                                                {Array.from(profile.completedCourses.values()).map(course => {
                                                    const isSelectedMatch = selectedCourseIds.includes(course.courseId);
                                                    const dateStr = course.completedDate ? formatDateDMY(course.completedDate) : 'Completed';
                                                    return (
                                                        <span
                                                            key={course.courseId}
                                                            className={`inline-flex items-center gap-1.5 px-2 h-6 rounded-md text-[11px] border ${
                                                                isSelectedMatch ? 'bg-success/10 border-success/30' : 'bg-surface-elevated border-border-subtle'
                                                            }`}
                                                        >
                                                            <CheckCircle2 size={11} className={isSelectedMatch ? 'text-status-confirmed' : 'text-muted'} />
                                                            <span className="font-semibold text-primary">{course.courseName}</span>
                                                            {course.variant && course.variant !== 'Default' && (
                                                                <span className="text-muted">({course.variant})</span>
                                                            )}
                                                            <span className="text-muted tabular-nums">{dateStr}</span>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className={`${tdCls} text-right`}>
                                            <Badge tone="completed" shape="pill" className="tabular-nums">{profile.completedCount}</Badge>
                                        </td>
                                        <td className={`${tdCls} text-right`}>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => profile.student && onOpenStudent(profile.student)}
                                                disabled={!profile.student}
                                                className="text-brand-600 dark:text-brand-400"
                                            >
                                                View
                                                <ExternalLink size={12} />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination
                    page={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredProfiles.length}
                    pageSize={itemsPerPage}
                    onPageChange={setCurrentPage}
                    itemLabel="graduates"
                />
            </Card>
        </div>
    );
}

import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant, Student } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';
import { normalizeCorkAddress } from './analyticsUtils';
import { darkHeader, downloadXlsx, valueCells, type Row } from '../../lib/excelExport';

export interface AvailableCourseSummary {
    id: string;
    name: string;
    completedStudentsCount: number;
}

export interface CompletedCourseRecord {
    courseId: string;
    courseName: string;
    variant: string;
    completedDate: string | null;
    rawEnrollment: EnrollmentWithRelations;
}

export interface StudentMultiCourseProfile {
    studentId: string;
    student: Student | null;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    address: string;
    eircode: string;
    district: string;
    macroRegion: string;
    completedCourses: Map<string, CompletedCourseRecord>;
    completedCount: number;
    matchedCoursesCount: number;
    hasAllSelected: boolean;
}

export interface MultiCourseFilterOptions {
    selectedCourseIds: string[];
    matchMode: 'all' | 'any';
    searchQuery?: string;
    districtFilter?: string;
}

/**
 * Extracts all unique courses from enrollments that have at least one completed student,
 * along with the count of distinct students who completed each course.
 */
export function extractAvailableCompletedCourses(enrollments: EnrollmentWithRelations[]): AvailableCourseSummary[] {
    const courseMap = new Map<string, { name: string; studentIds: Set<string> }>();

    enrollments.forEach(e => {
        if (e.status !== 'completed') return;
        const courseId = e.course_id || e.courses?.id;
        const studentId = e.student_id || e.students?.id;
        if (!courseId || !studentId) return;

        const courseName = e.courses?.name || 'Unknown Course';
        if (!courseMap.has(courseId)) {
            courseMap.set(courseId, { name: courseName, studentIds: new Set() });
        }

        courseMap.get(courseId)!.studentIds.add(studentId);
    });

    return Array.from(courseMap.entries())
        .map(([id, data]) => ({
            id,
            name: data.name,
            completedStudentsCount: data.studentIds.size
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Aggregates all completed enrollments by student, normalizing their address/district
 * and indexing their completed courses.
 */
export function buildStudentMultiCourseProfiles(enrollments: EnrollmentWithRelations[]): StudentMultiCourseProfile[] {
    const studentMap = new Map<string, {
        student: Student | null;
        completedCourses: Map<string, CompletedCourseRecord>;
    }>();

    enrollments.forEach(e => {
        if (e.status !== 'completed') return;
        const studentId = e.student_id || e.students?.id;
        const courseId = e.course_id || e.courses?.id;
        if (!studentId || !courseId) return;

        if (!studentMap.has(studentId)) {
            studentMap.set(studentId, {
                student: e.students || null,
                completedCourses: new Map()
            });
        }

        const entry = studentMap.get(studentId)!;
        if (!entry.student && e.students) {
            entry.student = e.students;
        }

        const courseName = e.courses?.name || 'Unknown Course';
        const variant = cleanVariant(courseName, e.course_variant);
        const completedDate = e.completed_date || e.confirmed_date || e.created_at || null;

        // If student took the course multiple times, keep the latest completion
        if (!entry.completedCourses.has(courseId)) {
            entry.completedCourses.set(courseId, {
                courseId,
                courseName,
                variant,
                completedDate,
                rawEnrollment: e
            });
        }
    });

    return Array.from(studentMap.entries()).map(([studentId, entry]) => {
        const s = entry.student;
        const norm = normalizeCorkAddress(s?.address || null, s?.eircode || null);
        const firstName = s?.first_name || '';
        const lastName = s?.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim() || 'Unknown Student';

        return {
            studentId,
            student: s,
            firstName,
            lastName,
            fullName,
            email: s?.email || '',
            phone: s?.phone || '',
            address: s?.address || '',
            eircode: s?.eircode || '',
            district: norm.microDistrict,
            macroRegion: norm.macroRegion,
            completedCourses: entry.completedCourses,
            completedCount: entry.completedCourses.size,
            matchedCoursesCount: 0,
            hasAllSelected: false
        };
    });
}

/**
 * Filters and sorts multi-course profiles according to selected courses, match mode,
 * search query, and district.
 */
export function filterMultiCourseProfiles(
    profiles: StudentMultiCourseProfile[],
    options: MultiCourseFilterOptions
): StudentMultiCourseProfile[] {
    const { selectedCourseIds, matchMode, searchQuery, districtFilter } = options;
    const cleanSearch = (searchQuery || '').trim().toLowerCase();

    return profiles
        .map(profile => {
            let matchedCount = 0;
            if (selectedCourseIds.length > 0) {
                selectedCourseIds.forEach(id => {
                    if (profile.completedCourses.has(id)) {
                        matchedCount++;
                    }
                });
            }

            const hasAll = selectedCourseIds.length > 0 && matchedCount === selectedCourseIds.length;

            return {
                ...profile,
                matchedCoursesCount: matchedCount,
                hasAllSelected: hasAll
            };
        })
        .filter(profile => {
            // Course intersection / union filter
            if (selectedCourseIds.length > 0) {
                if (matchMode === 'all') {
                    if (!profile.hasAllSelected) return false;
                } else {
                    if (profile.matchedCoursesCount === 0) return false;
                }
            } else {
                // If no specific courses selected, default to students who have completed >= 2 courses
                if (profile.completedCount < 2) return false;
            }

            // District filter
            if (districtFilter && districtFilter !== 'all') {
                if (profile.district !== districtFilter) return false;
            }

            // Search query filter
            if (cleanSearch) {
                const matchText = 
                    profile.fullName.toLowerCase().includes(cleanSearch) ||
                    profile.email.toLowerCase().includes(cleanSearch) ||
                    profile.phone.toLowerCase().includes(cleanSearch) ||
                    profile.district.toLowerCase().includes(cleanSearch) ||
                    profile.address.toLowerCase().includes(cleanSearch) ||
                    profile.eircode.toLowerCase().includes(cleanSearch) ||
                    Array.from(profile.completedCourses.values()).some(c => c.courseName.toLowerCase().includes(cleanSearch));

                if (!matchText) return false;
            }

            return true;
        })
        .sort((a, b) => {
            if (selectedCourseIds.length > 0 && matchMode === 'any') {
                // In ANY mode, sort by highest match count first
                if (b.matchedCoursesCount !== a.matchedCoursesCount) {
                    return b.matchedCoursesCount - a.matchedCoursesCount;
                }
            }
            // Secondary sort: Total completed courses count descending
            if (b.completedCount !== a.completedCount) {
                return b.completedCount - a.completedCount;
            }
            // Alphabetical by full name
            return a.fullName.localeCompare(b.fullName);
        });
}

/**
 * Generates and downloads a rich Excel (.xlsx) workbook for the filtered multi-course completers
 */
export async function exportMultiCourseExcelReport(
    profiles: StudentMultiCourseProfile[],
    selectedCourses: { id: string; name: string }[],
    matchMode: 'all' | 'any'
) {
    const courseNamesStr = selectedCourses.length > 0
        ? selectedCourses.map(c => c.name).join(matchMode === 'all' ? ' + ' : ' / ')
        : 'All Students with >= 2 Completed Courses';
    const modeLabel = matchMode === 'all' ? 'Completed ALL Selected (AND)' : 'Completed ANY Selected (OR)';

    // Column definitions: the base columns, one per selected course, then all courses
    const columns: [header: string, width: number][] = [
        ['First Name', 16],
        ['Last Name', 16],
        ['Email', 28],
        ['Phone', 18],
        ['District', 22],
        ['Macro Region', 20],
        ['Address', 30],
        ['Eircode', 12],
        ['Total Completed', 16],
        ...selectedCourses.map((c): [string, number] => [`${c.name} (Date & Variant)`, 24]),
        ['All Completed Courses', 40],
    ];

    const dataRows: Row[] = profiles.map((profile, idx) => {
        const courseCells = selectedCourses.map(c => {
            const rec = profile.completedCourses.get(c.id);
            if (!rec) return '—';
            const dateStr = rec.completedDate ? formatDateDMY(rec.completedDate) : 'Completed';
            return rec.variant && rec.variant !== 'Default' ? `${dateStr} (${rec.variant})` : dateStr;
        });
        const values = [
            profile.firstName,
            profile.lastName,
            profile.email,
            profile.phone,
            profile.district,
            profile.macroRegion,
            profile.address,
            profile.eircode,
            profile.completedCount,
            ...courseCells,
            Array.from(profile.completedCourses.values()).map(c => c.courseName).join(', '),
        ];
        // Subtle zebra striping
        return valueCells(values, idx % 2 === 1 ? { backgroundColor: '#F8FAFC' } : {});
    });

    // Title & context block above the header row (row 5)
    const rows: Row[] = [
        [{ value: 'CRM Cross-Course Graduates Report', fontWeight: 'bold', fontSize: 16, textColor: '#0F172A' }],
        [{ value: `Criteria: ${courseNamesStr} [${modeLabel}]`, fontWeight: 'bold', textColor: '#2563EB' }],
        [{ value: `Generated: ${new Date().toLocaleString('en-IE')} | Total Matching Graduates: ${profiles.length}`, fontStyle: 'italic', fontSize: 9, textColor: '#64748B' }],
        [],
        darkHeader(columns.map(([header]) => header), 25),
        ...dataRows,
    ];

    const safeFilenamePrefix = selectedCourses.length > 0
        ? selectedCourses.map(c => c.name.replace(/[^a-zA-Z0-9]/g, '_')).slice(0, 3).join('_AND_')
        : 'multi_course_graduates';

    await downloadXlsx(
        [{ name: 'Multi-Course Graduates', rows, widths: columns.map(([, width]) => width) }],
        `CRM_Graduates_${safeFilenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
}

import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant, Student } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';
import { normalizeCorkAddress } from './analyticsUtils';
import { downloadBlob } from '../../lib/download';

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
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CRM System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Multi-Course Graduates');

    // Title & Context block
    sheet.getCell('A1').value = 'CRM Cross-Course Graduates Report';
    sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0F172A' } };

    const courseNamesStr = selectedCourses.length > 0 
        ? selectedCourses.map(c => c.name).join(matchMode === 'all' ? ' + ' : ' / ')
        : 'All Students with >= 2 Completed Courses';

    const modeLabel = matchMode === 'all' ? 'Completed ALL Selected (AND)' : 'Completed ANY Selected (OR)';
    sheet.getCell('A2').value = `Criteria: ${courseNamesStr} [${modeLabel}]`;
    sheet.getCell('A2').font = { bold: true, size: 11, color: { argb: 'FF2563EB' } };

    sheet.getCell('A3').value = `Generated: ${new Date().toLocaleString('en-IE')} | Total Matching Graduates: ${profiles.length}`;
    sheet.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

    // Column definitions
    const baseColumns = [
        { header: 'First Name', key: 'firstName', width: 16 },
        { header: 'Last Name', key: 'lastName', width: 16 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Phone', key: 'phone', width: 18 },
        { header: 'District', key: 'district', width: 22 },
        { header: 'Macro Region', key: 'macroRegion', width: 20 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'Eircode', key: 'eircode', width: 12 },
        { header: 'Total Completed', key: 'totalCompleted', width: 16 }
    ];

    // Add specific columns for each selected course
    const courseColumns = selectedCourses.map(c => ({
        header: `${c.name} (Date)`,
        key: `course_${c.id}`,
        width: 24
    }));

    const allCoursesCol = { header: 'All Completed Courses', key: 'allCourses', width: 40 };

    sheet.columns = [...baseColumns, ...courseColumns, allCoursesCol];

    // Shift header row down to row 5 to leave room for the title block
    const headerRowNumber = 5;
    const headerRow = sheet.getRow(headerRowNumber);
    const headersList = [
        'First Name',
        'Last Name',
        'Email',
        'Phone',
        'District',
        'Macro Region',
        'Address',
        'Eircode',
        'Total Completed',
        ...selectedCourses.map(c => `${c.name} (Date & Variant)`),
        'All Completed Courses'
    ];

    headersList.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    });
    headerRow.height = 25;

    // Populate data rows
    profiles.forEach((profile, idx) => {
        const rowData: any = {
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            phone: profile.phone,
            district: profile.district,
            macroRegion: profile.macroRegion,
            address: profile.address,
            eircode: profile.eircode,
            totalCompleted: profile.completedCount
        };

        selectedCourses.forEach(c => {
            const rec = profile.completedCourses.get(c.id);
            if (rec) {
                const dateStr = rec.completedDate ? formatDateDMY(rec.completedDate) : 'Completed';
                rowData[`course_${c.id}`] = rec.variant && rec.variant !== 'Default' 
                    ? `${dateStr} (${rec.variant})` 
                    : dateStr;
            } else {
                rowData[`course_${c.id}`] = '—';
            }
        });

        rowData.allCourses = Array.from(profile.completedCourses.values())
            .map(c => c.courseName)
            .join(', ');

        const addedRow = sheet.addRow(rowData);
        
        // Subtle zebra striping
        if (idx % 2 === 1) {
            addedRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8FAFC' }
            };
        }
    });

    // Save & trigger download
    const safeFilenamePrefix = selectedCourses.length > 0
        ? selectedCourses.map(c => c.name.replace(/[^a-zA-Z0-9]/g, '_')).slice(0, 3).join('_AND_')
        : 'multi_course_graduates';

    const filename = `CRM_Graduates_${safeFilenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, filename);
}

import { downloadXlsx, styledTable } from '../../lib/excelExport';
import { formatDateDMY, todayISO } from '../../lib/dateUtils';
import { formatPhoneDisplay } from '../../lib/contactUtils';
import { cleanVariant, type Student } from '../../lib/types';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

export const STUDENT_EXPORT_HEADERS = ['First name', 'Last name', 'Email', 'Phone', 'Address', 'Eircode', 'Date of birth', 'Added', 'Courses'];

/** "ECDL (Ukrainian) – Confirmed; Barista – Requested" */
function coursesText(enrollments: EnrollmentRow[] | undefined): string {
    return (enrollments ?? []).map(e => {
        const name = e.courses?.name ?? 'Course';
        const language = e.course_variant ? cleanVariant(name, e.course_variant) : '';
        const status = STATUS_CONFIG[e.status]?.label ?? e.status;
        return `${name}${language && language !== 'English' ? ` (${language})` : ''} – ${status}`;
    }).join('; ');
}

/** The rows of the export, one per student, in the order given */
export function studentExportRows(students: Student[], enrollmentsOf: (id: string) => EnrollmentRow[] | undefined): string[][] {
    return students.map(s => [
        s.first_name || '',
        s.last_name || '',
        s.email || '',
        s.phone ? formatPhoneDisplay(s.phone) : '',
        s.address || '',
        s.eircode || '',
        s.dob ? formatDateDMY(s.dob) : '',
        s.created_at ? formatDateDMY(s.created_at) : '',
        coursesText(enrollmentsOf(s.id)),
    ]);
}

/** Downloads the chosen students as an Excel workbook */
export async function exportStudentsToExcel(students: Student[], enrollmentsOf: (id: string) => EnrollmentRow[] | undefined): Promise<void> {
    await downloadXlsx(
        [styledTable('Students', STUDENT_EXPORT_HEADERS, studentExportRows(students, enrollmentsOf), { filter: true })],
        `Students ${todayISO()}.xlsx`,
    );
}

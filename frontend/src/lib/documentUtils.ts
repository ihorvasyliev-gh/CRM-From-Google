import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { supabase } from './supabase';

export interface Student {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string | null;
    eircode: string | null;
    dob: string | null;
}

export interface Course {
    id: string;
    name: string;
}

export interface Enrollment {
    id: string;
    student_id: string;
    course_id: string;
    status: string;
    course_variant: string | null;
    notes: string | null;
    confirmed_date: string | null;
    invited_date: string | null;
    created_at: string;
    students: Student | null;
    courses: Course | null;
}

export function formatDateDMY(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateLong(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function buildPlaceholderData(enrollment: Enrollment): Record<string, string> {
    const s = enrollment.students;
    const c = enrollment.courses;

    return {
        userId: s?.id || '',
        firstName: s?.first_name || '',
        lastName: s?.last_name || '',
        fullName: [s?.first_name, s?.last_name].filter(Boolean).join(' '),
        email: s?.email || '',
        mobileNumber: s?.phone || '',
        address: s?.address || '',
        eircode: s?.eircode || '',
        dateOfBirth: formatDateLong(s?.dob),
        courseId: c?.id || '',
        courseTitle: c?.name || '',
        courseVariant: enrollment.course_variant || '',
        registeredAt: formatDateDMY(enrollment.created_at),
        courseRegistrationDate: formatDateLong(enrollment.created_at),
        isCompleted: enrollment.status === 'completed' ? 'Yes' : 'No',
        completedAt: enrollment.status === 'completed' ? formatDateLong(enrollment.confirmed_date) : '',
        isInvited: enrollment.invited_date ? 'Yes' : 'No',
        invitedAt: formatDateLong(enrollment.invited_date),
        confirmedDate: formatDateLong(enrollment.confirmed_date),
        courseDate: formatDateLong(enrollment.invited_date),
        enrollmentStatus: enrollment.status?.charAt(0).toUpperCase() + enrollment.status?.slice(1) || '',
        enrollmentNotes: enrollment.notes || '',
    };
}

export async function generateDocumentsArchive(
    enrollments: Enrollment[],
    templateStoragePath: string,
    archiveName: string
): Promise<void> {
    // 1. Download template from storage
    const { data: templateData, error: downloadError } = await supabase.storage
        .from('templates')
        .download(templateStoragePath);

    if (downloadError || !templateData) throw downloadError || new Error('Failed to download template');

    const templateBuffer = await templateData.arrayBuffer();

    // 2. Generate a document for each participant
    const zip = new JSZip();

    for (const enrollment of enrollments) {
        const student = enrollment.students;
        if (!student) continue;

        try {
            const pizZip = new PizZip(templateBuffer);
            const doc = new Docxtemplater(pizZip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: '{', end: '}' },
            });

            const data = buildPlaceholderData(enrollment);
            doc.render(data);

            const generatedDoc = doc.getZip().generate({ type: 'arraybuffer' });
            const fileName = `${student.first_name || 'Unknown'}_${student.last_name || 'Unknown'}.docx`
                .replace(/[^a-zA-Z0-9_.\-\s]/g, '')
                .replace(/\s+/g, '_');

            zip.file(fileName, generatedDoc);
        } catch (docErr) {
            console.error(`Error generating doc for ${student.first_name} ${student.last_name}:`, docErr);
        }
    }

    // 3. Download ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, archiveName);
}

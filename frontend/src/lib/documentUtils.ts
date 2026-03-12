import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { supabase } from './supabase';
import { Student, Course, Enrollment } from './types';
import { formatDateDMY, formatDateLong } from './dateUtils';

/** Enrollment with joined student and course data (from Supabase select with joins). */
export interface EnrollmentWithRelations extends Enrollment {
    students: Student | null;
    courses: Course | null;
}

/** Descriptor for a template to be rendered. */
export interface TemplateDescriptor {
    name: string;
    storagePath: string;
}

export function buildPlaceholderData(enrollment: EnrollmentWithRelations): Record<string, string> {
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
        completedAt: enrollment.completed_date ? formatDateLong(enrollment.completed_date) : (enrollment.status === 'completed' ? formatDateLong(enrollment.confirmed_date) : ''),
        isInvited: enrollment.invited_date ? 'Yes' : 'No',
        invitedAt: formatDateLong(enrollment.invited_date),
        confirmedDate: formatDateLong(enrollment.confirmed_date),
        courseDate: formatDateLong(enrollment.invited_date),
        enrollmentStatus: enrollment.status?.charAt(0).toUpperCase() + enrollment.status?.slice(1) || '',
        enrollmentNotes: enrollment.notes || '',
    };
}

export async function generateDocumentsArchive(
    enrollments: EnrollmentWithRelations[],
    templates: TemplateDescriptor[],
    archiveName: string,
    attendanceTemplateStoragePath?: string
): Promise<void> {
    const zip = new JSZip();
    const useSubfolders = templates.length > 1;

    // Generate documents for each template
    for (const tpl of templates) {
        const { data: templateData, error: downloadError } = await supabase.storage
            .from('templates')
            .download(tpl.storagePath);

        if (downloadError || !templateData) {
            console.error(`Failed to download template "${tpl.name}":`, downloadError);
            continue;
        }

        const templateBuffer = await templateData.arrayBuffer();
        // Derive a folder name from the template file name (without .docx extension)
        const folderName = tpl.name.replace(/\.docx$/i, '').replace(/[^a-zA-Z0-9_.\-\s]/g, '').replace(/\s+/g, '_');

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

                const filePath = useSubfolders ? `${folderName}/${fileName}` : fileName;
                zip.file(filePath, generatedDoc);
            } catch (docErr) {
                console.error(`Error generating doc for ${student.first_name} ${student.last_name} (template: ${tpl.name}):`, docErr);
            }
        }
    }

    // Generate Attendance Sheet (if template provided and enrollments exist)
    if (attendanceTemplateStoragePath && enrollments.length > 0) {
        try {
            const { data: attTemplateData, error: attDownloadError } = await supabase.storage
                .from('templates')
                .download(attendanceTemplateStoragePath);

            if (attDownloadError || !attTemplateData) {
                console.error('Failed to download attendance template:', attDownloadError);
            } else {
                const attTemplateBuffer = await attTemplateData.arrayBuffer();
                const attPizZip = new PizZip(attTemplateBuffer);
                const attDoc = new Docxtemplater(attPizZip, {
                    paragraphLoop: true,
                    linebreaks: true,
                    delimiters: { start: '{', end: '}' },
                });

                // Build flat data for 34 slots
                const attData: Record<string, string> = {};

                // Get course info from the first enrollment
                const firstC = enrollments[0]?.courses;
                attData['courseTitle'] = firstC?.name || '';
                attData['courseDate'] = formatDateLong(enrollments[0]?.invited_date) || '';
                attData['venue'] = ''; // Or add venue to course if needed

                // Fill up to 34 variables
                for (let i = 0; i < 34; i++) {
                    const idx = i + 1;
                    const student = enrollments[i]?.students;

                    if (student) {
                        attData[`firstName${idx}`] = student.first_name || '';
                        attData[`lastName${idx}`] = student.last_name || '';
                        attData[`fullName${idx}`] = [student.first_name, student.last_name].filter(Boolean).join(' ');
                        attData[`phone${idx}`] = student.phone || '';
                        attData[`email${idx}`] = student.email || '';
                    } else {
                        attData[`firstName${idx}`] = '';
                        attData[`lastName${idx}`] = '';
                        attData[`fullName${idx}`] = '';
                        attData[`phone${idx}`] = '';
                        attData[`email${idx}`] = '';
                    }
                }

                attDoc.render(attData);
                const generatedAttDoc = attDoc.getZip().generate({ type: 'arraybuffer' });
                zip.file('Attendance_Sheet.docx', generatedAttDoc);
            }
        } catch (attErr) {
            console.error('Error generating attendance sheet:', attErr);
        }
    }

    // Download ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, archiveName);
}

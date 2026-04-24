// Document generation libraries are imported dynamically in generateDocumentsArchive
// to reduce the main bundle size and improve initial load time.
import { supabase } from './supabase';
import { Student, Course, Enrollment, cleanVariant } from './types';
import { formatDateDMY, formatDateLong } from './dateUtils';
import type { ExcelColumn } from './appConfig';

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
        courseVariant: cleanVariant(c?.name || '', enrollment.course_variant),
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

/** Result of a document generation run. */
export interface GenerationResult {
    totalTemplates: number;
    successTemplates: string[];
    failedTemplates: { name: string; error: string }[];
    totalDocs: number;
    failedDocs: { student: string; template: string; error: string }[];
    attendanceOk: boolean;
    attendanceError?: string;
    labelsOk: boolean;
    labelsError?: string;
}

export async function generateDocumentsArchive(
    enrollments: EnrollmentWithRelations[],
    templates: TemplateDescriptor[],
    archiveName: string,
    attendanceTemplateStoragePath?: string,
    customVariables?: Record<string, string>,
    labelTemplateStoragePath?: string,
    excelColumns?: ExcelColumn[]
): Promise<GenerationResult> {
    // Dynamically import heavy libraries for document generation
    const JSZipModule = await import('jszip');
    const JSZip = JSZipModule.default || JSZipModule;
    
    const PizZipModule = await import('pizzip');
    const PizZip = PizZipModule.default || PizZipModule;
    
    const DocxtemplaterModule = await import('docxtemplater');
    const Docxtemplater = DocxtemplaterModule.default || DocxtemplaterModule;
    
    const FileSaverModule = await import('file-saver');
    const saveAs = FileSaverModule.saveAs || (FileSaverModule.default && FileSaverModule.default.saveAs);
    
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;

    const zip = new JSZip();
    const useSubfolders = templates.length > 1;

    const result: GenerationResult = {
        totalTemplates: templates.length,
        successTemplates: [],
        failedTemplates: [],
        totalDocs: 0,
        failedDocs: [],
        attendanceOk: true,
        labelsOk: true,
    };

    // Generate documents for each template
    for (const tpl of templates) {
        const { data: templateData, error: downloadError } = await supabase.storage
            .from('templates')
            .download(tpl.storagePath);

        if (downloadError || !templateData) {
            const errMsg = downloadError?.message || 'File not found in storage';
            console.error(`Failed to download template "${tpl.name}":`, downloadError);
            result.failedTemplates.push({ name: tpl.name, error: `Download failed: ${errMsg}` });
            continue;
        }

        const templateBuffer = await templateData.arrayBuffer();
        // Derive a folder name from the template file name (without .docx extension)
        const folderName = tpl.name.replace(/\.docx$/i, '').replace(/[^a-zA-Z0-9_.\-\s]/g, '').replace(/\s+/g, '_');

        let templateSuccess = true;

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

                const data = { ...buildPlaceholderData(enrollment), ...customVariables };
                doc.render(data);

                const generatedDoc = doc.getZip().generate({ type: 'arraybuffer' });
                const fileName = `${student.first_name || 'Unknown'}_${student.last_name || 'Unknown'}.docx`
                    .replace(/[^a-zA-Z0-9_.\-\s]/g, '')
                    .replace(/\s+/g, '_');

                const filePath = useSubfolders ? `${folderName}/${fileName}` : fileName;
                zip.file(filePath, generatedDoc);
                result.totalDocs++;
            } catch (docErr) {
                const errMsg = docErr instanceof Error ? docErr.message : String(docErr);
                console.error(`Error generating doc for ${student.first_name} ${student.last_name} (template: ${tpl.name}):`, docErr);
                result.failedDocs.push({
                    student: `${student.first_name} ${student.last_name}`,
                    template: tpl.name,
                    error: errMsg,
                });
                templateSuccess = false;
            }
        }

        if (templateSuccess) {
            result.successTemplates.push(tpl.name);
        }
    }

    // Generate Attendance Sheet (if template provided and enrollments exist)
    if (attendanceTemplateStoragePath && enrollments.length > 0) {
        try {
            const { data: attTemplateData, error: attDownloadError } = await supabase.storage
                .from('templates')
                .download(attendanceTemplateStoragePath);

            if (attDownloadError || !attTemplateData) {
                const errMsg = attDownloadError?.message || 'File not found';
                console.error('Failed to download attendance template:', attDownloadError);
                result.attendanceOk = false;
                result.attendanceError = `Download failed: ${errMsg}`;
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

                attDoc.render({ ...attData, ...customVariables });
                const generatedAttDoc = attDoc.getZip().generate({ type: 'arraybuffer' });
                zip.file('Attendance_Sheet.docx', generatedAttDoc);
            }
        } catch (attErr) {
            const errMsg = attErr instanceof Error ? attErr.message : String(attErr);
            console.error('Error generating attendance sheet:', attErr);
            result.attendanceOk = false;
            result.attendanceError = errMsg;
        }
    }

    // Generate Address Labels (if template provided and enrollments exist)
    if (labelTemplateStoragePath && enrollments.length > 0) {
        try {
            const { data: lblTemplateData, error: lblDownloadError } = await supabase.storage
                .from('templates')
                .download(labelTemplateStoragePath);

            if (lblDownloadError || !lblTemplateData) {
                const errMsg = lblDownloadError?.message || 'File not found';
                result.labelsOk = false;
                result.labelsError = `Download failed: ${errMsg}`;
                alert('[Labels] Download FAILED: ' + errMsg);
            } else {
                const lblTemplateBuffer = await lblTemplateData.arrayBuffer();
                const lblPizZip = new PizZip(lblTemplateBuffer);
                const lblDoc = new Docxtemplater(lblPizZip, {
                    paragraphLoop: true,
                    linebreaks: true,
                    delimiters: { start: '{', end: '}' },
                });

                // Build flat data for 28 slots
                const lblData: Record<string, string> = {};

                for (let i = 0; i < 28; i++) {
                    const idx = i + 1;
                    const student = enrollments[i]?.students;

                    if (student) {
                        lblData[`firstName${idx}`] = student.first_name || '';
                        lblData[`lastName${idx}`] = student.last_name || '';
                        lblData[`address${idx}`] = student.address || '';
                        lblData[`eircode${idx}`] = student.eircode || '';
                    } else {
                        lblData[`firstName${idx}`] = '';
                        lblData[`lastName${idx}`] = '';
                        lblData[`address${idx}`] = '';
                        lblData[`eircode${idx}`] = '';
                    }
                }

                lblDoc.render({ ...lblData, ...customVariables });
                const generatedLblDoc = lblDoc.getZip().generate({ type: 'arraybuffer' });
                zip.file('Address_Labels.docx', generatedLblDoc);
            }
        } catch (lblErr) {
            const errMsg = lblErr instanceof Error ? lblErr.message : String(lblErr);
            result.labelsOk = false;
            result.labelsError = errMsg;
        }
    }

    // Generate Excel spreadsheet with participant data
    if (excelColumns && excelColumns.length > 0 && enrollments.length > 0) {
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Participants');

            worksheet.columns = excelColumns.map(col => ({
                header: col.header,
                key: col.placeholder,
            }));

            const rows = enrollments.map(enrollment => {
                const placeholderData = { ...buildPlaceholderData(enrollment), ...customVariables };
                const row: Record<string, string> = {};
                for (const col of excelColumns) {
                    row[col.placeholder] = placeholderData[col.placeholder] || '';
                }
                return row;
            });
            
            worksheet.addRows(rows);

            // 1. Format the header row
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF0F172A' } // Dark blue
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            headerRow.height = 25;

            // 2. Format all data cells and add borders
            worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                row.eachCell({ includeEmpty: false }, (cell) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                    };
                    if (rowNumber > 1) {
                        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                        // Alternating row colors
                        if (rowNumber % 2 === 0) {
                            cell.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: 'FFF3F4F6' } // Light gray
                            };
                        }
                    }
                });
            });

            // 3. Auto-fit columns
            worksheet.columns.forEach(column => {
                if (!column || !column.eachCell) return;
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, (cell) => {
                    const columnLength = cell.value ? cell.value.toString().length : 0;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                // Set a minimum width and add some padding, cap at a reasonable maximum width
                column.width = Math.min(Math.max(12, maxLength + 3), 50);
            });

            const excelBuffer = await workbook.xlsx.writeBuffer();
            zip.file('Participants.xlsx', excelBuffer);
        } catch (excelErr) {
            console.error('Error generating Excel file:', excelErr);
        }
    }

    // Download ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, archiveName);

    return result;
}

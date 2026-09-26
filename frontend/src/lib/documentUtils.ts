// Document generation libraries (pizzip, docxtemplater, exceljs) are imported dynamically
// so they stay out of the main bundle until someone actually generates documents.
import { supabase } from './supabase';
import { Student, Course, Enrollment, DocumentTemplate, cleanVariant } from './types';
import { formatDateDMY, formatDateLong, todayISO } from './dateUtils';
import type { ExcelColumn } from './appConfig';
import { downloadBlob } from './download';

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

export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
/** Numbered slots ({firstName1} … {firstName34}) on one attendance sheet / label page. */
export const ATTENDANCE_SLOTS = 34;
export const LABEL_SLOTS = 28;
/** A table row wrapped in {#students}…{/students} repeats for every participant instead. */
export const SHEET_LOOP = 'students';

// ─── Placeholder catalogue ──────────────────────────────────

export const PLACEHOLDER_CATEGORIES: { title: string; items: { key: string; desc: string }[] }[] = [
    {
        title: 'Student Information',
        items: [
            { key: 'userId', desc: 'User ID' },
            { key: 'firstName', desc: 'First Name' },
            { key: 'lastName', desc: 'Last Name' },
            { key: 'fullName', desc: 'Full Name' },
            { key: 'email', desc: 'Email' },
            { key: 'mobileNumber', desc: 'Phone Number' },
            { key: 'address', desc: 'Address' },
            { key: 'eircode', desc: 'Eircode' },
            { key: 'dateOfBirth', desc: 'Date of Birth (formatted)' },
        ],
    },
    {
        title: 'Course Information',
        items: [
            { key: 'courseId', desc: 'Course ID' },
            { key: 'courseTitle', desc: 'Course Title' },
            { key: 'courseVariant', desc: 'Course Variant (language)' },
        ],
    },
    {
        title: 'Registration Information',
        items: [
            { key: 'registeredAt', desc: 'Registration Date (DD/MM/YYYY)' },
            { key: 'courseRegistrationDate', desc: 'Registration Date (formatted)' },
            { key: 'isCompleted', desc: 'Completion Status (Yes/No)' },
            { key: 'completedAt', desc: 'Completion Date (formatted)' },
        ],
    },
    {
        title: 'Enrollment & Dates',
        items: [
            { key: 'isInvited', desc: 'Invitation Status (Yes/No)' },
            { key: 'invitedAt', desc: 'Invitation Date (formatted)' },
            { key: 'confirmedDate', desc: 'Confirmed Date (formatted)' },
            { key: 'courseDate', desc: 'Course Date (formatted)' },
            { key: 'enrollmentStatus', desc: 'Current Status' },
            { key: 'enrollmentNotes', desc: 'Admin Notes' },
            { key: 'today', desc: 'Date the document was generated' },
        ],
    },
];

export const PLACEHOLDER_KEYS = new Set(PLACEHOLDER_CATEGORIES.flatMap(c => c.items.map(i => i.key)));

/** Custom variable names must work as a docxtemplater tag: `{Tutor}`, `{venue_name}`. */
export function validateVariableKey(key: string): string | null {
    if (!key) return 'Variable name is required';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return 'Use letters, digits and _ only, starting with a letter (e.g. Tutor, venue_name)';
    return null;
}

// ─── Data ───────────────────────────────────────────────────

export async function fetchDocumentTemplates(): Promise<DocumentTemplate[]> {
    const { data } = await supabase.from('document_templates').select('*').order('created_at', { ascending: true });
    return (data || []) as DocumentTemplate[];
}

/** Upload a .docx to the templates bucket under a fresh, unique path. */
export async function uploadTemplateFile(file: File, prefix: string): Promise<string> {
    const storagePath = `${prefix}_${Date.now()}.docx`;
    const { error } = await supabase.storage.from('templates').upload(storagePath, file, { cacheControl: '3600', upsert: true });
    if (error) throw error;
    return storagePath;
}

/** Course preset: the active templates picked for the course, or every active template if none are picked. */
export function templatesForCourse<T extends { id: string; is_active: boolean }>(templates: T[], templateIds?: string[] | null): T[] {
    const active = templates.filter(t => t.is_active);
    const picked = active.filter(t => templateIds?.includes(t.id));
    return picked.length ? picked : active;
}

export function buildPlaceholderData(enrollment: EnrollmentWithRelations, today: string = todayISO()): Record<string, string> {
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
        courseDate: formatDateLong(enrollment.confirmed_date || enrollment.invited_date || enrollment.completed_date),
        enrollmentStatus: enrollment.status?.charAt(0).toUpperCase() + enrollment.status?.slice(1) || '',
        enrollmentNotes: enrollment.notes || '',
        today: formatDateLong(today),
    };
}

/** Alphabetical by surname, then first name — the order people expect on a sign-in sheet. */
export function sortBySurname<T extends { students: Pick<Student, 'first_name' | 'last_name'> | null }>(rows: T[]): T[] {
    const key = (r: T) => `${r.students?.last_name || ''} ${r.students?.first_name || ''}`.trim();
    return [...rows].sort((a, b) => key(a).localeCompare(key(b), 'en', { sensitivity: 'base' }));
}

/**
 * Data for an attendance sheet or label page. Each page carries numbered slots
 * ({firstName1}…{firstNameN}) for fixed-grid templates, plus a `students` list for
 * templates that repeat a table row with {#students}…{/students}.
 * With `slots` set, participants are split into pages of that size; otherwise one page holds everyone.
 */
export function buildSheetPages(enrollments: EnrollmentWithRelations[], slots: number | null, today: string = todayISO()): Record<string, unknown>[] {
    const people = sortBySurname(enrollments.filter(e => e.students));
    const first = people[0];
    const pageSize = slots ?? Math.max(people.length, 1);
    const pageCount = Math.max(1, Math.ceil(people.length / pageSize));
    const common = {
        courseTitle: first?.courses?.name || '',
        courseVariant: first ? cleanVariant(first.courses?.name || '', first.course_variant) : '',
        courseDate: formatDateLong(first?.confirmed_date || first?.invited_date || first?.completed_date),
        venue: '',
        today: formatDateLong(today),
        participantCount: String(people.length),
        pages: String(pageCount),
    };

    return Array.from({ length: pageCount }, (_, p) => {
        const rows = people.slice(p * pageSize, (p + 1) * pageSize).map((e, i) => {
            const s = e.students!;
            return {
                n: String(p * pageSize + i + 1),
                firstName: s.first_name || '',
                lastName: s.last_name || '',
                fullName: [s.first_name, s.last_name].filter(Boolean).join(' '),
                phone: s.phone || '',
                email: s.email || '',
                address: s.address || '',
                eircode: s.eircode || '',
                courseVariant: cleanVariant(e.courses?.name || '', e.course_variant),
            };
        });
        const page: Record<string, unknown> = { ...common, page: String(p + 1), [SHEET_LOOP]: rows };
        // Empty slots render blank rather than leaving the tag in the document
        for (let i = 0; i < (slots ?? rows.length); i++) {
            const row = rows[i];
            for (const field of ['firstName', 'lastName', 'fullName', 'phone', 'email', 'address', 'eircode'] as const) {
                page[`${field}${i + 1}`] = row?.[field] ?? '';
            }
        }
        return page;
    });
}

// ─── Rendering ──────────────────────────────────────────────

type PizZipCtor = typeof import('pizzip');
type DocxtemplaterCtor = typeof import('docxtemplater');
interface DocxLibs { PizZip: PizZipCtor; Docxtemplater: DocxtemplaterCtor }

async function loadDocxLibs(): Promise<DocxLibs> {
    const [pz, dt] = await Promise.all([import('pizzip'), import('docxtemplater')]);
    return {
        PizZip: (pz.default || pz) as PizZipCtor,
        Docxtemplater: (dt.default || dt) as DocxtemplaterCtor,
    };
}

/**
 * A readable message for docxtemplater errors. Template problems arrive as a
 * "Multi error" whose real causes ("The tag 'firstName' is unclosed") sit in properties.errors.
 */
export function describeDocxError(err: unknown): string {
    const e = err as { message?: string; properties?: { explanation?: string; errors?: { message?: string; properties?: { explanation?: string } }[] } };
    const errors = e?.properties?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
        const lines = [...new Set(errors.map(x => x.properties?.explanation || x.message || 'Unknown error'))];
        return lines.slice(0, 3).join('; ') + (lines.length > 3 ? ` (+${lines.length - 3} more)` : '');
    }
    return e?.properties?.explanation || e?.message || String(err);
}

function createDoc(libs: DocxLibs, template: ArrayBuffer, missing?: Set<string>) {
    return new libs.Docxtemplater(new libs.PizZip(template), {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{', end: '}' },
        errorLogging: false, // errors are reported through describeDocxError
        // An unknown tag renders blank (instead of the word "undefined") and is reported back
        nullGetter(part) {
            if (!part.module && part.value) missing?.add(part.value);
            return '';
        },
    });
}

/** Render one .docx. Throws on template syntax errors; unknown tags are collected in `missing`. */
function renderDocx(libs: DocxLibs, template: ArrayBuffer, data: Record<string, unknown>, missing?: Set<string>): ArrayBuffer {
    const doc = createDoc(libs, template, missing);
    doc.render(data);
    return doc.getZip().generate({ type: 'arraybuffer', compression: 'DEFLATE' });
}

function usesSheetLoop(libs: DocxLibs, template: ArrayBuffer): boolean {
    return createDoc(libs, template).getFullText().includes(`{#${SHEET_LOOP}}`);
}

export type TemplateKind = 'document' | 'attendance' | 'labels';

export interface TemplateCheck {
    /** Syntax errors: the template cannot be rendered at all. */
    error?: string;
    /** Tags with no matching placeholder or custom variable — they would print blank. */
    unknownTags: string[];
}

/** Dry-run a template against sample data, so problems surface at upload rather than at generation. */
export async function checkTemplate(file: Blob, kind: TemplateKind, customVariables: Record<string, string> = {}): Promise<TemplateCheck> {
    const libs = await loadDocxLibs();
    const template = await file.arrayBuffer();
    const missing = new Set<string>();
    try {
        const sample: Record<string, unknown> = kind === 'document'
            ? Object.fromEntries([...PLACEHOLDER_KEYS].map(k => [k, 'x']))
            : buildSheetPages([], kind === 'attendance' ? ATTENDANCE_SLOTS : LABEL_SLOTS)[0];
        renderDocx(libs, template, { ...sample, ...customVariables }, missing);
    } catch (err) {
        return { error: describeDocxError(err), unknownTags: [] };
    }
    return { unknownTags: [...missing].sort() };
}

// ─── Archive ────────────────────────────────────────────────

/** Keeps letters of any alphabet (Seán, Олена), drops characters that are unsafe in file names. */
export function safeFileName(name: string, fallback = 'Unknown'): string {
    const cleaned = name
        .normalize('NFC')
        .replace(/[^\p{L}\p{M}\p{N}_.\-\s']/gu, '')
        .trim()
        .replace(/\s+/g, '_');
    return cleaned || fallback;
}

/** Adds _2, _3 … so two students with the same name do not overwrite each other in the ZIP. */
function uniquePath(used: Set<string>, path: string): string {
    const dot = path.lastIndexOf('.');
    const [base, ext] = dot > 0 ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
    let candidate = path;
    for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base}_${i}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
}

async function fetchTemplateFile(storagePath: string): Promise<ArrayBuffer> {
    // The templates bucket is public (see migration 26), so no signed URL is needed
    const { data } = supabase.storage.from('templates').getPublicUrl(storagePath);
    const response = await fetch(data.publicUrl);
    if (!response.ok) throw new Error(response.status === 404 ? 'File not found' : `HTTP ${response.status}`);
    return response.arrayBuffer();
}

export interface ArchiveOptions {
    enrollments: EnrollmentWithRelations[];
    templates: TemplateDescriptor[];
    attendanceTemplatePath?: string | null;
    labelTemplatePath?: string | null;
    customVariables?: Record<string, string>;
    excelColumns?: ExcelColumn[];
    /** Called after every generated file. */
    onProgress?: (done: number, total: number) => void;
    /** Override template download (tests). */
    fetchTemplate?: (storagePath: string) => Promise<ArrayBuffer>;
    today?: string;
}

/** Outcome of an extra file in the archive: attendance sheet, address labels or the Excel list. */
export interface ExtraFileResult {
    label: string;
    ok: boolean;
    files: number;
    error?: string;
}

/** Result of a document generation run. */
export interface GenerationResult {
    totalTemplates: number;
    successTemplates: string[];
    failedTemplates: { name: string; error: string }[];
    totalDocs: number;
    failedDocs: { student: string; template: string; error: string }[];
    extras: ExtraFileResult[];
    /** Tags a template uses that nothing fills in, per template. */
    unknownTags: { template: string; tags: string[] }[];
}

export async function buildDocumentsArchive(options: ArchiveOptions): Promise<{ blob: Blob; result: GenerationResult }> {
    const {
        templates, attendanceTemplatePath, labelTemplatePath, excelColumns = [],
        customVariables = {}, onProgress, fetchTemplate = fetchTemplateFile, today = todayISO(),
    } = options;
    const enrollments = options.enrollments.filter(e => e.students);
    const libs = await loadDocxLibs();
    const zip = new libs.PizZip();
    const usedPaths = new Set<string>();
    const useSubfolders = templates.length > 1;

    const result: GenerationResult = {
        totalTemplates: templates.length,
        successTemplates: [],
        failedTemplates: [],
        totalDocs: 0,
        failedDocs: [],
        extras: [],
        unknownTags: [],
    };

    const hasPeople = enrollments.length > 0;
    const withAttendance = !!attendanceTemplatePath && hasPeople;
    const withLabels = !!labelTemplatePath && hasPeople;
    const withExcel = excelColumns.length > 0 && hasPeople;
    const total = templates.length * enrollments.length + Number(withAttendance) + Number(withLabels) + Number(withExcel);
    let done = 0;
    const tick = async () => {
        onProgress?.(++done, total);
        // Yield to the event loop so the UI stays responsive during long runs
        await new Promise(resolve => setTimeout(resolve, 0));
    };

    // Download every template up front, in parallel
    const download = (path: string) => fetchTemplate(path).then(
        buffer => ({ buffer, error: null }),
        (err: unknown) => ({ buffer: null, error: `Download failed: ${err instanceof Error ? err.message : String(err)}` }),
    );
    const [docFiles, attFile, lblFile] = await Promise.all([
        Promise.all(templates.map(t => download(t.storagePath))),
        withAttendance ? download(attendanceTemplatePath!) : null,
        withLabels ? download(labelTemplatePath!) : null,
    ]);

    // ── One document per student per template ──
    for (const [ti, tpl] of templates.entries()) {
        const { buffer, error } = docFiles[ti];
        const skip = async (message: string) => {
            result.failedTemplates.push({ name: tpl.name, error: message });
            for (let i = 0; i < enrollments.length; i++) await tick();
        };
        if (!buffer) { await skip(error!); continue; }

        // Compile once: a broken template fails as a whole, not once per student
        try {
            createDoc(libs, buffer);
        } catch (err) {
            await skip(describeDocxError(err));
            continue;
        }

        const folder = useSubfolders ? `${safeFileName(tpl.name.replace(/\.docx$/i, ''), 'Template')}/` : '';
        const missing = new Set<string>();
        let templateOk = true;

        for (const enrollment of enrollments) {
            const s = enrollment.students!;
            const studentName = [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Unknown';
            try {
                const data = { ...buildPlaceholderData(enrollment, today), ...customVariables };
                const file = renderDocx(libs, buffer, data, missing);
                const name = `${safeFileName(s.first_name || '')}_${safeFileName(s.last_name || '')}.docx`;
                zip.file(uniquePath(usedPaths, folder + name), file);
                result.totalDocs++;
            } catch (err) {
                templateOk = false;
                result.failedDocs.push({ student: studentName, template: tpl.name, error: describeDocxError(err) });
            }
            await tick();
        }

        if (templateOk) result.successTemplates.push(tpl.name);
        if (missing.size) result.unknownTags.push({ template: tpl.name, tags: [...missing].sort() });
    }

    // ── Attendance sheet / address labels: one file per page of numbered slots ──
    const sheets = [
        { label: 'Attendance sheet', file: 'Attendance_Sheet', download: attFile, slots: ATTENDANCE_SLOTS },
        { label: 'Address labels', file: 'Address_Labels', download: lblFile, slots: LABEL_SLOTS },
    ];
    for (const sheet of sheets) {
        if (!sheet.download) continue;
        const { buffer, error } = sheet.download;
        if (!buffer) {
            result.extras.push({ label: sheet.label, ok: false, files: 0, error: error! });
        } else {
            try {
                const pages = buildSheetPages(enrollments, usesSheetLoop(libs, buffer) ? null : sheet.slots, today);
                const missing = new Set<string>();
                pages.forEach((page, i) => {
                    const file = renderDocx(libs, buffer, { ...page, ...customVariables }, missing);
                    const suffix = pages.length > 1 ? `_${i + 1}_of_${pages.length}` : '';
                    zip.file(uniquePath(usedPaths, `${sheet.file}${suffix}.docx`), file);
                });
                result.extras.push({ label: sheet.label, ok: true, files: pages.length });
                if (missing.size) result.unknownTags.push({ template: sheet.label, tags: [...missing].sort() });
            } catch (err) {
                result.extras.push({ label: sheet.label, ok: false, files: 0, error: describeDocxError(err) });
            }
        }
        await tick();
    }

    // ── Participants.xlsx ──
    if (withExcel) {
        try {
            zip.file(uniquePath(usedPaths, 'Participants.xlsx'), await buildParticipantsWorkbook(sortBySurname(enrollments), excelColumns, customVariables, today));
            result.extras.push({ label: 'Participants.xlsx', ok: true, files: 1 });
        } catch (err) {
            result.extras.push({ label: 'Participants.xlsx', ok: false, files: 0, error: err instanceof Error ? err.message : String(err) });
        }
        await tick();
    }

    // Entries (.docx/.xlsx) are already deflated, so the outer archive just stores them
    // (PizZip's default) — no point compressing twice.
    return { blob: zip.generate({ type: 'blob', mimeType: 'application/zip' }), result };
}

async function buildParticipantsWorkbook(
    enrollments: EnrollmentWithRelations[],
    columns: ExcelColumn[],
    customVariables: Record<string, string>,
    today: string,
): Promise<ArrayBuffer> {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Participants', { views: [{ state: 'frozen', ySplit: 1 }] });

    worksheet.columns = columns.map((col, i) => ({ header: col.header, key: `c${i}` }));
    worksheet.addRows(enrollments.map(enrollment => {
        const data = { ...buildPlaceholderData(enrollment, today), ...customVariables };
        return Object.fromEntries(columns.map((col, i) => [`c${i}`, data[col.placeholder] ?? '']));
    }));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

    const border = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } };
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        row.eachCell({ includeEmpty: false }, cell => {
            cell.border = { top: border, left: border, bottom: border, right: border };
            if (rowNumber > 1) {
                cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                if (rowNumber % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
            }
        });
    });

    // Fit columns to their content, within 12–50 characters
    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell?.({ includeEmpty: true }, cell => {
            maxLength = Math.max(maxLength, cell.value ? cell.value.toString().length : 0);
        });
        column.width = Math.min(Math.max(12, maxLength + 3), 50);
    });

    return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Build the archive and save it as `archiveName`. */
export async function generateDocumentsArchive(archiveName: string, options: ArchiveOptions): Promise<GenerationResult> {
    const { blob, result } = await buildDocumentsArchive(options);
    if (result.totalDocs > 0 || result.extras.some(x => x.ok)) downloadBlob(blob, archiveName);
    return result;
}

/** One toast summarising a generation run: what was made, and everything that went wrong. */
export function summarizeGeneration(result: GenerationResult): { message: string; type: 'success' | 'error' | 'info' } {
    const problems: string[] = [];
    for (const f of result.failedTemplates) problems.push(`"${f.name}": ${f.error}`);
    if (result.failedDocs.length) {
        const sample = result.failedDocs.slice(0, 2).map(d => `${d.student} (${d.template}): ${d.error}`).join('; ');
        problems.push(`${result.failedDocs.length} document(s) failed — ${sample}`);
    }
    for (const x of result.extras) if (!x.ok) problems.push(`${x.label}: ${x.error}`);

    const made = [`${result.totalDocs} document(s) from ${result.successTemplates.length}/${result.totalTemplates} template(s)`];
    for (const x of result.extras) if (x.ok) made.push(x.files > 1 ? `${x.label} (${x.files} pages)` : x.label);
    const unknown = result.unknownTags.map(u => `${u.template}: ${u.tags.map(t => `{${t}}`).join(', ')}`);

    if (problems.length) {
        return { type: 'error', message: `Generated ${made.join(', ')}. Problems: ${problems.join(' | ')}` };
    }
    if (unknown.length) {
        return { type: 'info', message: `Generated ${made.join(', ')}. Left blank — unknown placeholders in ${unknown.join(' | ')}` };
    }
    return { type: 'success', message: `Generated ${made.join(', ')}.` };
}

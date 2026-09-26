// Document generation: templates and settings in Supabase, and the archive run.
// The rendering itself lives in documentRender.ts and runs in a Web Worker (documentJob.ts).
import { supabase } from './supabase';
import { ENROLLMENT_SELECT } from './queries';
import { cleanVariant, type DocumentTemplate, type Enrollment, type TemplateVariable } from './types';
import { formatDateSpaces, todayISO } from './dateUtils';
import { getConfig, setConfig, type ExcelColumn } from './appConfig';
import { downloadBlob } from './download';
import { sanitizeExcelValue, styleWorksheet } from './excelExport';
import { runRenderJob } from './documentJob';
import {
    abortError, buildPlaceholderData, checkTemplateBuffer, courseDateOf, dateVariableValues, parseDateRule,
    type DateVariable, type EnrollmentWithRelations, type ExtraFile, type GenerationResult, type TemplateCheck, type TemplateFile, type TemplateKind,
} from './documentRender';

export * from './documentRender';

const BUCKET = 'templates';

/** Descriptor for a template to be rendered. */
export interface TemplateDescriptor {
    name: string;
    storagePath: string;
}

const errorMessage = (err: unknown) => err instanceof Error ? err.message : (err as { message?: string })?.message || String(err);

// ─── Templates ──────────────────────────────────────────────

export type TemplateTable = 'document_templates' | 'attendance_templates' | 'label_templates';

/** The attendance sheet and address labels: one current template each. */
export const SINGLE_TEMPLATES = {
    attendance: { table: 'attendance_templates', queryKey: 'doc_att_template', prefix: 'template_att', label: 'Attendance template' },
    labels: { table: 'label_templates', queryKey: 'doc_label_template', prefix: 'template_lbl', label: 'Label template' },
} as const;
export type SingleKind = keyof typeof SINGLE_TEMPLATES;

export async function fetchDocumentTemplates(): Promise<DocumentTemplate[]> {
    const { data, error } = await supabase.from('document_templates').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as DocumentTemplate[];
}

export async function fetchSingleTemplate(kind: SingleKind): Promise<DocumentTemplate | null> {
    const { data, error } = await supabase.from(SINGLE_TEMPLATES[kind].table).select('*').order('updated_at', { ascending: false }).limit(1);
    if (error) throw error;
    return (data?.[0] as DocumentTemplate | undefined) ?? null;
}

export async function fetchTemplateVariables(): Promise<TemplateVariable[]> {
    const { data, error } = await supabase.from('template_variables').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as TemplateVariable[];
}

/** Every variable by name, with its text (date variables map to ''): for checking templates. */
export function variablesToMap(vars: Pick<TemplateVariable, 'var_key' | 'var_value'>[]): Record<string, string> {
    return Object.fromEntries(vars.map(v => [v.var_key, v.var_value]));
}

/** Split custom variables into fixed text and dates worked out per participant. */
export function variablesForArchive(vars: TemplateVariable[]): { customVariables: Record<string, string>; dateVariables: DateVariable[] } {
    const customVariables: Record<string, string> = {};
    const dateVariables: DateVariable[] = [];
    for (const v of vars) {
        const rule = v.kind === 'date' ? parseDateRule(v.date_rule) : null;
        if (rule) dateVariables.push({ key: v.var_key, rule });
        else if (v.kind === 'date') customVariables[v.var_key] = ''; // unreadable rule: print blank
        else customVariables[v.var_key] = v.var_value;
    }
    return { customVariables, dateVariables };
}

/** Dry-run a template file against sample data (see checkTemplateBuffer). */
export async function checkTemplate(file: Blob, kind: TemplateKind, customVariables: Record<string, string> = {}): Promise<TemplateCheck> {
    return checkTemplateBuffer(await file.arrayBuffer(), kind, customVariables);
}

/** Upload a .docx to the templates bucket under a fresh, unique path. */
export async function uploadTemplateFile(file: File, prefix: string): Promise<string> {
    const storagePath = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.docx`;
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    return storagePath;
}

/** Remove stored files. A failure only leaves an unused file behind, so it is logged, not thrown. */
export async function removeTemplateFiles(paths: string[]): Promise<void> {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) console.warn(`Could not remove ${paths.join(', ')} from storage:`, error);
}

/**
 * Store a file, then run `save` (the database write). If the write fails the new file is
 * removed again, so a failed upload leaves nothing behind.
 */
async function withUploadedFile<T>(file: File, prefix: string, save: (storagePath: string) => Promise<T>): Promise<T> {
    const storagePath = await uploadTemplateFile(file, prefix);
    try {
        return await save(storagePath);
    } catch (err) {
        await removeTemplateFiles([storagePath]);
        throw err;
    }
}

/** Add a template row (document, attendance or labels) for a new file. */
export async function createTemplate(table: TemplateTable, file: File, prefix: string): Promise<DocumentTemplate> {
    return withUploadedFile(file, prefix, async storagePath => {
        const row: Record<string, unknown> = { name: file.name, storage_path: storagePath };
        if (table === 'document_templates') row.is_active = true;
        const { data, error } = await supabase.from(table).insert(row).select().single();
        if (error) throw error;
        return data as DocumentTemplate;
    });
}

/**
 * Point an existing template at a new file. The row keeps its id, so course presets keep
 * working; the old file is removed only after the row points at the new one.
 */
export async function replaceTemplateFile(table: TemplateTable, current: DocumentTemplate, file: File, prefix: string): Promise<DocumentTemplate> {
    const updated = await withUploadedFile(file, prefix, async storagePath => {
        const patch = { name: file.name, storage_path: storagePath, updated_at: new Date().toISOString() };
        const { error } = await supabase.from(table).update(patch).eq('id', current.id);
        if (error) throw error;
        return { ...current, ...patch };
    });
    await removeTemplateFiles([current.storage_path]);
    return updated;
}

export async function deleteTemplate(table: TemplateTable, row: DocumentTemplate): Promise<void> {
    const { error } = await supabase.from(table).delete().eq('id', row.id);
    if (error) throw error;
    await removeTemplateFiles([row.storage_path]);
}

/** Download a template's bytes. The bucket is private, so this goes through the signed-in session. */
export async function fetchTemplateFile(storagePath: string): Promise<ArrayBuffer> {
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
    if (error || !data) throw new Error(/not.?found|404/i.test(error?.message || '') ? 'File not found' : (error?.message || 'No data'));
    return data.arrayBuffer();
}

/** Save a stored template to the computer, e.g. to edit it in Word and upload it again. */
export async function downloadTemplate(tpl: Pick<DocumentTemplate, 'name' | 'storage_path'>): Promise<void> {
    const buffer = await fetchTemplateFile(tpl.storage_path);
    const name = /\.docx$/i.test(tpl.name) ? tpl.name : `${tpl.name}.docx`;
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), name);
}

// ─── Course presets ─────────────────────────────────────────

export type PresetState = 'all' | 'preset' | 'preset-off';

/**
 * Which templates a course uses. A course that picked templates uses the picked ones that
 * are switched on — or none, if they are all switched off ('preset-off'), rather than silently
 * falling back to every active template. No picks (or only picks of deleted templates) = all active.
 */
export function coursePreset<T extends { id: string; is_active: boolean }>(templates: T[], templateIds?: string[] | null): { templates: T[]; state: PresetState } {
    const picked = templates.filter(t => templateIds?.includes(t.id));
    if (!picked.length) return { templates: templates.filter(t => t.is_active), state: 'all' };
    const active = picked.filter(t => t.is_active);
    return { templates: active, state: active.length ? 'preset' : 'preset-off' };
}

export function templatesForCourse<T extends { id: string; is_active: boolean }>(templates: T[], templateIds?: string[] | null): T[] {
    return coursePreset(templates, templateIds).templates;
}

// ─── Participants ───────────────────────────────────────────

export type GenerationStatus = 'confirmed' | 'completed';

export interface CourseSession<T> {
    /** YYYY-MM-DD, or 'none' for participants without a date. */
    key: string;
    date: string | null;
    enrollments: T[];
}

type Dated = Pick<Enrollment, 'confirmed_date' | 'invited_date' | 'completed_date'>;

/** Key of the course date a participant belongs to (see groupSessions). */
export const sessionKeyOf = (e: Dated) => courseDateOf(e)?.slice(0, 10) ?? 'none';

/** Split a course's participants by the day they attend, earliest first; undated last. */
export function groupSessions<T extends Dated>(rows: T[]): CourseSession<T>[] {
    const byKey = new Map<string, CourseSession<T>>();
    for (const row of rows) {
        const key = sessionKeyOf(row);
        const date = key === 'none' ? null : key;
        if (!byKey.has(key)) byKey.set(key, { key, date, enrollments: [] });
        byKey.get(key)!.enrollments.push(row);
    }
    return [...byKey.values()].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
}

/** The date to preselect: the next upcoming one for confirmed people, the latest one for completers. */
export function defaultSessionKey<T>(sessions: CourseSession<T>[], status: GenerationStatus, today: string = todayISO()): string | null {
    const dated = sessions.filter(s => s.date);
    if (!dated.length) return sessions[0]?.key ?? null;
    if (status === 'confirmed') {
        const upcoming = dated.find(s => s.date! >= today);
        if (upcoming) return upcoming.key;
    }
    return dated[dated.length - 1].key;
}

/** Re-read enrollments right before generating, so documents never use a stale cached name or address. */
export async function fetchEnrollmentsByIds(ids: string[]): Promise<EnrollmentWithRelations[]> {
    const CHUNK = 150; // keeps the id=in.(…) URL well under server limits
    const chunks = Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) => ids.slice(i * CHUNK, (i + 1) * CHUNK));
    const results = await Promise.all(chunks.map(async chunk => {
        const { data, error } = await supabase.from('enrollments').select(ENROLLMENT_SELECT).in('id', chunk);
        if (error) throw error;
        return (data || []) as EnrollmentWithRelations[];
    }));
    const byId = new Map(results.flat().map(e => [e.id, e]));
    return ids.map(id => byId.get(id)).filter((e): e is EnrollmentWithRelations => !!e);
}

/**
 * Fresh copies of `selected`. People who were deleted since the list was loaded, or who no
 * longer pass `stillWanted` (e.g. moved to another status or course date), are returned in
 * `skipped` (by name) instead.
 */
export async function refreshParticipants(
    selected: EnrollmentWithRelations[],
    stillWanted: (fresh: EnrollmentWithRelations) => boolean = () => true,
): Promise<{ people: EnrollmentWithRelations[]; skipped: string[] }> {
    const fresh = await fetchEnrollmentsByIds(selected.map(e => e.id));
    const freshById = new Map(fresh.map(e => [e.id, e]));
    const people: EnrollmentWithRelations[] = [];
    const skipped: string[] = [];
    for (const e of selected) {
        const now = freshById.get(e.id);
        if (now && stillWanted(now)) people.push(now);
        else skipped.push([e.students?.first_name, e.students?.last_name].filter(Boolean).join(' ') || 'Unknown');
    }
    return { people, skipped };
}

/** "Python 101 (Ukrainian) 01 10 2026.zip" — course, variant(s) and date(s) of the people in it. */
export function archiveFileName(people: EnrollmentWithRelations[], prefix = ''): string {
    const distinct = (values: string[]) => [...new Set(values.filter(Boolean))];
    const courses = distinct(people.map(e => e.courses?.name || ''));
    const variants = distinct(people.map(e => cleanVariant(e.courses?.name || '', e.course_variant)));
    const dates = distinct(people.map(e => courseDateOf(e)?.slice(0, 10) || '')).sort();
    const course = (courses.join(', ') || 'Documents') + (variants.length ? ` (${variants.join(', ')})` : '');
    const date = dates.length
        ? formatDateSpaces(dates[0]) + (dates.length > 1 ? ` - ${formatDateSpaces(dates[dates.length - 1])}` : '')
        : formatDateSpaces(todayISO());
    return `${prefix}${course} ${date}.zip`.replace(/[/\\?%*:|"<>]/g, '-');
}

// ─── Excel columns (shared by every admin) ──────────────────

const isColumn = (c: unknown): c is ExcelColumn =>
    !!c && typeof (c as ExcelColumn).header === 'string' && typeof (c as ExcelColumn).placeholder === 'string';

/**
 * Columns of Participants.xlsx. They live in the shared document_settings row (migration 73);
 * until someone saves them there — or before that migration runs — this browser's copy is used.
 */
export async function fetchExcelColumns(): Promise<{ columns: ExcelColumn[]; shared: boolean }> {
    const { data, error } = await supabase.from('document_settings').select('excel_columns').eq('id', true).maybeSingle();
    if (error) {
        // Table not created yet (PostgREST: PGRST205, Postgres: 42P01): keep using this browser's copy
        if (error.code === 'PGRST205' || error.code === '42P01') return { columns: getConfig().excelColumns, shared: false };
        throw error;
    }
    const saved = data?.excel_columns;
    return { columns: Array.isArray(saved) ? saved.filter(isColumn) : getConfig().excelColumns, shared: true };
}

export async function saveExcelColumns(columns: ExcelColumn[], shared: boolean): Promise<void> {
    setConfig({ excelColumns: columns });
    if (!shared) return;
    const { error } = await supabase.from('document_settings').upsert({ id: true, excel_columns: columns, updated_at: new Date().toISOString() });
    if (error) throw error;
}

async function buildParticipantsWorkbook(
    enrollments: EnrollmentWithRelations[],
    columns: ExcelColumn[],
    customVariables: Record<string, string>,
    dateVariables: DateVariable[],
    today: string,
): Promise<ArrayBuffer> {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Participants');

    worksheet.columns = columns.map((col, i) => ({ header: col.header, key: `c${i}` }));
    worksheet.addRows(enrollments.map(enrollment => {
        const data = { ...buildPlaceholderData(enrollment, today), ...customVariables, ...dateVariableValues(dateVariables, enrollment, today) };
        // Names and addresses come from a public form: never let one start a formula
        return Object.fromEntries(columns.map((col, i) => [`c${i}`, sanitizeExcelValue(data[col.placeholder])]));
    }));
    styleWorksheet(worksheet, { filter: true });

    return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

// ─── Archive ────────────────────────────────────────────────

export interface ArchiveOptions {
    enrollments: EnrollmentWithRelations[];
    templates: TemplateDescriptor[];
    attendanceTemplatePath?: string | null;
    labelTemplatePath?: string | null;
    customVariables?: Record<string, string>;
    /** Custom variables worked out per participant (see variablesForArchive). */
    dateVariables?: DateVariable[];
    excelColumns?: ExcelColumn[];
    /** Also add one file per template with everyone in it, for printing. */
    combined?: boolean;
    /** Called after every generated file. */
    onProgress?: (done: number, total: number) => void;
    /** Abort to cancel the run; it then rejects with an AbortError. */
    signal?: AbortSignal;
    /** Override template download (tests). */
    fetchTemplate?: (storagePath: string) => Promise<ArrayBuffer>;
    today?: string;
}

export async function buildDocumentsArchive(options: ArchiveOptions): Promise<{ blob: Blob; result: GenerationResult }> {
    const {
        templates, attendanceTemplatePath, labelTemplatePath, excelColumns = [], combined = false,
        customVariables = {}, dateVariables = [], onProgress, signal, fetchTemplate = fetchTemplateFile, today = todayISO(),
    } = options;
    const people = options.enrollments.filter(e => e.students);
    const hasPeople = people.length > 0;

    // Download every template (and build the Excel list) up front, in parallel
    const download = (name: string, path: string): Promise<TemplateFile> => fetchTemplate(path).then(
        buffer => ({ name, buffer }),
        (err: unknown) => ({ name, buffer: null, error: `Download failed: ${errorMessage(err)}` }),
    );
    const excelFile = (): Promise<ExtraFile> => buildParticipantsWorkbook(people, excelColumns, customVariables, dateVariables, today).then(
        buffer => ({ label: 'Participants.xlsx', path: 'Participants.xlsx', buffer }),
        (err: unknown) => ({ label: 'Participants.xlsx', path: 'Participants.xlsx', buffer: null, error: errorMessage(err) }),
    );
    const [docFiles, attendance, labels, excel] = await Promise.all([
        Promise.all(templates.map(t => download(t.name, t.storagePath))),
        attendanceTemplatePath && hasPeople ? download('Attendance sheet', attendanceTemplatePath) : null,
        labelTemplatePath && hasPeople ? download('Address labels', labelTemplatePath) : null,
        excelColumns.length && hasPeople ? excelFile() : null,
    ]);
    if (signal?.aborted) throw abortError();

    const { zip, result } = await runRenderJob(
        { enrollments: people, templates: docFiles, attendance, labels, extraFiles: excel ? [excel] : [], customVariables, dateVariables, combined, today },
        { onProgress, signal },
    );
    return { blob: new Blob([zip], { type: 'application/zip' }), result };
}

/** Build the archive and save it as `archiveName` (when anything was made). */
export async function generateDocumentsArchive(archiveName: string, options: ArchiveOptions): Promise<GenerationResult> {
    const { blob, result } = await buildDocumentsArchive(options);
    if (result.totalDocs > 0 || result.extras.some(x => x.ok)) downloadBlob(blob, archiveName);
    return result;
}

export interface SelectionOptions {
    /** Also add one file per template with everyone in it, for printing. */
    combined?: boolean;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
}

/**
 * Documents for a hand-picked selection (the enrollment board): re-reads the people,
 * then uses the course preset (when they are all on one course), the attendance and label
 * templates, the shared Excel columns and the custom variables, and downloads the archive.
 */
export async function generateSelectionArchive(
    selected: EnrollmentWithRelations[],
    { combined = false, signal, onProgress }: SelectionOptions = {},
): Promise<{ fileName: string; result: GenerationResult }> {
    const { people, skipped } = await refreshParticipants(selected);
    if (!people.length) throw new Error('The selected enrollments no longer exist.');
    const courseIds = [...new Set(people.map(e => e.course_id))];
    const [templates, attTemplate, lblTemplate, vars, excel, course] = await Promise.all([
        fetchDocumentTemplates(),
        fetchSingleTemplate('attendance'),
        fetchSingleTemplate('labels'),
        fetchTemplateVariables(),
        fetchExcelColumns(),
        // A course preset only applies when the whole selection is one course
        courseIds.length === 1
            ? supabase.from('courses').select('template_ids').eq('id', courseIds[0]).maybeSingle().then(({ data, error }) => {
                if (error) throw error;
                return data as { template_ids?: string[] | null } | null;
            })
            : null,
    ]);
    const wordTemplates = templatesForCourse(templates, course?.template_ids);
    if (!wordTemplates.length && !attTemplate && !lblTemplate && !excel.columns.length) {
        throw new Error('No active template found. Please upload and activate at least one template.');
    }

    const fileName = archiveFileName(people);
    const result = await generateDocumentsArchive(fileName, {
        enrollments: people,
        templates: wordTemplates.map(t => ({ name: t.name, storagePath: t.storage_path })),
        attendanceTemplatePath: attTemplate?.storage_path,
        labelTemplatePath: lblTemplate?.storage_path,
        ...variablesForArchive(vars),
        excelColumns: excel.columns,
        combined,
        signal,
        onProgress,
    });
    result.skipped = skipped;
    return { fileName, result };
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
    const skipped = result.skipped.length ? ` Left out ${result.skipped.length} whose enrollment changed: ${result.skipped.join(', ')}.` : '';

    if (problems.length) {
        return { type: 'error', message: `Generated ${made.join(', ')}. Problems: ${problems.join(' | ')}${skipped}` };
    }
    if (unknown.length || skipped) {
        return { type: 'info', message: `Generated ${made.join(', ')}.${unknown.length ? ` Left blank — unknown placeholders in ${unknown.join(' | ')}` : ''}${skipped}` };
    }
    return { type: 'success', message: `Generated ${made.join(', ')}.` };
}

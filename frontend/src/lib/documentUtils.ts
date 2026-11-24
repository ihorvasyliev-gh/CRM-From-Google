// Document generation: templates and settings in Supabase, generation history, and the archive run.
// The rendering itself lives in documentRender.ts and runs in a Web Worker (documentJob.ts).
import { supabase } from './supabase';
import { fetchAllPages, fetchEnrollmentsByIds } from './queries';
import {
    cleanVariant, fullName, templateLabel,
    type DocumentGenerationRecord, type DocumentTemplate, type Enrollment, type TemplateVariable,
} from './types';
import { formatDateSpaces, todayISO } from './dateUtils';
import { getConfig, setConfig, type ExcelColumn } from './appConfig';
import { downloadBlob } from './download';
import { errorMessage } from './errors';
import { styledTable, xlsxBlob } from './excelExport';
import { runRenderJob } from './documentJob';
import { courseDateKey, SESSION_COLUMNS, sessionFromRow } from './courseSessions';
import {
    abortError, buildPlaceholderData, checkTemplateBuffer, courseDateOf, dateVariableValues, inspectTemplateBuffer, parseDateRule, sortBySurname,
    type DateVariable, type DocContext, type EnrollmentWithRelations, type ExtraFile, type GenerationResult,
    type SessionMap, type TemplateCheck, type TemplateFile, type TemplateInspection, type TemplateKind,
} from './documentRender';

export * from './documentRender';

const BUCKET = 'templates';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Descriptor for a template to be rendered. */
export interface TemplateDescriptor {
    name: string;
    storagePath: string;
}

/** Optional metadata persisted when migration 93 columns exist. */
export interface TemplateUploadMeta {
    tags?: string[];
    sizeBytes?: number;
    sortOrder?: number;
    displayName?: string | null;
    description?: string;
}

// ─── Error helpers ──────────────────────────────────────────

/** PostgREST (PGRST205) or Postgres (42P01): the table does not exist yet, its migration has not run. */
export const isMissingTable = (error: { code?: string; message?: string } | null | undefined) =>
    error?.code === 'PGRST205' || error?.code === '42P01';

/** PostgREST (PGRST204) or Postgres (42703): a migration-93 column does not exist yet. */
export const isMissingColumn = (error: { code?: string; message?: string } | null | undefined) =>
    error?.code === 'PGRST204' || error?.code === '42703' || /column .* does not exist|could not find the .* column/i.test(error?.message || '');

// ─── Templates ──────────────────────────────────────────────

export type TemplateTable = 'document_templates' | 'attendance_templates' | 'label_templates' | 'sicap_templates';

/** The attendance sheet, address labels and the SICAP course form: one current template each. */
export const SINGLE_TEMPLATES = {
    attendance: { table: 'attendance_templates', queryKey: 'doc_att_template', prefix: 'template_att', label: 'Attendance template' },
    labels: { table: 'label_templates', queryKey: 'doc_label_template', prefix: 'template_lbl', label: 'Label template' },
    sicap: { table: 'sicap_templates', queryKey: 'doc_sicap_template', prefix: 'template_sicap', label: 'SICAP form template' },
} as const;
export type SingleKind = keyof typeof SINGLE_TEMPLATES;

export async function fetchDocumentTemplates(): Promise<DocumentTemplate[]> {
    const ordered = await supabase
        .from('document_templates')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    if (!ordered.error) return (ordered.data || []) as DocumentTemplate[];
    if (!isMissingColumn(ordered.error)) throw ordered.error;

    // Pre-migration 93 fallback: sort_order column does not exist yet
    const legacy = await supabase.from('document_templates').select('*').order('created_at', { ascending: true });
    if (legacy.error) throw legacy.error;
    return (legacy.data || []) as DocumentTemplate[];
}

export async function fetchSingleTemplate(kind: SingleKind): Promise<DocumentTemplate | null> {
    const { data, error } = await supabase
        .from(SINGLE_TEMPLATES[kind].table)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);
    // Before migration 91 there is no SICAP table: the card says to run it, the rest works as before
    if (error && kind === 'sicap' && isMissingTable(error)) return null;
    if (error) throw error;
    return (data?.[0] as DocumentTemplate | undefined) ?? null;
}

/** Whether the SICAP template table exists (migration 91 has run). */
export async function sicapTableReady(): Promise<boolean> {
    const { error } = await supabase.from(SINGLE_TEMPLATES.sicap.table).select('id', { head: true, count: 'exact' }).limit(1);
    return !isMissingTable(error);
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

/** Full template inspection returning extracted tags, unknown tags and corrupt-file detection. */
export async function inspectTemplate(file: Blob, kind: TemplateKind, customVariables: Record<string, string> = {}): Promise<TemplateInspection> {
    return inspectTemplateBuffer(await file.arrayBuffer(), kind, customVariables);
}

function uniqueStoragePath(prefix: string): string {
    const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${uuid}.docx`;
}

/** Upload a .docx to the templates bucket under a fresh, unique path. */
async function uploadTemplateFile(file: File, prefix: string): Promise<string> {
    const storagePath = uniqueStoragePath(prefix);
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: DOCX_MIME,
    });
    if (error) throw error;
    return storagePath;
}

/** Remove stored files. A failure only leaves an unused file behind, so it is logged, not thrown. */
async function removeTemplateFiles(paths: string[]): Promise<void> {
    const valid = paths.filter(Boolean);
    if (!valid.length) return;
    const { error } = await supabase.storage.from(BUCKET).remove(valid);
    if (error) console.warn(`Could not remove ${valid.join(', ')} from storage:`, error);
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

/** Add a template row (document, attendance, labels, or SICAP) for a new file. */
export async function createTemplate(
    table: TemplateTable,
    file: File,
    prefix: string,
    meta: TemplateUploadMeta = {},
): Promise<DocumentTemplate> {
    return withUploadedFile(file, prefix, async storagePath => {
        const legacyRow: Record<string, unknown> = { name: file.name, storage_path: storagePath };
        if (table === 'document_templates') legacyRow.is_active = true;

        const richRow: Record<string, unknown> = {
            ...legacyRow,
            ...(meta.tags ? { tags: meta.tags } : {}),
            ...(meta.sizeBytes !== undefined ? { size_bytes: meta.sizeBytes } : { size_bytes: file.size }),
        };
        if (table === 'document_templates') {
            if (meta.sortOrder !== undefined) richRow.sort_order = meta.sortOrder;
            if (meta.displayName !== undefined) richRow.display_name = meta.displayName;
            if (meta.description !== undefined) richRow.description = meta.description;
        }

        const first = await supabase.from(table).insert(richRow).select().single();
        if (!first.error) return first.data as DocumentTemplate;
        if (!isMissingColumn(first.error)) throw first.error;

        // Pre-migration 93 fallback
        const fallback = await supabase.from(table).insert(legacyRow).select().single();
        if (fallback.error) throw fallback.error;
        return fallback.data as DocumentTemplate;
    });
}

/**
 * Point an existing template at a new file. The row keeps its id, so course presets keep
 * working; the old file is removed only after the row points at the new one.
 */
export async function replaceTemplateFile(
    table: TemplateTable,
    current: DocumentTemplate,
    file: File,
    prefix: string,
    meta: TemplateUploadMeta = {},
): Promise<DocumentTemplate> {
    const updated = await withUploadedFile(file, prefix, async storagePath => {
        const now = new Date().toISOString();
        const legacyPatch: Record<string, unknown> = { name: file.name, storage_path: storagePath, updated_at: now };
        const richPatch: Record<string, unknown> = {
            ...legacyPatch,
            ...(meta.tags ? { tags: meta.tags } : {}),
            size_bytes: meta.sizeBytes ?? file.size,
        };

        const runUpdate = async (patch: Record<string, unknown>) =>
            supabase.from(table).update(patch).eq('id', current.id).select().single();

        let res = await runUpdate(richPatch);
        if (res.error && isMissingColumn(res.error)) {
            res = await runUpdate(legacyPatch);
        }
        if (res.error) {
            if (res.error.code === 'PGRST116') {
                throw new Error('This template was deleted by another admin. Reload the page to refresh.');
            }
            throw res.error;
        }
        return (res.data as DocumentTemplate | null) ?? ({ ...current, ...legacyPatch } as DocumentTemplate);
    });
    await removeTemplateFiles([current.storage_path]);
    return updated;
}

/** Rename a Word template or update its description (migration 93). */
export async function updateTemplateMetadata(
    id: string,
    patch: { display_name?: string | null; description?: string },
): Promise<DocumentTemplate> {
    const cleanPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.display_name !== undefined) cleanPatch.display_name = patch.display_name?.trim() || null;
    if (patch.description !== undefined) cleanPatch.description = patch.description.trim();

    const { data, error } = await supabase
        .from('document_templates')
        .update(cleanPatch)
        .eq('id', id)
        .select()
        .single();
    if (error) {
        if (isMissingColumn(error)) {
            throw new Error('Run migration 93_documents_redesign.sql in Supabase first to rename templates or save descriptions.');
        }
        if (error.code === 'PGRST116') {
            throw new Error('This template no longer exists.');
        }
        throw error;
    }
    return data as DocumentTemplate;
}

export async function deleteTemplate(table: TemplateTable, row: DocumentTemplate): Promise<void> {
    const { error } = await supabase.from(table).delete().eq('id', row.id);
    if (error) throw error;
    await removeTemplateFiles([row.storage_path]);
}

/**
 * Persist a new global template order.
 * Uses `sort_order` when migration 93 has run (leaving per-course `courses.template_ids`
 * custom ordering untouched!), and falls back to strictly increasing `created_at` pre-migration.
 */
export async function saveTemplateOrder(ordered: DocumentTemplate[]): Promise<DocumentTemplate[]> {
    if (ordered.length < 2) return ordered;

    // Try migration-93 `sort_order` first
    const probe = ordered[0];
    const probeRes = await supabase
        .from('document_templates')
        .update({ sort_order: 0 })
        .eq('id', probe.id);

    if (!probeRes.error) {
        const rest = ordered.slice(1);
        await Promise.all(rest.map(async (tpl, idx) => {
            const { error } = await supabase
                .from('document_templates')
                .update({ sort_order: idx + 1 })
                .eq('id', tpl.id);
            if (error) throw error;
        }));
        return ordered.map((tpl, idx) => ({ ...tpl, sort_order: idx }));
    }

    if (!isMissingColumn(probeRes.error)) throw probeRes.error;

    // Pre-migration 93 fallback: strictly increasing created_at timestamps
    const parsed = ordered.map(t => Date.parse(t.created_at)).filter(Number.isFinite);
    let cursor = parsed.length ? Math.min(...parsed) : Date.now() - ordered.length * 1000;
    const next: DocumentTemplate[] = [];
    const updates: { id: string; created_at: string }[] = [];
    for (const tpl of ordered) {
        const currentMs = Date.parse(tpl.created_at);
        const targetMs = Number.isFinite(currentMs) && currentMs > cursor ? currentMs : cursor + 1000;
        cursor = targetMs;
        const created_at = new Date(targetMs).toISOString();
        if (created_at !== tpl.created_at) {
            updates.push({ id: tpl.id, created_at });
            next.push({ ...tpl, created_at });
        } else {
            next.push(tpl);
        }
    }
    await Promise.all(updates.map(async u => {
        const { error } = await supabase.from('document_templates').update({ created_at: u.created_at }).eq('id', u.id);
        if (error) throw error;
    }));
    return next;
}

/** Save a course's custom template preset (`courses.template_ids`). */
export async function saveCourseTemplatePreset(courseId: string, templateIds: string[]): Promise<string[]> {
    const { data, error } = await supabase
        .from('courses')
        .update({ template_ids: templateIds })
        .eq('id', courseId)
        .select('template_ids')
        .single();
    if (error) throw error;
    return (data?.template_ids as string[] | null) ?? templateIds;
}

/** Download a template's raw bytes. The bucket is private, so this goes through the signed-in session. */
export async function fetchTemplateBuffer(storagePath: string): Promise<ArrayBuffer> {
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
    if (error || !data) throw new Error(/not.?found|404/i.test(error?.message || '') ? 'File not found' : (error?.message || 'No data'));
    return data.arrayBuffer();
}

/** Save a stored template to the computer, e.g. to edit it in Word and upload it again. */
export async function downloadTemplate(tpl: Pick<DocumentTemplate, 'name' | 'storage_path'>): Promise<void> {
    const buffer = await fetchTemplateBuffer(tpl.storage_path);
    const name = /\.docx$/i.test(tpl.name) ? tpl.name : `${tpl.name}.docx`;
    downloadBlob(new Blob([buffer], { type: DOCX_MIME }), name);
}

// ─── Course presets ─────────────────────────────────────────

export type PresetState = 'all' | 'preset' | 'preset-off';

/**
 * Which templates a course uses. A course that picked templates uses the picked ones (in the
 * order they were picked) that are switched on — or none, if they are all switched off
 * ('preset-off'), rather than silently falling back to every active template.
 * No picks (or only picks of deleted templates) = all active.
 */
export function coursePreset<T extends { id: string; is_active: boolean }>(templates: T[], templateIds?: string[] | null): { templates: T[]; state: PresetState } {
    const byId = new Map(templates.map(t => [t.id, t]));
    const picked = (templateIds ?? []).map(id => byId.get(id)).filter((t): t is T => !!t);
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
        else skipped.push(fullName(e.students) || 'Unknown');
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
        if (isMissingTable(error)) return { columns: getConfig().excelColumns, shared: false };
        throw error;
    }
    const saved = data?.excel_columns;
    return { columns: Array.isArray(saved) ? saved.filter(isColumn) : getConfig().excelColumns, shared: true };
}

export async function saveExcelColumns(columns: ExcelColumn[], shared: boolean): Promise<void> {
    if (!shared) {
        setConfig({ excelColumns: columns });
        return;
    }
    // Persist to shared table first; only mirror locally after DB write succeeds so rollbacks never desync
    const { error } = await supabase.from('document_settings').upsert({
        id: true,
        excel_columns: columns,
        updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    setConfig({ excelColumns: columns });
}

async function buildParticipantsWorkbook(
    enrollments: EnrollmentWithRelations[],
    columns: ExcelColumn[],
    customVariables: Record<string, string>,
    dateVariables: DateVariable[],
    today: string,
    context: DocContext,
): Promise<ArrayBuffer> {
    const sorted = sortBySurname(enrollments);
    const rows = sorted.map(enrollment => {
        const data = { ...buildPlaceholderData(enrollment, today, context), ...customVariables, ...dateVariableValues(dateVariables, enrollment, today) };
        return columns.map(col => data[col.placeholder]);
    });
    const sheet = styledTable('Participants', columns.map(col => col.header), rows, { filter: true });
    return (await xlsxBlob([sheet])).arrayBuffer();
}

// ─── Generation history (migration 93) ──────────────────────

export async function fetchDocumentGenerations(limit = 30): Promise<{ records: DocumentGenerationRecord[]; ready: boolean }> {
    const { data, error } = await supabase
        .from('document_generations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        if (isMissingTable(error)) return { records: [], ready: false };
        throw error;
    }
    return { records: (data || []) as DocumentGenerationRecord[], ready: true };
}

export type NewGenerationRecord = Omit<DocumentGenerationRecord, 'id' | 'created_at' | 'created_by'>;

export async function recordDocumentGeneration(entry: NewGenerationRecord): Promise<DocumentGenerationRecord | null> {
    try {
        const { data, error } = await supabase
            .from('document_generations')
            .insert(entry)
            .select()
            .single();
        if (error) {
            if (isMissingTable(error)) return null;
            console.warn('Could not log document generation run:', error);
            return null;
        }
        return data as DocumentGenerationRecord;
    } catch {
        return null;
    }
}

// ─── Context: course date schedules, signed-in staff member ─

/** The signed-in person's name for {staffName}: the name set in Settings → Your name, or ''. */
export function staffNameOf(user: { user_metadata?: Record<string, unknown> } | null | undefined): string {
    const meta = user?.user_metadata ?? {};
    const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : '';
    return name.trim();
}

/**
 * Days and place of the course dates these people attend, and the signed-in staff member.
 * Either part may be missing (no schedule saved, migration 79 not run): its placeholders print blank.
 */
export async function fetchDocContext(people: EnrollmentWithRelations[]): Promise<DocContext> {
    const courseIds = [...new Set(people.map(e => e.course_id).filter(Boolean))];
    const [sessions, staffName] = await Promise.all([
        (async (): Promise<SessionMap> => {
            if (!courseIds.length) return {};
            try {
                const CHUNK = 100;
                const chunks = Array.from({ length: Math.ceil(courseIds.length / CHUNK) }, (_, i) => courseIds.slice(i * CHUNK, (i + 1) * CHUNK));
                const pages = await Promise.all(chunks.map(chunk =>
                    fetchAllPages<Record<string, unknown>>((from, to) => {
                        const q = supabase
                            .from('invite_dates')
                            .select(SESSION_COLUMNS)
                            .in('course_id', chunk)
                            .order('course_id')
                            .order('invite_date') as unknown as {
                                range?: (f: number, t: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
                            } & PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
                        return typeof q?.range === 'function' ? q.range(from, to) : q;
                    })
                ));
                const map: SessionMap = {};
                for (const row of pages.flat()) {
                    const session = sessionFromRow(row as Parameters<typeof sessionFromRow>[0]);
                    if (session && typeof row.course_id === 'string') map[courseDateKey(row.course_id, session.date)] = session;
                }
                return map;
            } catch (error) {
                console.warn('Course date schedules unavailable for documents:', error);
                return {};
            }
        })(),
        // No name is no reason to stop: {staffName} then prints blank
        Promise.resolve().then(() => supabase.auth.getSession()).then(({ data }) => staffNameOf(data.session?.user), () => ''),
    ]);
    return { sessions, staffName };
}

// ─── Archive ────────────────────────────────────────────────

export type GenerationPhase = 'refreshing' | 'downloading' | 'rendering' | 'packing';

export interface ArchiveOptions {
    enrollments: EnrollmentWithRelations[];
    templates: TemplateDescriptor[];
    attendanceTemplatePath?: string | null;
    labelTemplatePath?: string | null;
    sicapTemplatePath?: string | null;
    /** Course date schedules and the signed-in staff member (see fetchDocContext). */
    context?: DocContext;
    customVariables?: Record<string, string>;
    /** Custom variables worked out per participant (see variablesForArchive). */
    dateVariables?: DateVariable[];
    excelColumns?: ExcelColumn[];
    /** Also add one combined file per student with all their templates, for printing. */
    combined?: boolean;
    /** Called after every generated file. */
    onProgress?: (done: number, total: number) => void;
    /** Called when moving between pipeline phases. */
    onPhase?: (phase: GenerationPhase) => void;
    /** Abort to cancel the run; it then rejects with an AbortError. */
    signal?: AbortSignal;
    /** Override template download (tests). */
    fetchTemplate?: (storagePath: string) => Promise<ArrayBuffer>;
    today?: string;
}

export async function buildDocumentsArchive(options: ArchiveOptions): Promise<{ blob: Blob; result: GenerationResult }> {
    const {
        templates, attendanceTemplatePath, labelTemplatePath, sicapTemplatePath, excelColumns = [], combined = false,
        customVariables = {}, dateVariables = [], onProgress, onPhase, signal,
        fetchTemplate = fetchTemplateBuffer, today = todayISO(), context = {},
    } = options;
    if (signal?.aborted) throw abortError();
    const people = sortBySurname(options.enrollments.filter(e => e.students));
    const hasPeople = people.length > 0;

    onPhase?.('downloading');
    // Download every template (and build the Excel list) up front, in parallel
    const download = (name: string, path: string): Promise<TemplateFile> => fetchTemplate(path).then(
        buffer => ({ name, buffer }),
        (err: unknown) => ({ name, buffer: null, error: `Download failed: ${errorMessage(err, String(err))}` }),
    );
    const excelFile = (): Promise<ExtraFile> => buildParticipantsWorkbook(people, excelColumns, customVariables, dateVariables, today, context).then(
        buffer => ({ label: 'Participants.xlsx', path: 'Participants.xlsx', buffer }),
        (err: unknown) => ({ label: 'Participants.xlsx', path: 'Participants.xlsx', buffer: null, error: errorMessage(err, String(err)) }),
    );
    const [docFiles, attendance, labels, sicap, excel] = await Promise.all([
        Promise.all(templates.map(t => download(t.name, t.storagePath))),
        attendanceTemplatePath && hasPeople ? download('Attendance sheet', attendanceTemplatePath) : null,
        labelTemplatePath && hasPeople ? download('Address labels', labelTemplatePath) : null,
        sicapTemplatePath && hasPeople ? download('SICAP course form', sicapTemplatePath) : null,
        excelColumns.length && hasPeople ? excelFile() : null,
    ]);
    if (signal?.aborted) throw abortError();

    onPhase?.('rendering');
    const { zip, result } = await runRenderJob(
        { enrollments: people, templates: docFiles, attendance, labels, sicap, extraFiles: excel ? [excel] : [], customVariables, dateVariables, combined, today, context },
        {
            onProgress: (done, total) => {
                onProgress?.(done, total);
                if (total > 0 && done >= total) onPhase?.('packing');
            },
            signal,
        },
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
    /** Also add one combined file per student with all their templates, for printing. */
    combined?: boolean;
    /** Optional subset of Word template IDs to include (undefined = course preset / all active). */
    templateIds?: string[];
    includeAttendance?: boolean;
    includeLabels?: boolean;
    includeSicap?: boolean;
    includeExcel?: boolean;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    onPhase?: (phase: GenerationPhase) => void;
}

/**
 * Documents for a hand-picked selection (the enrollment board): re-reads the people,
 * then uses the course preset (or explicit `templateIds` overrides), the attendance/label/SICAP
 * templates, the shared Excel columns and the custom variables, and downloads the archive.
 */
export async function generateSelectionArchive(
    selected: EnrollmentWithRelations[],
    {
        combined = false,
        templateIds,
        includeAttendance = true,
        includeLabels = true,
        includeSicap = true,
        includeExcel = true,
        signal,
        onProgress,
        onPhase,
    }: SelectionOptions = {},
): Promise<{ fileName: string; result: GenerationResult; skippedIds: string[]; staffName: string; people: EnrollmentWithRelations[] }> {
    onPhase?.('refreshing');
    const { people, skipped } = await refreshParticipants(selected);
    if (signal?.aborted) throw abortError();
    if (!people.length) throw new Error('The selected enrollments no longer exist.');

    const keptIds = new Set(people.map(p => p.id));
    const skippedIds = selected.filter(e => !keptIds.has(e.id)).map(e => e.id);

    const courseIds = [...new Set(people.map(e => e.course_id))];
    const [templates, attTemplate, lblTemplate, sicapTemplate, vars, excel, context, course] = await Promise.all([
        fetchDocumentTemplates(),
        includeAttendance ? fetchSingleTemplate('attendance') : Promise.resolve(null),
        includeLabels ? fetchSingleTemplate('labels') : Promise.resolve(null),
        includeSicap ? fetchSingleTemplate('sicap') : Promise.resolve(null),
        fetchTemplateVariables(),
        includeExcel ? fetchExcelColumns() : Promise.resolve({ columns: [] as ExcelColumn[], shared: true }),
        fetchDocContext(people),
        // A course preset only applies when the whole selection is one course and no explicit override was given
        templateIds === undefined && courseIds.length === 1
            ? supabase.from('courses').select('template_ids').eq('id', courseIds[0]).maybeSingle().then(({ data, error }) => {
                if (error) throw error;
                return data as { template_ids?: string[] | null } | null;
            })
            : null,
    ]);
    if (signal?.aborted) throw abortError();

    let wordTemplates: DocumentTemplate[];
    let presetOff = false;
    if (templateIds !== undefined) {
        const byId = new Map(templates.map(t => [t.id, t]));
        wordTemplates = templateIds.map(id => byId.get(id)).filter((t): t is DocumentTemplate => !!t);
    } else {
        const preset = coursePreset(templates, course?.template_ids);
        wordTemplates = preset.templates;
        presetOff = preset.state === 'preset-off';
    }

    const activeExcelColumns = includeExcel ? excel.columns : [];
    if (!wordTemplates.length && !attTemplate && !lblTemplate && !sicapTemplate && !activeExcelColumns.length) {
        if (presetOff) {
            throw new Error('Every Word template picked for this course is switched off, and no other outputs are enabled.');
        }
        throw new Error('No active template found. Please upload and activate at least one template.');
    }

    const fileName = archiveFileName(people);
    const result = await generateDocumentsArchive(fileName, {
        enrollments: people,
        templates: wordTemplates.map(t => ({ name: templateLabel(t), storagePath: t.storage_path })),
        attendanceTemplatePath: includeAttendance ? attTemplate?.storage_path : null,
        labelTemplatePath: includeLabels ? lblTemplate?.storage_path : null,
        sicapTemplatePath: includeSicap ? sicapTemplate?.storage_path : null,
        context,
        ...variablesForArchive(vars),
        excelColumns: activeExcelColumns,
        combined,
        signal,
        onProgress,
        onPhase,
    });
    result.skipped = skipped;

    // Best-effort log to document_generations (migration 93)
    const downloaded = result.totalDocs > 0 || result.extras.some(x => x.ok);
    if (downloaded) {
        const statuses = new Set(people.map(p => p.status));
        const runStatus: DocumentGenerationRecord['status'] =
            statuses.size === 1 && statuses.has('completed') ? 'completed'
                : statuses.size === 1 && statuses.has('confirmed') ? 'confirmed'
                    : 'mixed';
        const dates = [...new Set(people.map(e => courseDateOf(e)?.slice(0, 10)).filter((d): d is string => !!d))];
        const distinctCourses = [...new Set(people.map(e => e.courses?.name || '').filter(Boolean))];
        void recordDocumentGeneration({
            staff_name: context.staffName ?? '',
            course_id: courseIds.length === 1 ? courseIds[0] : null,
            course_name: distinctCourses.join(', ') || 'Multiple courses',
            session_date: dates.length === 1 ? dates[0] : null,
            status: runStatus,
            participant_count: people.length,
            template_names: wordTemplates.map(t => templateLabel(t)),
            extras: result.extras.filter(x => x.ok).map(x => x.label),
            file_name: fileName,
            total_docs: result.totalDocs,
            had_problems: result.failedTemplates.length > 0 || result.failedDocs.length > 0 || result.extras.some(x => !x.ok),
            source: 'board',
        });
    }

    return { fileName, result, skippedIds, staffName: context.staffName ?? '', people };
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

    const made: string[] = [];
    if (result.totalTemplates > 0 || result.totalDocs > 0) {
        made.push(`${result.totalDocs} document(s) from ${result.successTemplates.length}/${result.totalTemplates} template(s)`);
    }
    for (const x of result.extras) if (x.ok) made.push(x.files > 1 ? `${x.label} (${x.files} pages)` : x.label);
    if (!made.length) made.push('0 documents');

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

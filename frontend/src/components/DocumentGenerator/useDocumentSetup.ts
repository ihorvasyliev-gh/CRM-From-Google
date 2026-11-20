import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import {
    MAX_TEMPLATE_BYTES, SINGLE_TEMPLATES, createTemplate, deleteTemplate,
    fetchDocumentGenerations, fetchDocumentTemplates, fetchExcelColumns, fetchSingleTemplate,
    fetchTemplateVariables, inspectTemplate, recordDocumentGeneration, replaceTemplateFile, saveCourseTemplatePreset,
    saveExcelColumns, saveTemplateOrder, sicapTableReady, updateTemplateMetadata,
    variablesForArchive, variablesToMap,
    type DateRule, type NewGenerationRecord, type SingleKind, type TemplateKind,
} from '../../lib/documentUtils';
import type { ExcelColumn } from '../../lib/appConfig';
import type { Course, DocumentGenerationRecord, DocumentTemplate, TemplateVariable } from '../../lib/types';
import type { VariableUpdateInput } from './types';

export const DOC_KEYS = {
    templates: ['doc_templates'],
    variables: ['doc_custom_vars'],
    excel: ['doc_excel_columns'],
    generations: ['doc_generations'],
    single: (kind: SingleKind) => [SINGLE_TEMPLATES[kind].queryKey],
} as const;

export type VetResult =
    | { error: string }
    | { note: string; tags: string[]; unknownTags: string[] };

/**
 * Check a .docx before it is stored: reject files docxtemplater cannot parse and
 * return extracted tags + a note listing placeholders that nothing fills in (they would print blank).
 */
export async function vetTemplateFile(
    file: File,
    kind: TemplateKind,
    customVariables: Record<string, string>,
): Promise<VetResult> {
    if (!/\.docx$/i.test(file.name)) return { error: 'Only .docx files are supported' };
    if (file.size > MAX_TEMPLATE_BYTES) return { error: 'File size must be less than 5MB' };
    const check = await inspectTemplate(file, kind, customVariables);
    if (check.error) {
        if (check.corrupt) return { error: `"${file.name}" is not a valid Word (.docx) document.` };
        return { error: `"${file.name}" has a placeholder error: ${check.error}. Fix it in Word and upload again.` };
    }
    return {
        tags: check.tags,
        unknownTags: check.unknownTags,
        note: check.unknownTags.length
            ? ` Unknown placeholders will print blank: ${check.unknownTags.map(t => `{${t}}`).join(', ')}. Check the spelling or add them as custom variables.`
            : '',
    };
}

/** Templates, custom variables, Excel columns, course presets and recent generations of the Documents section. */
export function useDocumentSetup() {
    const queryClient = useQueryClient();

    const templatesQuery = useQuery({ queryKey: DOC_KEYS.templates, queryFn: fetchDocumentTemplates });
    const attendanceQuery = useQuery({ queryKey: DOC_KEYS.single('attendance'), queryFn: () => fetchSingleTemplate('attendance') });
    const labelsQuery = useQuery({ queryKey: DOC_KEYS.single('labels'), queryFn: () => fetchSingleTemplate('labels') });
    const sicapQuery = useQuery({ queryKey: DOC_KEYS.single('sicap'), queryFn: () => fetchSingleTemplate('sicap') });
    // Only probe whether migration 91 ran when no SICAP template came back (avoids an extra HEAD request when configured)
    const sicapReadyQuery = useQuery({
        queryKey: ['doc_sicap_ready'],
        queryFn: sicapTableReady,
        staleTime: 5 * 60_000,
        enabled: !sicapQuery.isLoading && !sicapQuery.data,
    });
    const variablesQuery = useQuery({ queryKey: DOC_KEYS.variables, queryFn: fetchTemplateVariables });
    const excelQuery = useQuery({ queryKey: DOC_KEYS.excel, queryFn: fetchExcelColumns });
    const generationsQuery = useQuery({
        queryKey: DOC_KEYS.generations,
        queryFn: () => fetchDocumentGenerations(30),
        staleTime: 60_000,
    });

    const coreQueries = [templatesQuery, attendanceQuery, labelsQuery, sicapQuery, variablesQuery, excelQuery];
    const error = coreQueries.find(q => q.error)?.error ?? null;
    const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
    const customVars = useMemo(() => variablesQuery.data ?? [], [variablesQuery.data]);
    const customVarMap = useMemo(() => variablesToMap(customVars), [customVars]);
    const archiveVariables = useMemo(() => variablesForArchive(customVars), [customVars]);

    const setTemplates = (update: (prev: DocumentTemplate[]) => DocumentTemplate[]) =>
        queryClient.setQueryData<DocumentTemplate[]>(DOC_KEYS.templates, (old = []) => update(old));
    const setVariables = (update: (prev: TemplateVariable[]) => TemplateVariable[]) =>
        queryClient.setQueryData<TemplateVariable[]>(DOC_KEYS.variables, (old = []) => update(old));

    // ── Word templates ──
    const uploadTemplate = useMutation({
        mutationFn: ({ file, tags }: { file: File; tags?: string[] }) => {
            const current = queryClient.getQueryData<DocumentTemplate[]>(DOC_KEYS.templates) ?? [];
            const nextOrder = current.reduce((max, t, idx) => Math.max(max, (t.sort_order ?? idx) + 1), 0);
            return createTemplate('document_templates', file, 'template', {
                tags,
                sizeBytes: file.size,
                sortOrder: nextOrder,
            });
        },
        onSuccess: row => setTemplates(prev => [...prev, row]),
    });

    const replaceTemplate = useMutation({
        mutationFn: ({ tpl, file, tags }: { tpl: DocumentTemplate; file: File; tags?: string[] }) =>
            replaceTemplateFile('document_templates', tpl, file, 'template', { tags, sizeBytes: file.size }),
        onSuccess: row => setTemplates(prev => prev.map(t => t.id === row.id ? row : t)),
    });

    const updateTemplateMeta = useMutation({
        mutationFn: ({ id, display_name, description }: { id: string; display_name?: string | null; description?: string }) =>
            updateTemplateMetadata(id, { display_name, description }),
        onSuccess: row => setTemplates(prev => prev.map(t => t.id === row.id ? { ...t, ...row } : t)),
    });

    const toggleActive = useMutation({
        mutationFn: async (tpl: DocumentTemplate) => {
            const nextActive = !tpl.is_active;
            const { data, error } = await supabase
                .from('document_templates')
                .update({ is_active: nextActive, updated_at: new Date().toISOString() })
                .eq('id', tpl.id)
                .select()
                .single();
            if (error) {
                if (error.code === 'PGRST116') throw new Error('This template was deleted by another admin.');
                throw error;
            }
            return (data as DocumentTemplate | null) ?? { ...tpl, is_active: nextActive };
        },
        onSuccess: row => setTemplates(prev => prev.map(t => t.id === row.id ? row : t)),
    });

    const removeTemplate = useMutation({
        mutationFn: async (tpl: DocumentTemplate) => { await deleteTemplate('document_templates', tpl); return tpl; },
        onSuccess: tpl => {
            setTemplates(prev => prev.filter(t => t.id !== tpl.id));
            // The database drops the template from course presets (migration 73)
            queryClient.invalidateQueries({ queryKey: ['doc_courses'] });
            queryClient.invalidateQueries({ queryKey: ['courses'] });
        },
    });

    const reorderTemplates = useMutation({
        mutationFn: (ordered: DocumentTemplate[]) => saveTemplateOrder(ordered),
        onMutate: ordered => {
            const previous = queryClient.getQueryData<DocumentTemplate[]>(DOC_KEYS.templates);
            queryClient.setQueryData(DOC_KEYS.templates, ordered);
            return { previous };
        },
        onSuccess: next => {
            queryClient.setQueryData(DOC_KEYS.templates, next);
        },
        onError: (_err, _ordered, context) => {
            if (context?.previous) queryClient.setQueryData(DOC_KEYS.templates, context.previous);
        },
    });

    // ── Course template presets ──
    const saveCoursePreset = useMutation({
        mutationFn: ({ courseId, templateIds }: { courseId: string; templateIds: string[] }) =>
            saveCourseTemplatePreset(courseId, templateIds),
        onSuccess: (templateIds, { courseId }) => {
            const patch = (old?: Course[]) => old?.map(c => c.id === courseId ? { ...c, template_ids: templateIds } : c);
            queryClient.setQueryData<Course[]>(['doc_courses'], patch);
            queryClient.setQueryData<Course[]>(['courses'], patch);
        },
    });

    // ── Attendance sheet / labels / SICAP form: one template each ──
    const saveSingle = useMutation({
        mutationFn: async ({ kind, file, tags }: { kind: SingleKind; file: File; tags?: string[] }) => {
            const { table, prefix } = SINGLE_TEMPLATES[kind];
            const current = queryClient.getQueryData<DocumentTemplate | null>(DOC_KEYS.single(kind));
            const meta = { tags, sizeBytes: file.size };
            const row = current
                ? await replaceTemplateFile(table, current, file, prefix, meta)
                : await createTemplate(table, file, prefix, meta);
            return { kind, row };
        },
        onSuccess: ({ kind, row }) => queryClient.setQueryData(DOC_KEYS.single(kind), row),
    });

    const removeSingle = useMutation({
        mutationFn: async (kind: SingleKind) => {
            const current = queryClient.getQueryData<DocumentTemplate | null>(DOC_KEYS.single(kind));
            if (current) await deleteTemplate(SINGLE_TEMPLATES[kind].table, current);
            return kind;
        },
        onSuccess: kind => queryClient.setQueryData(DOC_KEYS.single(kind), null),
    });

    // ── Custom variables ──
    const addVariable = useMutation({
        mutationFn: async ({ key, value, rule }: { key: string; value: string; rule?: DateRule }) => {
            const row: Record<string, unknown> = rule
                ? { var_key: key, var_value: '', kind: 'date', date_rule: rule }
                : { var_key: key, var_value: value, kind: 'text', date_rule: null };
            const { data, error } = await supabase.from('template_variables').insert(row).select().single();
            if (error) throw error;
            return data as TemplateVariable;
        },
        onSuccess: row => setVariables(prev => [...prev, row]),
    });

    const updateVariable = useMutation({
        mutationFn: async ({ variable, var_key, kind, value, rule }: VariableUpdateInput) => {
            const nextKind = kind ?? variable.kind ?? 'text';
            const patch: Record<string, unknown> = {};
            if (var_key !== undefined && var_key !== variable.var_key) patch.var_key = var_key;
            if (nextKind === 'date') {
                patch.kind = 'date';
                patch.var_value = '';
                patch.date_rule = rule ?? variable.date_rule;
            } else {
                patch.kind = 'text';
                patch.var_value = value ?? variable.var_value;
                patch.date_rule = null;
            }
            const { data, error } = await supabase
                .from('template_variables')
                .update(patch)
                .eq('id', variable.id)
                .select()
                .single();
            if (error) {
                if (error.code === 'PGRST116') throw new Error('This variable was deleted by another admin.');
                throw error;
            }
            return (data as TemplateVariable | null) ?? ({ ...variable, ...patch } as TemplateVariable);
        },
        onSuccess: row => setVariables(prev => prev.map(v => v.id === row.id ? row : v)),
    });

    const removeVariable = useMutation({
        mutationFn: async (variable: TemplateVariable) => {
            const { error } = await supabase.from('template_variables').delete().eq('id', variable.id);
            if (error) throw error;
            return variable;
        },
        onSuccess: row => setVariables(prev => prev.filter(v => v.id !== row.id)),
    });

    // ── Excel columns ──
    const excelShared = excelQuery.data?.shared ?? false;
    const saveColumns = useMutation({
        mutationFn: async (columns: ExcelColumn[]) => { await saveExcelColumns(columns, excelShared); return columns; },
        onMutate: columns => {
            const previous = queryClient.getQueryData(DOC_KEYS.excel);
            queryClient.setQueryData(DOC_KEYS.excel, { columns, shared: excelShared });
            return { previous };
        },
        onError: (_err, _columns, context) => queryClient.setQueryData(DOC_KEYS.excel, context?.previous),
    });

    // ── Generation history ──
    const logGeneration = useMutation({
        mutationFn: (entry: NewGenerationRecord) => recordDocumentGeneration(entry),
        onSuccess: row => {
            if (!row) return;
            queryClient.setQueryData<{ records: DocumentGenerationRecord[]; ready: boolean }>(
                DOC_KEYS.generations,
                old => ({
                    ready: true,
                    records: [row, ...(old?.records ?? []).filter(r => r.id !== row.id)].slice(0, 30),
                }),
            );
        },
    });

    return {
        loading: coreQueries.some(q => q.isLoading),
        error,
        retry: () => coreQueries.forEach(q => { if (q.error) void q.refetch(); }),
        templates,
        attTemplate: attendanceQuery.data ?? null,
        labelTemplate: labelsQuery.data ?? null,
        sicapTemplate: sicapQuery.data ?? null,
        sicapReady: sicapQuery.data ? true : (sicapReadyQuery.data ?? true),
        customVars,
        customVarMap,
        archiveVariables,
        excelColumns: excelQuery.data?.columns ?? [],
        excelShared,
        generations: generationsQuery.data?.records ?? [],
        generationsReady: generationsQuery.data?.ready ?? false,
        uploadTemplate,
        replaceTemplate,
        updateTemplateMeta,
        toggleActive,
        removeTemplate,
        reorderTemplates,
        saveCoursePreset,
        saveSingle,
        removeSingle,
        addVariable,
        updateVariable,
        removeVariable,
        saveColumns,
        logGeneration,
    };
}

export type DocumentSetup = ReturnType<typeof useDocumentSetup>;

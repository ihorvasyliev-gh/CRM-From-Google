import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import {
    SINGLE_TEMPLATES, checkTemplate, createTemplate, deleteTemplate, fetchDocumentTemplates, fetchExcelColumns,
    fetchSingleTemplate, fetchTemplateVariables, replaceTemplateFile, saveExcelColumns, variablesForArchive, variablesToMap,
    MAX_TEMPLATE_BYTES, type DateRule, type SingleKind, type TemplateKind,
} from '../../lib/documentUtils';
import type { ExcelColumn } from '../../lib/appConfig';
import type { DocumentTemplate, TemplateVariable } from '../../lib/types';

export const DOC_KEYS = {
    templates: ['doc_templates'],
    variables: ['doc_custom_vars'],
    excel: ['doc_excel_columns'],
    single: (kind: SingleKind) => [SINGLE_TEMPLATES[kind].queryKey],
} as const;

/**
 * Check a .docx before it is stored: reject files docxtemplater cannot parse and
 * return a note listing placeholders that nothing fills in (they would print blank).
 */
export async function vetTemplateFile(file: File, kind: TemplateKind, customVariables: Record<string, string>): Promise<{ error: string } | { note: string }> {
    if (!/\.docx$/i.test(file.name)) return { error: 'Only .docx files are supported' };
    if (file.size > MAX_TEMPLATE_BYTES) return { error: 'File size must be less than 5MB' };
    const check = await checkTemplate(file, kind, customVariables);
    if (check.error) return { error: `"${file.name}" has a placeholder error: ${check.error}. Fix it in Word and upload again.` };
    return {
        note: check.unknownTags.length
            ? ` Unknown placeholders will print blank: ${check.unknownTags.map(t => `{${t}}`).join(', ')}. Check the spelling or add them as custom variables.`
            : '',
    };
}

/** Templates, custom variables and Excel columns of the Documents page, with their edits. */
export function useDocumentSetup() {
    const queryClient = useQueryClient();

    const templatesQuery = useQuery({ queryKey: DOC_KEYS.templates, queryFn: fetchDocumentTemplates });
    const attendanceQuery = useQuery({ queryKey: DOC_KEYS.single('attendance'), queryFn: () => fetchSingleTemplate('attendance') });
    const labelsQuery = useQuery({ queryKey: DOC_KEYS.single('labels'), queryFn: () => fetchSingleTemplate('labels') });
    const variablesQuery = useQuery({ queryKey: DOC_KEYS.variables, queryFn: fetchTemplateVariables });
    const excelQuery = useQuery({ queryKey: DOC_KEYS.excel, queryFn: fetchExcelColumns });

    const queries = [templatesQuery, attendanceQuery, labelsQuery, variablesQuery, excelQuery];
    const error = queries.find(q => q.error)?.error ?? null;
    const templates = templatesQuery.data ?? [];
    const customVars = useMemo(() => variablesQuery.data ?? [], [variablesQuery.data]);
    const customVarMap = useMemo(() => variablesToMap(customVars), [customVars]);
    const archiveVariables = useMemo(() => variablesForArchive(customVars), [customVars]);

    const setTemplates = (update: (prev: DocumentTemplate[]) => DocumentTemplate[]) =>
        queryClient.setQueryData<DocumentTemplate[]>(DOC_KEYS.templates, (old = []) => update(old));
    const setVariables = (update: (prev: TemplateVariable[]) => TemplateVariable[]) =>
        queryClient.setQueryData<TemplateVariable[]>(DOC_KEYS.variables, (old = []) => update(old));

    // ── Word templates ──
    const uploadTemplate = useMutation({
        mutationFn: (file: File) => createTemplate('document_templates', file, 'template'),
        onSuccess: row => setTemplates(prev => [...prev, row]),
    });
    const replaceTemplate = useMutation({
        mutationFn: ({ tpl, file }: { tpl: DocumentTemplate; file: File }) => replaceTemplateFile('document_templates', tpl, file, 'template'),
        onSuccess: row => setTemplates(prev => prev.map(t => t.id === row.id ? row : t)),
    });
    const toggleActive = useMutation({
        mutationFn: async (tpl: DocumentTemplate) => {
            const { error } = await supabase.from('document_templates').update({ is_active: !tpl.is_active }).eq('id', tpl.id);
            if (error) throw error;
            return { ...tpl, is_active: !tpl.is_active };
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

    // ── Attendance sheet / labels: one template each ──
    const saveSingle = useMutation({
        mutationFn: async ({ kind, file }: { kind: SingleKind; file: File }) => {
            const { table, prefix } = SINGLE_TEMPLATES[kind];
            const current = queryClient.getQueryData<DocumentTemplate | null>(DOC_KEYS.single(kind));
            const row = current ? await replaceTemplateFile(table, current, file, prefix) : await createTemplate(table, file, prefix);
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
            const row: Record<string, unknown> = rule ? { var_key: key, var_value: '', kind: 'date', date_rule: rule } : { var_key: key, var_value: value };
            const { data, error } = await supabase.from('template_variables').insert(row).select().single();
            if (error) throw error;
            return data as TemplateVariable;
        },
        onSuccess: row => setVariables(prev => [...prev, row]),
    });
    const updateVariable = useMutation({
        mutationFn: async ({ variable, value, rule }: { variable: TemplateVariable; value?: string; rule?: DateRule }) => {
            const patch = rule ? { date_rule: rule } : { var_value: value ?? '' };
            const { error } = await supabase.from('template_variables').update(patch).eq('id', variable.id);
            if (error) throw error;
            return { ...variable, ...patch };
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

    return {
        loading: queries.some(q => q.isLoading),
        error,
        retry: () => queries.forEach(q => { if (q.error) q.refetch(); }),
        templates,
        attTemplate: attendanceQuery.data ?? null,
        labelTemplate: labelsQuery.data ?? null,
        customVars,
        customVarMap,
        archiveVariables,
        excelColumns: excelQuery.data?.columns ?? [],
        excelShared,
        uploadTemplate, replaceTemplate, toggleActive, removeTemplate,
        saveSingle, removeSingle,
        addVariable, updateVariable, removeVariable,
        saveColumns,
    };
}

export type DocumentSetup = ReturnType<typeof useDocumentSetup>;

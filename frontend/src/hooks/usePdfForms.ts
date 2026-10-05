import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_SETTINGS, type PdfFormTemplate, type PdfFormTemplateDraft } from '../lib/pdfForms/types';

// Templates live in public.pdf_form_templates, their PDFs in the private "pdf-forms" bucket (migration 75).
const PDF_FORMS_BUCKET = 'pdf-forms';
const PDF_FORMS_KEY = ['pdf_form_templates'] as const;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function normalize(row: PdfFormTemplate): PdfFormTemplate {
    return {
        ...row,
        fields: Array.isArray(row.fields) ? row.fields : [],
        column_aliases: row.column_aliases && typeof row.column_aliases === 'object' ? row.column_aliases : {},
        settings: { ...DEFAULT_SETTINGS, ...(row.settings ?? {}) },
    };
}

/** The signed-in person as printed by {user} (e.g. "LDC Staff Member"): their name, else their email */
export function useFormUserName(): string {
    const { user } = useAuth();
    const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
    return (meta.full_name || meta.name || user?.email || '').trim();
}

async function fetchPdfFormTemplates(): Promise<PdfFormTemplate[]> {
    const { data, error } = await supabase.from('pdf_form_templates').select('*').order('name');
    if (error) throw error;
    return ((data ?? []) as PdfFormTemplate[]).map(normalize);
}

export function usePdfFormTemplates() {
    return useQuery({ queryKey: PDF_FORMS_KEY, queryFn: fetchPdfFormTemplates });
}

// Downloaded PDFs, by storage path (a new revision gets a new path)
const pdfCache = new Map<string, Promise<Uint8Array>>();

export function downloadTemplatePdf(path: string): Promise<Uint8Array> {
    let cached = pdfCache.get(path);
    if (!cached) {
        cached = supabase.storage
            .from(PDF_FORMS_BUCKET)
            .download(path)
            .then(async ({ data, error }) => {
                if (error || !data) throw new Error(error?.message || 'Could not download the PDF');
                return new Uint8Array(await data.arrayBuffer());
            });
        cached.catch(() => pdfCache.delete(path));
        pdfCache.set(path, cached);
    }
    return cached;
}

export function checkPdfFile(file: File): string | null {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return 'Choose a PDF file.';
    if (file.size > MAX_PDF_BYTES) return 'The PDF is larger than 20 MB.';
    return null;
}

function storagePath(file: File): string {
    const safe = file.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'form';
    return `${crypto.randomUUID()}/${safe}.pdf`;
}

export interface SaveTemplateInput {
    id?: string;
    draft: PdfFormTemplateDraft;
    /** A new PDF (new template, or a new revision of an existing one) */
    pdf?: File;
}

export function useSavePdfFormTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, draft, pdf }: SaveTemplateInput): Promise<PdfFormTemplate> => {
            const previous = id ? queryClient.getQueryData<PdfFormTemplate[]>(PDF_FORMS_KEY)?.find(t => t.id === id) : undefined;
            let upload: { pdf_path: string; pdf_name: string } | null = null;
            if (pdf) {
                const path = storagePath(pdf);
                const { error } = await supabase.storage.from(PDF_FORMS_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
                if (error) throw new Error(`Could not upload the PDF: ${error.message}`);
                upload = { pdf_path: path, pdf_name: pdf.name };
            }

            const row = {
                name: draft.name.trim(),
                description: draft.description?.trim() || null,
                fields: draft.fields,
                column_aliases: draft.column_aliases,
                settings: draft.settings,
                ...(upload ?? {}),
            };

            const query = id
                ? supabase.from('pdf_form_templates').update({ ...row, ...(upload ? { revision: (previous?.revision ?? 1) + 1 } : {}) }).eq('id', id)
                : supabase.from('pdf_form_templates').insert(row);
            const { data, error } = await query.select('*').single();
            if (error || !data) {
                // Don't leave an orphaned upload behind
                if (upload) await supabase.storage.from(PDF_FORMS_BUCKET).remove([upload.pdf_path]);
                throw new Error(error?.message || 'Could not save the template');
            }
            // The old revision's file is no longer used
            if (upload && previous?.pdf_path && previous.pdf_path !== upload.pdf_path) {
                await supabase.storage.from(PDF_FORMS_BUCKET).remove([previous.pdf_path]);
            }
            return normalize(data as PdfFormTemplate);
        },
        onSuccess: saved => {
            queryClient.setQueryData<PdfFormTemplate[]>(PDF_FORMS_KEY, prev => {
                const others = (prev ?? []).filter(t => t.id !== saved.id);
                return [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
            });
        },
    });
}

/** Save only the remembered column matches (from the fill screen) */
export function useSaveColumnAliases() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, column_aliases }: { id: string; column_aliases: Record<string, string[]> }) => {
            const { data, error } = await supabase.from('pdf_form_templates').update({ column_aliases }).eq('id', id).select('*').single();
            if (error || !data) throw new Error(error?.message || 'Could not save the column matches');
            return normalize(data as PdfFormTemplate);
        },
        onSuccess: saved => {
            queryClient.setQueryData<PdfFormTemplate[]>(PDF_FORMS_KEY, prev => (prev ?? []).map(t => (t.id === saved.id ? saved : t)));
        },
    });
}

export function useDeletePdfFormTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (template: PdfFormTemplate) => {
            const { error } = await supabase.from('pdf_form_templates').delete().eq('id', template.id);
            if (error) throw new Error(error.message);
            await supabase.storage.from(PDF_FORMS_BUCKET).remove([template.pdf_path]);
        },
        onSuccess: (_d, template) => {
            queryClient.setQueryData<PdfFormTemplate[]>(PDF_FORMS_KEY, prev => (prev ?? []).filter(t => t.id !== template.id));
        },
    });
}

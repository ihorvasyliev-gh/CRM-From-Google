import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { templateTags } from '../lib/documentRender';
import {
    CERT_TEMPLATES_BUCKET, CERT_TEMPLATES_TABLE, isMissingTable, type CertificateLibrary, type CertificateTemplate,
} from '../lib/certificates/library';

// Settings → Certificates: the Word templates offered on /certificates (migration 89, admins).
export const CERT_TEMPLATES_KEY = ['certificate_templates', 'admin'] as const;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Bigger than any certificate with a few pictures and fonts in it */
export const MAX_TEMPLATE_BYTES = 15 * 1024 * 1024;

export async function fetchCertificateTemplates(): Promise<CertificateLibrary> {
    const { data, error } = await supabase.from(CERT_TEMPLATES_TABLE).select('*').order('sort_order').order('name');
    if (error) {
        if (isMissingTable(error)) return { templates: [], available: false };
        throw error;
    }
    return { templates: (data ?? []) as CertificateTemplate[], available: true };
}

export function useCertificateTemplates() {
    return useQuery({ queryKey: CERT_TEMPLATES_KEY, queryFn: fetchCertificateTemplates });
}

/** "Manual Handling" from "Manual Handling Cert.docx" */
export function nameFromFile(fileName: string): string {
    return fileName.replace(/\.docx$/i, '').replace(/[_]+/g, ' ').replace(/\s+(cert(ificate)?|template)(\s+template)?$/i, '').trim() || 'Certificate';
}

/** The file checked as a template: its placeholders, or an error saying what is wrong */
async function readTemplate(file: File): Promise<{ tags: string[] }> {
    if (!/\.docx$/i.test(file.name)) throw new Error('Choose a Word file (.docx). An old .doc or a Publisher file can be saved as .docx from Word.');
    if (file.size > MAX_TEMPLATE_BYTES) throw new Error('This file is over 15 MB. Make the pictures in it smaller in Word and try again.');
    return { tags: await templateTags(await file.arrayBuffer()) };
}

async function uploadFile(file: File): Promise<string> {
    const path = `${crypto.randomUUID()}.docx`;
    const { error } = await supabase.storage.from(CERT_TEMPLATES_BUCKET).upload(path, file, { contentType: DOCX, upsert: false });
    if (error) throw error;
    return path;
}

async function removeFile(path: string): Promise<void> {
    await supabase.storage.from(CERT_TEMPLATES_BUCKET).remove([path]);
}

export type TemplatePatch = Partial<Pick<CertificateTemplate, 'name' | 'validity_months' | 'is_active' | 'sort_order'>>;

export function useCertificateTemplateMutations() {
    const queryClient = useQueryClient();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['certificate_templates'] });
    const current = () => queryClient.getQueryData<CertificateLibrary>(CERT_TEMPLATES_KEY)?.templates ?? [];

    const upload = useMutation({
        mutationFn: async (file: File): Promise<CertificateTemplate> => {
            const { tags } = await readTemplate(file);
            const path = await uploadFile(file);
            const order = Math.max(-1, ...current().map(t => t.sort_order)) + 1;
            const { data, error } = await supabase
                .from(CERT_TEMPLATES_TABLE)
                .insert({ name: nameFromFile(file.name), file_name: file.name, storage_path: path, tags, size_bytes: file.size, sort_order: order })
                .select('*')
                .single();
            if (error) {
                await removeFile(path);
                throw error;
            }
            return data as CertificateTemplate;
        },
        onSettled: refresh,
    });

    const replace = useMutation({
        mutationFn: async ({ template, file }: { template: CertificateTemplate; file: File }): Promise<CertificateTemplate> => {
            const { tags } = await readTemplate(file);
            const path = await uploadFile(file);
            const { data, error } = await supabase
                .from(CERT_TEMPLATES_TABLE)
                .update({ file_name: file.name, storage_path: path, tags, size_bytes: file.size })
                .eq('id', template.id)
                .select('*')
                .single();
            if (error) {
                await removeFile(path);
                throw error;
            }
            await removeFile(template.storage_path);
            return data as CertificateTemplate;
        },
        onSettled: refresh,
    });

    const update = useMutation({
        mutationFn: async ({ id, patch }: { id: string; patch: TemplatePatch }) => {
            const { error } = await supabase.from(CERT_TEMPLATES_TABLE).update(patch).eq('id', id);
            if (error) throw error;
        },
        onMutate: ({ id, patch }) => {
            queryClient.setQueryData<CertificateLibrary>(CERT_TEMPLATES_KEY, prev =>
                prev && { ...prev, templates: prev.templates.map(t => (t.id === id ? { ...t, ...patch } : t)) });
        },
        onSettled: refresh,
    });

    /** Moves a template one place up or down: every template gets its place as its order */
    const move = useMutation({
        mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
            const list = [...current()];
            const i = list.findIndex(t => t.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= list.length) return;
            [list[i], list[j]] = [list[j], list[i]];
            queryClient.setQueryData<CertificateLibrary>(CERT_TEMPLATES_KEY, prev => prev && { ...prev, templates: list.map((t, k) => ({ ...t, sort_order: k })) });
            const changed = list.map((t, k) => ({ t, k })).filter(({ t, k }) => t.sort_order !== k);
            for (const { t, k } of changed) {
                const { error } = await supabase.from(CERT_TEMPLATES_TABLE).update({ sort_order: k }).eq('id', t.id);
                if (error) throw error;
            }
        },
        onSettled: refresh,
    });

    const remove = useMutation({
        mutationFn: async (template: CertificateTemplate) => {
            const { error } = await supabase.from(CERT_TEMPLATES_TABLE).delete().eq('id', template.id);
            if (error) throw error;
            await removeFile(template.storage_path);
        },
        onSettled: refresh,
    });

    return { upload, replace, update, move, remove };
}

/** The template's file, to check it */
export async function downloadCertificateTemplate(template: CertificateTemplate): Promise<Blob> {
    const { data, error } = await supabase.storage.from(CERT_TEMPLATES_BUCKET).download(template.storage_path);
    if (error || !data) throw error ?? new Error('The file could not be downloaded');
    return data;
}

// ─── Certificates: the templates admins keep for /certificates (migration 89) ───
// The public page reads them signed out, through a client of its own that never uses a
// signed-in session: the page behaves the same for everyone, and nothing it does can reach
// anything else. The client is only loaded when the page asks for the templates.

import type { SupabaseClient } from '@supabase/supabase-js';

export const CERT_TEMPLATES_TABLE = 'certificate_templates';
export const CERT_TEMPLATES_BUCKET = 'certificate-templates';

export interface CertificateTemplate {
    id: string;
    name: string;
    file_name: string;
    storage_path: string;
    tags: string[];
    validity_months: number | null;
    is_active: boolean;
    sort_order: number;
    size_bytes: number | null;
    created_at: string;
    updated_at: string;
}

export interface CertificateLibrary {
    templates: CertificateTemplate[];
    /** false until migration 89 is applied */
    available: boolean;
}

export function isMissingTable(error: { code?: string } | null | undefined): boolean {
    return error?.code === 'PGRST205' || error?.code === '42P01';
}

let anonClient: Promise<SupabaseClient> | null = null;
function publicClient(): Promise<SupabaseClient> {
    anonClient ??= import('@supabase/supabase-js').then(({ createClient }) =>
        createClient(import.meta.env.VITE_SUPABASE_URL || '', import.meta.env.VITE_SUPABASE_ANON_KEY || '', {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-certificates-public' },
        }),
    );
    return anonClient;
}

/** The templates that are on, in their order, for /certificates */
export async function fetchPublicCertificateTemplates(): Promise<CertificateLibrary> {
    const supabase = await publicClient();
    const { data, error } = await supabase
        .from(CERT_TEMPLATES_TABLE)
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('name');
    if (error) {
        if (isMissingTable(error)) return { templates: [], available: false };
        throw error;
    }
    return { templates: (data ?? []) as CertificateTemplate[], available: true };
}

/** A kept template's Word file */
export async function downloadPublicCertificateTemplate(template: Pick<CertificateTemplate, 'storage_path'>): Promise<ArrayBuffer> {
    const supabase = await publicClient();
    const { data, error } = await supabase.storage.from(CERT_TEMPLATES_BUCKET).download(template.storage_path);
    if (error || !data) throw error ?? new Error('The template could not be downloaded');
    return data.arrayBuffer();
}

/** The link that opens /certificates with this template chosen */
export function certificateTemplateLink(id: string, origin = window.location.origin): string {
    return `${origin}/certificates?template=${encodeURIComponent(id)}`;
}

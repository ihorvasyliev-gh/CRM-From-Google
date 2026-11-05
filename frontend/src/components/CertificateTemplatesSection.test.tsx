import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PizZip from 'pizzip';
import CertificateTemplatesSection from './CertificateTemplatesSection';

const state = vi.hoisted(() => ({
    rows: [] as Record<string, unknown>[],
    error: null as { code: string } | null,
    inserted: [] as Record<string, unknown>[],
    updated: [] as { patch: Record<string, unknown>; id: unknown }[],
    uploaded: [] as string[],
}));

vi.mock('../lib/supabase', () => {
    const table = () => {
        let patch: Record<string, unknown> | null = null;
        let insert: Record<string, unknown> | null = null;
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
            select: () => chain,
            order: () => chain,
            insert: (row: Record<string, unknown>) => { insert = row; state.inserted.push(row); return chain; },
            update: (p: Record<string, unknown>) => { patch = p; return chain; },
            delete: () => chain,
            eq: (_c: string, id: unknown) => { if (patch) state.updated.push({ patch, id }); return chain; },
            single: () => Promise.resolve({ data: { id: 'new', ...insert }, error: null }),
            then: (resolve: (v: unknown) => void) => resolve(patch || insert ? { error: null } : { data: state.rows, error: state.error }),
        });
        return chain;
    };
    return {
        supabase: {
            from: () => table(),
            storage: { from: () => ({ upload: (path: string) => { state.uploaded.push(path); return Promise.resolve({ error: null }); }, remove: () => Promise.resolve({ error: null }) }) },
        },
    };
});

function docx(text: string): File {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
    return new File([zip.generate({ type: 'uint8array' }) as BlobPart], 'Manual Handling Cert.docx');
}

function renderSection() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><CertificateTemplatesSection /></QueryClientProvider>);
}

const row = {
    id: 'mh', name: 'Manual Handling', file_name: 'Manual Handling Cert.docx', storage_path: 'mh.docx', tags: ['firstName', 'expire'],
    validity_months: 36, is_active: true, sort_order: 0, size_bytes: 1, created_at: '', updated_at: '',
};

describe('CertificateTemplatesSection', () => {
    beforeEach(() => {
        state.rows = [];
        state.error = null;
        state.inserted = [];
        state.updated = [];
        state.uploaded = [];
    });

    it('says to run the migration until the table is there', async () => {
        state.error = { code: 'PGRST205' };
        renderSection();
        expect(await screen.findByText(/89_certificate_templates\.sql/)).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /Add template/ })[0]).toBeDisabled();
    });

    it('uploads a Word file with the placeholders found in it', async () => {
        renderSection();
        await screen.findByText('No certificates yet');
        fireEvent.change(screen.getByLabelText('Add certificate templates'), { target: { files: [docx('{firstName} {courseDate} {expire}')] } });
        await waitFor(() => expect(state.inserted).toHaveLength(1));
        expect(state.uploaded[0]).toMatch(/\.docx$/);
        expect(state.inserted[0]).toMatchObject({ name: 'Manual Handling', file_name: 'Manual Handling Cert.docx', tags: ['firstName', 'courseDate', 'expire'], storage_path: state.uploaded[0] });
    });

    it('changes how long a certificate is valid and hides it from the page', async () => {
        state.rows = [row];
        renderSection();
        const length = await screen.findByLabelText('Valid for');
        expect(length).toHaveValue('36');
        fireEvent.change(length, { target: { value: '24' } });
        fireEvent.click(screen.getByLabelText('On the page'));
        await waitFor(() => expect(state.updated).toEqual([
            { patch: { validity_months: 24 }, id: 'mh' },
            { patch: { is_active: false }, id: 'mh' },
        ]));
    });
});

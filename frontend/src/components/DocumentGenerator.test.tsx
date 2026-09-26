import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PizZip from 'pizzip';
import DocumentGenerator from './DocumentGenerator';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
        storage: { from: vi.fn() },
    },
}));

const tables: Record<string, unknown[]> = {
    courses: [{ id: 'c1', name: 'Python 101', created_at: '2026-01-01' }],
    enrollments: [
        { id: 'e1', course_id: 'c1', status: 'confirmed', confirmed_date: '2026-10-01', students: { id: 's1', first_name: 'Olena', last_name: 'Kovalenko', email: 'olena@example.com' } },
        { id: 'e2', course_id: 'c1', status: 'requested', students: { id: 's2', first_name: 'Seán', last_name: 'Murphy' } },
    ],
    document_templates: [{ id: 't1', name: 'Certificate.docx', storage_path: 'template_1.docx', is_active: true, created_at: '2026-01-01' }],
    attendance_templates: [],
    label_templates: [],
    template_variables: [{ id: 'v1', var_key: 'Tutor', var_value: 'Jane', created_at: '2026-01-01' }],
};

/** Chainable, awaitable stand-in for a PostgREST query on `table`. */
function query(table: string) {
    let page = 0;
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit', 'eq', 'insert', 'update', 'delete', 'single']) chain[m] = () => chain;
    chain.range = (from: number) => { page = from; return chain; };
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: page === 0 ? tables[table] ?? [] : [], error: null });
    return chain;
}

function makeDocx(text: string): File {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
    return new File([zip.generate({ type: 'arraybuffer' })], 'New.docx');
}

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><DocumentGenerator /></QueryClientProvider>);
}

describe('DocumentGenerator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(supabase.from).mockImplementation(((table: string) => query(table)) as never);
    });

    it('lists confirmed participants of the chosen course and offers a one-person trial', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Choose a course/ }));
        fireEvent.click(screen.getByRole('option', { name: /Python 101/ }));

        expect(await screen.findByText('Olena Kovalenko')).toBeInTheDocument();
        expect(screen.queryByText(/Seán/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Try with one participant first/ })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Generate & Download ZIP \(1 student × 1 template\)/ })).toBeEnabled();
    });

    it('refuses to store a template with broken placeholders', async () => {
        renderPage();
        await screen.findByText('Certificate.docx');
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [makeDocx('Hello {firstName')] } });

        expect(await screen.findByText(/has a placeholder error: .*unclosed/)).toBeInTheDocument();
        expect(supabase.storage.from).not.toHaveBeenCalled();
    });

    it('warns about unknown placeholders after upload', async () => {
        const upload = vi.fn().mockResolvedValue({ error: null });
        vi.mocked(supabase.storage.from).mockReturnValue({ upload } as never);
        renderPage();
        await screen.findByText('Certificate.docx');
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [makeDocx('{fullName} {Tutor} {Tuter}')] } });

        await waitFor(() => expect(upload).toHaveBeenCalled());
        expect(await screen.findByText(/Unknown placeholders will print blank: \{Tuter\}/)).toBeInTheDocument();
    });

    it('rejects custom variable names that cannot be used as a tag', async () => {
        renderPage();
        await screen.findByText('Certificate.docx');
        fireEvent.change(screen.getByLabelText('Variable Name'), { target: { value: 'Tutor Name' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]); // custom variables come before Excel columns
        expect(await screen.findByText(/Use letters, digits and _ only/)).toBeInTheDocument();
    });
});

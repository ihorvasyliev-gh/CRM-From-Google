import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PizZip from 'pizzip';
import DocumentGenerator from './DocumentGenerator';
import { supabase } from '../lib/supabase';
import { downloadBlob } from '../lib/download';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
        storage: { from: vi.fn() },
        auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    },
}));
vi.mock('../lib/download', () => ({ downloadBlob: vi.fn() }));

const student = (id: string, first: string, last: string) => ({ id, first_name: first, last_name: last, email: `${first.toLowerCase()}@example.com`, phone: '0871234567', address: '1 Main St', eircode: 'T12 AB34', dob: null });
const enrollment = (id: string, s: ReturnType<typeof student>, extra: Record<string, unknown>) => ({
    id, course_id: 'c1', status: 'confirmed', course_variant: null, notes: null, created_at: '2026-01-01',
    confirmed_date: null, invited_date: null, completed_date: null, students: s, courses: { id: 'c1', name: 'Python 101' }, ...extra,
});

let tables: Record<string, unknown[]>;
let fail: Record<string, string | { message: string; code: string }>;
let calls: { table: string; op: string; payload?: unknown; eq?: unknown }[];

function resetData() {
    tables = {
        courses: [{ id: 'c1', name: 'Python 101', created_at: '2026-01-01', template_ids: [] }],
        enrollments: [
            enrollment('e1', student('s1', 'Olena', 'Kovalenko'), { confirmed_date: '2099-10-01' }),
            enrollment('e2', student('s2', 'Seán', 'Murphy'), { status: 'requested' }),
            enrollment('e3', student('s3', 'Mary', 'Ahern'), { confirmed_date: '2099-10-01' }),
            enrollment('e4', student('s4', 'Tom', 'Walsh'), { confirmed_date: '2099-11-05' }),
            enrollment('e5', student('s5', 'Anna', 'Byrne'), { status: 'completed', confirmed_date: '2020-05-01', completed_date: '2020-05-01' }),
        ],
        document_templates: [{ id: 't1', name: 'Certificate.docx', storage_path: 'template_1.docx', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' }],
        attendance_templates: [],
        label_templates: [],
        template_variables: [{ id: 'v1', var_key: 'Tutor', var_value: 'Jane', created_at: '2026-01-01' }],
        document_settings: [{ id: true, excel_columns: null }],
    };
    fail = {};
    calls = [];
}

/** Chainable, awaitable stand-in for a PostgREST query on `table`. */
function query(table: string) {
    let page = 0;
    let op = 'select';
    let payload: unknown;
    let single = false;
    let ids: string[] | null = null;
    let eq: unknown;
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit']) chain[m] = () => chain;
    chain.eq = (_col: string, value: unknown) => { eq = value; return chain; };
    chain.range = (from: number) => { page = from; return chain; };
    chain.in = (_col: string, values: string[]) => { ids = values; return chain; };
    chain.single = chain.maybeSingle = () => { single = true; return chain; };
    for (const m of ['insert', 'update', 'upsert', 'delete']) chain[m] = (p?: unknown) => { op = m; payload = p; return chain; };
    chain.then = (resolve: (v: unknown) => void) => {
        calls.push({ table, op, payload, eq });
        const err = fail[table];
        if (err) return resolve({ data: null, error: typeof err === 'string' ? { message: err } : err });
        if (op === 'insert') return resolve({ data: { ...(payload as object), id: 'new', created_at: '2026-09-01', updated_at: '2026-09-01' }, error: null });
        if (op !== 'select') return resolve({ data: null, error: null });
        let rows = page === 0 ? tables[table] ?? [] : [];
        if (ids) rows = rows.filter(r => ids!.includes((r as { id: string }).id));
        resolve({ data: single ? rows[0] ?? null : rows, error: null });
    };
    return chain;
}

function docx(text: string): ArrayBuffer {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
    return zip.generate({ type: 'arraybuffer' });
}
const docxFile = (text: string, name = 'New.docx') => new File([docx(text)], name);

const storage = { upload: vi.fn(), remove: vi.fn(), download: vi.fn() };

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><DocumentGenerator /></QueryClientProvider>);
}

async function chooseCourse(name = /Python 101/) {
    fireEvent.click(await screen.findByRole('button', { name: /Choose a course/ }));
    fireEvent.click(screen.getByRole('option', { name }));
}

const newTemplateInput = () => screen.getByText('Add new template').closest('label')!.querySelector('input')!;
const generateButton = () => screen.getByRole('button', { name: /Generate & Download ZIP/ });

describe('DocumentGenerator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        localStorage.clear();
        resetData();
        vi.mocked(supabase.from).mockImplementation(((table: string) => query(table)) as never);
        vi.mocked(supabase.storage.from).mockReturnValue(storage as never);
        storage.upload.mockResolvedValue({ error: null });
        storage.remove.mockResolvedValue({ error: null });
        storage.download.mockImplementation(async () => ({ data: new Blob([docx('{fullName} / {Tutor}')]), error: null }));
    });

    it('lists the confirmed participants of the next course date, one date at a time', async () => {
        renderPage();
        await chooseCourse();

        const dates = screen.getByRole('radiogroup', { name: 'Course date' });
        expect(within(dates).getByRole('radio', { name: /01 Oct 2099/ })).toHaveAttribute('aria-checked', 'true');
        expect(await screen.findByText('Olena Kovalenko')).toBeInTheDocument();
        expect(screen.getByText('Mary Ahern')).toBeInTheDocument();
        expect(screen.queryByText('Tom Walsh')).not.toBeInTheDocument();
        expect(screen.queryByText(/Seán/)).not.toBeInTheDocument();
        expect(generateButton()).toHaveTextContent('2 students × 1 template');

        fireEvent.click(within(dates).getByRole('radio', { name: /05 Nov 2099/ }));
        expect(screen.getByText('Tom Walsh')).toBeInTheDocument();
        expect(screen.queryByText('Olena Kovalenko')).not.toBeInTheDocument();
    });

    it('finds a course by typing and picks it with the keyboard', async () => {
        tables.courses.push({ id: 'c2', name: 'Excel Basics', created_at: '2026-01-01' });
        tables.enrollments.push({ ...enrollment('e9', student('s9', 'Ian', 'Roche'), { confirmed_date: '2099-10-01' }), course_id: 'c2' });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Choose a course/ }));
        const search = screen.getByRole('combobox', { name: 'Search courses' });
        fireEvent.change(search, { target: { value: 'excel' } });
        expect(within(screen.getByRole('listbox', { name: 'Courses' })).getAllByRole('option')).toHaveLength(1);
        fireEvent.keyDown(search, { key: 'Enter' });
        expect(await screen.findByText('Ian Roche')).toBeInTheDocument();
    });

    it('switches to people who completed the course', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('tab', { name: /Completed/ }));
        await chooseCourse();
        expect(screen.getByText('Anna Byrne')).toBeInTheDocument();
        expect(screen.queryByText('Olena Kovalenko')).not.toBeInTheDocument();
    });

    it('leaves out unticked participants', async () => {
        renderPage();
        await chooseCourse();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Include Mary Ahern' }));
        expect(generateButton()).toHaveTextContent('1 student × 1 template');
        expect(screen.getByRole('checkbox', { name: 'Select all participants' })).toHaveProperty('indeterminate', true);
    });

    it('generates from freshly loaded data and reports who was left out', async () => {
        renderPage();
        await chooseCourse();
        // Since the list was loaded: Olena's surname was corrected, Mary moved back to requested
        tables.enrollments = tables.enrollments.map(e => {
            const row = e as ReturnType<typeof enrollment>;
            if (row.id === 'e1') return { ...row, students: { ...row.students, last_name: 'Kovalenko-Shevchenko' } };
            if (row.id === 'e3') return { ...row, status: 'requested' };
            return row;
        });
        fireEvent.click(generateButton());

        await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
        const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
        expect(name).toBe('Python 101 (English) 01 10 2099.zip');
        const zip = new PizZip(await (blob as Blob).arrayBuffer());
        const doc = new PizZip(zip.file('Olena_Kovalenko-Shevchenko.docx')!.asArrayBuffer()).file('word/document.xml')!.asText();
        expect(doc).toContain('Olena Kovalenko-Shevchenko / Jane');
        expect(zip.file('Participants.xlsx')).toBeTruthy();
        expect(zip.file(/Ahern/)).toHaveLength(0);

        expect(await screen.findByText(/Left out 1 whose enrollment changed/)).toHaveTextContent('Mary Ahern');
        expect(storage.download).toHaveBeenCalledWith('template_1.docx');
    });

    it('leaves out people moved to another course date since the list was loaded', async () => {
        renderPage();
        await chooseCourse();
        tables.enrollments = tables.enrollments.map(e => (e as { id: string }).id === 'e3' ? { ...(e as object), confirmed_date: '2099-11-05' } : e);
        fireEvent.click(generateButton());

        expect(await screen.findByText(/Left out 1 whose enrollment changed/)).toHaveTextContent('Mary Ahern');
        const zip = new PizZip(await (vi.mocked(downloadBlob).mock.calls[0][0] as Blob).arrayBuffer());
        expect(zip.file(/Ahern/)).toHaveLength(0);
        expect(zip.file('Olena_Kovalenko.docx')).toBeTruthy();
    });

    it('keeps Excel columns in this browser until the shared settings table exists', async () => {
        fail.document_settings = { message: 'Could not find the table', code: 'PGRST205' };
        renderPage();
        expect(await screen.findByText(/Saved in this browser only/)).toBeInTheDocument();
        expect(screen.queryByText('Could not load the document templates')).not.toBeInTheDocument();
    });

    it('treats other failures to load the Excel columns as an error', async () => {
        fail.document_settings = { message: 'Failed to fetch', code: '' };
        renderPage();
        expect(await screen.findByText('Could not load the document templates')).toBeInTheDocument();
    });

    it('warns when every template picked for the course is switched off', async () => {
        tables.courses = [{ id: 'c1', name: 'Python 101', created_at: '2026-01-01', template_ids: ['t1'] }];
        (tables.document_templates[0] as { is_active: boolean }).is_active = false;
        renderPage();
        await chooseCourse();
        expect(screen.getByText(/every template picked for this course is switched off/)).toBeInTheDocument();
        expect(generateButton()).toHaveTextContent('2 students × 0 templates');
        // Participants.xlsx alone can still be generated
        expect(generateButton()).toBeEnabled();
    });

    it('shows an error with a retry button when templates cannot be loaded', async () => {
        fail.document_templates = 'JWT expired';
        renderPage();
        expect(await screen.findByText('Could not load the document templates')).toBeInTheDocument();
        expect(screen.getByText('JWT expired')).toBeInTheDocument();

        delete fail.document_templates;
        fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
        await waitFor(() => expect(screen.queryByText('Could not load the document templates')).not.toBeInTheDocument());
    });

    it('refuses to store a template with broken placeholders', async () => {
        renderPage();
        await screen.findByText('Certificate.docx');
        fireEvent.change(newTemplateInput(), { target: { files: [docxFile('Hello {firstName')] } });

        expect(await screen.findByText(/has a placeholder error: .*unclosed/)).toBeInTheDocument();
        expect(storage.upload).not.toHaveBeenCalled();
    });

    it('warns about unknown placeholders after upload', async () => {
        renderPage();
        await screen.findByText('Certificate.docx');
        fireEvent.change(newTemplateInput(), { target: { files: [docxFile('{fullName} {Tutor} {Tuter}')] } });

        await waitFor(() => expect(storage.upload).toHaveBeenCalled());
        expect(await screen.findByText(/Unknown placeholders will print blank: \{Tuter\}/)).toBeInTheDocument();
    });

    it('replaces a template file in place and removes the old file', async () => {
        renderPage();
        await screen.findByText('Certificate.docx');
        const replace = screen.getByRole('button', { name: 'Replace Certificate.docx with a new file' });
        fireEvent.change(replace.parentElement!.querySelector('input[type="file"]')!, { target: { files: [docxFile('{fullName}', 'Certificate v2.docx')] } });

        expect(await screen.findByText('Certificate v2.docx')).toBeInTheDocument();
        const update = calls.find(c => c.table === 'document_templates' && c.op === 'update');
        expect(update?.eq).toBe('t1');
        expect(update?.payload).toMatchObject({ name: 'Certificate v2.docx', storage_path: expect.stringMatching(/^template_/) });
        expect(storage.remove).toHaveBeenCalledWith(['template_1.docx']);
    });

    it('removes the uploaded file again when saving the template fails', async () => {
        renderPage();
        await screen.findByText('Certificate.docx');
        fail.document_templates = 'permission denied';
        fireEvent.change(newTemplateInput(), { target: { files: [docxFile('{fullName}')] } });

        expect(await screen.findByText('Upload failed: permission denied')).toBeInTheDocument();
        const uploaded = storage.upload.mock.calls[0][0];
        expect(storage.remove).toHaveBeenCalledWith([uploaded]);
    });

    it('downloads a stored template', async () => {
        renderPage();
        await screen.findByText('Certificate.docx');
        fireEvent.click(screen.getByRole('button', { name: 'Download Certificate.docx' }));
        await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Certificate.docx'));
    });

    it('saves reordered Excel columns for every admin', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Move Last Name up' }));
        await waitFor(() => expect(calls.some(c => c.table === 'document_settings' && c.op === 'upsert')).toBe(true));
        const saved = calls.find(c => c.op === 'upsert')!.payload as { excel_columns: { header: string }[] };
        expect(saved.excel_columns.slice(0, 2).map(c => c.header)).toEqual(['Last Name', 'First Name']);
        expect(screen.getByText(/shared by every admin/)).toBeInTheDocument();
    });

    it('creates a date variable worked out from the course date', async () => {
        renderPage();
        await screen.findByText('Certificate.docx');
        fireEvent.click(screen.getByRole('tab', { name: /Date from course/ }));
        fireEvent.change(screen.getByLabelText('Variable Name'), { target: { value: 'expire' } });
        fireEvent.change(screen.getByLabelText('Amount to add'), { target: { value: '4' } });
        fireEvent.change(screen.getByLabelText('Date format'), { target: { value: 'dmy' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);

        expect(await screen.findByText('Variable {expire} added')).toBeInTheDocument();
        const insert = calls.find(c => c.table === 'template_variables' && c.op === 'insert');
        expect(insert?.payload).toEqual({ var_key: 'expire', var_value: '', kind: 'date', date_rule: { base: 'courseDate', amount: 4, unit: 'years', format: 'dmy' } });
        expect(screen.getAllByText('Course date + 4 years').length).toBeGreaterThan(0);
    });

    it('edits the rule of a date variable and uses it when generating', async () => {
        tables.template_variables.push({ id: 'v2', var_key: 'expire', var_value: '', kind: 'date', date_rule: { base: 'courseDate', amount: 2, unit: 'years', format: 'long' }, created_at: '2026-01-02' });
        storage.download.mockImplementation(async () => ({ data: new Blob([docx('{fullName} until {expire}')]), error: null }));
        renderPage();
        const row = (await screen.findAllByText('Course date + 2 years')).map(el => el.closest('li')).find(Boolean)!;
        fireEvent.click(within(row).getByRole('button', { name: 'Edit value' }));
        fireEvent.change(screen.getByLabelText('Amount to add'), { target: { value: '3' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('Variable {expire} updated')).toBeInTheDocument();
        const update = calls.find(c => c.table === 'template_variables' && c.op === 'update');
        expect(update?.payload).toEqual({ date_rule: { base: 'courseDate', amount: 3, unit: 'years', format: 'long' } });

        await chooseCourse();
        fireEvent.click(generateButton());
        await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
        const zip = new PizZip(await (vi.mocked(downloadBlob).mock.calls[0][0] as Blob).arrayBuffer());
        const doc = new PizZip(zip.file('Olena_Kovalenko.docx')!.asArrayBuffer()).file('word/document.xml')!.asText();
        expect(doc).toContain('Olena Kovalenko until 01 Oct 2102');
    });

    it('rejects custom variable names that cannot be used as a tag', async () => {
        renderPage();
        await screen.findByText('Certificate.docx');
        fireEvent.change(screen.getByLabelText('Variable Name'), { target: { value: 'Tutor Name' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]); // custom variables come before Excel columns
        expect(await screen.findByText(/Use letters, digits and _ only/)).toBeInTheDocument();
    });
});

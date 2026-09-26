/**
 * "Generate Docs" on the enrollment board: the selection is re-read, the course preset,
 * sheets, Excel columns and custom variables (text and date) go into one archive, with an
 * optional combined file and a report.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PizZip from 'pizzip';
import GenerateDocsModal from './GenerateDocsModal';
import { supabase } from '../../lib/supabase';
import { downloadBlob } from '../../lib/download';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

vi.mock('../../lib/supabase', () => ({
    supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

const row = (id: string, first: string, courseId = 'c1', extra: Partial<EnrollmentRow> = {}): EnrollmentRow => ({
    id, student_id: `s-${id}`, course_id: courseId, status: 'requested', course_variant: null, notes: null, is_priority: false,
    invited_date: null, confirmed_date: '2026-10-01', completed_date: null, invited_at: null, confirmed_at: null, completed_at: null,
    response_days: 7, created_at: '2026-01-01', updated_at: '2026-01-01',
    students: { id: `s-${id}`, first_name: first, last_name: 'Test', email: '', phone: '', address: null, eircode: null, dob: null } as never,
    courses: { id: courseId, name: courseId === 'c1' ? 'Python 101' : 'Excel Basics', created_at: '2026-01-01' },
    ...extra,
} as EnrollmentRow);

let tables: Record<string, unknown[]>;
let courseLookups: string[];

function query(table: string) {
    let ids: string[] | null = null;
    let single = false;
    let eq: string | undefined;
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit']) chain[m] = () => chain;
    chain.eq = (_c: string, v: string) => { eq = v; return chain; };
    chain.in = (_c: string, v: string[]) => { ids = v; return chain; };
    chain.maybeSingle = () => { single = true; return chain; };
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        let rows = tables[table] ?? [];
        if (ids) rows = rows.filter(r => ids!.includes((r as { id: string }).id));
        if (table === 'courses') { courseLookups.push(eq!); rows = rows.filter(r => (r as { id: string }).id === eq); }
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
    };
    return chain;
}

function docx(text: string): Blob {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
    return new Blob([zip.generate({ type: 'arraybuffer' })]);
}

const download = vi.fn();
const selection = [row('1', 'Ann'), row('2', 'Bob')];

async function archive() {
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    const zip = new PizZip(await (blob as Blob).arrayBuffer());
    const text = (path: string) => new PizZip(zip.file(path)!.asArrayBuffer()).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');
    return { name, files: Object.keys(zip.files).sort(), text };
}

describe('GenerateDocsModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        courseLookups = [];
        tables = {
            enrollments: selection,
            courses: [{ id: 'c1', template_ids: ['t1'] }],
            document_templates: [
                { id: 't1', name: 'Certificate.docx', storage_path: 'cert', is_active: true, created_at: '', updated_at: '' },
                { id: 't2', name: 'Letter.docx', storage_path: 'letter', is_active: true, created_at: '', updated_at: '' },
            ],
            attendance_templates: [],
            label_templates: [],
            template_variables: [
                { id: 'v1', var_key: 'Tutor', var_value: 'Jane', created_at: '' },
                { id: 'v2', var_key: 'expire', var_value: '', kind: 'date', date_rule: { base: 'courseDate', amount: 2, unit: 'years', format: 'long' }, created_at: '' },
            ],
            document_settings: [{ id: true, excel_columns: [] }],
        };
        vi.mocked(supabase.from).mockImplementation(((table: string) => query(table)) as never);
        vi.mocked(supabase.storage.from).mockReturnValue({ download } as never);
        download.mockImplementation(async (path: string) => ({ data: docx(`${path}: {fullName}, {Tutor}, until {expire}`), error: null }));
    });

    it('generates the course preset with text and date variables, a combined file and a report', async () => {
        const onClose = vi.fn();
        render(<GenerateDocsModal open selected={selection} onClose={onClose} />);
        expect(screen.getByText('Python 101')).toBeInTheDocument();
        expect(screen.getByText(/course's template preset/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('checkbox', { name: /combined file/ }));
        fireEvent.click(screen.getByRole('button', { name: /Generate & Download ZIP/ }));

        const { name, files, text } = await archive();
        expect(name).toBe('Python 101 (English) 01 10 2026.zip');
        expect(files).toEqual(['Ann_Test.docx', 'Bob_Test.docx', 'Certificate_All.docx']);
        expect(text('Ann_Test.docx')).toBe('cert: Ann Test, Jane, until 01 Oct 2028');
        expect(text('Certificate_All.docx')).toContain('Bob Test, Jane, until 01 Oct 2028');
        expect(courseLookups).toEqual(['c1']);

        expect(await screen.findByText('Downloaded')).toBeInTheDocument();
        expect(screen.getByText('Certificate.docx — all in one file')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(onClose).toHaveBeenCalledWith(true);
        // The choice is remembered for next time (shared with the Documents page)
        expect(localStorage.getItem('doc_gen_combined')).toBe('true');
    });

    it('uses every active template when the selection spans several courses', async () => {
        const mixed = [row('1', 'Ann'), row('3', 'Cat', 'c2')];
        tables.enrollments = mixed;
        render(<GenerateDocsModal open selected={mixed} onClose={vi.fn()} />);
        expect(screen.getByText(/All active templates/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Generate & Download ZIP/ }));

        const { files } = await archive();
        expect(files).toEqual(['Certificate/Ann_Test.docx', 'Certificate/Cat_Test.docx', 'Letter/Ann_Test.docx', 'Letter/Cat_Test.docx']);
        expect(courseLookups).toEqual([]);
    });

    it('reports people removed since the board loaded and keeps the selection on failure', async () => {
        tables.enrollments = [selection[0]];
        tables.document_templates = [{ id: 't1', name: 'Certificate.docx', storage_path: 'cert', is_active: true, created_at: '', updated_at: '' }];
        download.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
        const onClose = vi.fn();
        render(<GenerateDocsModal open selected={selection} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /Generate & Download ZIP/ }));

        expect(await screen.findByText('Nothing was generated')).toBeInTheDocument();
        expect(screen.getByText(/Download failed: File not found/)).toBeInTheDocument();
        expect(screen.getByText(/Left out 1/)).toHaveTextContent('Bob Test');
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(onClose).toHaveBeenCalledWith(false);
    });

    it('can be cancelled while generating', async () => {
        render(<GenerateDocsModal open selected={selection} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Generate & Download ZIP/ }));
        fireEvent.click(screen.getByRole('button', { name: /Cancel generation/ }));

        expect(await screen.findByRole('button', { name: /Generate & Download ZIP/ })).toBeInTheDocument();
        expect(downloadBlob).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('explains when there is nothing to generate', async () => {
        tables.document_templates = [];
        render(<GenerateDocsModal open selected={selection} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Generate & Download ZIP/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('No active template found');
        expect(downloadBlob).not.toHaveBeenCalled();
    });
});

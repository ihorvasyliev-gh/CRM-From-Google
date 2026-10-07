import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import WordConverter from './WordConverter';
import type { FieldDef } from '../../lib/pdfToDocx/fields';

const fields: FieldDef[] = [
    { id: 'f1', kind: 'text', page: 0, rect: { page: 0, x: 100, y: 700, w: 150, h: 14 }, label: 'First Name', multiline: false, align: 'left', valign: 'middle', placeholder: 'firstName' },
    { id: 's1', kind: 'text', page: 0, rect: { page: 0, x: 100, y: 680, w: 150, h: 14 }, label: 'LDC Staff Member', multiline: false, align: 'left', valign: 'middle' },
    { id: 'd1', kind: 'text', page: 0, rect: { page: 0, x: 100, y: 660, w: 90, h: 12 }, label: 'Date of Registration', multiline: false, align: 'left', valign: 'bottom', placeholder: 'registeredAt', blank: { page: 0, x: 98, y: 655, w: 94, h: 18 } },
    { id: 'c1', kind: 'check', page: 0, rect: { page: 0, x: 300, y: 700, w: 8.5, h: 10.6 }, label: 'Yes' },
];

const browser = vi.hoisted(() => ({
    convertForm: vi.fn(),
    formDocx: vi.fn(() => new Blob(['docx'])),
    docxFileName: vi.fn((title: string) => `${title}.docx`),
}));
vi.mock('../../lib/pdfToDocx/browser', () => browser);

const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('../../lib/download', () => download);

const docs = vi.hoisted(() => ({ fetchTemplateVariables: vi.fn(() => Promise.resolve([{ id: 'v1', var_key: 'expire', var_value: '', kind: 'date', created_at: '' }])) }));
vi.mock('../../lib/documentUtils', () => docs);

// No canvas in jsdom: draw just the overlay, at 1 CSS pixel per point
vi.mock('./pdfView', () => ({
    PdfPage: ({ overlay, size }: { overlay?: (scale: number) => ReactNode; size: { w: number; h: number } }) => (
        <div style={{ position: 'relative', width: size.w, height: size.h }}>{overlay?.(1)}</div>
    ),
}));

// jsdom lays nothing out: give the page column a width
vi.mock('./pdfHooks', async importOriginal => ({
    ...(await importOriginal<typeof import('./pdfHooks')>()),
    useElementWidth: () => [() => {}, 800],
}));

function renderConverter(admin = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <WordConverter admin={admin} />
        </QueryClientProvider>,
    );
}

async function choosePdf() {
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([new Uint8Array([37, 80, 68, 70])], 'form.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText('SICAP Individual Registration Form');
}

const box = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;

beforeEach(() => {
    vi.clearAllMocks();
    browser.convertForm.mockResolvedValue({
        fileName: 'form.pdf',
        title: 'SICAP Individual Registration Form',
        doc: { loadingTask: { destroy: vi.fn() } },
        layout: { pages: [{ w: 595, h: 842 }], phrases: [], checkboxes: [], edges: [] },
        pages: [{ index: 0, w: 595, h: 842, base: { w: 595, h: 842, lines: [{}], shapes: [], pictures: [] }, boxes: [] }],
        fields,
    });
});

describe('WordConverter', () => {
    it('starts with the steps and a place to drop the PDF', () => {
        renderConverter();
        expect(screen.getByText('1. Choose the PDF form')).toBeInTheDocument();
        expect(screen.getByText('2. Put in placeholders')).toBeInTheDocument();
        expect(screen.getByText(/Choose the PDF form: click here/)).toBeInTheDocument();
    });

    it('puts the suggested placeholders in, inserts more where the cursor is, and downloads the template', async () => {
        renderConverter();
        await choosePdf();
        expect(browser.convertForm).toHaveBeenCalledWith(expect.any(Uint8Array), 'form.pdf', expect.any(Function));
        expect(box('First Name')).toHaveValue('{firstName}');
        expect(box('Date of Registration')).toHaveValue('{registeredAt}');
        expect(box('LDC Staff Member')).toHaveValue('');

        // Type fixed text, put the cursor after "Name: " and click a placeholder
        fireEvent.change(box('LDC Staff Member'), { target: { value: 'Name:  (CCP)' } });
        box('LDC Staff Member').setSelectionRange(6, 6);
        fireEvent.select(box('LDC Staff Member'));
        expect(screen.getByText('LDC Staff Member', { selector: 'b' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /\{fullName\}/ }));
        expect(box('LDC Staff Member')).toHaveValue('Name: {fullName} (CCP)');

        fireEvent.click(screen.getByRole('checkbox', { name: 'Yes' }));
        fireEvent.click(screen.getByRole('button', { name: /Download Word template \(\.docx\)/ }));
        await waitFor(() => expect(download.downloadBlob).toHaveBeenCalled());
        const [, passedFields, values, opts] = browser.formDocx.mock.calls[0] as unknown as [unknown, FieldDef[], Record<string, unknown>, { mark: string }];
        expect(passedFields).toHaveLength(4);
        expect(values).toEqual({ f1: '{firstName}', d1: '{registeredAt}', s1: 'Name: {fullName} (CCP)', c1: true });
        expect(opts).toEqual({ mark: 'tick' });
        expect(download.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'SICAP Individual Registration Form.docx');
    });

    it('asks for a blank first, warns about unknown placeholders, and clears and suggests again', async () => {
        renderConverter();
        await choosePdf();
        fireEvent.click(screen.getByRole('button', { name: /\{email\}/ }));
        expect(box('First Name')).toHaveValue('{firstName}');

        fireEvent.change(box('First Name'), { target: { value: '{fristName}' } });
        expect(screen.getByRole('alert')).toHaveTextContent('Documents doesn’t know {fristName}');

        fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
        expect(box('First Name')).toHaveValue('');
        fireEvent.click(screen.getByRole('button', { name: /Suggest placeholders \(2\)/ }));
        expect(box('First Name')).toHaveValue('{firstName}');
    });

    it('removes blanks in edit mode', async () => {
        renderConverter();
        await choosePdf();
        fireEvent.click(screen.getByRole('button', { name: /Edit blanks/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove the field “First Name”' }));
        expect(screen.queryByRole('textbox', { name: 'First Name' })).not.toBeInTheDocument();
    });

    it('offers the custom variables of Documents to admins', async () => {
        renderConverter(true);
        await choosePdf();
        fireEvent.click(await screen.findByRole('button', { name: /Custom variables/ }));
        expect(await screen.findByRole('button', { name: /\{expire\}/ })).toBeInTheDocument();
        expect(docs.fetchTemplateVariables).toHaveBeenCalled();
    });

    it('says so when a PDF cannot be read', async () => {
        browser.convertForm.mockRejectedValueOnce(new Error('Invalid PDF structure'));
        renderConverter();
        const input = document.querySelector('input[type=file]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [new File(['x'], 'broken.pdf', { type: 'application/pdf' })] } });
        expect(await screen.findByText('This PDF could not be converted')).toBeInTheDocument();
    });
});

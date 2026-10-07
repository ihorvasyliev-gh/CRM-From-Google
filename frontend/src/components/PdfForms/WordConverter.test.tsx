import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import WordConverter from './WordConverter';
import type { FieldDef } from '../../lib/pdfToDocx/fields';
import { todayISO } from '../../lib/dateUtils';

const fields: FieldDef[] = [
    { id: 'f1', kind: 'text', page: 0, rect: { page: 0, x: 100, y: 700, w: 150, h: 14 }, label: 'First Name', multiline: false, align: 'left', valign: 'middle', crm: 'firstName' },
    { id: 's1', kind: 'text', page: 0, rect: { page: 0, x: 100, y: 680, w: 150, h: 14 }, label: 'LDC Staff Member', multiline: false, align: 'left', valign: 'middle', crm: 'staff' },
    { id: 'd1', kind: 'text', page: 0, rect: { page: 0, x: 100, y: 660, w: 20, h: 12 }, label: 'Date of Registration', multiline: false, align: 'center', valign: 'bottom', crm: 'today', part: 'dd' },
    { id: 'c1', kind: 'check', page: 0, rect: { page: 0, x: 300, y: 700, w: 8.5, h: 10.6 }, label: 'Yes' },
];

const browser = vi.hoisted(() => ({
    convertForm: vi.fn(),
    formDocx: vi.fn(() => new Blob(['docx'])),
    docxFileName: vi.fn((title: string, person?: string) => `${person ? `${person} - ` : ''}${title}.docx`),
    formsZip: vi.fn(),
}));
vi.mock('../../lib/pdfToDocx/browser', () => browser);

const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('../../lib/download', () => download);

vi.mock('../../hooks/usePdfForms', () => ({ useFormUserName: () => 'Anna Staff' }));

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

function renderConverter(crm = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <WordConverter crm={crm} />
        </QueryClientProvider>,
    );
}

async function choosePdf() {
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([new Uint8Array([37, 80, 68, 70])], 'form.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText('SICAP Individual Registration Form');
}

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
    it('starts with the steps and a place to drop the PDF, without the CRM panel', () => {
        renderConverter();
        expect(screen.getByText('1. Choose the PDF form')).toBeInTheDocument();
        expect(screen.getByText(/Choose the PDF form: click here/)).toBeInTheDocument();
        expect(screen.queryByText('Fill in from the CRM')).not.toBeInTheDocument();
    });

    it('fills in your name and today’s date, takes typed answers and ticks, and downloads Word', async () => {
        renderConverter();
        await choosePdf();
        expect(browser.convertForm).toHaveBeenCalledWith(expect.any(Uint8Array), 'form.pdf', expect.any(Function));
        expect(screen.getByRole('textbox', { name: 'LDC Staff Member' })).toHaveValue('Anna Staff');
        expect(screen.getByRole('textbox', { name: 'Date of Registration' })).toHaveValue(todayISO().slice(8, 10));

        fireEvent.change(screen.getByRole('textbox', { name: 'First Name' }), { target: { value: 'Siobhán' } });
        fireEvent.click(screen.getByRole('checkbox', { name: 'Yes' }));
        expect(screen.getByRole('checkbox', { name: 'Yes' })).toHaveAttribute('aria-checked', 'true');

        fireEvent.click(screen.getByRole('button', { name: /Download Word \(\.docx\)/ }));
        await waitFor(() => expect(download.downloadBlob).toHaveBeenCalled());
        const [, passedFields, values, opts] = browser.formDocx.mock.calls[0] as unknown as [unknown, FieldDef[], Record<string, unknown>, { mark: string }];
        expect(passedFields).toHaveLength(4);
        expect(values).toMatchObject({ f1: 'Siobhán', s1: 'Anna Staff', c1: true });
        expect(opts).toEqual({ mark: 'tick' });
        expect(download.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'SICAP Individual Registration Form.docx');
    });

    it('removes blanks in edit mode and clears answers', async () => {
        renderConverter();
        await choosePdf();
        fireEvent.change(screen.getByRole('textbox', { name: 'First Name' }), { target: { value: 'Siobhán' } });
        fireEvent.click(screen.getByRole('button', { name: /Edit blanks/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove the field “First Name”' }));
        expect(screen.queryByRole('textbox', { name: 'First Name' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Yes' }));
        fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
        expect(screen.getByRole('checkbox', { name: 'Yes' })).toHaveAttribute('aria-checked', 'false');
        // Your name stays: it is filled in again
        expect(screen.getByRole('textbox', { name: 'LDC Staff Member' })).toHaveValue('Anna Staff');
    });

    it('shows the CRM panel for admins', async () => {
        renderConverter(true);
        await choosePdf();
        expect(screen.getByText('Fill in from the CRM')).toBeInTheDocument();
        expect(screen.getByText('3 fields on this form take CRM data')).toBeInTheDocument();
    });

    it('says so when a PDF cannot be read', async () => {
        browser.convertForm.mockRejectedValueOnce(new Error('Invalid PDF structure'));
        renderConverter();
        const input = document.querySelector('input[type=file]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [new File(['x'], 'broken.pdf', { type: 'application/pdf' })] } });
        expect(await screen.findByText('This PDF could not be converted')).toBeInTheDocument();
    });
});

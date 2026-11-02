import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PizZip from 'pizzip';
import PublicCertificates from './PublicCertificates';

// Nothing on the public page may reach the database: loading the client at all fails this file
vi.mock('../lib/supabase', () => {
    throw new Error('The public certificates page must not load the Supabase client');
});
// Drawing pages needs a real browser's layout and canvas
vi.mock('./Certificates/CertificatePreview', () => ({
    default: ({ people }: { people: { label: string }[] }) => <div data-testid="preview">{people.map(p => p.label).join(', ')}</div>,
}));
const makeWord = vi.fn();
const makePdf = vi.fn();
vi.mock('../lib/certificates/output', async importOriginal => ({
    ...(await importOriginal<typeof import('../lib/certificates/output')>()),
    makeWord: (...args: unknown[]) => makeWord(...args),
    makePdf: (...args: unknown[]) => makePdf(...args),
}));
const downloadBlob = vi.fn();
vi.mock('../lib/download', () => ({ downloadBlob: (...args: unknown[]) => downloadBlob(...args) }));

function templateFile(...lines: string[]): File {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    const body = lines.map(l => `<w:p><w:r><w:t xml:space="preserve">${l}</w:t></w:r></w:p>`).join('');
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
    const bytes = zip.generate({ type: 'uint8array' });
    return new File([bytes as BlobPart], 'MH Cert.docx');
}

async function openTemplate(file: File) {
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText('1. Certificate: MH Cert.docx');
}

describe('PublicCertificates', () => {
    beforeEach(() => {
        makeWord.mockReset().mockResolvedValue({ blob: new Blob(['docx']), fileName: 'MH Cert - all.docx' });
        makePdf.mockReset().mockResolvedValue({ blob: new Blob(['pdf']), fileName: 'MH Cert.zip' });
        downloadBlob.mockReset();
    });

    it('asks for a Word template first', () => {
        render(<PublicCertificates />);
        expect(screen.getByText(/choose your Word certificate/)).toBeInTheDocument();
        expect(screen.getByText('Nothing you add here is saved anywhere.')).toBeInTheDocument();
        expect(document.title).toBe('Certificates · Cork City Partnership');
    });

    it('turns the placeholders into fields, takes the names one per line and downloads everyone in one Word file', async () => {
        render(<PublicCertificates />);
        await openTemplate(templateFile('{firstName} {lastName}', 'Course Date: {courseDate}', 'Signed: {tutor}'));

        fireEvent.change(screen.getByLabelText('Course date'), { target: { value: '21/09/2026' } });
        fireEvent.change(screen.getByLabelText('Tutor'), { target: { value: 'Yvonne Quilligan' } });
        fireEvent.change(screen.getByLabelText(/One name per line/), { target: { value: "Hadgu Gebremikel\nMary O'Brien\n" } });
        expect(screen.getByText('3. Who gets a certificate')).toBeInTheDocument();
        expect(screen.getByText('2 people')).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: "O'Brien" })).toBeInTheDocument();
        expect(screen.getByTestId('preview')).toHaveTextContent("Hadgu Gebremikel, Mary O'Brien");

        fireEvent.click(screen.getByRole('button', { name: /Download Word/ }));
        await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'MH Cert - all.docx'));
        const [, name, people, allInOne] = makeWord.mock.calls[0];
        expect(name).toBe('MH Cert.docx');
        expect(allInOne).toBe(true);
        expect(people).toEqual([
            { data: { courseDate: '21/09/2026', tutor: 'Yvonne Quilligan', firstName: 'Hadgu', lastName: 'Gebremikel' }, fileBase: 'Hadgu_Gebremikel' },
            { data: { courseDate: '21/09/2026', tutor: 'Yvonne Quilligan', firstName: 'Mary', lastName: "O'Brien" }, fileBase: "Mary_O'Brien" },
        ]);
    });

    it('pastes what was copied with the Paste button, and fixes a name in the table', async () => {
        const readText = vi.fn().mockResolvedValue("Mary Kate O'Brien\r\nJohn Murphy\r\n");
        Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
        render(<PublicCertificates />);
        await openTemplate(templateFile('{firstName} {lastName}'));
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
        await waitFor(() => expect((screen.getByLabelText(/One name per line/) as HTMLTextAreaElement).value.replace(/\r/g, '')).toBe("Mary Kate O'Brien\nJohn Murphy\n"));
        expect(screen.getByRole('cell', { name: "Kate O'Brien" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Fix it in a table/ }));
        fireEvent.change(screen.getByLabelText('First name, person 1'), { target: { value: 'Mary Kate' } });
        fireEvent.change(screen.getByLabelText('Last name, person 1'), { target: { value: "O'Brien" } });
        // A list pasted into a cell fills the rows from there down
        fireEvent.paste(screen.getByLabelText('First name, person 2'), { clipboardData: { getData: () => 'Ann Lee\nBob Ray' } });
        expect(screen.getByLabelText('Last name, person 3')).toHaveValue('Ray');

        fireEvent.click(screen.getByRole('button', { name: /Back to the simple list/ }));
        expect(screen.getByLabelText(/One name per line/)).toHaveValue("Mary Kate\tO'Brien\nAnn Lee\nBob Ray");
    });

    it('makes a field different for each person, and PDFs a file each', async () => {
        render(<PublicCertificates />);
        await openTemplate(templateFile('{firstName} {lastName}', 'Signed: {tutor}'));
        fireEvent.change(screen.getByLabelText('Tutor'), { target: { value: 'Anne' } });
        fireEvent.click(screen.getByRole('button', { name: /Different for each person/ }));
        expect(screen.getByLabelText('Tutor, person 1')).toHaveValue('Anne');
        fireEvent.change(screen.getByLabelText('First name, person 1'), { target: { value: 'Mary' } });
        fireEvent.click(screen.getByRole('button', { name: /Add a person/ }));
        fireEvent.change(screen.getByLabelText('First name, person 2'), { target: { value: 'John' } });
        fireEvent.change(screen.getByLabelText('Tutor, person 2'), { target: { value: 'Pat' } });

        fireEvent.click(screen.getByLabelText(/All in one file/));
        fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
        await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'MH Cert.zip'));
        const [, , people, allInOne] = makePdf.mock.calls[0];
        expect(allInOne).toBe(false);
        expect(people.map((p: { data: Record<string, string> }) => p.data.tutor)).toEqual(['Anne', 'Pat']);
    });

    it('holds the downloads until someone is named', async () => {
        render(<PublicCertificates />);
        await openTemplate(templateFile('{firstName} {lastName}'));
        expect(screen.getByRole('button', { name: /Download Word/ })).toBeDisabled();
        expect(screen.getByText('Add the names in step 2 first.')).toBeInTheDocument();
    });
});

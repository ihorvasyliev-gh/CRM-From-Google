import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FillView from './FillView';
import type { Workbook } from '../../lib/pdfForms/excel';
import { DEFAULT_SETTINGS, type FormField, type PdfFormTemplate } from '../../lib/pdfForms/types';

vi.mock('../../hooks/usePdfForms', () => ({
    downloadTemplatePdf: vi.fn(() => Promise.resolve(new Uint8Array([37, 80, 68, 70]))),
    useFormUserName: () => 'Anna Staff',
    useSaveColumnAliases: () => ({ mutate: vi.fn(), isPending: false }),
}));

const field = (id: string, source: string): FormField => ({
    id,
    kind: 'text',
    name: id,
    source,
    rect: { page: 0, x: 0, y: 0, w: 100, h: 14 },
    fontSize: 10,
    multiline: false,
    align: 'left',
});

const template: PdfFormTemplate = {
    id: 't1',
    name: 'SICAP Individual registration',
    description: null,
    pdf_path: 'x/form.pdf',
    pdf_name: 'form.pdf',
    revision: 1,
    fields: [field('First Name', '{First Name}'), field('Last Name', '{Last Name}'), field('Eircode', '{Eircode}'), field('Date of Birth (day)', '{Date of Birth|dd}')],
    column_aliases: {},
    settings: DEFAULT_SETTINGS,
    created_at: '',
    updated_at: '',
};

const HEADER = ['Timestamp', 'First Name', 'Last Name', 'Date of Birth'];
const smallTable = [
    HEADER,
    ['01/09/2026', 'Anna', 'Smith', '03/03/2003'],
    ['15/09/2026', 'Brian', 'Kelly', '11/19/0001'],
    ['20/09/2026', 'Ciara', 'Walsh', '07/07/1990'],
];

function book(...sheets: { name: string; table: string[][]; hidden?: boolean; hiddenRows?: number[] }[]): Workbook {
    return { fileName: 'people.xlsx', sheets: sheets.map(s => ({ hidden: false, hiddenRows: [], ...s })) };
}

function renderFill(workbook = book({ name: 'Sheet1', table: smallTable })) {
    return render(<FillView template={template} initialWorkbook={workbook} canManage={false} onBack={vi.fn()} onEdit={vi.fn()} />);
}

describe('FillView', () => {
    it('walks through the three steps and ticks everyone in a small file', () => {
        renderFill();
        expect(screen.getByText('Step 1 · Your spreadsheet')).toBeInTheDocument();
        expect(screen.getByText('Step 2 · Who needs a form?')).toBeInTheDocument();
        expect(screen.getByText('Step 3 · Download the forms')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Download 3 forms/ })).toBeInTheDocument();
    });

    it('explains missing information in plain words and lets it be left blank', () => {
        renderFill();
        expect(screen.getByText(/1 piece of information couldn't be found/)).toBeInTheDocument();
        expect(screen.getByLabelText('Column for Eircode')).toHaveValue('-1');
    });

    it('marks rows with a note and says the form is still filled', () => {
        renderFill();
        expect(screen.getByText(/doesn’t look right, so it's left blank/)).toBeInTheDocument();
        expect(screen.getByText(/They will still be filled in/)).toBeInTheDocument();
    });

    it('finds people by name and ticks only them', () => {
        renderFill();
        fireEvent.click(screen.getByRole('button', { name: 'Untick everyone' }));
        expect(screen.getByRole('button', { name: 'Tick at least one person first' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Search rows'), { target: { value: 'kelly' } });
        expect(screen.queryByText('Anna Smith')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tick these 1/ }));
        expect(screen.getByRole('button', { name: /Download 1 form$/ })).toBeInTheDocument();
    });

    it('lets a row be ticked by clicking anywhere on it', () => {
        renderFill();
        fireEvent.click(screen.getByText('Anna Smith'));
        expect(screen.getByRole('button', { name: /Download 2 forms/ })).toBeInTheDocument();
    });

    it('starts a big file with nobody ticked and offers the registration dates', () => {
        const rows = Array.from({ length: 60 }, (_, i) => [`${String((i % 28) + 1).padStart(2, '0')}/09/2026`, `Person${i}`, 'Test', '01/01/2000']);
        renderFill(book({ name: 'Big', table: [HEADER, ...rows] }));
        expect(screen.getByText('Nobody ticked yet')).toBeInTheDocument();
        expect(screen.getByText('Sent in from')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tick everyone \(60\)/ }));
        expect(screen.getByRole('button', { name: /Download 60 forms/ })).toBeInTheDocument();
    });

    it('prints one file for printing by default', () => {
        renderFill();
        expect(screen.getByRole('radio', { name: /One file with all the forms/ })).toBeChecked();
    });

    it('uses the sheet that has the form columns, and lets another sheet be chosen', () => {
        renderFill(book({ name: 'Notes', table: [['Reminder: call Anna']] }, { name: 'Registrations', table: smallTable }));
        expect(screen.getByLabelText('Sheet')).toHaveValue('1');
        expect(screen.getByText('Anna Smith')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Sheet'), { target: { value: '0' } });
        expect(screen.getByText(/This sheet has no rows of answers/)).toBeInTheDocument();
    });

    it('finds the column names below a title and blank lines, and skips totals', () => {
        const table = [['Course registrations — exported 28/09/2026'], [], ...smallTable, ['Total: 3']];
        renderFill(book({ name: 'Export', table }));
        expect(screen.getByText('Ciara Walsh')).toBeInTheDocument();
        expect(screen.getByText(/1 row was left out/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Download 3 forms/ })).toBeInTheDocument();
    });

    it('leaves out rows hidden in Excel unless asked', () => {
        renderFill(book({ name: 'Filtered', table: smallTable, hiddenRows: [2] }));
        expect(screen.queryByText('Brian Kelly')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Download 2 forms/ })).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText(/Include the 1 row hidden in Excel/));
        expect(screen.getByText('Brian Kelly')).toBeInTheDocument();
    });

    describe('a sheet without column names', () => {
        // A staff member's extract (no names, answers start in row 3) and the export it came from
        const export_ = [
            ['Id', ...HEADER],
            ['1', '01/09/2026', 'Anna', 'Smith', '03/03/2003'],
            ['2', '15/09/2026', 'Brian', 'Kelly', '11/09/1970'],
            ['3', '20/09/2026', 'Ciara', 'Walsh', '07/07/1990'],
            ['4', '21/09/2026', 'Dara', 'Byrne', '01/02/1999'],
        ];
        const extract = [[], [], ['2', '15/09/2026', 'Brian', 'Kelly', '11/09/1970'], ['3', '20/09/2026', 'Ciara', 'Walsh', '07/07/1990']];
        const staffBook = () => book({ name: 'Ciara’s people', table: extract }, { name: 'Export', table: export_ });

        it('takes the names from the sheet it came from, and says so', () => {
            renderFill(staffBook());
            fireEvent.change(screen.getByLabelText('Sheet'), { target: { value: '0' } });
            expect(screen.getByTestId('names-note')).toHaveTextContent('taken from the sheet “Export”');
            expect(screen.getByText('Brian Kelly')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Download 2 forms/ })).toBeInTheDocument();
        });

        it('lets the person say where the names are instead', () => {
            renderFill(staffBook());
            fireEvent.change(screen.getByLabelText('Sheet'), { target: { value: '0' } });
            fireEvent.click(screen.getByRole('button', { name: /Not right\? Change/ }));
            fireEvent.click(screen.getByLabelText(/There are no column names/));
            expect(screen.getByTestId('names-note')).toHaveTextContent('Excel letters');
            fireEvent.click(screen.getByLabelText(/Find them for me/));
            expect(screen.getByTestId('names-note')).toHaveTextContent('taken from the sheet “Export”');
        });
    });
});

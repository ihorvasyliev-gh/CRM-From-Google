import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SavedScreen from './SavedScreen';
import { DEFAULT_SETTINGS, type FormField, type PdfFormTemplate } from '../../lib/pdfForms/types';

const text: FormField = { id: 'a', kind: 'text', name: 'First Name', source: '{First Name}', rect: { page: 0, x: 0, y: 0, w: 50, h: 12 }, fontSize: 10, multiline: false, align: 'left' };
const template: PdfFormTemplate = {
    id: 't', name: 'Individual registration', description: null, pdf_path: 'x.pdf', pdf_name: 'x.pdf', revision: 1,
    fields: [text], column_aliases: {}, settings: DEFAULT_SETTINGS, created_at: '', updated_at: '',
};

describe('SavedScreen', () => {
    it('says what the form needs and offers the next steps', () => {
        const onFill = vi.fn();
        const onBack = vi.fn();
        const onEdit = vi.fn();
        render(<SavedScreen template={template} first onFill={onFill} onBack={onBack} onEdit={onEdit} />);
        expect(screen.getByText('The form is ready!')).toBeInTheDocument();
        expect(screen.getByText(/1 text box and 0 checkbox questions/)).toBeInTheDocument();
        expect(screen.getByText('First Name')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Fill in some forms now/ }));
        fireEvent.click(screen.getByRole('button', { name: /Back to all forms/ }));
        fireEvent.click(screen.getByRole('button', { name: /Keep editing/ }));
        expect([onFill, onBack, onEdit].every(f => f.mock.calls.length === 1)).toBe(true);
    });

    it('is worded for a change, and has no editing link for people who cannot edit', () => {
        render(<SavedScreen template={template} first={false} onFill={vi.fn()} onBack={vi.fn()} />);
        expect(screen.getByText('Your changes are saved')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Keep editing/ })).not.toBeInTheDocument();
    });
});

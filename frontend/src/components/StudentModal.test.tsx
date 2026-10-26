import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudentModal from './StudentModal';
import type { Student } from '../lib/types';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

const created = { id: 'st-new', first_name: 'Olena', last_name: 'Koval' } as Student;

function setup(onSaveAndEnroll?: (student: Student) => void) {
    const onSave = vi.fn().mockResolvedValue(created);
    const onClose = vi.fn();
    render(<StudentModal open student={null} onSave={onSave} onClose={onClose} onSaveAndEnroll={onSaveAndEnroll} />);
    fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: 'Olena' } });
    fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Koval' } });
    return { onSave, onClose };
}

describe('StudentModal — Save and enroll', () => {
    it('saves, closes and hands the new student on to be enrolled', async () => {
        const onSaveAndEnroll = vi.fn();
        const { onSave, onClose } = setup(onSaveAndEnroll);

        fireEvent.click(screen.getByRole('button', { name: 'Save and enroll' }));

        await waitFor(() => expect(onSaveAndEnroll).toHaveBeenCalledWith(created));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Olena', last_name: 'Koval' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('only saves with the usual button', async () => {
        const onSaveAndEnroll = vi.fn();
        const { onSave, onClose } = setup(onSaveAndEnroll);

        fireEvent.click(screen.getByRole('button', { name: 'Add Student' }));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSaveAndEnroll).not.toHaveBeenCalled();
    });

    it('does not offer it where nothing can enroll the student', () => {
        setup();
        expect(screen.queryByRole('button', { name: 'Save and enroll' })).toBeNull();
    });
});

describe('StudentModal — errors under the fields', () => {
    it('says what is missing under the field and moves focus to it', async () => {
        const onSave = vi.fn();
        render(<StudentModal open student={null} onSave={onSave} onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: 'Olena' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add Student' }));

        const lastName = screen.getByLabelText('Last Name *');
        expect(await screen.findByText('Last Name is required')).toBeInTheDocument();
        expect(lastName).toHaveFocus();
        expect(lastName).toHaveAttribute('aria-invalid', 'true');
        expect(lastName).toHaveAccessibleDescription('Last Name is required');
        expect(onSave).not.toHaveBeenCalled();

        // Typing in the field clears its message
        fireEvent.input(lastName, { target: { value: 'K' } });
        expect(screen.queryByText('Last Name is required')).toBeNull();
        expect(lastName).not.toHaveAttribute('aria-invalid');
    });

    it('asks in its own dialog before throwing away what was typed', async () => {
        const onClose = vi.fn();
        render(<StudentModal open student={null} onSave={vi.fn()} onClose={onClose} />);
        fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: 'Olena' } });

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
        expect(onClose).toHaveBeenCalled();
    });
});

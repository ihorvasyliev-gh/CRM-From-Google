import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudentModal from './StudentModal';
import type { Student } from '../lib/types';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

/** The duplicate lookup: students.select().or().limit() answers with `result` */
function mockDuplicateLookup(result: { data: unknown[] | null; error: unknown }) {
    const chain = { or: vi.fn(() => chain), neq: vi.fn(() => chain), limit: vi.fn().mockResolvedValue(result) };
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn(() => chain) } as unknown as ReturnType<typeof supabase.from>);
}

describe('StudentModal — duplicates', () => {
    it('names the student already there and opens them instead', async () => {
        mockDuplicateLookup({ data: [{ id: 'st-old', first_name: 'Siobhan', last_name: 'Walsh', email: 'siobhan@example.ie', phone: null }], error: null });
        const onOpenExisting = vi.fn();
        render(<StudentModal open student={null} onSave={vi.fn()} onClose={vi.fn()} onOpenExisting={onOpenExisting} />);
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'siobhan@example.ie' } });

        fireEvent.click(await screen.findByRole('button', { name: 'Open Siobhan Walsh' }, { timeout: 2000 }));
        expect(onOpenExisting).toHaveBeenCalledWith('st-old');
        // Adding never offers a merge: there is nothing saved yet to merge
        expect(screen.queryByRole('button', { name: 'Merge the two' })).toBeNull();
    });

    it('offers to merge when editing', async () => {
        mockDuplicateLookup({ data: [{ id: 'st-old', first_name: 'Siobhan', last_name: 'Walsh', email: null, phone: '+353871234567' }], error: null });
        const onMergeWith = vi.fn();
        const editing = { id: 'st-1', first_name: 'Shiv', last_name: 'Walsh', email: '', phone: '', address: '', eircode: '', dob: '' };
        render(<StudentModal open student={editing} onSave={vi.fn()} onClose={vi.fn()} onMergeWith={onMergeWith} />);
        fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '087 123 4567' } });

        expect(await screen.findByText(/already has this phone/, {}, { timeout: 2000 })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Merge the two' }));
        expect(onMergeWith).toHaveBeenCalledWith('st-old');
    });

    it('says when the check could not run', async () => {
        mockDuplicateLookup({ data: null, error: { message: 'Failed to fetch' } });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<StudentModal open student={null} onSave={vi.fn()} onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.ie' } });
        expect(await screen.findByText(/Couldn't check whether this student is already in the system/, {}, { timeout: 2000 })).toBeInTheDocument();
    });
});

describe('StudentModal — format hints', () => {
    it('writes the Eircode as T12 AB34 and points out one that looks wrong', () => {
        render(<StudentModal open student={null} onSave={vi.fn()} onClose={vi.fn()} />);
        const eircode = screen.getByLabelText('Eircode');
        fireEvent.change(eircode, { target: { value: 't12ab34' } });
        fireEvent.blur(eircode);
        expect(eircode).toHaveValue('T12 AB34');

        fireEvent.change(eircode, { target: { value: 't12' } });
        fireEvent.blur(eircode);
        expect(screen.getByText(/Eircodes have 7 letters and numbers/)).toBeInTheDocument();
    });

    it('points out a phone number that looks wrong', () => {
        render(<StudentModal open student={null} onSave={vi.fn()} onClose={vi.fn()} />);
        const phone = screen.getByLabelText('Phone');
        fireEvent.change(phone, { target: { value: '12345' } });
        fireEvent.blur(phone);
        expect(screen.getByText(/doesn't look like a phone number/)).toBeInTheDocument();
    });
});

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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EnrollmentModal from './EnrollmentModal';
import { supabase } from '../lib/supabase';
import type { EnrollmentRow } from '../hooks/useEnrollments';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
    },
}));

const student = { id: 'st-1', first_name: 'Arsen', last_name: 'Ohly', email: 'arsen@example.com' };
const courses = [{ id: 'c-1', name: 'SafePass' }];

function enrollment(id: string, course_variant: string | null, status = 'requested'): EnrollmentRow {
    return { id, student_id: 'st-1', course_id: 'c-1', status, course_variant } as EnrollmentRow;
}

function setup(existing: EnrollmentRow[], insertedRows: { id: string }[] = [{ id: 'new' }]) {
    const insertSelect = vi.fn().mockResolvedValue({ data: insertedRows, error: null });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'students') {
            return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [student], error: null }) }) };
        }
        if (table === 'courses') {
            return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: courses, error: null }) }) };
        }
        return { insert };
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['enrollments'], existing);
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
        <QueryClientProvider client={queryClient}>
            <EnrollmentModal open preselectedStudentId="st-1" preselectedCourseId="c-1" onSave={onSave} onClose={onClose} />
        </QueryClientProvider>
    );
    return { insert, onSave, onClose };
}

const enrollButton = () => screen.getByRole('button', { name: 'Enroll Student' });
const typeVariant = (value: string) => fireEvent.change(screen.getByLabelText(/Variant/), { target: { value } });

describe('EnrollmentModal — languages of a course', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('adds another language while the student is only queued, as a separate enrollment', async () => {
        const { insert, onSave } = setup([enrollment('en-1', 'English')]);

        // No variant means English, which they already queue in
        expect(await screen.findByText('Already in the English queue for this course')).toBeInTheDocument();
        expect(enrollButton()).toBeDisabled();

        typeVariant('Ukrainian');
        expect(screen.getByText('Also in the English queue: this adds a place in the Ukrainian queue')).toBeInTheDocument();
        expect(enrollButton()).toBeEnabled();

        fireEvent.click(enrollButton());
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ course_variant: 'Ukrainian', status: 'requested' }));
    });

    it('adds another language only as Requested', async () => {
        setup([enrollment('en-1', 'English')]);
        await screen.findByText('Already in the English queue for this course');

        typeVariant('Arabic');
        fireEvent.change(screen.getByLabelText('Initial Status'), { target: { value: 'confirmed' } });
        expect(screen.getByText('Already in the English queue: another language can only be added as Requested')).toBeInTheDocument();
        expect(enrollButton()).toBeDisabled();
    });

    it('adds nothing once the student is invited or further along in the course', async () => {
        setup([enrollment('en-1', 'English', 'invited')]);

        typeVariant('Ukrainian');
        expect(await screen.findByText('Already enrolled in this course (invited, English)')).toBeInTheDocument();
        expect(enrollButton()).toBeDisabled();
    });

    it('reports a row the database skipped instead of claiming it was added', async () => {
        const { onSave } = setup([], []);
        typeVariant('Ukrainian');
        await waitFor(() => expect(enrollButton()).toBeEnabled());

        fireEvent.click(enrollButton());
        expect(await screen.findByRole('alert')).toHaveTextContent('Not added: this student is already enrolled in this course');
        expect(onSave).not.toHaveBeenCalled();
    });

    it('lets you pick a course date for Confirmed/Invited, pick language via chips, and mark Priority', async () => {
        const { insert, onSave } = setup([
            { ...enrollment('other', 'Ukrainian', 'completed'), student_id: 'st-other' },
        ]);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Ukrainian' })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Ukrainian' }));
        fireEvent.change(screen.getByLabelText('Initial Status'), { target: { value: 'confirmed' } });
        fireEvent.click(screen.getByRole('button', { name: /Priority/ }));

        // Date picker is visible for Confirmed status
        expect(screen.getByText('Confirmed course date')).toBeInTheDocument();

        fireEvent.click(enrollButton());
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            course_variant: 'Ukrainian',
            status: 'confirmed',
            is_priority: true,
            confirmed_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }));
    });
});

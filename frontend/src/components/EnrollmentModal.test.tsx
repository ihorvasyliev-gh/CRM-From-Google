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

function enrollment(course_variant: string | null): EnrollmentRow {
    return { id: 'en-1', student_id: 'st-1', course_id: 'c-1', status: 'requested', course_variant } as EnrollmentRow;
}

function setup(existing: EnrollmentRow[]) {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'students') {
            return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [student], error: null }) }) };
        }
        if (table === 'courses') {
            return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: courses, error: null }) }) };
        }
        return { update, insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['enrollments'], existing);
    const onClose = vi.fn();
    render(
        <QueryClientProvider client={queryClient}>
            <EnrollmentModal open preselectedStudentId="st-1" preselectedCourseId="c-1" onSave={vi.fn()} onClose={onClose} />
        </QueryClientProvider>
    );
    return { update, eq, onClose };
}

describe('EnrollmentModal — already enrolled in the course', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('marks the existing enrollment as Any language instead of adding a second one', async () => {
        const { update, eq, onClose } = setup([enrollment('English')]);

        expect(await screen.findByText(/Already enrolled in this course \(requested, English\)/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enroll Student' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /Mark as Any language/ }));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(update).toHaveBeenCalledWith({ course_variant: 'Any language' });
        expect(eq).toHaveBeenCalledWith('id', 'en-1');
    });

    it('offers no button once the enrollment is already Any language', async () => {
        setup([enrollment('Any language')]);

        expect(await screen.findByText(/Already enrolled in this course \(requested, Any language\)/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Mark as Any language/ })).not.toBeInTheDocument();
    });
});

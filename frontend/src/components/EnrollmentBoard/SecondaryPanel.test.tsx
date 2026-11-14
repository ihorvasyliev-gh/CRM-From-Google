import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SecondaryPanel from './SecondaryPanel';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

function row(id: string, status: string, first: string): EnrollmentRow {
    return {
        id, student_id: `s-${id}`, course_id: 'c1', status, course_variant: 'English', notes: id === 'w1' ? 'Moved abroad' : null,
        created_at: '2026-08-20T10:00:00Z',
        students: { id: `s-${id}`, first_name: first, last_name: 'Doe', email: `${first}@example.com`, phone: '+353871234567' },
        courses: { id: 'c1', name: 'Safe Pass' },
    } as EnrollmentRow;
}

function setup(open = true) {
    const props = {
        open,
        onClose: vi.fn(),
        byStatus: { withdrawn: [row('w1', 'withdrawn', 'Anna'), row('w2', 'withdrawn', 'Brian')], rejected: [row('r1', 'rejected', 'Ciara')] },
        onRestore: vi.fn(), onDelete: vi.fn(), onShowDetail: vi.fn(), onCopyEmails: vi.fn(),
    };
    render(<SecondaryPanel {...props} />);
    return props;
}

describe('SecondaryPanel', () => {
    it('renders nothing while closed', () => {
        setup(false);
        expect(screen.queryByText('Anna Doe')).not.toBeInTheDocument();
    });

    it('lists withdrawn and rejected people with phone and note', () => {
        setup();
        const withdrawn = screen.getByRole('region', { name: 'Withdrawn' });
        expect(within(withdrawn).getByText('Anna Doe')).toBeInTheDocument();
        expect(within(withdrawn).getByText('Brian Doe')).toBeInTheDocument();
        expect(within(withdrawn).getByText('Moved abroad')).toBeInTheDocument();
        expect(within(withdrawn).getAllByRole('link')[0]).toHaveAttribute('href', expect.stringContaining('tel:'));
        expect(within(screen.getByRole('region', { name: 'Rejected' })).getByText('Ciara Doe')).toBeInTheDocument();
        expect(screen.getByText(/3 enrollments/)).toBeInTheDocument();
    });

    it('opens the student, restores, deletes and copies emails', () => {
        const props = setup();
        fireEvent.click(screen.getByText('Anna Doe'));
        expect(props.onShowDetail).toHaveBeenCalledWith(props.byStatus.withdrawn[0]);

        fireEvent.click(screen.getAllByRole('button', { name: /Restore/ })[1]);
        expect(props.onRestore).toHaveBeenCalledWith(props.byStatus.withdrawn[1]);

        fireEvent.click(screen.getByRole('button', { name: "Delete Ciara Doe's enrollment" }));
        expect(props.onDelete).toHaveBeenCalledWith(props.byStatus.rejected[0]);

        fireEvent.click(screen.getByRole('button', { name: 'Copy Rejected emails' }));
        expect(props.onCopyEmails).toHaveBeenCalledWith(props.byStatus.rejected, 'Rejected');
    });
});

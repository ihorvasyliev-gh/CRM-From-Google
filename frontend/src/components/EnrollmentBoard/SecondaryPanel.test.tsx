import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
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

    it('supports bulk selection with Restore and Delete plus inline note editing', async () => {
        const onRestoreMany = vi.fn();
        const onDeleteMany = vi.fn();
        const onUpdateNote = vi.fn().mockResolvedValue(true);
        const byStatus = {
            withdrawn: [row('w1', 'withdrawn', 'Anna'), row('w2', 'withdrawn', 'Brian')],
            rejected: [row('r1', 'rejected', 'Ciara')],
        };
        render(
            <SecondaryPanel
                open
                onClose={vi.fn()}
                byStatus={byStatus}
                onRestore={vi.fn()}
                onDelete={vi.fn()}
                onShowDetail={vi.fn()}
                onCopyEmails={vi.fn()}
                onUpdateNote={onUpdateNote}
                onRestoreMany={onRestoreMany}
                onDeleteMany={onDeleteMany}
            />
        );

        // Select all in Withdrawn and restore them together
        fireEvent.click(screen.getByRole('button', { name: 'Select all Withdrawn' }));
        fireEvent.click(screen.getByRole('button', { name: 'Restore (2)' }));
        expect(onRestoreMany).toHaveBeenCalledWith(byStatus.withdrawn);

        // Inline edit Anna's note
        fireEvent.click(screen.getByText('Moved abroad'));
        const textarea = screen.getByPlaceholderText('Add note…');
        fireEvent.change(textarea, { target: { value: 'Returning in January' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        });
        expect(onUpdateNote).toHaveBeenCalledWith('w1', 'Returning in January');
    });

    it('paginates long lists with a Show more button', () => {
        const manyWithdrawn = Array.from({ length: 30 }, (_, i) => row(`w-${i}`, 'withdrawn', `Person${i}`));
        render(
            <SecondaryPanel
                open
                onClose={vi.fn()}
                byStatus={{ withdrawn: manyWithdrawn, rejected: [] }}
                onRestore={vi.fn()}
                onDelete={vi.fn()}
                onShowDetail={vi.fn()}
                onCopyEmails={vi.fn()}
            />
        );
        expect(screen.queryByText('Person29 Doe')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Show 5 more \(5 remaining\)/ }));
        expect(screen.getByText('Person29 Doe')).toBeInTheDocument();
    });
});

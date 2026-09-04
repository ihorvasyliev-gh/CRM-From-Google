import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardKPIs from './DashboardKPIs';

describe('DashboardKPIs', () => {
    it('renders 4 key operational metrics and triggers navigation on click', () => {
        const mockNavigate = vi.fn();
        render(
            <DashboardKPIs
                stats={{ students: 120, courses: 8, enrollments: 340 }}
                statusCounts={{ requested: 14, invited: 9, confirmed: 28, completed: 80 }}
                onNavigate={mockNavigate}
            />
        );

        expect(screen.getByText('120')).toBeInTheDocument();
        expect(screen.getByText('14')).toBeInTheDocument();
        expect(screen.getByText('9')).toBeInTheDocument();
        expect(screen.getByText('28')).toBeInTheDocument();

        // Click Requested card
        const requestedCard = screen.getByText(/New Requests/i).closest('button');
        if (requestedCard) fireEvent.click(requestedCard);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { status: 'requested' });

        // Click Students card
        const studentsCard = screen.getByText(/Total Students/i).closest('button');
        if (studentsCard) fireEvent.click(studentsCard);
        expect(mockNavigate).toHaveBeenCalledWith('students');
    });

    it('triggers navigation for invited and confirmed cards', () => {
        const mockNavigate = vi.fn();
        render(
            <DashboardKPIs
                stats={{ students: 10, courses: 2, enrollments: 20 }}
                statusCounts={{ requested: 1, invited: 5, confirmed: 7 }}
                onNavigate={mockNavigate}
            />
        );

        const invitedCard = screen.getByText(/Pending Invites/i).closest('button');
        if (invitedCard) fireEvent.click(invitedCard);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { status: 'invited' });

        const confirmedCard = screen.getByText(/Confirmed/i).closest('button');
        if (confirmedCard) fireEvent.click(confirmedCard);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { status: 'confirmed' });
    });

    it('handles missing status counts gracefully by defaulting to 0', () => {
        render(
            <DashboardKPIs
                stats={{ students: 50, courses: 3, enrollments: 100 }}
                statusCounts={{}}
            />
        );

        expect(screen.getByText('50')).toBeInTheDocument();
        const zeroes = screen.getAllByText('0');
        expect(zeroes.length).toBe(3);
    });

    it('displays loading placeholders and disables buttons when loading is true', () => {
        const mockNavigate = vi.fn();
        render(
            <DashboardKPIs
                stats={{ students: 120, courses: 8, enrollments: 340 }}
                statusCounts={{ requested: 14, invited: 9, confirmed: 28 }}
                onNavigate={mockNavigate}
                loading={true}
            />
        );

        const placeholders = screen.getAllByText('—');
        expect(placeholders.length).toBe(4);

        const buttons = screen.getAllByRole('button');
        buttons.forEach(button => {
            expect(button).toBeDisabled();
            fireEvent.click(button);
        });

        expect(mockNavigate).not.toHaveBeenCalled();
    });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UpcomingCohortsCard from './UpcomingCohortsCard';
import { UpcomingCohortItem } from './dashboardUtils';

describe('UpcomingCohortsCard', () => {
    it('renders upcoming cohorts grouped by date and triggers filter navigation', () => {
        const mockNavigate = vi.fn();
        const cohorts: UpcomingCohortItem[] = [
            {
                date: '2026-09-12',
                courseId: 'c-1',
                courseName: 'Patient Moving and Handling',
                confirmedCount: 9,
            },
        ];

        render(<UpcomingCohortsCard cohorts={cohorts} onNavigate={mockNavigate} />);
        expect(screen.getByText(/Patient Moving and Handling/i)).toBeInTheDocument();
        expect(screen.getByText(/9 confirmed/i)).toBeInTheDocument();

        const cardBtn = screen.getByRole('button', { name: /Patient Moving and Handling/i });
        fireEvent.click(cardBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', {
            courseId: 'c-1',
            courseDate: '2026-09-12',
        });
    });

    it('renders empty state when no upcoming cohorts', () => {
        const mockNavigate = vi.fn();
        render(<UpcomingCohortsCard cohorts={[]} onNavigate={mockNavigate} />);
        expect(screen.getByText(/No upcoming course cohorts scheduled/i)).toBeInTheDocument();

        const openBoardBtn = screen.getByRole('button', { name: /Open Board →/i });
        fireEvent.click(openBoardBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments');
    });

    it('renders empty state defensively when cohorts is undefined', () => {
        render(<UpcomingCohortsCard />);
        expect(screen.getByText(/No upcoming course cohorts scheduled/i)).toBeInTheDocument();

        const openBoardBtn = screen.getByRole('button', { name: /Open Board →/i });
        expect(() => fireEvent.click(openBoardBtn)).not.toThrow();
    });

    it('renders multiple cohorts with correct badge and aria-labels', () => {
        const mockNavigate = vi.fn();
        const cohorts: UpcomingCohortItem[] = [
            {
                date: '2026-09-12',
                courseId: 'c-1',
                courseName: 'Patient Moving and Handling',
                confirmedCount: 9,
            },
            {
                date: '2026-09-15',
                courseId: 'c-2',
                courseName: 'SafePass Training',
                confirmedCount: 14,
            },
        ];

        render(<UpcomingCohortsCard cohorts={cohorts} onNavigate={mockNavigate} />);
        expect(screen.getByText('Next 2 dates')).toBeInTheDocument();
        expect(screen.getByLabelText('Cohort: Patient Moving and Handling on 2026-09-12, 9 confirmed')).toBeInTheDocument();
        expect(screen.getByLabelText('Cohort: SafePass Training on 2026-09-15, 14 confirmed')).toBeInTheDocument();

        const card2 = screen.getByLabelText('Cohort: SafePass Training on 2026-09-15, 14 confirmed');
        fireEvent.click(card2);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', {
            courseId: 'c-2',
            courseDate: '2026-09-15',
        });
    });

    it('does not throw when clicking cohort card if onNavigate is not provided', () => {
        const cohorts: UpcomingCohortItem[] = [
            {
                date: '2026-09-12',
                courseId: 'c-1',
                courseName: 'Patient Moving and Handling',
                confirmedCount: 9,
            },
        ];

        render(<UpcomingCohortsCard cohorts={cohorts} />);
        const cardBtn = screen.getByRole('button', { name: /Patient Moving and Handling/i });
        expect(() => fireEvent.click(cardBtn)).not.toThrow();
    });
});

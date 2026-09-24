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
        expect(screen.getByText(/No upcoming courses scheduled/i)).toBeInTheDocument();

        const openBoardBtn = screen.getByRole('button', { name: /Open Board →/i });
        fireEvent.click(openBoardBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments');
    });

    it('renders empty state defensively when cohorts is undefined', () => {
        render(<UpcomingCohortsCard />);
        expect(screen.getByText(/No upcoming courses scheduled/i)).toBeInTheDocument();

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
        expect(screen.getByLabelText('Course: Patient Moving and Handling on 2026-09-12, 9 confirmed')).toBeInTheDocument();
        expect(screen.getByLabelText('Course: SafePass Training on 2026-09-15, 14 confirmed')).toBeInTheDocument();

        const card2 = screen.getByLabelText('Course: SafePass Training on 2026-09-15, 14 confirmed');
        fireEvent.click(card2);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', {
            courseId: 'c-2',
            courseDate: '2026-09-15',
        });
    });

    it('stacks courses on the same day into one card, each clickable on its own', () => {
        const mockNavigate = vi.fn();
        const cohorts: UpcomingCohortItem[] = [
            { date: '2026-10-21', courseId: 'c-1', courseName: 'SafePass', confirmedCount: 1 },
            { date: '2026-10-21', courseId: 'c-2', courseName: 'Manual Handling', confirmedCount: 4 },
            { date: '2026-10-22', courseId: 'c-3', courseName: 'First Aid', confirmedCount: 2 },
        ];

        const { container } = render(<UpcomingCohortsCard cohorts={cohorts} onNavigate={mockNavigate} />);
        expect(screen.getByText('Next 2 dates')).toBeInTheDocument();
        // One date badge per day, not per course
        expect(container.querySelectorAll('.tabular-nums')).toHaveLength(2);

        const safePass = screen.getByRole('button', { name: /SafePass on 2026-10-21/ });
        const manual = screen.getByRole('button', { name: /Manual Handling on 2026-10-21/ });
        expect(safePass.parentElement).toBe(manual.parentElement);

        fireEvent.click(manual);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { courseId: 'c-2', courseDate: '2026-10-21' });
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

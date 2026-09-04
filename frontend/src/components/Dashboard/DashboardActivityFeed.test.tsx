import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardActivityFeed, { GroupedActivity } from './DashboardActivityFeed';
import StatusBreakdownCard from './StatusBreakdownCard';

describe('DashboardActivityFeed', () => {
    it('renders grouped student activities and filters by status', () => {
        const mockNavigate = vi.fn();
        const mockOpenStudent = vi.fn();

        const groupedActivity: GroupedActivity[] = [
            {
                key: 'g1',
                studentName: 'Alice Green',
                studentId: 's1',
                date: '2026-09-04',
                dateLabel: '04 Sep',
                isNew: true,
                enrollments: [
                    { id: 'en1', courseId: 'c1', courseName: 'SafePass', courseVariant: null, status: 'requested' },
                ],
                previousEnrollments: [],
            },
        ];

        render(
            <DashboardActivityFeed
                groupedActivity={groupedActivity}
                activityFilter="all"
                setActivityFilter={vi.fn()}
                filterCounts={{ all: 1, requested: 1, invited: 0, confirmed: 0, completed: 0 }}
                onNavigate={mockNavigate}
                onOpenStudentDetail={mockOpenStudent}
            />
        );

        expect(screen.getByText('Alice Green')).toBeInTheDocument();
        expect(screen.getByText('SafePass')).toBeInTheDocument();
        expect(screen.getByText('NEW')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Alice Green'));
        expect(mockOpenStudent).toHaveBeenCalledWith('s1');
    });

    it('handles clicking on course pill to navigate to board with courseId', () => {
        const mockNavigate = vi.fn();

        const groupedActivity: GroupedActivity[] = [
            {
                key: 'g1',
                studentName: 'Bob Smith',
                studentId: 's2',
                date: '2026-09-04',
                dateLabel: '04 Sep',
                enrollments: [
                    { id: 'en2', courseId: 'c2', courseName: 'Manual Handling', courseVariant: 'Morning', status: 'confirmed' },
                ],
                previousEnrollments: [],
            },
        ];

        render(
            <DashboardActivityFeed
                groupedActivity={groupedActivity}
                activityFilter="all"
                setActivityFilter={vi.fn()}
                filterCounts={{ all: 1, requested: 0, invited: 0, confirmed: 1, completed: 0 }}
                onNavigate={mockNavigate}
            />
        );

        expect(screen.getByText('Manual Handling')).toBeInTheDocument();
        expect(screen.getByText('(Morning)')).toBeInTheDocument();

        const courseBtn = screen.getByRole('button', { name: /Manual Handling/i });
        fireEvent.click(courseBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { courseId: 'c2' });
    });

    it('handles clicking on course pill without courseId', () => {
        const mockNavigate = vi.fn();

        const groupedActivity: GroupedActivity[] = [
            {
                key: 'g1',
                studentName: 'Bob Smith',
                studentId: 's2',
                date: '2026-09-04',
                dateLabel: '04 Sep',
                enrollments: [
                    { id: 'en2', courseName: 'General Course', courseVariant: null, status: 'confirmed' },
                ],
                previousEnrollments: [],
            },
        ];

        render(
            <DashboardActivityFeed
                groupedActivity={groupedActivity}
                activityFilter="all"
                setActivityFilter={vi.fn()}
                filterCounts={{ all: 1, requested: 0, invited: 0, confirmed: 1, completed: 0 }}
                onNavigate={mockNavigate}
            />
        );

        const courseBtn = screen.getByRole('button', { name: /General Course/i });
        fireEvent.click(courseBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments');
    });

    it('handles filter selection', () => {
        const mockSetFilter = vi.fn();

        render(
            <DashboardActivityFeed
                groupedActivity={[]}
                activityFilter="all"
                setActivityFilter={mockSetFilter}
                filterCounts={{ all: 5, requested: 2, invited: 1, confirmed: 1, completed: 1 }}
            />
        );

        const requestedFilterBtn = screen.getByRole('button', { name: /Requested \(2\)/i });
        fireEvent.click(requestedFilterBtn);
        expect(mockSetFilter).toHaveBeenCalledWith('requested');
    });

    it('renders timeline with previous enrollments history', () => {
        const groupedActivity: GroupedActivity[] = [
            {
                key: 'g1',
                studentName: 'Charlie Brown',
                studentId: 's3',
                date: '2026-09-04',
                dateLabel: '04 Sep',
                enrollments: [
                    { id: 'en3', courseId: 'c3', courseName: 'Forklift', courseVariant: null, status: 'confirmed' },
                ],
                previousEnrollments: [
                    { id: 'en_prev', courseId: 'c1', courseName: 'SafePass', courseVariant: null, status: 'completed', dateLabel: '12 Aug' },
                ],
            },
        ];

        render(
            <DashboardActivityFeed
                groupedActivity={groupedActivity}
                activityFilter="all"
                setActivityFilter={vi.fn()}
                filterCounts={{ all: 2, requested: 0, invited: 0, confirmed: 1, completed: 1 }}
            />
        );

        expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
        expect(screen.getByText('Forklift')).toBeInTheDocument();
        expect(screen.getByText('SafePass')).toBeInTheDocument();
        expect(screen.getByText('04 Sep')).toBeInTheDocument();
        expect(screen.getByText('12 Aug')).toBeInTheDocument();
    });

    it('renders empty state when no activities match filter', () => {
        render(
            <DashboardActivityFeed
                groupedActivity={[]}
                activityFilter="invited"
                setActivityFilter={vi.fn()}
                filterCounts={{ all: 0, requested: 0, invited: 0, confirmed: 0, completed: 0 }}
            />
        );
        expect(screen.getByText(/No invited enrollments/i)).toBeInTheDocument();
    });

    it('renders default empty state for all filter', () => {
        render(
            <DashboardActivityFeed
                groupedActivity={[]}
                activityFilter="all"
                setActivityFilter={vi.fn()}
                filterCounts={{ all: 0, requested: 0, invited: 0, confirmed: 0, completed: 0 }}
            />
        );
        expect(screen.getByText(/No recent activity/i)).toBeInTheDocument();
    });

    it('renders loading skeleton when loading is true', () => {
        const { container } = render(
            <DashboardActivityFeed
                groupedActivity={[]}
                activityFilter="all"
                setActivityFilter={vi.fn()}
                filterCounts={{ all: 0, requested: 0, invited: 0, confirmed: 0, completed: 0 }}
                loading={true}
            />
        );
        expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('handles defensive defaults when optional props and nested arrays are undefined', () => {
        const groupedActivity = [
            {
                key: 'g_partial',
                studentName: 'Partial Student',
                studentId: 's_part',
                date: '2026-09-04',
                dateLabel: '04 Sep',
            } as any,
        ];

        render(
            <DashboardActivityFeed
                groupedActivity={groupedActivity}
                activityFilter="all"
                setActivityFilter={vi.fn()}
                filterCounts={{} as any}
            />
        );

        expect(screen.getByText('Partial Student')).toBeInTheDocument();
        expect(screen.getByText('All (0)')).toBeInTheDocument();
    });
});

describe('StatusBreakdownCard', () => {
    it('renders status rows with counts and percentages', () => {
        const statusBreakdown = {
            requested: 10,
            invited: 5,
            confirmed: 15,
            completed: 20,
            withdrawn: 0,
            rejected: 0,
        };

        render(<StatusBreakdownCard statusBreakdown={statusBreakdown} />);

        expect(screen.getByText(/Enrollment Status/i)).toBeInTheDocument();
        expect(screen.getByText('Requested')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getByText('20%')).toBeInTheDocument(); // 10 / 50 = 20%

        expect(screen.getByText('Confirmed')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();
        expect(screen.getByText('30%')).toBeInTheDocument(); // 15 / 50 = 30%
    });

    it('handles clicking a status row to navigate to enrollments with status filter', () => {
        const mockNavigate = vi.fn();
        const statusBreakdown = {
            requested: 4,
            invited: 2,
        };

        render(<StatusBreakdownCard statusBreakdown={statusBreakdown} onNavigate={mockNavigate} />);

        const requestedBtn = screen.getByRole('button', { name: /Requested/i });
        fireEvent.click(requestedBtn);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { status: 'requested' });
    });

    it('renders empty state when total status count is 0', () => {
        render(<StatusBreakdownCard statusBreakdown={{}} />);
        expect(screen.getByText(/No enrollments yet/i)).toBeInTheDocument();
    });

    it('renders loading state when loading is true', () => {
        const { container } = render(<StatusBreakdownCard statusBreakdown={{}} loading={true} />);
        expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('defensively handles undefined statusBreakdown', () => {
        render(<StatusBreakdownCard statusBreakdown={undefined as any} />);
        expect(screen.getByText(/No enrollments yet/i)).toBeInTheDocument();
    });
});

import { describe, it, expect } from 'vitest';
import { mergeCoursePills } from './Dashboard/dashboardUtils';

describe('Dashboard Activity Grouping Logic', () => {
    const groupStudentEnrollments = mergeCoursePills;

    it('separates confirmed and requested variants for the same course and prioritizes confirmed first', () => {
        const studentEnrollments = [
            { id: '1', courseName: 'Manual Handling', courseVariant: 'English', status: 'requested' },
            { id: '2', courseName: 'Manual Handling', courseVariant: 'Ukrainian', status: 'confirmed' },
            { id: '3', courseName: 'SafePass', courseVariant: 'Ukrainian', status: 'requested' },
            { id: '4', courseName: 'SafePass', courseVariant: 'English', status: 'requested' },
            { id: '5', courseName: 'Barista', courseVariant: 'English', status: 'requested' },
        ];

        const grouped = groupStudentEnrollments(studentEnrollments);

        // Confirmed Manual Handling should be first (priority sort)
        expect(grouped[0]).toEqual({
            id: '2',
            courseName: 'Manual Handling',
            courseVariant: 'Ukrainian',
            status: 'confirmed'
        });

        // SafePass with both requested variants merged into one pill
        const safePass = grouped.find(g => g.courseName === 'SafePass');
        expect(safePass).toEqual({
            id: '3',
            courseName: 'SafePass',
            courseVariant: 'Ukrainian, English',
            status: 'requested'
        });

        // Requested Manual Handling is retained as separate pill
        const requestedManualHandling = grouped.find(g => g.courseName === 'Manual Handling' && g.status === 'requested');
        expect(requestedManualHandling).toEqual({
            id: '1',
            courseName: 'Manual Handling',
            courseVariant: 'English',
            status: 'requested'
        });
    });
});

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './Dashboard';
import { vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockResolvedValue({ count: 5 }),
        })),
    },
}));

const futureCohortDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

vi.mock('../hooks/useEnrollments', () => ({
    fetchAllEnrollments: vi.fn().mockResolvedValue([
        {
            id: 'enr-1',
            student_id: 'stu-1',
            course_id: 'crs-1',
            status: 'invited',
            invited_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago with 7 days limit = 24h left
            response_days: 7,
            created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
            students: { id: 'stu-1', first_name: 'Jane', last_name: 'Smith' },
            courses: { id: 'crs-1', name: 'SafePass' },
        },
        {
            id: 'enr-2',
            student_id: 'stu-2',
            course_id: 'crs-2',
            status: 'requested',
            created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago = stale
            students: { id: 'stu-2', first_name: 'Bob', last_name: 'Builder' },
            courses: { id: 'crs-2', name: 'Manual Handling' },
        },
        {
            id: 'enr-3',
            student_id: 'stu-3',
            course_id: 'crs-3',
            status: 'confirmed',
            confirmed_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            students: { id: 'stu-3', first_name: 'Alice', last_name: 'Wonder' },
            courses: { id: 'crs-3', name: 'First Aid' },
        },
    ]),
}));

describe('Dashboard Component - Interactive Feed & Needs Attention', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
    });

    const renderDashboard = (props: any = {}) => {
        return render(
            <QueryClientProvider client={queryClient}>
                <Dashboard {...props} />
            </QueryClientProvider>
        );
    };

    it('allows clicking student name in activity feed to view student details', async () => {
        const mockOpenDetail = vi.fn();
        renderDashboard({ onOpenStudentDetail: mockOpenDetail });

        const studentBtns = await screen.findAllByRole('button', { name: /Jane Smith/i }, { timeout: 4000 });
        expect(studentBtns.length).toBeGreaterThan(0);
        fireEvent.click(studentBtns[0]);
        expect(mockOpenDetail).toHaveBeenCalledWith('stu-1');
    });

    it('allows clicking course pill in activity feed to filter board by that course', async () => {
        const mockNavigate = vi.fn();
        renderDashboard({ onNavigate: mockNavigate });

        const courseBtns = await screen.findAllByRole('button', { name: /SafePass/i }, { timeout: 4000 });
        expect(courseBtns.length).toBeGreaterThan(0);
        fireEvent.click(courseBtns[0]);
        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { courseId: 'crs-1' });
    });

    it('renders all assembled sections: KPIs, registration links, expired invites, upcoming cohorts, quick actions, status breakdown', async () => {
        renderDashboard();

        // Operational KPIs
        const totalStudents = await screen.findAllByText(/Total Students/i, {}, { timeout: 4000 });
        expect(totalStudents.length).toBeGreaterThan(0);
        expect(screen.getAllByText(/New Requests/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Pending Invites/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Confirmed/i).length).toBeGreaterThan(0);

        // Expired Invites card
        const expiredHeaders = await screen.findAllByText(/Expired Invites/i, {}, { timeout: 4000 });
        expect(expiredHeaders.length).toBeGreaterThan(0);

        // Upcoming Courses card
        const cohortHeaders = await screen.findAllByText(/Upcoming Courses/i, {}, { timeout: 4000 });
        expect(cohortHeaders.length).toBeGreaterThan(0);
        expect(screen.getAllByText(/First Aid/i).length).toBeGreaterThan(0);

        // Status Breakdown
        expect(screen.getAllByText(/Enrollment Status/i).length).toBeGreaterThan(0);

        // Registration form link
        expect(screen.getAllByText(/Registration Form/i).length).toBeGreaterThan(0);
    });

    it('handles clicking upcoming cohort to navigate to enrollments with courseId and courseDate', async () => {
        const mockNavigate = vi.fn();
        renderDashboard({ onNavigate: mockNavigate });

        const cohortBtns = await screen.findAllByRole('button', { name: /First Aid/i }, { timeout: 4000 });
        expect(cohortBtns.length).toBeGreaterThan(0);
        fireEvent.click(cohortBtns[0]);

        expect(mockNavigate).toHaveBeenCalledWith('enrollments', {
            courseId: 'crs-3',
            courseDate: futureCohortDate,
        });
    });

    it('filters the activity feed with the search box', async () => {
        renderDashboard();

        const search = await screen.findByRole('searchbox', { name: /Search activity/i }, { timeout: 4000 });
        await screen.findAllByRole('button', { name: /Jane Smith/i }, { timeout: 4000 });
        fireEvent.change(search, { target: { value: 'first aid' } });

        const feed = within(screen.getByText('Recent Activity').closest('section')!);
        await waitFor(() => expect(feed.queryByRole('button', { name: 'Jane Smith' })).not.toBeInTheDocument());
        expect(feed.getByRole('button', { name: 'Alice Wonder' })).toBeInTheDocument();
    });

    it('shows contextual KPI hints derived from enrollments', async () => {
        renderDashboard();

        // Bob's request is 10 days old -> stale; Alice's cohort starts in 5 days
        expect(await screen.findByText(/1 waiting over 7 days/i, {}, { timeout: 4000 })).toBeInTheDocument();
        expect(screen.getByText(/1 starting within 7 days/i)).toBeInTheDocument();
    });

    it('handles clicking KPI cards to navigate to enrollments with status filter', async () => {
        const mockNavigate = vi.fn();
        renderDashboard({ onNavigate: mockNavigate });

        const requestsKpis = await screen.findAllByRole('button', { name: /New Requests/i }, { timeout: 4000 });
        expect(requestsKpis.length).toBeGreaterThan(0);
        await waitFor(() => expect(requestsKpis[0]).not.toBeDisabled(), { timeout: 4000 });
        fireEvent.click(requestsKpis[0]);

        expect(mockNavigate).toHaveBeenCalledWith('enrollments', { status: 'requested' });
    });
});


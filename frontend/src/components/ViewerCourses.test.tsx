import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ViewerCourses from './ViewerCourses';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

function renderWithClient(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
}

describe('ViewerCourses Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockCourses = [
        {
            id: 'course-1',
            name: 'First Aid Training',
            created_at: '2026-01-01T00:00:00Z',
            total_count: 3,
            requested_count: 3,
            invited_count: 0,
            confirmed_count: 0,
            completed_count: 0,
            rejected_count: 0,
            pending_approval_count: 0,
        },
    ];

    const mockRoster = [
        {
            enrollment_id: 'en-3',
            student_id: 'st-3',
            first_name: 'Charlie',
            last_name: 'Brown',
            email: 'charlie@example.com',
            phone: '333',
            status: 'requested',
            course_variant: null,
            notes: null,
            is_priority: false,
            queue_position: 2,
            invited_date: null,
            invited_at: null,
            confirmed_date: null,
            confirmed_at: null,
            completed_date: null,
            completed_at: null,
            pending_completion_date: null,
            completion_request_status: 'none',
            completion_requested_at: null,
            completion_requested_by: null,
            completion_rejection_reason: null,
            created_at: '2026-02-15T12:00:00Z', // Later registration date, non-priority
        },
        {
            enrollment_id: 'en-2',
            student_id: 'st-2',
            first_name: 'Bob',
            last_name: 'Adams',
            email: 'bob@example.com',
            phone: '222',
            status: 'requested',
            course_variant: null,
            notes: null,
            is_priority: false,
            queue_position: 1,
            invited_date: null,
            invited_at: null,
            confirmed_date: null,
            confirmed_at: null,
            completed_date: null,
            completed_at: null,
            pending_completion_date: null,
            completion_request_status: 'none',
            completion_requested_at: null,
            completion_requested_by: null,
            completion_rejection_reason: null,
            created_at: '2026-01-10T10:00:00Z', // Earlier registration date, non-priority
        },
        {
            enrollment_id: 'en-1',
            student_id: 'st-1',
            first_name: 'Alice',
            last_name: 'Smith',
            email: 'alice@example.com',
            phone: '111',
            status: 'requested',
            course_variant: null,
            notes: null,
            is_priority: true, // Priority student! Should come first regardless of date
            queue_position: 1,
            invited_date: null,
            invited_at: null,
            confirmed_date: null,
            confirmed_at: null,
            completed_date: null,
            completed_at: null,
            pending_completion_date: null,
            completion_request_status: 'none',
            completion_requested_at: null,
            completion_requested_by: null,
            completion_rejection_reason: null,
            created_at: '2026-03-01T08:00:00Z',
        },
    ];

    it('renders course catalog and navigates to roster with priority queue sorting', async () => {
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_viewer_courses') {
                return Promise.resolve({ data: mockCourses, error: null });
            }
            if (rpcName === 'get_viewer_course_roster') {
                return Promise.resolve({ data: mockRoster, error: null });
            }
            return Promise.resolve({ data: [], error: null });
        });

        renderWithClient(<ViewerCourses />);

        // Wait for course card to appear
        await waitFor(() => {
            expect(screen.getByText('First Aid Training')).toBeInTheDocument();
        });

        // Click on the course card to open roster
        fireEvent.click(screen.getByText('First Aid Training'));

        // Wait for students to load
        await waitFor(() => {
            expect(screen.getByText('Alice Smith')).toBeInTheDocument();
            expect(screen.getByText('Bob Adams')).toBeInTheDocument();
            expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
        });

        // Verify Priority indicator for Alice
        expect(screen.getByText('Priority')).toBeInTheDocument();

        // Verify student cards order in DOM:
        // Priority student Alice must appear first, then Bob (oldest created_at 2026-01-10), then Charlie (2026-02-15)
        const studentNames = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
        expect(studentNames).toEqual(['Alice Smith', 'Bob Adams', 'Charlie Brown']);
    });

    it('switches sort order while keeping priority student first', async () => {
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_viewer_courses') {
                return Promise.resolve({ data: mockCourses, error: null });
            }
            if (rpcName === 'get_viewer_course_roster') {
                return Promise.resolve({ data: mockRoster, error: null });
            }
            return Promise.resolve({ data: [], error: null });
        });

        renderWithClient(<ViewerCourses />);

        await waitFor(() => expect(screen.getByText('First Aid Training')).toBeInTheDocument());
        fireEvent.click(screen.getByText('First Aid Training'));

        await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());

        // Click "Newest First" sort button
        const newestButton = screen.getByText('Newest First');
        fireEvent.click(newestButton);

        // Under "Newest First":
        // Priority (Alice) stays first.
        // Then between Bob (Jan 10) and Charlie (Feb 15), Charlie is newer so Charlie comes before Bob.
        const studentNamesNewest = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
        expect(studentNamesNewest).toEqual(['Alice Smith', 'Charlie Brown', 'Bob Adams']);

        // Click "By Name" sort button
        const nameButton = screen.getByText('By Name');
        fireEvent.click(nameButton);

        // Under "By Name":
        // Priority (Alice Smith) is first.
        // Then Adams (Bob Adams) comes before Brown (Charlie Brown).
        const studentNamesByName = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
        expect(studentNamesByName).toEqual(['Alice Smith', 'Bob Adams', 'Charlie Brown']);
    });
});

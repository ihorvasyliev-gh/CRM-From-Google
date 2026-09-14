import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ViewerStudentsDirectory, { ViewerStudentDirectoryItem } from './ViewerStudentsDirectory';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

vi.mock('./StudentDetailDrawer', () => ({
    default: ({ studentId, onClose }: { studentId: string | null; onClose: () => void }) => {
        if (!studentId) return null;
        return (
            <div data-testid="student-detail-drawer">
                <span>Drawer for student {studentId}</span>
                <button onClick={onClose}>Close Drawer</button>
            </div>
        );
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

describe('ViewerStudentsDirectory Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockCourses = [
        {
            id: 'c-1',
            name: 'Digital Skills Beginners',
            created_at: '2026-01-01T00:00:00Z',
            total_count: 5,
            requested_count: 2,
            invited_count: 1,
            confirmed_count: 2,
            completed_count: 0,
            rejected_count: 0,
            pending_approval_count: 0,
        },
        {
            id: 'c-2',
            name: 'Barista Training',
            created_at: '2026-01-02T00:00:00Z',
            total_count: 3,
            requested_count: 1,
            invited_count: 0,
            confirmed_count: 2,
            completed_count: 0,
            rejected_count: 0,
            pending_approval_count: 0,
        },
    ];

    const mockStudents: ViewerStudentDirectoryItem[] = [
        {
            student_id: 's-1',
            first_name: 'Alice',
            last_name: 'Smith',
            email: 'alice@example.com',
            phone: '+353871112222',
            address: '12 Grand Parade, Cork',
            eircode: 'T12AB12',
            dob: '1990-01-01',
            created_at: '2026-01-15T10:00:00Z',
            primary_course_name: 'Digital Skills Beginners',
            primary_course_id: 'c-1',
            primary_status: 'requested',
            primary_course_variant: 'Morning Class',
            primary_queue_position: 2,
            is_priority: true,
            total_enrollments: 2,
            notes_count: 3,
            total_count: 2,
        },
        {
            student_id: 's-2',
            first_name: 'Bob',
            last_name: 'Jones',
            email: 'bob@example.com',
            phone: '+353873334444',
            address: '45 South Mall, Cork',
            eircode: 'T12CD34',
            dob: '1988-03-20',
            created_at: '2026-01-10T10:00:00Z',
            primary_course_name: 'Barista Training',
            primary_course_id: 'c-2',
            primary_status: 'confirmed',
            primary_course_variant: null,
            primary_queue_position: null,
            is_priority: false,
            total_enrollments: 1,
            notes_count: 0,
            total_count: 2,
        },
    ];

    function setupRpcMock(students: ViewerStudentDirectoryItem[] = mockStudents, courses = mockCourses) {
        (supabase.rpc as any).mockImplementation((rpcName: string, _params: any) => {
            if (rpcName === 'get_viewer_courses') {
                return Promise.resolve({ data: courses, error: null });
            }
            if (rpcName === 'get_viewer_students_directory') {
                return Promise.resolve({ data: students, error: null });
            }
            return Promise.resolve({ data: null, error: new Error('Unknown RPC') });
        });
    }

    it('renders search input and filter controls (course dropdown, status pills, priority toggle, sort dropdown)', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        // Search input
        expect(screen.getByPlaceholderText(/search students/i)).toBeInTheDocument();

        // Course filter
        await waitFor(() => {
            expect(screen.getByRole('option', { name: /digital skills beginners/i })).toBeInTheDocument();
        });
        expect(screen.getByRole('combobox', { name: /course filter/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /all courses/i })).toBeInTheDocument();

        // Status pills/tabs
        expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /requested/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /invited/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /confirmed/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /completed/i })).toBeInTheDocument();

        // Priority toggle
        expect(screen.getByRole('button', { name: /priority only/i })).toBeInTheDocument();

        // Sort dropdown
        expect(screen.getByRole('combobox', { name: /sort by/i })).toBeInTheDocument();
    });

    it('displays list of students with name, status badge, priority star, queue badge, and registration date', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        // Names rendered
        await waitFor(() => {
            expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Bob Jones').length).toBeGreaterThan(0);
        });

        // Contact info
        expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
        expect(screen.getAllByText('bob@example.com').length).toBeGreaterThan(0);

        // Courses
        expect(screen.getAllByText('Digital Skills Beginners').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Barista Training').length).toBeGreaterThan(0);

        // Status badges
        expect(screen.getAllByText(/requested/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/confirmed/i).length).toBeGreaterThan(0);

        // Priority star
        expect(screen.getAllByText(/priority/i).length).toBeGreaterThan(0);

        // Queue badge: #2 in queue
        expect(screen.getAllByText(/#2 in queue/i).length).toBeGreaterThan(0);

        // Registration dates (formatted Irish DD/MM/YYYY)
        expect(screen.getAllByText(/15\/01\/2026/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/10\/01\/2026/).length).toBeGreaterThan(0);

        // Multi-enrollment badge: +1 more
        expect(screen.getAllByText('+1 more').length).toBeGreaterThan(0);

        // Notes count: 3 notes
        expect(screen.getAllByText(/3/).length).toBeGreaterThan(0);

        // Results count indicator
        expect(screen.getByText(/showing 2 students/i)).toBeInTheDocument();
    });

    it('toggles priority filter when ⭐ Priority Only is clicked', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        await waitFor(() => {
            expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
        });

        const priorityBtn = screen.getByRole('button', { name: /priority only/i });
        fireEvent.click(priorityBtn);

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith(
                'get_viewer_students_directory',
                expect.objectContaining({
                    p_priority_only: true,
                })
            );
        });

        // Click again to toggle off
        fireEvent.click(priorityBtn);
        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith(
                'get_viewer_students_directory',
                expect.objectContaining({
                    p_priority_only: false,
                })
            );
        });
    });

    it('debounced search updates query', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        await waitFor(() => {
            expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
        });

        const searchInput = screen.getByPlaceholderText(/search students/i);
        fireEvent.change(searchInput, { target: { value: 'Alice' } });

        // Fast forward / wait for debounced value to trigger RPC
        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith(
                'get_viewer_students_directory',
                expect.objectContaining({
                    p_search: 'Alice',
                })
            );
        }, { timeout: 1500 });
    });

    it('clicking a student row opens StudentDetailDrawer for that student', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        await waitFor(() => {
            expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
        });

        // Drawer shouldn't be open initially
        expect(screen.queryByTestId('student-detail-drawer')).not.toBeInTheDocument();

        // Click the row containing Alice Smith
        const row = screen.getAllByTestId('student-row')[0];
        expect(row).toBeInTheDocument();
        fireEvent.click(row);

        // Drawer should open with student ID s-1
        await waitFor(() => {
            expect(screen.getByTestId('student-detail-drawer')).toBeInTheDocument();
            expect(screen.getByText('Drawer for student s-1')).toBeInTheDocument();
        });

        // Closing drawer
        fireEvent.click(screen.getByRole('button', { name: /close drawer/i }));
        await waitFor(() => {
            expect(screen.queryByTestId('student-detail-drawer')).not.toBeInTheDocument();
        });
    });

    it('reset filters button clears active filters', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        await waitFor(() => {
            expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
        });

        // Activate a filter: click Priority Only
        const priorityBtn = screen.getByRole('button', { name: /priority only/i });
        fireEvent.click(priorityBtn);

        // Reset button should now be visible
        const resetBtn = await screen.findByRole('button', { name: /reset filters/i });
        expect(resetBtn).toBeInTheDocument();

        // Click reset button
        fireEvent.click(resetBtn);

        // Filters should reset: p_priority_only becomes false
        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith(
                'get_viewer_students_directory',
                expect.objectContaining({
                    p_search: null,
                    p_course_id: null,
                    p_status: null,
                    p_priority_only: false,
                    p_sort_by: 'date_desc',
                })
            );
        });
    });

    it('renders empty state when no students match filters and allows reset', async () => {
        setupRpcMock([], mockCourses);
        renderWithClient(<ViewerStudentsDirectory />);

        // Initially no records found
        await waitFor(() => {
            expect(screen.getByText(/no students found in the database/i)).toBeInTheDocument();
        });

        // Enter search filter to trigger "No students match your selected filters"
        const searchInput = screen.getByPlaceholderText(/search students/i);
        fireEvent.change(searchInput, { target: { value: 'NonExistent' } });

        await waitFor(() => {
            expect(screen.getByText(/no students match your selected filters/i)).toBeInTheDocument();
        });

        const resetBtns = screen.getAllByRole('button', { name: /reset filters/i });
        expect(resetBtns.length).toBeGreaterThan(0);
    });

    it('clears search input when clear button (X) is clicked', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        const searchInput = screen.getByPlaceholderText(/search students/i) as HTMLInputElement;
        fireEvent.change(searchInput, { target: { value: 'Alice' } });
        expect(searchInput.value).toBe('Alice');

        const clearBtn = screen.getByRole('button', { name: /clear search/i });
        fireEvent.click(clearBtn);

        expect(searchInput.value).toBe('');
    });

    it('selecting course filter updates RPC query parameters', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        await waitFor(() => {
            expect(screen.getByRole('option', { name: /digital skills beginners/i })).toBeInTheDocument();
        });

        const courseSelect = screen.getByRole('combobox', { name: /course filter/i });
        fireEvent.change(courseSelect, { target: { value: 'c-1' } });

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith(
                'get_viewer_students_directory',
                expect.objectContaining({
                    p_course_id: 'c-1',
                })
            );
        });
    });

    it('selecting status pill updates RPC query parameters', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        await waitFor(() => {
            expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
        });

        const confirmedBtn = screen.getByRole('button', { name: /confirmed/i });
        fireEvent.click(confirmedBtn);

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith(
                'get_viewer_students_directory',
                expect.objectContaining({
                    p_status: 'confirmed',
                })
            );
        });
    });

    it('selecting sort option updates RPC query parameters', async () => {
        setupRpcMock();
        renderWithClient(<ViewerStudentsDirectory />);

        await waitFor(() => {
            expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
        });

        const sortSelect = screen.getByRole('combobox', { name: /sort by/i });
        fireEvent.change(sortSelect, { target: { value: 'queue' } });

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith(
                'get_viewer_students_directory',
                expect.objectContaining({
                    p_sort_by: 'queue',
                })
            );
        });
    });

    it('renders pagination controls when total count exceeds 50 and handles next page', async () => {
        // Create 50 students with total_count: 75
        const manyStudents = Array.from({ length: 50 }, (_, i) => ({
            student_id: `st-${i}`,
            first_name: `Student${i}`,
            last_name: 'Test',
            email: `student${i}@example.com`,
            phone: null,
            address: null,
            eircode: null,
            dob: null,
            created_at: '2026-01-01T00:00:00Z',
            primary_course_name: 'Course A',
            primary_course_id: 'c-1',
            primary_status: 'confirmed',
            primary_course_variant: null,
            primary_queue_position: null,
            is_priority: false,
            total_enrollments: 1,
            notes_count: 0,
            total_count: 75,
        }));

        setupRpcMock(manyStudents);
        renderWithClient(<ViewerStudentsDirectory />);

        await waitFor(() => {
            expect(screen.getAllByText('Student0 Test').length).toBeGreaterThan(0);
        });

        expect(screen.getByText(/showing 75 students/i)).toBeInTheDocument();
        expect(screen.getByText(/page/i)).toBeInTheDocument();

        const nextBtn = screen.getByRole('button', { name: /next/i });
        expect(nextBtn).toBeEnabled();
        fireEvent.click(nextBtn);

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith(
                'get_viewer_students_directory',
                expect.objectContaining({
                    p_offset: 50,
                })
            );
        });
    });

    it('renders user-friendly error card when RPC query fails and allows retry', async () => {
        let callCount = 0;
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_viewer_courses') {
                return Promise.resolve({ data: mockCourses, error: null });
            }
            if (rpcName === 'get_viewer_students_directory') {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({ data: null, error: new Error('Failed to fetch from Supabase') });
                }
                return Promise.resolve({ data: mockStudents, error: null });
            }
            return Promise.resolve({ data: null, error: new Error('Unknown RPC') });
        });

        renderWithClient(<ViewerStudentsDirectory />);

        // Should display error state card instead of empty state
        await waitFor(() => {
            expect(screen.getByText(/failed to load students directory/i)).toBeInTheDocument();
            expect(screen.getByText(/failed to fetch from supabase/i)).toBeInTheDocument();
        });

        expect(screen.queryByText(/no students found in the database/i)).not.toBeInTheDocument();

        // Retry button should be present
        const retryBtn = screen.getByRole('button', { name: /retry/i });
        expect(retryBtn).toBeInTheDocument();

        // Click retry
        fireEvent.click(retryBtn);

        // On retry, directory data should load successfully
        await waitFor(() => {
            expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
        });
    });

    it('does not render variant badge for students without course or variant', async () => {
        const studentNoCourse: ViewerStudentDirectoryItem[] = [
            {
                student_id: 's-no-course',
                first_name: 'Unenrolled',
                last_name: 'User',
                email: 'unenrolled@example.com',
                phone: null,
                address: null,
                eircode: null,
                dob: null,
                created_at: '2026-01-01T00:00:00Z',
                primary_course_name: null,
                primary_course_id: null,
                primary_status: null,
                primary_course_variant: null,
                primary_queue_position: null,
                is_priority: false,
                total_enrollments: 0,
                notes_count: 0,
                total_count: 1,
            },
        ];

        setupRpcMock(studentNoCourse);
        renderWithClient(<ViewerStudentsDirectory />);

        await waitFor(() => {
            expect(screen.getAllByText('Unenrolled User').length).toBeGreaterThan(0);
        });

        // "No course" should be shown
        expect(screen.getAllByText(/no course/i).length).toBeGreaterThan(0);

        // cleanVariant default "English" should NOT be rendered
        expect(screen.queryByText('English')).not.toBeInTheDocument();
    });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import CourseList from './CourseList';
import { supabase } from '../lib/supabase';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
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

describe('CourseList Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockCourses = [
        { id: 'course-1', name: 'Patient moving and handling', created_at: '2026-01-01T00:00:00Z' },
        { id: 'course-2', name: 'Manual Handling', created_at: '2026-01-01T00:00:00Z' },
    ];

    const mockEnrollments = [
        // Patient moving and handling: 1 completed, 2 confirmed, 1 invited, 3 requested, 1 withdrawn = total 8
        { id: 'en-1', course_id: 'course-1', status: 'completed', student_id: 'st-1', created_at: '2026-01-01' },
        { id: 'en-2', course_id: 'course-1', status: 'confirmed', student_id: 'st-2', created_at: '2026-01-02' },
        { id: 'en-3', course_id: 'course-1', status: 'confirmed', student_id: 'st-3', created_at: '2026-01-03' },
        { id: 'en-4', course_id: 'course-1', status: 'invited', student_id: 'st-4', created_at: '2026-01-04' },
        { id: 'en-5', course_id: 'course-1', status: 'requested', student_id: 'st-5', created_at: '2026-01-05' },
        { id: 'en-6', course_id: 'course-1', status: 'requested', student_id: 'st-6', created_at: '2026-01-06' },
        { id: 'en-7', course_id: 'course-1', status: 'requested', student_id: 'st-7', created_at: '2026-01-07' },
        { id: 'en-8', course_id: 'course-1', status: 'withdrawn', student_id: 'st-8', created_at: '2026-01-08' },
        // Manual Handling: 5 requested = total 5
        { id: 'en-9', course_id: 'course-2', status: 'requested', student_id: 'st-9', created_at: '2026-01-09' },
        { id: 'en-10', course_id: 'course-2', status: 'requested', student_id: 'st-10', created_at: '2026-01-10' },
        { id: 'en-11', course_id: 'course-2', status: 'requested', student_id: 'st-11', created_at: '2026-01-11' },
        { id: 'en-12', course_id: 'course-2', status: 'requested', student_id: 'st-12', created_at: '2026-01-12' },
        { id: 'en-13', course_id: 'course-2', status: 'requested', student_id: 'st-13', created_at: '2026-01-13' },
    ];

    it('accurately renders course list with total enrolled counts and breakdown numbers', async () => {
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'courses') {
                return {
                    select: vi.fn().mockReturnValue({
                        order: vi.fn().mockResolvedValue({ data: mockCourses, error: null }),
                    }),
                };
            }
            if (table === 'enrollments') {
                return {
                    select: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                            range: vi.fn().mockResolvedValue({ data: mockEnrollments, error: null }),
                        }),
                    }),
                };
            }
            return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        });

        renderWithClient(<CourseList />);

        // Expect course cards to be rendered
        await waitFor(() => {
            expect(screen.getByText('Patient moving and handling')).toBeInTheDocument();
            expect(screen.getByText('Manual Handling')).toBeInTheDocument();
        });

        // Total students count
        expect(screen.getByText('8')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();

        // Breakdown items for Patient moving and handling
        expect(screen.getByText('1 Completed')).toBeInTheDocument();
        expect(screen.getByText('2 Confirmed')).toBeInTheDocument();
        expect(screen.getByText('1 Invited')).toBeInTheDocument();
        expect(screen.getByText('3 Requested')).toBeInTheDocument();
        expect(screen.getByText('1 Withdrawn')).toBeInTheDocument();

        // Breakdown items for Manual Handling
        expect(screen.getByText('5 Requested')).toBeInTheDocument();
    });

    it('navigates to /enrollments with courseId filter when course card is clicked', async () => {
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'courses') {
                return {
                    select: vi.fn().mockReturnValue({
                        order: vi.fn().mockResolvedValue({ data: mockCourses, error: null }),
                    }),
                };
            }
            if (table === 'enrollments') {
                return {
                    select: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                            range: vi.fn().mockResolvedValue({ data: mockEnrollments, error: null }),
                        }),
                    }),
                };
            }
            return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        });

        renderWithClient(<CourseList />);

        await waitFor(() => {
            expect(screen.getByText('Patient moving and handling')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Patient moving and handling'));

        expect(mockNavigate).toHaveBeenCalledWith('/enrollments', {
            state: { courseId: 'course-1' },
        });
    });

    it('uses get_course_enrollment_counts RPC when available', async () => {
        const mockRpc = vi.fn().mockResolvedValue({
            data: [
                {
                    course_id: 'course-1',
                    total: 10,
                    requested: 4,
                    invited: 2,
                    confirmed: 3,
                    completed: 1,
                    withdrawn: 0,
                    rejected: 0,
                },
                {
                    course_id: 'course-2',
                    total: 6,
                    requested: 6,
                    invited: 0,
                    confirmed: 0,
                    completed: 0,
                    withdrawn: 0,
                    rejected: 0,
                },
            ],
            error: null,
        });

        (supabase as any).rpc = mockRpc;
        (supabase.from as any).mockImplementation((table: string) => {
            if (table === 'courses') {
                return {
                    select: vi.fn().mockReturnValue({
                        order: vi.fn().mockResolvedValue({ data: mockCourses, error: null }),
                    }),
                };
            }
            return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        });

        renderWithClient(<CourseList />);

        await waitFor(() => {
            expect(screen.getByText('Patient moving and handling')).toBeInTheDocument();
            expect(screen.getByText('10')).toBeInTheDocument();
            expect(screen.getByText('6')).toBeInTheDocument();
        });

        expect(mockRpc).toHaveBeenCalledWith('get_course_enrollment_counts');
    });
});

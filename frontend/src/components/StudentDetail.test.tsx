import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentDetail from './StudentDetail';
import type { Student, EmploymentStatusRow } from '../lib/types';

const mockDb = vi.hoisted(() => ({
    enrollments: [] as Record<string, unknown>[],
    employmentStatus: [] as EmploymentStatusRow[],
    upsertCalls: [] as { table: string; payload: Record<string, unknown>; options?: Record<string, unknown> }[],
    updateCalls: [] as { table: string; payload: Record<string, unknown> }[],
    deleteCalls: [] as { table: string; column: string; value: unknown }[],
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn((table: string) => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn().mockImplementation(async () => {
                        if (table === 'enrollments') return { data: mockDb.enrollments, error: null };
                        if (table === 'employment_status') return { data: mockDb.employmentStatus, error: null };
                        return { data: [], error: null };
                    }),
                    single: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
            upsert: vi.fn((payload: Record<string, unknown>, options?: Record<string, unknown>) => {
                mockDb.upsertCalls.push({ table, payload, options });
                return Promise.resolve({ error: null });
            }),
            update: vi.fn((payload: Record<string, unknown>) => {
                mockDb.updateCalls.push({ table, payload });
                return {
                    eq: vi.fn().mockResolvedValue({ error: null }),
                    in: vi.fn().mockResolvedValue({ error: null }),
                };
            }),
            delete: vi.fn(() => ({
                eq: vi.fn((column: string, value: unknown) => {
                    mockDb.deleteCalls.push({ table, column, value });
                    return Promise.resolve({ error: null });
                }),
            })),
        })),
    },
}));

vi.mock('../hooks/useApprovals', () => ({
    useApproveCompletion: () => ({
        mutateAsync: vi.fn().mockResolvedValue({}),
        isPending: false,
    }),
    useRejectCompletion: () => ({
        mutateAsync: vi.fn().mockResolvedValue({}),
        isPending: false,
    }),
}));

const mockStudent: Student = {
    id: 'student-123',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    phone: '+353871234567',
    address: '123 Main Street',
    eircode: 'T12AB34',
    dob: '1995-05-15',
    created_at: '2026-01-01T00:00:00Z',
};

function renderWithQueryClient(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('StudentDetail Component', () => {
    const mockOnClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb.enrollments = [];
        mockDb.employmentStatus = [];
        mockDb.upsertCalls = [];
        mockDb.updateCalls = [];
        mockDb.deleteCalls = [];
    });

    it('renders student details with correct container animation classes', () => {
        renderWithQueryClient(
            <StudentDetail
                student={mockStudent}
                onClose={mockOnClose}
            />
        );

        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();

        // The outer overlay must have overflow-hidden to prevent horizontal scroll during slide-in
        const backdrop = screen.getByText('John Doe').closest('.fixed.inset-0');
        expect(backdrop).not.toBeNull();
        expect(backdrop?.className).toContain('overflow-hidden');
        expect(backdrop?.className).toContain('animate-fadeIn');
        expect(backdrop?.className).toContain('sm:justify-end');

        // The inner card must have sm:animate-slideInRight to slide in from screen edge without translate(-50%) glitch
        const card = screen.getByText('John Doe').closest('.animate-slideUp');
        expect(card).not.toBeNull();
        expect(card?.className).toContain('sm:animate-slideInRight');
        expect(card?.className).toContain('animate-slideUp');
    });

    it('renders close button and responds to click', () => {
        renderWithQueryClient(
            <StudentDetail
                student={mockStudent}
                onClose={mockOnClose}
            />
        );

        // Backdrop click closes (the panel is portaled to <body>, the backdrop just before it)
        const backdropBg = screen.getByRole('dialog').previousElementSibling;
        expect(backdropBg).not.toBeNull();
        fireEvent.click(backdropBg!);
        expect(mockOnClose).toHaveBeenCalled();
    });

    it('hides Employment Outcome section when student has no completed enrollments and no employment_status row', async () => {
        mockDb.enrollments = [
            {
                id: 'en-1',
                student_id: mockStudent.id,
                course_id: 'course-1',
                status: 'confirmed',
                course_variant: null,
                created_at: '2026-02-01T00:00:00Z',
                confirmed_date: '2026-02-10',
                confirmed_at: '2026-02-01T00:00:00Z',
                invited_date: null,
                invited_dates: null,
                invited_at: null,
                courses: { name: 'Safe Pass' },
            },
        ];

        renderWithQueryClient(
            <StudentDetail
                student={mockStudent}
                onClose={mockOnClose}
            />
        );

        expect(await screen.findByText('Safe Pass')).toBeInTheDocument();
        expect(screen.queryByText('Employment Outcome')).not.toBeInTheDocument();
    });

    it('shows Employment Outcome section for a graduate with badges and opens OutcomeEditModal on Edit click', async () => {
        mockDb.enrollments = [
            {
                id: 'en-1',
                student_id: mockStudent.id,
                course_id: 'course-1',
                status: 'completed',
                course_variant: null,
                created_at: '2026-02-01T00:00:00Z',
                confirmed_date: '2026-02-10',
                confirmed_at: '2026-02-01T00:00:00Z',
                invited_date: null,
                invited_dates: null,
                invited_at: null,
                completed_date: '2026-02-10',
                courses: { name: 'Manual Handling' },
            },
        ];
        mockDb.employmentStatus = [
            {
                id: 'es-1',
                student_id: mockStudent.id,
                email: mockStudent.email,
                status: 'responded',
                is_working: true,
                started_month: '2026-03',
                field_of_work: 'Hospitality',
                employment_type: 'full_time',
                last_invited_at: '2026-03-01T10:00:00Z',
                last_responded_at: '2026-04-10T10:00:00Z',
                called_no_answer_at: null,
            },
        ];

        renderWithQueryClient(
            <StudentDetail
                student={mockStudent}
                onClose={mockOnClose}
            />
        );

        expect(await screen.findByText('Employment Outcome')).toBeInTheDocument();
        expect(screen.getByText('Responded')).toBeInTheDocument();
        expect(screen.getByText(/Working · Full-time/)).toBeInTheDocument();
        expect(screen.getByText('in Hospitality')).toBeInTheDocument();
        expect(screen.getByText('Since Mar 2026')).toBeInTheDocument();
        expect(screen.getByText(/Updated 10 Apr 2026/)).toBeInTheDocument();
        // Call mark button is hidden when already responded
        expect(screen.queryByRole('button', { name: /called, no answer/i })).not.toBeInTheDocument();

        // Clicking Edit opens OutcomeEditModal
        fireEvent.click(screen.getByTitle('Edit employment outcome'));
        expect(await screen.findByText('Edit Employment Status')).toBeInTheDocument();

        // Saving from OutcomeEditModal upserts employment_status and clears called_no_answer_at
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        await waitFor(() => {
            expect(mockDb.upsertCalls).toHaveLength(1);
        });
        expect(mockDb.upsertCalls[0]).toEqual({
            table: 'employment_status',
            payload: expect.objectContaining({
                student_id: mockStudent.id,
                email: mockStudent.email,
                status: 'responded',
                is_working: true,
                started_month: '2026-03',
                field_of_work: 'Hospitality',
                employment_type: 'full_time',
                called_no_answer_at: null,
                last_responded_at: expect.any(String),
            }),
            options: { onConflict: 'student_id' },
        });
    });

    it('shows CallMarkButton when not responded and preserves call mark when resetting status to not_contacted', async () => {
        mockDb.employmentStatus = [
            {
                id: 'es-2',
                student_id: mockStudent.id,
                email: mockStudent.email,
                status: 'pending',
                is_working: null,
                started_month: null,
                field_of_work: null,
                employment_type: null,
                last_invited_at: '2026-04-02T09:00:00Z',
                last_responded_at: null,
                called_no_answer_at: '2026-04-05T12:00:00Z',
            },
        ];

        renderWithQueryClient(
            <StudentDetail
                student={mockStudent}
                onClose={mockOnClose}
            />
        );

        expect(await screen.findByText('Employment Outcome')).toBeInTheDocument();
        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getByText(/Sent 2 Apr 2026/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /called, no answer/i })).toBeInTheDocument();

        // Resetting to Not Contacted keeps the row (updates instead of deleting) so called_no_answer_at isn't lost
        fireEvent.click(screen.getByTitle('Edit employment outcome'));
        expect(await screen.findByText('Edit Employment Status')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Not Contacted' }));
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => {
            expect(mockDb.updateCalls).toHaveLength(1);
        });
        expect(mockDb.deleteCalls).toHaveLength(0);
        expect(mockDb.updateCalls[0]).toEqual({
            table: 'employment_status',
            payload: {
                status: 'not_contacted',
                is_working: null,
                started_month: null,
                field_of_work: null,
                employment_type: null,
                last_invited_at: null,
                last_responded_at: null,
            },
        });
    });

    it('toggles CallMarkButton for a graduate with no outcome row yet', async () => {
        mockDb.enrollments = [
            {
                id: 'en-2',
                student_id: mockStudent.id,
                course_id: 'course-1',
                status: 'completed',
                course_variant: null,
                created_at: '2026-02-01T00:00:00Z',
                confirmed_date: null,
                confirmed_at: null,
                invited_date: null,
                invited_dates: null,
                invited_at: null,
                courses: { name: 'First Aid' },
            },
        ];

        renderWithQueryClient(
            <StudentDetail
                student={mockStudent}
                onClose={mockOnClose}
            />
        );

        expect(await screen.findByText('Employment Outcome')).toBeInTheDocument();
        expect(screen.getByText('Not Contacted')).toBeInTheDocument();
        expect(screen.getByText('No data')).toBeInTheDocument();

        const callBtn = screen.getByRole('button', { name: /mark john doe as called, no answer/i });
        fireEvent.click(callBtn);

        await waitFor(() => {
            expect(mockDb.upsertCalls).toHaveLength(1);
            expect(mockDb.updateCalls).toHaveLength(1);
        });
        expect(mockDb.upsertCalls[0]).toEqual({
            table: 'employment_status',
            payload: { student_id: mockStudent.id, email: mockStudent.email, status: 'not_contacted' },
            options: { onConflict: 'student_id', ignoreDuplicates: true },
        });
        expect(mockDb.updateCalls[0]).toEqual({
            table: 'employment_status',
            payload: { called_no_answer_at: expect.any(String) },
        });
    });
});

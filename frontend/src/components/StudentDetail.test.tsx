import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentDetail from './StudentDetail';
import { Student } from '../lib/types';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn().mockResolvedValue({ data: [] }),
                })),
                order: vi.fn().mockResolvedValue({ data: [] }),
            })),
            update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
                in: vi.fn().mockResolvedValue({ error: null }),
            })),
            delete: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
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
    updated_at: '2026-01-01T00:00:00Z',
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
        const card = screen.getByText('John Doe').closest('.bg-surface-elevated');
        expect(card).not.toBeNull();
        expect(card?.className).toContain('sm:animate-slideInRight');
        expect(card?.className).toContain('animate-slideUp');
    });

    it('renders close button and responds to click', () => {
        const { container } = renderWithQueryClient(
            <StudentDetail
                student={mockStudent}
                onClose={mockOnClose}
            />
        );

        // Backdrop click closes
        const backdropBg = container.querySelector('.bg-black\\/40');
        expect(backdropBg).not.toBeNull();
        fireEvent.click(backdropBg!);
        expect(mockOnClose).toHaveBeenCalled();
    });
});

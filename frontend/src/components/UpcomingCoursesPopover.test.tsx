import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import UpcomingCoursesPopover from './UpcomingCoursesPopover';
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

describe('UpcomingCoursesPopover Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockUpcoming = [
        {
            course_id: 'c-1',
            course_name: 'SafePass Training',
            course_date: '2026-10-15',
            confirmed_count: 8,
            pending_count: 3,
            total_active_count: 11,
        },
        {
            course_id: 'c-2',
            course_name: 'Manual Handling',
            course_date: '2026-10-22',
            confirmed_count: 12,
            pending_count: 0,
            total_active_count: 12,
        },
    ];

    it('renders the trigger button with badge count', async () => {
        vi.mocked(supabase.rpc).mockResolvedValueOnce({
            data: mockUpcoming,
            error: null,
        } as any);

        renderWithClient(<UpcomingCoursesPopover onSelectCourse={vi.fn()} />);

        expect(screen.getByRole('button', { name: /upcoming courses/i })).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('2')).toBeInTheDocument();
        });
    });

    it('opens popover on click and shows course list with confirmed and pending counts', async () => {
        vi.mocked(supabase.rpc).mockResolvedValueOnce({
            data: mockUpcoming,
            error: null,
        } as any);

        renderWithClient(<UpcomingCoursesPopover onSelectCourse={vi.fn()} />);

        const trigger = screen.getByRole('button', { name: /upcoming courses/i });
        fireEvent.click(trigger);

        await waitFor(() => {
            expect(screen.getByText('SafePass Training')).toBeInTheDocument();
            expect(screen.getByText('Manual Handling')).toBeInTheDocument();
            expect(screen.getByText(/8 confirmed/i)).toBeInTheDocument();
            expect(screen.getAllByText(/3 pending/i).length).toBe(2); // In summary and in SafePass row
            expect(screen.getByText(/12 confirmed/i)).toBeInTheDocument();
        });
    });

    it('calls onSelectCourse and closes popover when a course item is clicked', async () => {
        vi.mocked(supabase.rpc).mockResolvedValueOnce({
            data: mockUpcoming,
            error: null,
        } as any);

        const onSelectCourseMock = vi.fn();
        renderWithClient(<UpcomingCoursesPopover onSelectCourse={onSelectCourseMock} />);

        const trigger = screen.getByRole('button', { name: /upcoming courses/i });
        fireEvent.click(trigger);

        await waitFor(() => {
            expect(screen.getByText('SafePass Training')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('SafePass Training'));

        expect(onSelectCourseMock).toHaveBeenCalledWith('c-1', '2026-10-15');
        // Popover should close
        expect(screen.queryByText(/8 confirmed/i)).not.toBeInTheDocument();
    });

    it('displays empty state when no upcoming courses exist', async () => {
        vi.mocked(supabase.rpc).mockResolvedValueOnce({
            data: [],
            error: null,
        } as any);

        renderWithClient(<UpcomingCoursesPopover onSelectCourse={vi.fn()} />);

        const trigger = screen.getByRole('button', { name: /upcoming courses/i });
        fireEvent.click(trigger);

        await waitFor(() => {
            expect(screen.getByText(/no upcoming courses/i)).toBeInTheDocument();
        });
    });
});

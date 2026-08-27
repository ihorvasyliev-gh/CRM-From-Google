import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandPalette from './CommandPalette';

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                order: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({ data: [] }),
                })),
                limit: vi.fn().mockResolvedValue({ data: [] }),
                or: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [] }),
                }),
            })),
        })),
    },
}));

describe('CommandPalette Component', () => {
    const mockNavigate = vi.fn();
    const mockClose = vi.fn();
    const mockToggleDarkMode = vi.fn();
    const mockToggleDensity = vi.fn();
    const mockOpenAddStudent = vi.fn();
    const mockOpenApprovals = vi.fn();
    const mockOpenShortcuts = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders search input and navigation items when open', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                onOpenAddStudent={mockOpenAddStudent}
                onOpenApprovals={mockOpenApprovals}
                onOpenShortcuts={mockOpenShortcuts}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
                isViewer={false}
                pendingApprovalsCount={3}
            />
        );

        expect(screen.getByPlaceholderText(/search students, courses, navigation/i)).toBeInTheDocument();
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Students')).toBeInTheDocument();
        expect(screen.getByText('Courses')).toBeInTheDocument();
        expect(screen.getByText('Enrollments')).toBeInTheDocument();
        expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
        expect(screen.getByText('Switch to Dark Mode')).toBeInTheDocument();
        expect(screen.getByText('Switch to Compact View')).toBeInTheDocument();
    });

    it('filters items based on user search query', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                onOpenAddStudent={mockOpenAddStudent}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
            />
        );

        const input = screen.getByPlaceholderText(/search students, courses, navigation/i);
        fireEvent.change(input, { target: { value: 'Analytics' } });

        expect(screen.getByText('Analytics')).toBeInTheDocument();
        expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });

    it('triggers action and closes palette when action item is clicked', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
            />
        );

        const themeBtn = screen.getByText('Switch to Dark Mode');
        fireEvent.click(themeBtn);

        expect(mockToggleDarkMode).toHaveBeenCalledTimes(1);
        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('triggers navigation when navigation item is clicked', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
            />
        );

        const studentsNav = screen.getByText('Students');
        fireEvent.click(studentsNav);

        expect(mockNavigate).toHaveBeenCalledWith('students');
        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape key press', () => {
        render(
            <CommandPalette
                open={true}
                onClose={mockClose}
                onNavigate={mockNavigate}
                darkMode={false}
                toggleDarkMode={mockToggleDarkMode}
                density="comfortable"
                toggleDensity={mockToggleDensity}
            />
        );

        const input = screen.getByPlaceholderText(/search students, courses, navigation/i);
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(mockClose).toHaveBeenCalledTimes(1);
    });
});

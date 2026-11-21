import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MobileBottomNav from './MobileBottomNav';

describe('MobileBottomNav Component', () => {
    it('renders admin navigation items and handles tab clicks', () => {
        const handleNavigate = vi.fn();
        const handleToggleDark = vi.fn();
        const handleToggleDensity = vi.fn();
        const handleCommandPalette = vi.fn();
        const handleSignOut = vi.fn();

        render(
            <MobileBottomNav
                activeTab="dashboard"
                onNavigate={handleNavigate}
                isViewer={false}
                darkMode={true}
                toggleDarkMode={handleToggleDark}
                density="comfortable"
                toggleDensity={handleToggleDensity}
                onOpenCommandPalette={handleCommandPalette}
                onSignOut={handleSignOut}
                userEmail="admin@example.com"
            />
        );

        // Check main tab labels
        // Same names as the sidebar
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Enrollments')).toBeInTheDocument();
        expect(screen.getByText('Students')).toBeInTheDocument();
        expect(screen.getByText('Courses')).toBeInTheDocument();
        // No "More": the burger menu has every other section and tool
        expect(screen.queryByText('More')).not.toBeInTheDocument();

        // Click Enrollments tab
        fireEvent.click(screen.getByText('Enrollments'));
        expect(handleNavigate).toHaveBeenCalledWith('enrollments');

        // Click Students tab
        fireEvent.click(screen.getByText('Students'));
        expect(handleNavigate).toHaveBeenCalledWith('students');

        // Click Courses tab
        fireEvent.click(screen.getByText('Courses'));
        expect(handleNavigate).toHaveBeenCalledWith('courses');
    });

    it('renders viewer mode navigation with Home, Students, Courses, Search, and More', () => {
        const handleNavigate = vi.fn();
        const handleCommandPalette = vi.fn();
        const handleToggleDark = vi.fn();
        const handleToggleDensity = vi.fn();
        const handleSignOut = vi.fn();

        const { rerender } = render(
            <MobileBottomNav
                activeTab="students"
                onNavigate={handleNavigate}
                isViewer={true}
                darkMode={false}
                toggleDarkMode={handleToggleDark}
                density="comfortable"
                toggleDensity={handleToggleDensity}
                onOpenCommandPalette={handleCommandPalette}
                onSignOut={handleSignOut}
                userEmail="viewer@example.com"
            />
        );

        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('Students')).toBeInTheDocument();
        expect(screen.getByText('Courses')).toBeInTheDocument();
        expect(screen.getByText('Search')).toBeInTheDocument();
        expect(screen.queryByText('Lookup')).not.toBeInTheDocument();

        // Check active tab highlighting for 'students'
        const studentsBtn = screen.getByText('Students').closest('button');
        expect(studentsBtn).toHaveClass('text-brand-600');

        fireEvent.click(screen.getByText('Students'));
        expect(handleNavigate).toHaveBeenCalledWith('students');

        fireEvent.click(screen.getByText('Courses'));
        expect(handleNavigate).toHaveBeenCalledWith('courses');

        fireEvent.click(screen.getByText('Home'));
        expect(handleNavigate).toHaveBeenCalledWith('home');

        fireEvent.click(screen.getByText('Search'));
        expect(handleCommandPalette).toHaveBeenCalled();

        // Also verify backwards compatibility when activeTab="lookup"
        rerender(
            <MobileBottomNav
                activeTab="lookup"
                onNavigate={handleNavigate}
                isViewer={true}
                darkMode={false}
                toggleDarkMode={handleToggleDark}
                density="comfortable"
                toggleDensity={handleToggleDensity}
                onOpenCommandPalette={handleCommandPalette}
                onSignOut={handleSignOut}
                userEmail="viewer@example.com"
            />
        );
        const studentsBtnLookup = screen.getByText('Students').closest('button');
        expect(studentsBtnLookup).toHaveClass('text-brand-600');
    });
});

describe('MobileBottomNav extras', () => {
    const base = {
        onNavigate: vi.fn(),
        darkMode: false,
        toggleDarkMode: vi.fn(),
        density: 'comfortable' as const,
        toggleDensity: vi.fn(),
        onOpenCommandPalette: vi.fn(),
        onSignOut: vi.fn(),
    };

    it('shows the pending approvals count on the admin Dashboard tab', () => {
        render(<MobileBottomNav {...base} activeTab="students" isViewer={false} pendingApprovalsCount={3} />);
        expect(screen.getByRole('button', { name: /dashboard, 3 approvals waiting/i })).toBeInTheDocument();
    });

    it('marks More active inside it, and labels the density toggle in plain case', () => {
        render(<MobileBottomNav {...base} activeTab="pdf-forms" isViewer={true} />);
        const more = screen.getByRole('button', { name: 'More' });
        expect(more).toHaveAttribute('aria-current', 'page');
        expect(more).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(more);
        expect(screen.getByText('Comfortable view')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();
    });
});

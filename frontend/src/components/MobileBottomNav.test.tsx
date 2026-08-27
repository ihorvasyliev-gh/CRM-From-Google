import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MobileBottomNav from './MobileBottomNav';

describe('MobileBottomNav Component', () => {
    it('renders admin navigation items and handles tab clicks', () => {
        const handleNavigate = vi.fn();
        const handleToggleDark = vi.fn();
        const handleToggleDensity = vi.fn();
        const handleCommandPalette = vi.fn();
        const handleShortcuts = vi.fn();
        const handleSignOut = vi.fn();

        render(
            <MobileBottomNav
                activeTab="dashboard"
                onNavigate={handleNavigate}
                isViewer={false}
                pendingApprovalsCount={3}
                darkMode={true}
                toggleDarkMode={handleToggleDark}
                density="comfortable"
                toggleDensity={handleToggleDensity}
                onOpenCommandPalette={handleCommandPalette}
                onOpenShortcuts={handleShortcuts}
                onSignOut={handleSignOut}
                userEmail="admin@example.com"
            />
        );

        // Check main tab labels
        expect(screen.getByText('Overview')).toBeInTheDocument();
        expect(screen.getByText('Board')).toBeInTheDocument();
        expect(screen.getByText('Students')).toBeInTheDocument();
        expect(screen.getByText('Courses')).toBeInTheDocument();
        expect(screen.getByText('More')).toBeInTheDocument();

        // Click Board tab
        fireEvent.click(screen.getByText('Board'));
        expect(handleNavigate).toHaveBeenCalledWith('enrollments');

        // Click Students tab
        fireEvent.click(screen.getByText('Students'));
        expect(handleNavigate).toHaveBeenCalledWith('students');

        // Click Courses tab
        fireEvent.click(screen.getByText('Courses'));
        expect(handleNavigate).toHaveBeenCalledWith('courses');

        // Click More tab to open drawer
        fireEvent.click(screen.getByText('More'));
        expect(screen.getByText('All Sections & Tools')).toBeInTheDocument();
        expect(screen.getByText('Analytics')).toBeInTheDocument();
        expect(screen.getByText('Outcomes')).toBeInTheDocument();
        expect(screen.getByText('Documents')).toBeInTheDocument();
        expect(screen.getByText('Settings')).toBeInTheDocument();
        expect(screen.getByText(/3 Course Completions Pending/i)).toBeInTheDocument();

        // Click Analytics from drawer
        fireEvent.click(screen.getByText('Analytics'));
        expect(handleNavigate).toHaveBeenCalledWith('analytics');
    });

    it('renders viewer mode navigation with Lookup, Courses, Search, and More', () => {
        const handleNavigate = vi.fn();
        const handleCommandPalette = vi.fn();
        const handleToggleDark = vi.fn();
        const handleToggleDensity = vi.fn();
        const handleShortcuts = vi.fn();
        const handleSignOut = vi.fn();

        render(
            <MobileBottomNav
                activeTab="lookup"
                onNavigate={handleNavigate}
                isViewer={true}
                darkMode={false}
                toggleDarkMode={handleToggleDark}
                density="comfortable"
                toggleDensity={handleToggleDensity}
                onOpenCommandPalette={handleCommandPalette}
                onOpenShortcuts={handleShortcuts}
                onSignOut={handleSignOut}
                userEmail="viewer@example.com"
            />
        );

        expect(screen.getByText('Lookup')).toBeInTheDocument();
        expect(screen.getByText('Courses')).toBeInTheDocument();
        expect(screen.getByText('Search')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Courses'));
        expect(handleNavigate).toHaveBeenCalledWith('courses');

        fireEvent.click(screen.getByText('Search'));
        expect(handleCommandPalette).toHaveBeenCalled();
    });
});

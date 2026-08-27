import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MobileFloatingActions from './MobileFloatingActions';

describe('MobileFloatingActions Component', () => {
    it('opens speed dial and triggers quick actions', () => {
        const handleAddStudent = vi.fn();
        const handleSearch = vi.fn();
        const handleEnrollment = vi.fn();

        render(
            <MobileFloatingActions
                onOpenAddStudent={handleAddStudent}
                onOpenCommandPalette={handleSearch}
                onOpenEnrollment={handleEnrollment}
                isViewer={false}
            />
        );

        const fab = screen.getByLabelText('Quick Actions');
        expect(fab).toBeInTheDocument();

        // Open speed dial
        fireEvent.click(fab);
        expect(screen.getByText('Add Student')).toBeInTheDocument();
        expect(screen.getByText('New Enrollment')).toBeInTheDocument();
        expect(screen.getByText('Quick Search')).toBeInTheDocument();

        // Click Add Student
        fireEvent.click(screen.getByText('Add Student'));
        expect(handleAddStudent).toHaveBeenCalledTimes(1);
    });

    it('triggers search directly in viewer mode', () => {
        const handleAddStudent = vi.fn();
        const handleSearch = vi.fn();

        render(
            <MobileFloatingActions
                onOpenAddStudent={handleAddStudent}
                onOpenCommandPalette={handleSearch}
                isViewer={true}
            />
        );

        const fab = screen.getByLabelText('Quick Search');
        fireEvent.click(fab);
        expect(handleSearch).toHaveBeenCalledTimes(1);
    });
});

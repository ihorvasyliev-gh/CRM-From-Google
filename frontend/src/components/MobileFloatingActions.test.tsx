import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MobileFloatingActions from './MobileFloatingActions';

describe('MobileFloatingActions Component', () => {
    it('opens speed dial and triggers quick actions', () => {
        const handleAddStudent = vi.fn();
        const handleEnrollment = vi.fn();

        render(
            <MobileFloatingActions
                onOpenAddStudent={handleAddStudent}
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
        // Search is in the top bar, not repeated here
        expect(screen.queryByText('Quick Search')).not.toBeInTheDocument();

        // Click Add Student
        fireEvent.click(screen.getByText('Add Student'));
        expect(handleAddStudent).toHaveBeenCalledTimes(1);
    });

    it('renders nothing in viewer mode', () => {
        const { container } = render(
            <MobileFloatingActions
                onOpenAddStudent={vi.fn()}
                isViewer={true}
            />
        );

        expect(container).toBeEmptyDOMElement();
    });
});

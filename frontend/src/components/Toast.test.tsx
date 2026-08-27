import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Toast from './Toast';

describe('Toast Component', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('renders toast message and handles dismissal', () => {
        const mockDismiss = vi.fn();
        render(<Toast toast={{ message: 'Enrollment saved', type: 'success' }} onDismiss={mockDismiss} />);

        expect(screen.getByText('Enrollment saved')).toBeInTheDocument();
    });

    it('renders action button and triggers onClick when clicked', () => {
        const mockDismiss = vi.fn();
        const mockUndo = vi.fn();

        render(
            <Toast
                toast={{
                    message: 'Student moved to Rejected',
                    type: 'info',
                    action: {
                        label: 'Undo',
                        onClick: mockUndo,
                    },
                }}
                onDismiss={mockDismiss}
            />
        );

        const undoBtn = screen.getByRole('button', { name: /undo/i });
        expect(undoBtn).toBeInTheDocument();

        fireEvent.click(undoBtn);
        expect(mockUndo).toHaveBeenCalledTimes(1);
    });
});

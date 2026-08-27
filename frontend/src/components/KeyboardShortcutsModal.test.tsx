import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';

describe('KeyboardShortcutsModal Component', () => {
    it('renders keyboard shortcuts list when open', () => {
        const mockClose = vi.fn();
        render(<KeyboardShortcutsModal open={true} onClose={mockClose} />);

        expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
        expect(screen.getByText(/Open Command Palette & Omnisearch/i)).toBeInTheDocument();
        expect(screen.getByText(/Focus search bar in current view/i)).toBeInTheDocument();
        expect(screen.getByText(/Toggle Theme/i)).toBeInTheDocument();
        expect(screen.getByText(/Toggle Density/i)).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
        const mockClose = vi.fn();
        render(<KeyboardShortcutsModal open={true} onClose={mockClose} />);

        const gotItBtn = screen.getByRole('button', { name: /got it/i });
        fireEvent.click(gotItBtn);

        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('does not render when open is false', () => {
        const mockClose = vi.fn();
        const { container } = render(<KeyboardShortcutsModal open={false} onClose={mockClose} />);

        expect(container.firstChild).toBeNull();
    });
});

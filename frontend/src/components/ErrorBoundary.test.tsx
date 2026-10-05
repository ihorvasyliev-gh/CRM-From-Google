import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

let shouldThrow = true;
function Page() {
    if (shouldThrow) throw new Error('page crashed');
    return <p>page content</p>;
}

describe('ErrorBoundary', () => {
    it('inline: shows the error inside the page area and "Try again" renders the page again', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        shouldThrow = true;
        render(<nav>sidebar</nav>);
        render(<ErrorBoundary inline><Page /></ErrorBoundary>);

        expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
        expect(screen.getByRole('alert')).toHaveTextContent('page crashed');
        expect(screen.getByText('sidebar')).toBeInTheDocument();

        shouldThrow = false;
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(screen.getByText('page content')).toBeInTheDocument();
        vi.mocked(console.error).mockRestore();
    });

    it('full screen: offers a reload only', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        shouldThrow = true;
        render(<ErrorBoundary><Page /></ErrorBoundary>);

        expect(screen.getByRole('button', { name: /Reload Page/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
        vi.mocked(console.error).mockRestore();
    });
});

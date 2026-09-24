import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OutreachShell from './OutreachShell';
import { TooltipProvider } from './ui/Tooltip';

vi.mock('./OutreachLists', () => ({ default: () => <div>External lists page</div> }));
vi.mock('./ui/NetworkStatusIndicator', () => ({ default: () => null }));

function renderShell(onSignOut = vi.fn()) {
    render(
        <TooltipProvider>
            <OutreachShell darkMode={false} toggleDarkMode={vi.fn()} userEmail="lists@example.com" onSignOut={onSignOut} />
        </TooltipProvider>
    );
    return { onSignOut };
}

describe('OutreachShell', () => {
    beforeEach(() => localStorage.clear());

    it('shows only the External Lists page, with sign out', async () => {
        const { onSignOut } = renderShell();
        expect(await screen.findByText('External lists page')).toBeInTheDocument();
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(onSignOut).toHaveBeenCalled();
    });

    it('lets the user hide and bring back the how-it-works tips', async () => {
        renderShell();
        await screen.findByText('External lists page');
        expect(screen.getByRole('region', { name: 'How it works' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Hide these tips' }));
        expect(screen.queryByRole('region', { name: 'How it works' })).not.toBeInTheDocument();
        expect(localStorage.getItem('outreach_guide_hidden')).toBe('1');

        fireEvent.click(screen.getByRole('button', { name: 'How it works' }));
        expect(screen.getByRole('region', { name: 'How it works' })).toBeInTheDocument();
    });
});

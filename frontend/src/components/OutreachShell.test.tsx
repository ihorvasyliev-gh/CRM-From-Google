import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OutreachShell from './OutreachShell';
import { TooltipProvider } from './ui/Tooltip';

vi.mock('./OutreachLists', () => ({ default: () => <div>External lists page</div> }));
vi.mock('./PdfForms', () => ({ default: ({ canManage }: { canManage: boolean }) => <div>PDF forms page{canManage ? ' (manage)' : ''}</div> }));
vi.mock('./ui/NetworkStatusIndicator', () => ({ default: () => null }));

function renderShell(onSignOut = vi.fn(), role: 'outreach' | 'forms' = 'outreach') {
    render(
        <TooltipProvider>
            <OutreachShell role={role} darkMode={false} toggleDarkMode={vi.fn()} userEmail="lists@example.com" onSignOut={onSignOut} />
        </TooltipProvider>
    );
    return { onSignOut };
}

describe('OutreachShell', () => {
    beforeEach(() => localStorage.clear());

    it('shows the External Lists page first, with sign out', async () => {
        const { onSignOut } = renderShell();
        expect(await screen.findByText('External lists page')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(onSignOut).toHaveBeenCalled();
    });

    it('lets outreach users switch to PDF Forms (filling only) and remembers the tab', async () => {
        renderShell();
        await screen.findByText('External lists page');
        fireEvent.click(screen.getByRole('button', { name: 'PDF Forms' }));
        expect(await screen.findByText('PDF forms page')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'How it works' })).not.toBeInTheDocument();
        expect(localStorage.getItem('outreach_tab')).toBe('forms');
    });

    it('gives PDF Forms users only PDF Forms, with template management', async () => {
        renderShell(vi.fn(), 'forms');
        expect(await screen.findByText('PDF forms page (manage)')).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument();
        expect(screen.queryByText('External lists page')).not.toBeInTheDocument();
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

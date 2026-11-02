import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PublicLinksCard, { GOOGLE_FORM_URL } from './PublicLinksCard';

describe('PublicLinksCard', () => {
    beforeEach(() => {
        Object.assign(navigator, {
            clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
    });

    it('lists the registration form and every public page, each opening in a new tab', () => {
        render(<PublicLinksCard />);
        const origin = window.location.origin;
        const expected: [string, string][] = [
            ['Registration form', GOOGLE_FORM_URL],
            ['Cheque requisition', `${origin}/cheque`],
            ['Certificates', `${origin}/certificates`],
            ['Employment update', `${origin}/status`],
        ];
        for (const [name, url] of expected) {
            const link = screen.getByRole('link', { name: `Open ${name}` });
            expect(link).toHaveAttribute('href', url);
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        }
        expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(4);
    });

    it('copies the chosen link and shows it was copied', async () => {
        render(<PublicLinksCard />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy Certificates link' }));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/certificates`);
        expect(await screen.findByRole('button', { name: 'Certificates link copied' })).toBeInTheDocument();
        // The other rows are unchanged
        expect(screen.getByRole('button', { name: 'Copy Registration form link' })).toBeInTheDocument();
    });
});

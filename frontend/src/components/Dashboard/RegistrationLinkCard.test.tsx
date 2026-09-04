import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RegistrationLinkCard, { GOOGLE_FORM_URL } from './RegistrationLinkCard';

describe('RegistrationLinkCard', () => {
    beforeEach(() => {
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });
    });

    it('renders the registration form link and handles copy action', async () => {
        render(<RegistrationLinkCard />);
        expect(screen.getByText(/Registration Form/i)).toBeInTheDocument();
        expect(screen.getByText(/forms\.gle\/9U4DsSe5UYnsakJZ8/i)).toBeInTheDocument();

        const copyBtn = screen.getByRole('button', { name: /Copy Link/i });
        fireEvent.click(copyBtn);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(GOOGLE_FORM_URL);
        expect(await screen.findByText(/Copied!/i)).toBeInTheDocument();
    });

    it('renders the external link to open the form in a new tab', () => {
        render(<RegistrationLinkCard />);
        const openLink = screen.getByRole('link', { name: /Open/i });
        expect(openLink).toBeInTheDocument();
        expect(openLink).toHaveAttribute('href', GOOGLE_FORM_URL);
        expect(openLink).toHaveAttribute('target', '_blank');
        expect(openLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders compact mode properly and handles copy action', async () => {
        render(<RegistrationLinkCard compact />);
        expect(screen.getByText(/Registration Form/i)).toBeInTheDocument();

        const copyBtn = screen.getByRole('button', { name: /Copy Link/i });
        expect(copyBtn).toBeInTheDocument();

        fireEvent.click(copyBtn);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(GOOGLE_FORM_URL);
        expect(await screen.findByText(/Copied!/i)).toBeInTheDocument();

        const openLink = screen.getByRole('link', { name: /Open registration form/i });
        expect(openLink).toBeInTheDocument();
        expect(openLink).toHaveAttribute('href', GOOGLE_FORM_URL);
        expect(openLink).toHaveAttribute('target', '_blank');
        expect(openLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
});

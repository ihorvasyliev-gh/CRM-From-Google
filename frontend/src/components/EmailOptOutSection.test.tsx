import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmailOptOutSection from './EmailOptOutSection';
import {
    listEmailOptOuts,
    optInEmail,
    optOutEmail,
    updateEmailOptOutNote,
    type EmailOptOut,
} from '../lib/emailOptOut';

vi.mock('../lib/emailOptOut', async importOriginal => {
    const actual = await importOriginal<typeof import('../lib/emailOptOut')>();
    return {
        ...actual,
        listEmailOptOuts: vi.fn(),
        optOutEmail: vi.fn(),
        optInEmail: vi.fn(),
        updateEmailOptOutNote: vi.fn(),
    };
});

function renderSection() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>
            <EmailOptOutSection />
        </QueryClientProvider>,
    );
}

const sampleEntries: EmailOptOut[] = [
    { email: 'alice@example.com', note: 'Replied to invitation', opted_out_at: '2026-02-10T10:00:00Z' },
    { email: 'bob@example.com', note: null, opted_out_at: '2026-02-11T10:00:00Z' },
];

describe('EmailOptOutSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(listEmailOptOuts).mockResolvedValue(sampleEntries);
        vi.mocked(optOutEmail).mockImplementation(async (email: string) => ({
            email: email.trim().toLowerCase(),
            students: 1,
            contacts: 0,
        }));
        vi.mocked(optInEmail).mockResolvedValue(undefined);
        vi.mocked(updateEmailOptOutNote).mockResolvedValue(undefined);
    });

    it('renders unsubscribed list with count badge and hides search when <= 3 entries', async () => {
        renderSection();

        const rows = await screen.findAllByTestId('opt-out-row');
        expect(rows).toHaveLength(2);
        expect(screen.getByText('2 unsubscribed')).toBeInTheDocument();
        expect(within(rows[0]).getByText('alice@example.com')).toBeInTheDocument();
        expect(within(rows[0]).getByText(/Replied to invitation/)).toBeInTheDocument();
        expect(within(rows[1]).getByText('bob@example.com')).toBeInTheDocument();
        expect(screen.queryByLabelText('Search unsubscribed emails')).not.toBeInTheDocument();
    });

    it('adds a new email via optOutEmail and clears the form', async () => {
        renderSection();
        await screen.findAllByTestId('opt-out-row');

        const emailInput = screen.getByLabelText('Email address');
        const noteInput = screen.getByLabelText(/^Note/);
        const submitBtn = screen.getByRole('button', { name: 'Unsubscribe' });

        expect(submitBtn).toBeDisabled();

        fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
        expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
        expect(submitBtn).toBeDisabled();

        fireEvent.change(emailInput, { target: { value: 'carol@example.com' } });
        fireEvent.change(noteInput, { target: { value: 'Asked by phone' } });
        expect(submitBtn).toBeEnabled();

        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(optOutEmail).toHaveBeenCalledWith('carol@example.com', 'Asked by phone');
        });
        await waitFor(() => {
            expect(emailInput).toHaveValue('');
            expect(noteInput).toHaveValue('');
        });
    });

    it('shows search input when more than 3 entries exist and filters by email or note', async () => {
        vi.mocked(listEmailOptOuts).mockResolvedValue([
            { email: 'alice@example.com', note: 'Replied to invitation', opted_out_at: '2026-02-10T10:00:00Z' },
            { email: 'bob@example.com', note: 'Called office', opted_out_at: '2026-02-11T10:00:00Z' },
            { email: 'carol@example.com', note: null, opted_out_at: '2026-02-12T10:00:00Z' },
            { email: 'dave@example.com', note: 'Survey bounce', opted_out_at: '2026-02-13T10:00:00Z' },
        ]);

        renderSection();
        expect(await screen.findByText('4 unsubscribed')).toBeInTheDocument();

        const searchInput = screen.getByLabelText('Search unsubscribed emails');
        expect(searchInput).toBeInTheDocument();

        fireEvent.change(searchInput, { target: { value: 'survey' } });
        const rows = screen.getAllByTestId('opt-out-row');
        expect(rows).toHaveLength(1);
        expect(within(rows[0]).getByText('dave@example.com')).toBeInTheDocument();

        fireEvent.change(searchInput, { target: { value: 'nobody-matches' } });
        expect(screen.getByText('No matching emails')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Clear search'));
        expect(screen.getAllByTestId('opt-out-row')).toHaveLength(4);
    });

    it('opens ConfirmDialog from accessible Resubscribe <email> button and calls optInEmail on confirm', async () => {
        renderSection();
        await screen.findAllByTestId('opt-out-row');

        const resubscribeBtn = screen.getByRole('button', { name: 'Resubscribe alice@example.com' });
        fireEvent.click(resubscribeBtn);

        const dialog = screen.getByRole('alertdialog');
        expect(within(dialog).getByText('Turn emails back on?')).toBeInTheDocument();
        expect(within(dialog).getByText(/alice@example\.com will receive course invitations and surveys again/)).toBeInTheDocument();
        expect(optInEmail).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Resubscribe' }));

        await waitFor(() => {
            expect(optInEmail).toHaveBeenCalledWith('alice@example.com');
        });
    });

    it('allows updating the note for an already-unsubscribed email both via the top form and inline editor', async () => {
        renderSection();
        await screen.findAllByTestId('opt-out-row');

        // 1. Update note via top form for an already-listed email
        const emailInput = screen.getByLabelText('Email address');
        const noteInput = screen.getByLabelText(/^Note/);

        fireEvent.change(emailInput, { target: { value: 'ALICE@example.com' } });
        expect(screen.getByText(/This email is already unsubscribed/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeDisabled();

        fireEvent.change(noteInput, { target: { value: 'Confirmed via phone call' } });
        const updateBtn = screen.getByRole('button', { name: 'Update note' });
        expect(updateBtn).toBeEnabled();

        fireEvent.click(updateBtn);
        await waitFor(() => {
            expect(updateEmailOptOutNote).toHaveBeenCalledWith('ALICE@example.com', 'Confirmed via phone call');
        });

        // 2. Update note via inline row edit button
        fireEvent.click(screen.getByRole('button', { name: 'Edit note for bob@example.com' }));
        const inlineInput = screen.getByLabelText('Note for bob@example.com');
        fireEvent.change(inlineInput, { target: { value: 'Inline note update' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(updateEmailOptOutNote).toHaveBeenCalledWith('bob@example.com', 'Inline note update');
        });
    });
});

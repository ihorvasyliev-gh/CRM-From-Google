import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserRolesSection from './UserRolesSection';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u-admin' } }),
}));

const users = [
    { id: 'u-admin', email: 'admin@example.com', role: 'admin', created_at: '2025-01-01T00:00:00Z', last_sign_in_at: '2026-01-01T00:00:00Z' },
    { id: 'u-view', email: 'viewer@example.com', role: 'viewer', created_at: '2026-01-02T00:00:00Z', last_sign_in_at: null },
];

function renderSection() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <UserRolesSection />
        </QueryClientProvider>
    );
}

describe('UserRolesSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (supabase.rpc as any).mockImplementation((name: string) => {
            if (name === 'list_app_users') return Promise.resolve({ data: users, error: null });
            return Promise.resolve({ data: null, error: null });
        });
    });

    it('lists users with their role and only offers promotion for viewers', async () => {
        renderSection();
        const rows = await screen.findAllByTestId('app-user-row');
        expect(rows).toHaveLength(2);

        expect(within(rows[0]).getByText('Admin')).toBeInTheDocument();
        expect(within(rows[0]).getByText('(you)')).toBeInTheDocument();
        expect(within(rows[0]).queryByRole('button', { name: /Make admin/ })).not.toBeInTheDocument();

        expect(within(rows[1]).getByText('Viewer')).toBeInTheDocument();
        expect(within(rows[1]).getByRole('button', { name: /Make admin/ })).toBeInTheDocument();
        // No demotion control anywhere
        expect(screen.queryByRole('button', { name: /viewer/i })).not.toBeInTheDocument();
    });

    it('promotes a viewer after confirmation', async () => {
        renderSection();
        const rows = await screen.findAllByTestId('app-user-row');

        fireEvent.click(within(rows[1]).getByRole('button', { name: /Make admin/ }));
        expect(screen.getByText('Make this user an admin?')).toBeInTheDocument();
        expect(supabase.rpc).not.toHaveBeenCalledWith('promote_user_to_admin', expect.anything());

        const confirm = screen.getAllByRole('button', { name: 'Make admin' }).slice(-1)[0];
        fireEvent.click(confirm);

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith('promote_user_to_admin', { p_user_id: 'u-view' });
        });
    });

    it('filters by role', async () => {
        renderSection();
        await screen.findAllByTestId('app-user-row');

        fireEvent.click(screen.getByRole('tab', { name: /Viewers/ }));
        expect(screen.getAllByTestId('app-user-row')).toHaveLength(1);
        expect(screen.getByText('viewer@example.com')).toBeInTheDocument();
    });

    it('explains when the migration is missing', async () => {
        (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'function list_app_users() does not exist' } });
        renderSection();
        expect(await screen.findByText(/migration 58/)).toBeInTheDocument();
    });
});

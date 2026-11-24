import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

type AuthCallback = (event: string, session: unknown) => void;
let authCallback: AuthCallback | null = null;

vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn(),
            onAuthStateChange: vi.fn((cb: AuthCallback) => {
                authCallback = cb;
                return { data: { subscription: { unsubscribe: vi.fn() } } };
            }),
            signInWithPassword: vi.fn(),
            signOut: vi.fn().mockResolvedValue({ error: null }),
        },
        from: vi.fn(() => ({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: { settings: {} }, error: null }),
                }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
        })),
    },
}));

vi.mock('../lib/appConfig', () => ({
    clearStoredConfig: vi.fn(),
    getConfig: vi.fn(() => ({})),
    storeServerConfig: vi.fn(),
}));

describe('AuthContext security & cache isolation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authCallback = null;
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    });

    it('clears the React Query cache on signOut so a subsequent role never sees stale admin data', async () => {
        const adminSession = {
            access_token: 'tok-admin',
            user: { id: 'admin-1', email: 'admin@ccp.ie', app_metadata: { role: 'admin' } },
        };
        vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: adminSession }, error: null } as never);

        const queryClient = new QueryClient();
        queryClient.setQueryData(['students'], [{ id: 's-1', first_name: 'Secret' }]);
        const clearSpy = vi.spyOn(queryClient, 'clear');

        let capturedSignOut: (() => Promise<void>) | undefined;
        function Consumer() {
            const { signOut } = useAuth();
            capturedSignOut = signOut;
            return null;
        }

        render(
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <Consumer />
                </AuthProvider>
            </QueryClientProvider>
        );

        await waitFor(() => expect(capturedSignOut).toBeDefined());
        expect(queryClient.getQueryData(['students'])).toBeDefined();

        await act(async () => {
            await capturedSignOut!();
        });

        expect(clearSpy).toHaveBeenCalled();
        expect(queryClient.getQueryData(['students'])).toBeUndefined();
    });

    it('clears cached queries when switching directly to a different account', async () => {
        const adminSession = {
            access_token: 'tok-admin',
            user: { id: 'admin-1', email: 'admin@ccp.ie', app_metadata: { role: 'admin' } },
        };
        vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: adminSession }, error: null } as never);

        const queryClient = new QueryClient();
        queryClient.setQueryData(['cheque_requisitions'], [{ id: 'cr-1' }]);

        render(
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <div />
                </AuthProvider>
            </QueryClientProvider>
        );

        await waitFor(() => expect(authCallback).not.toBeNull());
        expect(queryClient.getQueryData(['cheque_requisitions'])).toBeDefined();

        act(() => {
            authCallback!('SIGNED_IN', {
                access_token: 'tok-viewer',
                user: { id: 'viewer-2', email: 'viewer@ccp.ie', app_metadata: { role: 'viewer' } },
            });
        });

        expect(queryClient.getQueryData(['cheque_requisitions'])).toBeUndefined();
    });

    it('skips user_settings sync for non-admin roles', async () => {
        const formsSession = {
            access_token: 'tok-forms',
            user: { id: 'forms-1', email: 'forms@ccp.ie', app_metadata: { role: 'forms' } },
        };
        vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: formsSession }, error: null } as never);

        const queryClient = new QueryClient();
        render(
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <div />
                </AuthProvider>
            </QueryClientProvider>
        );

        await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled());
        expect(supabase.from).not.toHaveBeenCalledWith('user_settings');
    });
});

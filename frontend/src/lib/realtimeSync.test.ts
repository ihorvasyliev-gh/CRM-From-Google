import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupSleepAndWakeListener, ensureFreshSession, reconnectSupabaseRealtime } from './realtimeSync';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn(),
            refreshSession: vi.fn(),
        },
        realtime: {
            isConnected: vi.fn(),
            connect: vi.fn(),
            setAuth: vi.fn(),
        },
    },
}));

describe('realtimeSync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('setupSleepAndWakeListener', () => {
        it('triggers onWake when document becomes visible', () => {
            const onWake = vi.fn();
            const cleanup = setupSleepAndWakeListener(onWake);

            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));

            expect(onWake).toHaveBeenCalledWith('visibility');
            cleanup();
        });

        it('does not trigger onWake when document becomes hidden', () => {
            const onWake = vi.fn();
            const cleanup = setupSleepAndWakeListener(onWake);

            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));

            expect(onWake).not.toHaveBeenCalled();
            cleanup();
        });

        it('triggers onWake on window focus', () => {
            const onWake = vi.fn();
            const cleanup = setupSleepAndWakeListener(onWake);

            window.dispatchEvent(new Event('focus'));

            expect(onWake).toHaveBeenCalledWith('focus');
            cleanup();
        });

        it('triggers onWake on window online', () => {
            const onWake = vi.fn();
            const cleanup = setupSleepAndWakeListener(onWake);

            window.dispatchEvent(new Event('online'));

            expect(onWake).toHaveBeenCalledWith('online');
            cleanup();
        });

        it('triggers onWake when a sleep gap is detected', () => {
            const onWake = vi.fn();
            const cleanup = setupSleepAndWakeListener(onWake, { sleepThresholdMs: 5000, checkIntervalMs: 1000 });

            // Simulate system sleep: clock jumps forward by 15s while timers were suspended
            vi.setSystemTime(Date.now() + 15000);
            vi.advanceTimersByTime(1000);

            expect(onWake).toHaveBeenCalledWith('sleep_gap');
            cleanup();
        });

        it('stops listening after cleanup is called', () => {
            const onWake = vi.fn();
            const cleanup = setupSleepAndWakeListener(onWake);

            cleanup();

            window.dispatchEvent(new Event('focus'));
            window.dispatchEvent(new Event('online'));

            expect(onWake).not.toHaveBeenCalled();
        });
    });

    describe('ensureFreshSession', () => {
        it('returns null if no active session', async () => {
            (supabase.auth.getSession as any).mockResolvedValueOnce({
                data: { session: null },
                error: null,
            });

            const token = await ensureFreshSession();
            expect(token).toBeNull();
        });

        it('returns current token if session is valid and not expiring', async () => {
            const validSession = {
                access_token: 'valid-token-123',
                expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour in future
            };
            (supabase.auth.getSession as any).mockResolvedValueOnce({
                data: { session: validSession },
                error: null,
            });

            const token = await ensureFreshSession();
            expect(token).toBe('valid-token-123');
            expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
            expect(supabase.realtime.setAuth).toHaveBeenCalledWith('valid-token-123');
        });

        it('refreshes session if token expires in less than 60 seconds', async () => {
            const expiringSession = {
                access_token: 'old-token',
                expires_at: Math.floor(Date.now() / 1000) + 20, // 20s remaining
            };
            const refreshedSession = {
                access_token: 'new-fresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            };

            (supabase.auth.getSession as any).mockResolvedValueOnce({
                data: { session: expiringSession },
                error: null,
            });
            (supabase.auth.refreshSession as any).mockResolvedValueOnce({
                data: { session: refreshedSession },
                error: null,
            });

            const token = await ensureFreshSession();
            expect(supabase.auth.refreshSession).toHaveBeenCalled();
            expect(token).toBe('new-fresh-token');
            expect(supabase.realtime.setAuth).toHaveBeenCalledWith('new-fresh-token');
        });
    });

    describe('reconnectSupabaseRealtime', () => {
        it('connects realtime if disconnected and dispatches event', async () => {
            (supabase.auth.getSession as any).mockResolvedValueOnce({
                data: { session: { access_token: 'token-abc', expires_at: Math.floor(Date.now() / 1000) + 3600 } },
                error: null,
            });
            (supabase.realtime.isConnected as any).mockReturnValueOnce(false);

            const eventSpy = vi.fn();
            window.addEventListener('crm:realtime-reconnect', eventSpy);

            await reconnectSupabaseRealtime();

            expect(supabase.realtime.connect).toHaveBeenCalled();
            expect(eventSpy).toHaveBeenCalled();

            window.removeEventListener('crm:realtime-reconnect', eventSpy);
        });
    });
});

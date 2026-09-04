import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkSyncStatus } from './useNetworkSyncStatus';
import { supabase } from '../lib/supabase';
import * as AuthContextModule from '../contexts/AuthContext';

vi.mock('../lib/supabase', () => ({
    supabase: {
        channel: vi.fn(),
        removeChannel: vi.fn(),
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token', expires_at: Math.floor(Date.now() / 1000) + 3600 } } }),
            refreshSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token', expires_at: Math.floor(Date.now() / 1000) + 3600 } } }),
        },
        realtime: {
            isConnected: vi.fn().mockReturnValue(true),
            connect: vi.fn(),
            setAuth: vi.fn(),
        },
    },
}));

describe('useNetworkSyncStatus', () => {
    let mockSubscribeCallback: (status: string) => void;
    let mockChannel: any;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        mockChannel = {
            subscribe: vi.fn((cb) => {
                mockSubscribeCallback = cb;
                // Default immediate subscription success
                cb('SUBSCRIBED');
                return mockChannel;
            }),
        };
        (supabase.channel as any).mockReturnValue(mockChannel);
        (supabase.removeChannel as any).mockResolvedValue('ok');

        vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
            user: { id: 'user-123' } as any,
            session: {} as any,
            loading: false,
            signIn: vi.fn(),
            signOut: vi.fn(),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns online when subscribed and navigator.onLine is true', () => {
        const { result } = renderHook(() => useNetworkSyncStatus());

        expect(result.current.status).toBe('online');
        expect(result.current.isOnline).toBe(true);
        expect(result.current.realtimeConnected).toBe(true);
        expect(result.current.statusText).toContain('Online');
    });

    it('transitions to reconnecting when channel receives CHANNEL_ERROR', () => {
        const { result } = renderHook(() => useNetworkSyncStatus());

        expect(result.current.status).toBe('online');

        act(() => {
            mockSubscribeCallback('CHANNEL_ERROR');
        });

        expect(result.current.status).toBe('reconnecting');
        expect(result.current.realtimeConnected).toBe(false);
        expect(result.current.statusText).toContain('Reconnecting');
    });

    it('transitions to offline when offline event fires', () => {
        const { result } = renderHook(() => useNetworkSyncStatus());

        act(() => {
            window.dispatchEvent(new Event('offline'));
        });

        expect(result.current.status).toBe('offline');
        expect(result.current.isOnline).toBe(false);
        expect(result.current.statusText).toContain('offline');
    });

    it('recovers to online when manual reconnect is called and subscription succeeds', async () => {
        const { result } = renderHook(() => useNetworkSyncStatus());

        act(() => {
            mockSubscribeCallback('CHANNEL_ERROR');
        });
        expect(result.current.status).toBe('reconnecting');

        await act(async () => {
            await result.current.reconnect();
        });

        expect(result.current.status).toBe('online');
        expect(result.current.realtimeConnected).toBe(true);
    });

    it('automatically attempts reconnection when wake event occurs', async () => {
        const { result } = renderHook(() => useNetworkSyncStatus());

        act(() => {
            mockSubscribeCallback('CHANNEL_ERROR');
        });
        expect(result.current.status).toBe('reconnecting');

        // Simulate wake event (tab becomes visible)
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
        });

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(supabase.removeChannel).toHaveBeenCalled();
        expect(supabase.channel).toHaveBeenCalledWith('system_health');
        expect(result.current.status).toBe('online');
    });
});

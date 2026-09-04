import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { setupSleepAndWakeListener, reconnectSupabaseRealtime } from '../lib/realtimeSync';

export type NetworkSyncState = 'online' | 'reconnecting' | 'offline';

export interface NetworkSyncStatus {
    status: NetworkSyncState;
    isOnline: boolean;
    realtimeConnected: boolean;
    statusText: string;
    reconnect: () => Promise<void>;
    isReconnecting: boolean;
}

export function useNetworkSyncStatus(): NetworkSyncStatus {
    const { user } = useAuth();
    const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [realtimeConnected, setRealtimeConnected] = useState<boolean>(true);
    const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

    // Track active channel and retry timer references
    const activeChannelRef = useRef<any>(null);
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryAttemptRef = useRef<number>(0);
    const isMountedRef = useRef<boolean>(true);
    const reconnectRef = useRef<() => Promise<void>>(() => Promise.resolve());

    // Clean up channel safely
    const cleanupChannel = useCallback(() => {
        if (activeChannelRef.current) {
            const chan = activeChannelRef.current;
            activeChannelRef.current = null;
            try {
                supabase.removeChannel(chan);
            } catch (err) {
                console.warn('[useNetworkSyncStatus] removeChannel error:', err);
            }
        }
    }, []);

    // Core subscription function
    const subscribeHealthChannel = useCallback(() => {
        if (!user || !isOnline || !isMountedRef.current) {
            setRealtimeConnected(false);
            return;
        }

        // Clean up previous channel first to prevent duplicate/orphaned subscriptions
        cleanupChannel();

        try {
            const channel = supabase.channel('system_health')
                .subscribe((status, err) => {
                    if (!isMountedRef.current) return;

                    if (status === 'SUBSCRIBED') {
                        setRealtimeConnected(true);
                        setIsReconnecting(false);
                        retryAttemptRef.current = 0;
                        if (retryTimeoutRef.current) {
                            clearTimeout(retryTimeoutRef.current);
                            retryTimeoutRef.current = null;
                        }
                    } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
                        setRealtimeConnected(false);
                        if (err) {
                            console.warn(`[useNetworkSyncStatus] system_health channel error (${status}):`, err);
                        }

                        // Schedule automated reconnect with exponential backoff if online
                        if (isOnline && isMountedRef.current && !retryTimeoutRef.current) {
                            const delayMs = Math.min(3000 * Math.pow(1.5, retryAttemptRef.current), 30000);
                            retryAttemptRef.current += 1;
                            retryTimeoutRef.current = setTimeout(() => {
                                retryTimeoutRef.current = null;
                                if (isMountedRef.current && isOnline) {
                                    reconnectRef.current?.();
                                }
                            }, delayMs);
                        }
                    }
                });

            activeChannelRef.current = channel;
        } catch (err) {
            console.error('[useNetworkSyncStatus] Failed to subscribe system_health:', err);
            if (isMountedRef.current) {
                setRealtimeConnected(false);
            }
        }
    }, [user, isOnline, cleanupChannel]);

    // Manual or programmatic reconnect action
    const reconnect = useCallback(async () => {
        if (isReconnecting) return;
        setIsReconnecting(true);
        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }

        try {
            await reconnectSupabaseRealtime();
            subscribeHealthChannel();
        } finally {
            if (isMountedRef.current) {
                setIsReconnecting(false);
            }
        }
    }, [isReconnecting, subscribeHealthChannel]);

    useEffect(() => {
        reconnectRef.current = reconnect;
    }, [reconnect]);

    // 1. Browser online/offline event listeners
    useEffect(() => {
        isMountedRef.current = true;

        const handleOnline = () => {
            setIsOnline(true);
            // Immediately attempt re-sync when network returns
            reconnect();
        };

        const handleOffline = () => {
            setIsOnline(false);
            setRealtimeConnected(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            isMountedRef.current = false;
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [reconnect]);

    // 2. Sleep / Wake & Visibility resume listener
    useEffect(() => {
        const cleanupWakeListener = setupSleepAndWakeListener(
            (reason) => {
                console.log(`[useNetworkSyncStatus] Resuming from ${reason}. Re-establishing connection...`);
                reconnect();
            },
            { sleepThresholdMs: 8000, checkIntervalMs: 2500 }
        );

        return () => {
            cleanupWakeListener();
        };
    }, [reconnect]);

    // 3. Initial subscription and dependency management
    useEffect(() => {
        if (user && isOnline) {
            subscribeHealthChannel();
        } else {
            setRealtimeConnected(false);
        }

        return () => {
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
            cleanupChannel();
        };
    }, [user, isOnline, subscribeHealthChannel, cleanupChannel]);

    // Determine user-friendly status and tooltip
    let status: NetworkSyncState = 'online';
    let statusText = 'System Online • Realtime Sync Active';

    if (!isOnline) {
        status = 'offline';
        statusText = 'You are offline • Changes will sync when reconnected (Click to retry)';
    } else if (!realtimeConnected || isReconnecting) {
        status = 'reconnecting';
        statusText = 'Reconnecting to realtime sync... (Click to reconnect now)';
    }

    return {
        status,
        isOnline,
        realtimeConnected,
        statusText,
        reconnect,
        isReconnecting,
    };
}

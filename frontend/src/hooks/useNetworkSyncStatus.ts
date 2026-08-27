import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type NetworkSyncState = 'online' | 'reconnecting' | 'offline';

export interface NetworkSyncStatus {
    status: NetworkSyncState;
    isOnline: boolean;
    realtimeConnected: boolean;
    statusText: string;
}

export function useNetworkSyncStatus(): NetworkSyncStatus {
    const { user } = useAuth();
    const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [realtimeConnected, setRealtimeConnected] = useState<boolean>(true);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (!user || !isOnline) {
            setRealtimeConnected(false);
            return;
        }

        // Dedicated heartbeat/status channel
        const channel = supabase.channel('system_health')
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    setRealtimeConnected(true);
                } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
                    setRealtimeConnected(false);
                } else if (status === 'CLOSED') {
                    setRealtimeConnected(false);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, isOnline]);

    let status: NetworkSyncState = 'online';
    let statusText = 'System Online • Realtime Sync Active';

    if (!isOnline) {
        status = 'offline';
        statusText = 'You are offline • Changes will sync when reconnected';
    } else if (!realtimeConnected) {
        status = 'reconnecting';
        statusText = 'Reconnecting to realtime sync...';
    }

    return {
        status,
        isOnline,
        realtimeConnected,
        statusText
    };
}

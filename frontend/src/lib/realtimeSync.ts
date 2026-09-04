import { supabase } from './supabase';

export interface SleepWakeOptions {
    /** Sleep gap detection threshold in milliseconds (default: 10000ms = 10s) */
    sleepThresholdMs?: number;
    /** Heartbeat check interval in milliseconds (default: 2500ms) */
    checkIntervalMs?: number;
}

/**
 * Registers listeners for window/tab resumption:
 * 1. document visibilitychange (hidden -> visible, e.g. unlocking PC or switching back to tab)
 * 2. window focus (clicking into the window)
 * 3. window online (network reconnects)
 * 4. Sleep gap detector (system standby/sleep where JS timer was frozen for > threshold)
 */
export function setupSleepAndWakeListener(
    onWake: (reason: 'visibility' | 'focus' | 'online' | 'sleep_gap') => void,
    options: SleepWakeOptions = {}
): () => void {
    if (typeof window === 'undefined') return () => {};

    const sleepThresholdMs = options.sleepThresholdMs ?? 10000;
    const checkIntervalMs = options.checkIntervalMs ?? 2500;

    let lastTick = Date.now();
    let isCleanedUp = false;

    // 1. Visibility change listener
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && !isCleanedUp) {
            onWake('visibility');
        }
    };

    // 2. Focus listener
    const handleFocus = () => {
        if (!isCleanedUp) {
            onWake('focus');
        }
    };

    // 3. Online listener
    const handleOnline = () => {
        if (!isCleanedUp) {
            onWake('online');
        }
    };

    // 4. Timer freeze / sleep gap detector
    const intervalId = setInterval(() => {
        if (isCleanedUp) return;
        const now = Date.now();
        const delta = now - lastTick;
        lastTick = now;

        if (delta > sleepThresholdMs) {
            console.log(`[realtimeSync] System sleep / suspension detected (gap: ${Math.round(delta / 1000)}s). Triggering wake recovery.`);
            onWake('sleep_gap');
        }
    }, checkIntervalMs);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
        isCleanedUp = true;
        clearInterval(intervalId);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('online', handleOnline);
    };
}

/**
 * Validates the current auth session and refreshes it if missing or expired.
 * Also synchronizes the access token with supabase.realtime.
 */
export async function ensureFreshSession(): Promise<string | null> {
    try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            console.warn('[realtimeSync] Failed to get session:', sessionError.message);
        }

        let session = sessionData?.session;

        // If no session, return null
        if (!session) {
            return null;
        }

        // Check if token is expired or about to expire in the next 60 seconds
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        const isExpiringSoon = expiresAt > 0 && expiresAt - Date.now() < 60000;

        if (isExpiringSoon) {
            console.log('[realtimeSync] Token is expired or expiring soon. Refreshing session...');
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshData.session) {
                session = refreshData.session;
            } else if (refreshError) {
                console.warn('[realtimeSync] refreshSession error:', refreshError.message);
            }
        }

        const token = session.access_token;
        if (token && supabase.realtime) {
            try {
                await supabase.realtime.setAuth(token);
            } catch (err) {
                console.warn('[realtimeSync] Error setting realtime auth:', err);
            }
        }

        return token ?? null;
    } catch (err) {
        console.error('[realtimeSync] ensureFreshSession error:', err);
        return null;
    }
}

/**
 * Force reconnects Supabase Realtime client.
 * Refreshes auth token and triggers websocket connection.
 */
export async function reconnectSupabaseRealtime(): Promise<void> {
    try {
        await ensureFreshSession();

        if (supabase.realtime) {
            // If the connection is currently closed or disconnected, establish it
            if (!supabase.realtime.isConnected()) {
                supabase.realtime.connect();
            }
        }

        // Broadcast a custom event for any listeners (e.g. queries or channels) to resync
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('crm:realtime-reconnect'));
        }
    } catch (err) {
        console.error('[realtimeSync] reconnectSupabaseRealtime error:', err);
    }
}

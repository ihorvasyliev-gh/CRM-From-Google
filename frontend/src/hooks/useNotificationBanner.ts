import { useCallback, useEffect, useState } from 'react';
import { isNotificationSupported, getNotificationPermission } from '../lib/notifications';
import { isUserSubscribed, subscribeUserToPush } from '../lib/pushNotifications';
import { readStorage, writeStorage } from '../lib/storage';
import { toast } from '../lib/toast';

const DISMISSED_KEY = 'notif_banner_dismissed_at';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * The "enable notifications" banner: shown while the browser hasn't been asked yet and this
 * browser isn't subscribed, unless it was dismissed in the last 14 days.
 */
export function useNotificationBanner(userId: string | undefined) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const dismissedAt = parseInt(readStorage(DISMISSED_KEY) || '0', 10) || 0;
        if (Date.now() - dismissedAt < SNOOZE_MS) return;
        if (!isNotificationSupported() || getNotificationPermission() !== 'default') return;
        let cancelled = false;
        isUserSubscribed().then(subscribed => {
            if (!cancelled && !subscribed) setVisible(true);
        });
        return () => { cancelled = true; };
    }, []);

    const enable = useCallback(async () => {
        setVisible(false);
        if (!userId) return;
        const ok = await subscribeUserToPush(userId);
        if (ok) toast.success('Notifications enabled');
        else toast.error('Notifications were not enabled (permission denied or unsupported)');
    }, [userId]);

    const dismiss = useCallback(() => {
        setVisible(false);
        writeStorage(DISMISSED_KEY, String(Date.now()));
    }, []);

    return { visible, enable, dismiss };
}

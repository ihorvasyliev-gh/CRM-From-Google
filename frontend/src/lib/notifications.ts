// ─── Browser Notification Helpers ────────────────────────────
// Thin wrapper around the native Notification API.

/** Whether the browser supports the Notification API. */
export function isNotificationSupported(): boolean {
    return 'Notification' in window;
}

/** Current permission state, or 'unsupported' if the API is missing. */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
    if (!isNotificationSupported()) return 'unsupported';
    return Notification.permission;
}

/** Show a native desktop notification if permission is granted. */
export function showNotification(title: string, options?: NotificationOptions): Notification | null {
    if (!isNotificationSupported()) return null;
    if (Notification.permission !== 'granted') return null;
    return new Notification(title, options);
}

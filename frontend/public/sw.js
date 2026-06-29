// ─── Service Worker for Web Push Notifications ────────────────
// Served at the root path (/sw.js) to allow scoping across the whole app.

self.addEventListener('push', function (event) {
    if (!event.data) {
        console.warn('[Service Worker] Push event received but no payload data.');
        return;
    }

    let payload = {};
    try {
        payload = event.data.json();
    } catch (e) {
        // Fallback if payload is plain text
        payload = {
            title: '🎓 Course CRM Notification',
            body: event.data.text(),
        };
    }

    const title = payload.title || '🎓 Course CRM';
    const options = {
        body: payload.body || 'New update received.',
        icon: payload.icon || '/favicon.ico',
        badge: payload.badge || '/favicon.ico',
        tag: payload.tag || 'crm-default-tag',
        data: {
            url: payload.url || '/'
        },
        requireInteraction: payload.requireInteraction || false,
        vibrate: [100, 50, 100],
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function (event) {
    console.log('[Service Worker] Notification click Received.');

    event.notification.close();

    const targetUrl = event.notification.data?.url || '/';

    // Focus an existing open window matching the target URL or open a new one
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clientList) {
                // Check if we have an open tab we can focus
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    // If the client's URL matches our target URL (or hostname), focus it
                    if (client.url.includes(targetUrl) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Otherwise open a new tab
                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            })
    );
});

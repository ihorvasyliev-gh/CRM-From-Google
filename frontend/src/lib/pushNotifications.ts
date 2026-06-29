import { supabase } from './supabase';

// ─── VAPID Key Helper ──────────────────────────────────────────
// Converts the base64 URL-safe VAPID public key to a Uint8Array.
function urlB64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// ─── Service Worker Registration ────────────────────────────────
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Service Workers or Push Manager are not supported in this browser.');
        return null;
    }
    try {
        // Register the Service Worker located in public/sw.js
        const registration = await navigator.serviceWorker.register('/sw.js');
        return registration;
    } catch (err) {
        console.error('Service Worker registration failed:', err);
        return null;
    }
}

// ─── Push Subscription Operations ──────────────────────────────

/**
 * Checks if the user is currently subscribed to push notifications in this browser.
 */
export async function isUserSubscribed(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return false;
    }
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return false;
        const subscription = await registration.pushManager.getSubscription();
        return !!subscription;
    } catch (err) {
        console.error('Error checking subscription status:', err);
        return false;
    }
}

/**
 * Requests notification permission, registers Service Worker,
 * subscribes via PushManager, and registers subscription in Supabase.
 */
export async function subscribeUserToPush(userId: string): Promise<boolean> {
    try {
        const registration = await registerServiceWorker();
        if (!registration) return false;

        // 1. Request notification permission from browser
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('Notification permission denied by user.');
            return false;
        }

        // 2. Subscribe to push notifications using VAPID public key
        const publicVapidKey = 'BEXKy7-1BQOoZ23lEfJVE11pQJaQd1eRl1LavYMMAUb7R5y2jUelEmSTMIr-UUf7jF0UmsiQC2zaJwrecHE5m-o';
        const convertedVapidKey = urlB64ToUint8Array(publicVapidKey);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey as any
        });

        // 3. Extract credentials and serialize keys
        const subJson = subscription.toJSON();
        const endpoint = subJson.endpoint;
        const p256dh = subJson.keys?.p256dh;
        const auth = subJson.keys?.auth;

        if (!endpoint || !p256dh || !auth) {
            throw new Error('Push subscription returned invalid JSON structure.');
        }

        // 4. Save/Upsert the subscription in the Supabase table
        const { error } = await supabase
            .from('user_push_subscriptions')
            .upsert({
                user_id: userId,
                endpoint,
                p256dh,
                auth
            }, { onConflict: 'endpoint' });

        if (error) throw error;

        console.log('Successfully registered Web Push subscription with Supabase.');
        return true;
    } catch (err) {
        console.error('Failed to subscribe to Web Push:', err);
        return false;
    }
}

/**
 * Unsubscribes the current browser subscription, and deletes it from Supabase.
 */
export async function unsubscribeUserFromPush(_userId: string): Promise<boolean> {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            return true;
        }
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return true;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return true;

        const endpoint = subscription.endpoint;
        
        // 1. Unsubscribe via browser API
        await subscription.unsubscribe();

        // 2. Delete subscription from database
        const { error } = await supabase
            .from('user_push_subscriptions')
            .delete()
            .eq('endpoint', endpoint);

        if (error) throw error;

        console.log('Successfully removed Web Push subscription.');
        return true;
    } catch (err) {
        console.error('Failed to unsubscribe from Web Push:', err);
        return false;
    }
}

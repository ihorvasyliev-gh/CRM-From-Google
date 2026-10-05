import { supabase } from './supabase';

/**
 * Public half of the VAPID key pair used by the send-push-notification Edge Function
 * (its VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets). A new pair means setting
 * VITE_VAPID_PUBLIC_KEY and those two secrets together.
 */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
    || 'BEXKy7-1BQOoZ23lEfJVE11pQJaQd1eRl1LavYMMAUb7R5y2jUelEmSTMIr-UUf7jF0UmsiQC2zaJwrecHE5m-o';

// Converts the base64 URL-safe VAPID public key to a Uint8Array (atob accepts missing padding).
const urlB64ToUint8Array = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// ─── Service Worker Registration ────────────────────────────────
async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
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
        const convertedVapidKey = urlB64ToUint8Array(VAPID_PUBLIC_KEY);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
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

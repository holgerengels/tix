import axios from 'axios';

/**
 * Checks if push notification permission is granted but no active
 * PushSubscription exists (e.g. lost during SW update or browser cleanup).
 * If so, automatically re-subscribes and sends the subscription to the backend.
 */
export async function resubscribePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) return; // still subscribed, nothing to do

        console.log('[PushResubscribe] Permission granted but no subscription found — re-subscribing...');

        const vapidResponse = await axios.get('/api/push/public-key', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const publicVapidKey = vapidResponse.data;

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
        });

        await axios.post('/api/push/subscribe', subscription, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        console.log('[PushResubscribe] Successfully re-subscribed to push notifications.');
    } catch (err) {
        console.error('[PushResubscribe] Failed to re-subscribe:', err);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
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

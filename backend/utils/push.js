const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const vapidPath = path.join(__dirname, '../../config/vapid.json');
let vapidKeys = {};

function initWebPush() {
    try {
        if (fs.existsSync(vapidPath)) {
            vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
        } else {
            vapidKeys = webpush.generateVAPIDKeys();
            fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys, null, 2));
            console.log('[WebPush] Generated new VAPID keys.');
        }

        webpush.setVapidDetails(
            'mailto:admin@example.com',
            vapidKeys.publicKey,
            vapidKeys.privateKey
        );
        console.log('[WebPush] VAPID configured.');
    } catch (err) {
        console.error('[WebPush] Error initializing VAPID keys:', err);
    }
}

function getPublicKey() {
    return vapidKeys.publicKey;
}

module.exports = {
    initWebPush,
    getPublicKey,
    webpush
};

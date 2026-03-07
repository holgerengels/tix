const nodemailer = require('nodemailer');
const webpush = require('web-push');

let HttpsProxyAgent;
try {
    HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch (e) { }

const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://129.143.4.2:8080';

console.log('Testing proxy:', proxy);

// Test Nodemailer
const transport = nodemailer.createTransport({
    host: 'mail.valckenburgschule.de',
    port: 587,
    secure: false,
    proxy: proxy, // Passed as string
    logger: true,
    debug: true
});

transport.verify((err, success) => {
    if (err) {
        console.error('Nodemailer Error:', err.message);
    } else {
        console.log('Nodemailer Success:', success);
    }
});

// Test Web-Push
if (HttpsProxyAgent) {
    // webpush options are passed directly to sendNotification(sub, payload, options)
    // where options = { agent: new HttpsProxyAgent(proxy) }
    console.log('Web-Push proxy agent would be configured in sendNotification options');
}

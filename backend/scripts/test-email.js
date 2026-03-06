const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const settingsPath = path.join(__dirname, '../../config/settings.json');
let settings;
try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (e) {
    console.error("Konnte settings.json nicht laden:", e);
    process.exit(1);
}

const mailConfig = settings.publisher.mail;
console.log("Teste Email mit folgender Konfiguration:");
console.log("- Host:", mailConfig.host);
console.log("- Port:", mailConfig.port);
console.log("- Secure:", mailConfig.secure);
console.log("- User:", mailConfig.auth.user);
console.log("--------------------------------------------------");

const transporter = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: mailConfig.auth,
    // Add debug and logger flags for more verbose output
    debug: true,
    logger: true
});

async function run() {
    try {
        console.log("1. Überprüfe Verbindung zum Mailserver...");
        await transporter.verify();
        console.log("✅ Verbindung und Authentifizierung erfolgreich!");

        console.log("2. Versuche eine Test-Email zu senden...");
        const info = await transporter.sendMail({
            from: mailConfig.auth.user,
            to: mailConfig.auth.user, // Send to self as a test
            subject: 'Test Email vom Tix Ticket System (Netzwerk-Test)',
            text: 'Dies ist eine Test-E-Mail, um die Netzwerkkonnektivität vom Server aus zu überprüfen.'
        });

        console.log("✅ E-Mail erfolgreich gesendet!");
        console.log("Message ID:", info.messageId);
    } catch (error) {
        console.error("\n❌ FEHLER beim Mail-Test:");
        console.error(error.message);
        console.error("Stacktrace:", error);
    }
}

run();

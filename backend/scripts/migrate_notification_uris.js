const connectDB = require('../src/db');
const User = require('../src/models/user');
const mongoose = require('mongoose');

function normalizeNotificationUri(uri) {
    if (!uri) return '';
    return uri.split(',')
        .map(item => {
            const trimmed = item.trim();
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex === -1) return trimmed;
            const protocol = trimmed.substring(0, colonIndex).toLowerCase();
            const address = trimmed.substring(colonIndex + 1);
            return `${protocol}:${address}`;
        })
        .join(', ');
}

async function run() {
    console.log('Starte Migration für Benachrichtigungs-URIs...');
    
    // Connect to database
    await connectDB();

    const users = await User.find({ notificationUri: { $exists: true, $ne: '' } });
    console.log(`Gefunden: ${users.length} Benutzer mit ausgefüllter notificationUri.`);

    let updatedCount = 0;
    for (const user of users) {
        const normalized = normalizeNotificationUri(user.notificationUri);
        if (user.notificationUri !== normalized) {
            const oldValue = user.notificationUri;
            user.notificationUri = normalized;
            await user.save();
            console.log(`Benutzer '${user.username}' aktualisiert: '${oldValue}' -> '${normalized}'`);
            updatedCount++;
        }
    }

    console.log(`Migration abgeschlossen. ${updatedCount} Benutzer aktualisiert.`);
    await mongoose.connection.close();
    process.exit(0);
}

run().catch(err => {
    console.error('Migration fehlgeschlagen:', err);
    process.exit(1);
});

const mongoose = require('mongoose');

const fs = require('fs');
const path = require('path');

let settingsPath = path.join(__dirname, '../../config/settings.json');
let settings = {};

try {
    if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(data);
    }
} catch (err) {
    console.warn(`[DB] Warning: Error reading settings file: ${err.message}`);
}

const MONGO_URI = settings.database && settings.database.url
    ? settings.database.url
    : 'mongodb://admin:password@localhost:27017/tickets?authSource=admin';

const connectDB = async () => {
    try {
        mongoose.connection.on('disconnected', () => {
            console.error('❌ [DB] MongoDB disconnected! (Verbindung zur Datenbank verloren)');
        });
        
        mongoose.connection.on('error', (err) => {
            console.error('❌ [DB] MongoDB Fehler:', err.message);
        });

        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000 // 5 seconds instead of default 30s
        });
        console.log('✅ [DB] MongoDB connected');
    } catch (err) {
        console.error('❌ [DB] MongoDB connection error:', err.message);
        console.error('💡 Bitte prüfen, ob der MongoDB Docker Container (sudo docker compose up -d) läuft!');
        process.exit(1);
    }
};

module.exports = connectDB;

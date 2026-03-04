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
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

module.exports = connectDB;

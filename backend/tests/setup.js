const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Load env or defaults
const SECRET_KEY = 'supersecretkey'; // Same as in auth.js

jest.mock('../src/ki', () => ({
    askKI: jest.fn(async (prompt) => {
        if (prompt.includes('extrem frustriert')) return 'ESKALIERT';
        if (prompt.includes('Raum oder Ort aus folgendem Text')) return 'Raum 101';
        return 'OK';
    }),
    askKIWithMessages: jest.fn(async () => 'OK'),
    getClient: jest.fn(async () => ({}))
}));

// Mock tokens based on auth.js MOCK_USERS
const generateToken = (username, groups) => {
    return jwt.sign({ username, groups }, SECRET_KEY, { expiresIn: '8h' });
};

const getTokens = () => {
    return {
        admin: generateToken('admin', ['Administration', 'Schulleitung', 'Stundenplanung']),
        lehrer1: generateToken('lehrer1', ['Lehrkräfte']),
        lehrer2: generateToken('lehrer2', ['Lehrkräfte', 'Mensateam']),
        schulleiter: generateToken('schulleiter', ['Schulleitung', 'Lehrkräfte']),
        abteilungsleiter: generateToken('abteilungsleiter', ['Abteilungsleitung', 'Lehrkräfte']),
        stundenplaner: generateToken('stundenplaner', ['Stundenplanung', 'Lehrkräfte']),
        hausmeister: generateToken('hausmeister', ['Hausmeister']),
        netzwerker: generateToken('netzwerker', ['Netzwerkteam', 'Lehrkräfte']),
    };
};

const clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        if (key === 'users') continue;
        const collection = collections[key];
        await collection.deleteMany({});
    }
};

const closeDatabase = async () => {
    await mongoose.connection.close();
};

module.exports = {
    getTokens,
    clearDatabase,
    closeDatabase
};

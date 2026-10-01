const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./db');
const routes = require('./routes');
const attachments = require('./attachments');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Skip JSON body parsing for attachment upload route (needs raw streaming)
app.use((req, res, next) => {
    if (req.path === '/api/attachments' && req.method === 'POST') {
        return next();
    }
    bodyParser.json()(req, res, next);
});

// DB
connectDB();

// Serve Static Frontend (for Docker/Production)
const path = require('path');

// Service worker and HTML entry point must never be cached by the browser
app.use((req, res, next) => {
    if (req.path === '/sw.js' || req.path === '/' || req.path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
});

app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// Routes
app.use('/api', attachments);
app.use('/api', routes);

// SPA Catch-All
app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);

        // Start Background Jobs via Unified Scheduler
        const { startScheduler } = require('./scheduler');
        startScheduler();

        // Initialize Web Push Keys
        const { initWebPush } = require('./utils/push');
        initWebPush();
    });
}

module.exports = app;

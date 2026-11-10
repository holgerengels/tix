const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../../config/settings.json');

/**
 * Loads configuration from config/settings.json synchronously, returning {} on error or missing file.
 */
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        }
    } catch (err) {
        console.error(`[Settings] Error loading ${SETTINGS_PATH}:`, err.message);
    }
    return {};
}

const settings = loadSettings();

module.exports = { settings, loadSettings, SETTINGS_PATH };

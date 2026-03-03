import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceImage = '/home/holger/.gemini/antigravity/brain/7d1e7064-0a8b-457b-9052-452f96192baa/tix_logo_1772555309410.png';
const outputDir = path.join(__dirname, '../public');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
    try {
        await sharp(sourceImage)
            .resize(192, 192)
            .toFile(path.join(outputDir, 'pwa-192x192.png'));

        await sharp(sourceImage)
            .resize(512, 512)
            .toFile(path.join(outputDir, 'pwa-512x512.png'));

        await sharp(sourceImage)
            .resize(64, 64)
            .toFile(path.join(outputDir, 'favicon.ico'));

        await sharp(sourceImage)
            .resize(180, 180)
            .toFile(path.join(outputDir, 'apple-touch-icon.png'));

        await sharp(sourceImage)
            .resize(512, 512)
            .toFile(path.join(outputDir, 'masked-icon.png'));

        console.log('Icons generated successfully.');
    } catch (err) {
        console.error('Error generating icons:', err);
    }
}

generateIcons();

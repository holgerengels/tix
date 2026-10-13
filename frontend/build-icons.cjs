const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const publicDir = path.join(__dirname, 'public');

const BRAND_COLOR = { r: 91, g: 107, b: 109, alpha: 1 }; // #5B6B6D (Valckenburg-Slate)
const BRAND_HEX = '#5B6B6D';
const WHITE_HEX = '#FFFFFF';
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// Tightly bounded SVG of the VU logo
function createVuSvg(fillColor, width = 140.02, height = 65.40) {
    return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 140.02 65.40" xmlns="http://www.w3.org/2000/svg">
    <g fill="${fillColor}" fill-rule="nonzero">
      <path d="M47.7667158,65.1240059 L37.7213549,41.0698085 L20.7057437,0.136671576 C20.7057437,0.136671576 20.637408,0.0683357879 20.5690722,0 L0.136671576,0 C-1.42108547e-14,0 -1.42108547e-14,0.136671576 -1.42108547e-14,0.205007364 L27.402651,65.2606775 C27.402651,65.2606775 27.4709867,65.397349 27.5393225,65.397349 L47.5617084,65.397349 C47.6300442,65.397349 47.69838,65.3290133 47.69838,65.1923417 L47.69838,65.1923417 L47.7667158,65.1240059 Z"/>
      <path d="M42.5048601,26.0359352 L61.4338733,26.0359352 C61.5022091,26.0359352 61.5705449,26.0359352 61.5705449,25.8992636 L72.4359352,0.205007364 C72.4359352,0.136671576 72.4359352,0 72.2992636,0 L53.2335788,0 C53.165243,0 53.0969072,0 53.0969072,0.136671576 L42.3681885,25.8309278 C42.3681885,25.8992636 42.3681885,26.0359352 42.5048601,26.0359352 L42.5048601,26.0359352 Z"/>
      <path d="M97.6518409,65.1240059 C104.212077,66.695729 114.462445,65.739028 123.892784,58.9054492 L123.892784,63.142268 C123.892784,64.5773196 124.712813,65.2606775 126.489543,65.2606775 L139.746686,65.2606775 C139.883358,65.2606775 140.020029,65.1240059 140.020029,64.9873343 L140.020029,0.273343152 C140.020029,0.136671576 139.883358,0 139.746686,0 L122.457732,0 C122.32106,0 122.184389,0.136671576 122.184389,0.273343152 L122.184389,48.1767305 C115.965832,52.7552283 108.312224,53.6435935 104.553756,50.6368189 C101.273638,48.0400589 101.205302,42.6415317 101.205302,38.678056 L101.205302,0.273343152 C101.205302,0.136671576 101.136966,0 101.000295,0 L83.7113402,0 C83.5746686,0 83.4379971,0.136671576 83.4379971,0.273343152 C83.4379971,3.4167894 83.4379971,34.5779087 83.4379971,41.2064801 C83.4379971,47.8350515 85.2147275,54.6002946 87.4698085,58.0170839 C89.5198822,61.0921944 92.7316642,63.9622975 97.6518409,65.1240059 L97.6518409,65.1240059 Z"/>
    </g>
  </svg>`);
}

async function generateSolidIcon(size, logoSize, outputPath) {
    const whiteLogoBuf = await sharp(createVuSvg(WHITE_HEX))
        .resize(logoSize, logoSize, { fit: 'contain', background: TRANSPARENT })
        .png()
        .toBuffer();

    await sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: BRAND_COLOR
        }
    })
    .composite([{ input: whiteLogoBuf, gravity: 'centre' }])
    .png()
    .toFile(outputPath);
}

async function generateBadge(size, logoSize, outputPath) {
    // Android Notification Badges MUST be a monochrome alpha mask on transparent background.
    const whiteLogoBuf = await sharp(createVuSvg(WHITE_HEX))
        .resize(logoSize, logoSize, { fit: 'contain', background: TRANSPARENT })
        .png()
        .toBuffer();

    await sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: TRANSPARENT
        }
    })
    .composite([{ input: whiteLogoBuf, gravity: 'centre' }])
    .png()
    .toFile(outputPath);
}

async function generateIcons() {
    try {
        console.log('Generating high-contrast icons for TIX...');

        // 1. Android Push Notification Badges (Monochrome alpha mask on transparent background)
        // 96x96 (xxxhdpi) and 72x72 (xxhdpi)
        await generateBadge(96, 76, path.join(publicDir, 'badge-96x96.png'));
        await generateBadge(96, 76, path.join(publicDir, 'badge.png'));

        // 2. Apple Touch Icon (180x180) - Solid #5B6B6D with white logo, centered in safe squircle area
        await generateSolidIcon(180, 126, path.join(publicDir, 'apple-touch-icon.png'));

        // 3. PWA Icons (192x192 & 512x512)
        await generateSolidIcon(192, 136, path.join(publicDir, 'pwa-192x192.png'));
        await generateSolidIcon(512, 360, path.join(publicDir, 'pwa-512x512.png'));

        // 4. Maskable Icon (512x512) - Solid background, logo within 80% safe zone circle (radius 204px, our logo diagonal is ~198px)
        await generateSolidIcon(512, 360, path.join(publicDir, 'masked-icon.png'));

        // 5. Favicon (32x32)
        await generateSolidIcon(32, 24, path.join(publicDir, 'favicon.ico'));

        console.log('All icons generated successfully!');
    } catch (err) {
        console.error('Error generating icons:', err);
    }
}

generateIcons();


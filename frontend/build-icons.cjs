const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const sourceSvg = path.join(publicDir, 'vu.svg');

async function generateIcons() {
    try {
        const svgBuffer = fs.readFileSync(sourceSvg);

        // Provide a solid background option for icons that typically need it, 
        // or keep transparent and create the maskable one with background
        const bgSvg = Buffer.from(
            `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" fill="#ffffff"/>
      </svg>`
        );

        // 192x192
        await sharp(sourceSvg)
            .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .png()
            .toFile(path.join(publicDir, 'pwa-192x192.png'));

        // 512x512
        await sharp(sourceSvg)
            .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .png()
            .toFile(path.join(publicDir, 'pwa-512x512.png'));

        // Maskable icon (usually needs padding and a solid background)
        await sharp(bgSvg)
            .composite([{
                input: await sharp(sourceSvg).resize(400, 400, { fit: 'contain' }).png().toBuffer(),
                gravity: 'centre'
            }])
            .png()
            .toFile(path.join(publicDir, 'masked-icon.png'));

        // Apple Touch Icon
        await sharp(bgSvg)
            .composite([{
                input: await sharp(sourceSvg).resize(150, 150, { fit: 'contain' }).png().toBuffer(),
                gravity: 'centre'
            }])
            .resize(180, 180)
            .png()
            .toFile(path.join(publicDir, 'apple-touch-icon.png'));

        // Favicon (just resize 192 for simplicity or convert to ico if needed, here we just keep .ico extension for older browsers or standard behavior)
        // Actually sharp doesn't do pure .ico out of the box easily, but we can make a tiny png and name it ico or just use the svg directly.
        // Vite PWA handles it if you set the manifest right, but let's make a 32x32 png as favicon.ico just in case
        await sharp(sourceSvg)
            .resize(32, 32, { fit: 'contain' })
            .png()
            .toFile(path.join(publicDir, 'favicon.ico'));

        console.log('Icons generated successfully from vu.svg!');
    } catch (error) {
        console.error('Error generating icons:', error);
    }
}

generateIcons();

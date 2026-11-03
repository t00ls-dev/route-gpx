// Raster exports of the repository's SVG brand assets; no remote image service.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const render = async (source, width, height, target) => {
    const svg = await fs.readFile(source, 'utf8');
    const png = await page.evaluate(
      async ({ svg, width, height }) => {
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { svg, width, height },
    );
    await fs.writeFile(target, Buffer.from(png, 'base64'));
  };
  for (const size of [32, 180, 192, 512])
    await render(
      'public/icons/icon.svg',
      size,
      size,
      `public/icons/icon-${size}.png`,
    );
  const maskable = (await fs.readFile('public/icons/icon.svg', 'utf8')).replace(
    'rx="112"',
    'rx="0"',
  );
  await fs.writeFile('public/icons/maskable.svg', maskable);
  await render(
    'public/icons/maskable.svg',
    512,
    512,
    'public/icons/maskable-512.png',
  );
  await render('public/social-card.svg', 1200, 630, 'public/social-card.png');
  console.log('Exported PNG icons and social sharing image.');
} finally {
  await browser.close();
}

// Generates PWA / favicon assets from the brand mark. Run: npm run icons
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const mark = (
  size,
  pad = 0,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${64 + pad * 2} ${64 + pad * 2}">
  <rect x="${-pad}" y="${-pad}" width="${64 + pad * 2}" height="${64 + pad * 2}" ${pad ? '' : 'rx="16"'} fill="#33201a"/>
  <path d="M18 24h28l-3 24a6 6 0 0 1-6 5H27a6 6 0 0 1-6-5z" fill="#f4a300"/>
  <path d="M46 28h3a5 5 0 0 1 0 10h-4" fill="none" stroke="#f4a300" stroke-width="3" stroke-linecap="round"/>
  <g stroke="#fbf6ef" stroke-width="3" stroke-linecap="round" opacity="0.9"><path d="M16 10v44M26 10v44M36 10v44M46 10v44M56 10v44"/></g>
</svg>`;

writeFileSync('public/favicon.svg', mark(64));
await sharp(Buffer.from(mark(192)))
  .png()
  .toFile('public/pwa-192.png');
await sharp(Buffer.from(mark(512)))
  .png()
  .toFile('public/pwa-512.png');
await sharp(Buffer.from(mark(512, 14)))
  .png()
  .toFile('public/pwa-512-maskable.png'); // safe-zone padding
await sharp(Buffer.from(mark(180, 8)))
  .png()
  .toFile('public/apple-touch-icon.png');
console.log('icons written');

// The app icons (public/icons/*.png): the ghost over its chart line, from the
// one logo in src/brand/logo.ts, on the dashboard's dark background. PNGs
// because iOS ignores any other kind for the home screen. Run by hand when the
// logo changes: node scripts/icons.mjs (Chromium from Playwright draws them).
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { EYES, GHOST, LINE } from '../src/brand/logo.ts'

const BG = '#0b0d10'
// size: pixels; fill: how much of the icon the 64-unit logo box takes. A
// maskable icon keeps its drawing in the middle 60%, where every mask leaves it.
const ICONS = [
  { file: 'icon-192.png', size: 192, fill: 0.8 },
  { file: 'icon-512.png', size: 512, fill: 0.8 },
  { file: 'icon-maskable-512.png', size: 512, fill: 0.62 },
  { file: 'apple-touch-icon.png', size: 180, fill: 0.72 },
]

// The drawing sits on units 1.5 to 62.5 across and 10 to 52 down; its middle is (32, 31).
const svg = ({ size, fill }) => {
  const k = (size * fill) / 64
  const x = size / 2 - 32 * k
  const y = size / 2 - 31 * k
  const edge = `fill="none" stroke-linecap="round" stroke-linejoin="round"`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${BG}"/>` +
    `<g transform="translate(${x} ${y}) scale(${k})">` +
    `<path d="${GHOST}" fill="#b8ff3c"/>${EYES}` +
    `<path d="${LINE}" ${edge} stroke="${BG}" stroke-width="7"/>` +
    `<path d="${LINE}" ${edge} stroke="#f5f7fa" stroke-width="3.2"/>` +
    '</g></svg>'
  )
}

const dir = new URL('../public/icons/', import.meta.url).pathname
mkdirSync(dir, { recursive: true })
const browser = await chromium.launch()
for (const icon of ICONS) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
  await page.setContent(`<body style="margin:0">${svg(icon)}</body>`)
  writeFileSync(dir + icon.file, await page.screenshot({ type: 'png', omitBackground: false }))
  await page.close()
}
await browser.close()

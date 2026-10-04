// Draws the wordpress.org directory assets from the one logo
// (dashboard/src/brand): icon.svg, icon-128x128.png, icon-256x256.png,
// banner-772x250.png and banner-1544x500.png, into ../assets. Nothing here is a
// new drawing: the ghost, the chart line and the name come from logo.ts and
// logo.css as they are.
//
//   cd e2e && node --experimental-strip-types ../integrations/wordpress/tools/make-assets.mjs
//
// Needs Playwright's Chromium (the e2e package has it).
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')
const out = join(here, '../assets')
const { GHOST, LINE, EYES, logoInner } = await import(pathToFileURL(join(root, 'dashboard/src/brand/logo.ts')).href)
const { chromium } = createRequire(join(root, 'e2e/package.json'))('@playwright/test')
const css = readFileSync(join(root, 'dashboard/src/brand/logo.css'), 'utf8')
const font = (f) => pathToFileURL(join(root, 'server/internal/cards/fonts', f)).href

const INK = '#f5f7fa'
const BG = '#0b0d10'
const LIME = '#b8ff3c'
const mark = `<path d="${GHOST}" fill="${LIME}"/>${EYES}` +
  `<path d="${LINE}" fill="none" stroke="${BG}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${LINE}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`

// The mark on the dashboard's own dark, centred with room around it.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 80 80" role="img" aria-label="trckable"><rect x="-8" y="-8" width="80" height="80" fill="${BG}"/>${mark}</svg>\n`
writeFileSync(join(out, 'icon.svg'), icon)

const banner = (w, h) => `<!doctype html><meta charset="utf-8"><style>
${css}
@font-face { font-family: tkb-body; src: url(${font('Geist-Regular.ttf')}); font-weight: 400 }
@font-face { font-family: tkb-body; src: url(${font('Geist-Bold.ttf')}); font-weight: 700 }
html, body { margin: 0; width: ${w}px; height: ${h}px; background: ${BG}; overflow: hidden }
body { position: relative; font-family: tkb-body, sans-serif; color: ${INK} }
.line { position: absolute; right: 0; bottom: 0; width: ${w * 0.55}px; opacity: .16 }
.copy { position: absolute; left: ${w * 0.07}px; top: 50%; transform: translateY(-50%) }
.tkb-logo { zoom: ${h / 100}; --tkb-ink: ${INK}; --tkb-bg: ${BG}; display: flex }
.tag { font-size: ${h * 0.085}px; font-weight: 400; margin-top: ${h * 0.07}px; color: #aab2bd; line-height: 1.3 }
.tag b { color: ${INK}; font-weight: 700 }
</style>
<svg class="line" viewBox="0 0 64 64" preserveAspectRatio="none"><path d="${LINE}" fill="none" stroke="${LIME}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
<div class="copy"><span class="tkb-logo" role="img" aria-label="trckable">${logoInner()}</span>
<div class="tag"><b>The only analytics you need.</b><br>Private, free and open source.</div></div>`

const browser = await chromium.launch()
const shot = async (html, file, w, h, scale = 1) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale })
  await page.setContent(html)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(out, file), clip: { x: 0, y: 0, width: w, height: h } })
  await page.close()
}
for (const size of [128, 256]) await shot(`<body style="margin:0">${icon.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}`, `icon-${size}x${size}.png`, size, size)
await shot(banner(1544, 500), 'banner-1544x500.png', 1544, 500)
await shot(banner(772, 250), 'banner-772x250.png', 772, 250)
await browser.close()

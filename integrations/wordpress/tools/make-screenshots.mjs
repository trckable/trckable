// Takes the four screenshots of readme.txt (== Screenshots ==) into ../assets:
//   1 Settings → trckable        2 the dashboard widget
//   3 the trckable dashboard     4 the cookieless switch
// Against a local WordPress that has the plugin set up (tests/setup.sh) and a
// local trckable with a site that has some history; both only on this machine.
//
//   cd e2e && WP_URL=http://127.0.0.1:19401 TKB_URL=http://127.0.0.1:19400 \
//     TKB_EMAIL=… TKB_PASSWORD=… TKB_SITE=127.0.0.1 node ../integrations/wordpress/tools/make-screenshots.mjs
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '../assets')
const { chromium } = createRequire(join(here, '../../../e2e/package.json'))('@playwright/test')
const WP = process.env.WP_URL ?? 'http://127.0.0.1:19401'
const TKB = process.env.TKB_URL ?? 'http://127.0.0.1:19400'

const browser = await chromium.launch()
const wp = await (await browser.newContext({ viewport: { width: 1200, height: 720 }, deviceScaleFactor: 1 })).newPage()
await wp.goto(`${WP}/wp-login.php`)
await wp.fill('#user_login', 'admin')
await wp.fill('#user_pass', 'admin-local-test')
await wp.click('#wp-submit')
await wp.waitForURL(/wp-admin/)

await wp.goto(`${WP}/wp-admin/options-general.php?page=trckable`)
await wp.screenshot({ path: join(out, 'screenshot-1.png') })

// The switch, close up: the first rows of the form, the cookieless one in focus.
await wp.focus('#trckable_cookieless')
const form = await wp.locator('.form-table').boundingBox()
await wp.screenshot({ path: join(out, 'screenshot-4.png'), clip: { x: form.x - 20, y: form.y - 10, width: 760, height: 250 } })

await wp.goto(`${WP}/wp-admin/index.php`)
// The widget first, so it is the one that shows (what a site's owner puts on top).
await wp.evaluate(() => {
  document.querySelector('#welcome-panel')?.remove()
  document.querySelector('#normal-sortables')?.prepend(document.querySelector('#trckable_widget'))
})
await wp.setViewportSize({ width: 1200, height: 480 })
await wp.screenshot({ path: join(out, 'screenshot-2.png') })

const tkb = await (await browser.newContext({ viewport: { width: 1200, height: 760 }, colorScheme: 'dark' })).newPage()
await tkb.goto(`${TKB}/`)
await tkb.fill('input[type=email]', process.env.TKB_EMAIL ?? '')
await tkb.fill('input[type=password]', process.env.TKB_PASSWORD ?? '')
await tkb.keyboard.press('Enter')
await tkb.waitForTimeout(1500)
await tkb.goto(`${TKB}/${process.env.TKB_SITE ?? '127.0.0.1'}`)
await tkb.waitForTimeout(3000)
await tkb.mouse.click(1135, 169) // the milestone banner's close button
await tkb.waitForTimeout(800)
await tkb.screenshot({ path: join(out, 'screenshot-3.png') })
await browser.close()

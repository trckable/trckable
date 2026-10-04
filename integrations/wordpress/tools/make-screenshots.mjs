// Takes the screenshots of readme.txt (== Screenshots ==) into ../assets, and
// the extra ones named below into OUT_DIR:
//   screenshot-1  the trckable page, connected      screenshot-2  the dashboard widget
//   screenshot-3  the trckable dashboard            screenshot-4  the switches and the live preview
//   screenshot-5  the first-run card (SHOT=first-run, on a WordPress with no site ID saved), and first-run-step-2 (OUT_DIR)
//   mobile-390    the page at the admin's phone width, and dark (the OS dark scheme) (OUT_DIR)
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
const extra = process.env.OUT_DIR ?? out
const { chromium } = createRequire(join(here, '../../../e2e/package.json'))('@playwright/test')
const WP = process.env.WP_URL ?? 'http://127.0.0.1:19401'
const TKB = process.env.TKB_URL ?? 'http://127.0.0.1:19400'
const PAGE = `${WP}/wp-admin/admin.php?page=trckable`

const browser = await chromium.launch()
const wp = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
await wp.goto(`${WP}/wp-login.php`)
await wp.fill('#user_login', 'admin')
await wp.fill('#user_pass', 'admin-local-test')
await wp.click('#wp-submit')
await wp.waitForURL(/wp-admin/)

if (process.env.SHOT === 'first-run') {
  await wp.goto(PAGE)
  await wp.locator('label[for=trk-server-own]').click()
  await wp.fill('#trckable_host', process.env.OWN_HOST ?? 'http://127.0.0.1:19400')
  await wp.getByRole('button', { name: 'Check connection' }).click()
  await wp.locator('.trk-check[data-state="ok"]').waitFor()
  await wp.waitForTimeout(600)
  await wp.screenshot({ path: join(out, 'screenshot-5.png'), clip: { x: 160, y: 0, width: 1120, height: 700 } })
  await wp.getByRole('button', { name: 'Continue' }).click()
  await wp.fill('#trckable_site', process.env.SITE_ID ?? 'tkb_r6e2bgzsvyhu')
  await wp.waitForTimeout(500)
  await wp.screenshot({ path: join(extra, 'first-run-step-2.png'), clip: { x: 160, y: 0, width: 1120, height: 860 } })
  await browser.close()
  process.exit(0)
}

await wp.goto(PAGE)
await wp.waitForTimeout(500)
await wp.screenshot({ path: join(out, 'screenshot-1.png'), clip: { x: 0, y: 0, width: 1280, height: 860 } })

// The switches, the chips and the tag that follow them: cookieless off, then on.
await wp.uncheck('#trckable_cookieless', { force: true })
await wp.focus('#trckable_cookieless')
await wp.waitForTimeout(300)
await wp.check('#trckable_cookieless', { force: true })
await wp.waitForTimeout(500)
await wp.screenshot({ path: join(out, 'screenshot-4.png'), clip: { x: 160, y: 60, width: 1120, height: 800 } })

await wp.goto(`${WP}/wp-admin/index.php`)
await wp.evaluate(() => {
  document.querySelector('#welcome-panel')?.remove()
  document.querySelector('#normal-sortables')?.prepend(document.querySelector('#trckable_widget'))
})
await wp.setViewportSize({ width: 1200, height: 560 })
await wp.screenshot({ path: join(out, 'screenshot-2.png') })

const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
await phone.goto(`${WP}/wp-login.php`)
await phone.fill('#user_login', 'admin')
await phone.fill('#user_pass', 'admin-local-test')
await phone.click('#wp-submit')
await phone.waitForURL(/wp-admin/)
await phone.goto(PAGE)
await phone.waitForTimeout(500)
await phone.screenshot({ path: join(extra, 'mobile-390.png'), fullPage: true })

const dark = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' })).newPage()
await dark.goto(`${WP}/wp-login.php`)
await dark.fill('#user_login', 'admin')
await dark.fill('#user_pass', 'admin-local-test')
await dark.click('#wp-submit')
await dark.waitForURL(/wp-admin/)
await dark.goto(PAGE)
await dark.waitForTimeout(500)
await dark.screenshot({ path: join(extra, 'dark.png') })

const tkb = await (await browser.newContext({ viewport: { width: 1200, height: 760 }, colorScheme: 'dark' })).newPage()
await tkb.goto(`${TKB}/`)
await tkb.fill('input[type=email]', process.env.TKB_EMAIL ?? '')
await tkb.fill('input[type=password]', process.env.TKB_PASSWORD ?? '')
await tkb.keyboard.press('Enter')
await tkb.waitForTimeout(1500)
await tkb.goto(`${TKB}/${process.env.TKB_SITE ?? '127.0.0.1'}`)
await tkb.waitForTimeout(3000)
await tkb.mouse.click(1135, 169) // the milestone banner's close button, when it is there
await tkb.waitForTimeout(800)
await tkb.screenshot({ path: join(out, 'screenshot-3.png') })
await browser.close()

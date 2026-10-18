// The account window, end to end: API keys (create, error, copy, revoke) and People (add, error, one-time password,
// remove), each with Cancel and Escape (a form in the window closes first, then the window), and one overlay at a time.
import { expect, test, type Page } from './fixtures'
import { flowSession, LOOKS, openFlow, overlays } from './flows-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the flows')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const WINDOW = 'Profile, your account'

async function openAccount(page: Page, tab: string, look: { width: number; scheme: 'dark' | 'light' }) {
  await openFlow(page, cookie, look)
  await page.getByRole('button', { name: /^Account/ }).first().click()
  await page.getByRole('menuitem', { name: /^Profile/ }).or(page.getByRole('button', { name: /^Profile/ })).first().click()
  await expect.poll(() => overlays(page)).toEqual([WINDOW])
  await page.locator('.window-nav button, .window-tab').filter({ hasText: tab }).first().click()
}

for (const look of LOOKS) {
  test.describe(`${look.width}px, ${look.scheme}`, () => {
    test('API keys: Escape and Cancel close the form, an error keeps the name, a key is made once, shown once and revoked', async ({ page }) => {
      await openAccount(page, 'Keys', look)
      const win = page.getByRole('dialog', { name: WINDOW })
      await win.getByRole('button', { name: 'Create key' }).click()
      await expect(win.getByLabel('Key name')).toBeFocused()
      // Escape closes the form, not the window.
      await page.keyboard.press('Escape')
      await expect(win.getByLabel('Key name')).toHaveCount(0)
      expect(await overlays(page)).toEqual([WINDOW])
      await win.getByRole('button', { name: 'Create key' }).click()
      await win.getByRole('button', { name: 'Cancel' }).click()
      await expect(win.getByLabel('Key name')).toHaveCount(0)
      // The server says no: the message shows and the name stays.
      let posts = 0
      let broken = true
      await page.route(/\/api\/v1\/keys$/, async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        posts++
        if (broken) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'broken' }) })
        await new Promise((r) => setTimeout(r, 300))
        return route.continue()
      })
      const name = `flow key ${look.width} ${Date.now()}`
      await win.getByRole('button', { name: 'Create key' }).click()
      await win.getByLabel('Key name').fill(name)
      await win.getByRole('button', { name: 'Create key' }).last().click()
      await expect(win.locator('.field-err-msg')).toBeVisible()
      await expect(win.getByLabel('Key name')).toHaveValue(name)
      // Two clicks make one key; its secret shows once.
      broken = false
      posts = 0
      await win.getByRole('button', { name: 'Create key' }).last().dblclick()
      await expect(win.getByRole('group', { name: 'Your new key' })).toBeVisible()
      expect(posts).toBe(1)
      await win.getByRole('button', { name: 'Close' }).last().click()
      await expect(win.getByRole('group', { name: 'Your new key' })).toHaveCount(0)
      // Revoke asks once: Escape keeps the key, Revoke removes it from the list without a reload.
      const revoke = win.getByRole('button', { name: `Revoke ${name}` })
      await revoke.click()
      const ask = page.getByRole('dialog', { name: `Revoke "${name}"?` })
      await expect(ask).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(ask).toHaveCount(0)
      await expect(revoke).toBeVisible()
      await revoke.click()
      await ask.getByRole('button', { name: 'Revoke' }).click()
      await expect(revoke).toHaveCount(0)
    })

    test('People: a bad address is named, an error keeps the form, Cancel and Escape close it, and the one-time password is the only overlay', async ({ page }) => {
      await openAccount(page, 'People', look)
      const win = page.getByRole('dialog', { name: WINDOW })
      await win.getByRole('button', { name: 'Add someone' }).click()
      await win.getByLabel('Email').fill('not an address')
      await win.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(win.locator('.field-err-msg')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(win.getByLabel('Email')).toHaveCount(0)
      expect(await overlays(page)).toEqual([WINDOW])
      await win.getByRole('button', { name: 'Add someone' }).click()
      await win.getByRole('button', { name: 'Cancel' }).click()
      await expect(win.getByLabel('Email')).toHaveCount(0)
      // A failing server keeps what was typed.
      let broken = true
      await page.route(/\/api\/v1\/people$/, (route) => (route.request().method() === 'POST' && broken ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'broken' }) }) : route.continue()))
      const email = `flow-${look.width}-${Date.now()}@example.com`
      await win.getByRole('button', { name: 'Add someone' }).click()
      await win.getByLabel('Email').fill(email)
      await win.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(win.locator('.field-err-msg')).toBeVisible()
      await expect(win.getByLabel('Email')).toHaveValue(email)
      // It works the next time; the password to pass on is the only overlay in sight, and the person is in the list.
      broken = false
      await win.getByRole('button', { name: 'Add', exact: true }).click()
      await expect.poll(() => overlays(page).then((o) => o.length === 1 && o[0] !== WINDOW)).toBe(true)
      await page.keyboard.press('Escape')
      await expect.poll(() => overlays(page)).toEqual([WINDOW])
      const options = win.getByRole('button', { name: `${email} options` })
      await expect(options).toBeVisible()
      // Remove them (clean up, and the removal flow): the question, then gone.
      await options.click()
      await page.getByRole('menuitem', { name: 'Remove' }).or(page.getByRole('button', { name: 'Remove' })).first().click()
      const ask = page.getByRole('dialog').filter({ hasText: email }).last()
      await expect(ask).toBeVisible()
      await ask.getByRole('button', { name: 'Remove' }).click()
      await expect(options).toHaveCount(0)
    })
  })
}

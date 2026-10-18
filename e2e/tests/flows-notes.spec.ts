// Notes, end to end, on the Briefing: the sheet that lists them, the form that adds one (it takes the sheet's place, never
// stacks on it), editing in place, deleting with a way back, Cancel, Escape, a click outside, a failing server, a double click.
import { expect, test, type Page } from './fixtures'
import { flowSession, LOOKS, openFlow, overlays } from './flows-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the flows')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const sheet = (page: Page) => page.locator('.cd.on')
const form = (page: Page) => page.getByRole('dialog', { name: 'Add a note' })
const ask = (page: Page) => page.getByRole('dialog', { name: 'Delete this note?' })
const notesButton = (page: Page) => page.getByRole('button', { name: /^Notes/ }).first()

async function openNotes(page: Page) {
  await notesButton(page).click()
  await expect(sheet(page)).toBeVisible()
}

for (const look of LOOKS) {
  test.describe(`${look.width}px, ${look.scheme}`, () => {
    test(`Add a note takes the sheet's place, and Cancel and Escape go back to it`, async ({ page }) => {
      await openFlow(page, cookie, look)
      await openNotes(page)
      await sheet(page).getByRole('button', { name: 'Add a note' }).click()
      await expect(form(page)).toBeVisible()
      // One overlay in sight: the form. The sheet waits underneath, out of sight and out of reach.
      expect(await overlays(page)).toEqual(['Add a note'])
      await form(page).getByRole('button', { name: 'Cancel' }).click()
      await expect(form(page)).toHaveCount(0)
      expect(await overlays(page)).toEqual(['All notes'])
      // Escape from the form is the same way back; a second Escape closes the sheet and focus returns to the opener.
      await sheet(page).getByRole('button', { name: 'Add a note' }).click()
      await expect(form(page)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(form(page)).toHaveCount(0)
      expect(await overlays(page)).toEqual(['All notes'])
      await page.keyboard.press('Escape')
      await expect(sheet(page)).toHaveCount(0)
      await expect(notesButton(page)).toBeFocused()
    })

    test('a note is added, edited and deleted (with Undo) without a reload', async ({ page }) => {
      const word = `flow ${look.width} ${look.scheme} ${Date.now()}`
      await openFlow(page, cookie, look)
      await openNotes(page)
      await sheet(page).getByRole('button', { name: 'Add a note' }).click()
      await form(page).getByRole('textbox').fill(word)
      await form(page).getByRole('button', { name: 'Add note' }).click()
      // Back on the sheet, with the new note in the list.
      await expect(form(page)).toHaveCount(0)
      expect(await overlays(page)).toEqual(['All notes'])
      const row = sheet(page).locator('.irow', { hasText: word })
      await expect(row).toBeVisible()
      // Edit in place: Escape leaves the edit, not the sheet.
      await row.getByRole('button', { name: /^Edit note/ }).click()
      await page.keyboard.press('Escape')
      await expect(sheet(page)).toBeVisible()
      await expect(row.getByRole('button', { name: /^Edit note/ })).toBeVisible()
      await row.getByRole('button', { name: /^Edit note/ }).click()
      await page.getByRole('textbox', { name: 'Note' }).fill(word + ' edited')
      await page.getByRole('button', { name: 'Save' }).click()
      const edited = sheet(page).locator('.irow', { hasText: word + ' edited' })
      await expect(edited).toBeVisible()
      // Delete asks once; Escape keeps it, Delete removes it, and Undo brings it back.
      await edited.getByRole('button', { name: /^Delete note/ }).click()
      await expect(ask(page)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(ask(page)).toHaveCount(0)
      await expect(edited).toBeVisible()
      await edited.getByRole('button', { name: /^Delete note/ }).click()
      await ask(page).getByRole('button', { name: 'Delete' }).click()
      await expect(edited).toHaveCount(0)
      await page.getByRole('button', { name: 'Undo' }).click()
      await expect(edited).toBeVisible()
      // Clean up what this run made.
      await edited.getByRole('button', { name: /^Delete note/ }).click()
      await ask(page).getByRole('button', { name: 'Delete' }).click()
      await expect(edited).toHaveCount(0)
    })

    test('a failing save keeps the words and says so; two clicks save once; a click outside closes', async ({ page }) => {
      await openFlow(page, cookie, look)
      let posts = 0
      let broken = true
      await page.route(/\/annotations$/, async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        posts++
        if (broken) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'broken' }) })
        await new Promise((r) => setTimeout(r, 400))
        return route.continue()
      })
      await openNotes(page)
      await sheet(page).getByRole('button', { name: 'Add a note' }).click()
      const words = `outage ${look.width} ${Date.now()}`
      await form(page).getByRole('textbox').fill(words)
      await form(page).getByRole('button', { name: 'Add note' }).click()
      // The server said no: the dialog stays with what was typed, and a message says why.
      await expect(page.locator('[data-toast], .toast, [role=status], [role=alert]').filter({ hasText: /\S/ }).first()).toBeVisible()
      await expect(form(page)).toBeVisible()
      await expect(form(page).getByRole('textbox')).toHaveValue(words)
      // It works the next time, and a double click makes one note.
      broken = false
      posts = 0
      await form(page).getByRole('button', { name: 'Add note' }).dblclick()
      await expect(form(page)).toHaveCount(0)
      expect(posts).toBe(1)
      const row = sheet(page).locator('.irow', { hasText: words })
      await expect(row).toBeVisible()
      await row.getByRole('button', { name: /^Delete note/ }).click()
      await ask(page).getByRole('button', { name: 'Delete' }).click()
      await expect(row).toHaveCount(0)
      // The backdrop is the mouse's way out.
      await page.locator('.xscrim.on').click({ position: { x: 5, y: 5 } })
      await expect(sheet(page)).toHaveCount(0)
    })
  })
}

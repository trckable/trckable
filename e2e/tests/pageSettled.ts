import { expect, type Page } from '@playwright/test'

// The cards under the cards ask for their data only once the page's own reads are
// done (1.5 s), so a page keeps growing for a while after the chart shows. Waits
// until its height has been the same for 2.5 s, and returns it.
export async function pageSettled(page: Page): Promise<number> {
  let height = 0
  let since = Date.now()
  await expect
    .poll(
      async () => {
        const h = await page.evaluate(() => document.documentElement.scrollHeight)
        if (h !== height) {
          height = h
          since = Date.now()
        }
        return Date.now() - since
      },
      { timeout: 30_000, intervals: [250] },
    )
    .toBeGreaterThanOrEqual(2500)
  return height
}

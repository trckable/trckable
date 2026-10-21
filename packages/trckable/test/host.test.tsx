// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://site.com/pricing"}
import { expect, it, vi } from 'vitest'

// The Next.js install's two steps (install + layout) rely on this: a given
// host is posted to directly, with no proxy route on the site.
it('posts to the given host directly, with no /api/e route on the site', async () => {
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  const urls: string[] = []
  globalThis.fetch = vi.fn(async (u: any) => {
    urls.push(String(u))
    return new Response(null, { status: 202 })
  }) as any
  const { init } = await import('../src/index')
  init({ site: 'tkb_test', host: 'https://stats.site.com' })
  await new Promise((r) => setTimeout(r, 0))
  expect(urls[0]).toBe('https://stats.site.com/api/e')
})

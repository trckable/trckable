// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://site.com/pricing?app=1"}
import { expect, it, vi } from 'vitest'

it('knows an app visit by the app option, inApp() and the ?app=1 marker', async () => {
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  const sent: any[] = []
  globalThis.fetch = vi.fn(async (_u: any, init: any) => {
    sent.push(JSON.parse(init.body))
    return new Response(null, { status: 202 })
  }) as any

  const api = await import('../src/index')
  expect(typeof api.inApp).toBe('function')
  api.init({ site: 'tkb_test', host: 'https://stats.site.com', app: true })
  api.inApp()
  api.pageview()
  await new Promise((r) => setTimeout(r, 0))

  const pvs = sent.filter((e) => e.k === 'pv')
  expect(pvs.length).toBeGreaterThan(0)
  for (const pv of pvs) {
    expect(pv.ap).toBe(1)
    expect(pv.u).toBe('https://site.com/pricing') // the marker is not sent on
  }
  const react = await import('../src/react')
  expect(typeof react.inApp).toBe('function')
})

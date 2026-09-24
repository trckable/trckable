// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://site.com/pricing"}
import { expect, it, vi } from 'vitest'
import { StrictMode, act } from 'react'
import { createRoot } from 'react-dom/client'

it('starts exactly one tracker under StrictMode and replays calls made before init', async () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  // happy-dom reports itself as automated, which the tracker rightly ignores.
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  const sent: any[] = []
  globalThis.fetch = vi.fn(async (_u: any, init: any) => {
    sent.push(JSON.parse(init.body))
    return new Response(null, { status: 202 })
  }) as any

  const { Analytics, track } = await import('../src/react')
  track('clicked_before_init', { from: 'hero' }) // queued until <Analytics /> mounts

  const el = document.createElement('div')
  document.body.appendChild(el)
  await act(async () => {
    createRoot(el).render(
      <StrictMode>
        <Analytics site="tkb_test" host="https://stats.site.com/" />
        <Analytics site="tkb_test" host="https://stats.site.com/" />
      </StrictMode>,
    )
  })
  await new Promise((r) => setTimeout(r, 0))

  const pvs = sent.filter((e) => e.k === 'pv')
  expect(pvs).toHaveLength(1) // StrictMode double effects + two components → one tracker
  expect(sent.find((e) => e.k === 'g')).toMatchObject({ n: 'clicked_before_init', p: { from: 'hero' } })
  expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://stats.site.com/api/e')
})

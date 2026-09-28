// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://site.com/pricing"}
//
// The other tests import the TypeScript sources, where vitest supplies the
// tracker's feature flags. What people install is dist/, built by build.mjs —
// and a flag left undefined there is an identifier no browser can resolve, so
// the first pageview throws and the app records nothing. That happened. These
// two tests read the built files, which is the only way to catch it.
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

const FILES = ['index', 'react', 'next', 'next-client', 'server', 'cli']

it('leaves no build-time flag in the published files', () => {
  for (const f of FILES) {
    // import.meta.url is the page URL under happy-dom, so the path is taken
    // from the working directory (the package root) instead.
    const js = readFileSync(`${process.cwd()}/dist/${f}.js`, 'utf8')
    expect([...js.matchAll(/__[A-Z][A-Z_]*__/g)].map((m) => m[0]), `dist/${f}.js`).toEqual([])
  }
})

it('records a pageview when the built bundle is the one that runs', async () => {
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  const sent: any[] = []
  globalThis.fetch = vi.fn(async (_u: any, init: any) => {
    sent.push(JSON.parse(init.body))
    return { status: 202 } as Response
  }) as any
  const { init } = await import('../dist/index.js')
  init({ site: 'tkb_test', host: 'https://stats.site.com' })
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ s: 'tkb_test', k: 'pv', u: 'https://site.com/pricing' })
})

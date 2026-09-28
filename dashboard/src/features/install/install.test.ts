import { describe, expect, it } from 'vitest'
import { METHODS, type Ctx } from '../../lib/install'
import { aiPrompt } from './copy'
import { outcomeOf } from './outcome'
import { docsFor, methodOf, stepsFor, TABS, tagFor } from './snippet'
import { keyTarget, moreItems, tabsFor } from './tabs'
import { BACKOFF_MS, nextLook, RECHECK_MS } from './useInstallCheck'

const ctx: Ctx = { host: 'https://stats.example.com', site: 'tkb_abcdefghijkl', domain: 'shop.example', proxyKey: 'pk_secret' }
const off = { ...ctx, cookieless: false }
const on = { ...ctx, cookieless: true }
const all = (m: string, c: Ctx) => stepsFor(methodOf(m), c).map((s) => s.code).join('\n')

describe('snippets', () => {
  it('writes the script tag one attribute a line, with the site and its domain', () => {
    expect(tagFor(ctx)).toBe(
      [
        '<script',
        '  defer',
        '  data-site="tkb_abcdefghijkl"',
        '  data-domain="shop.example"',
        '  src="https://stats.example.com/js/tkb_abcdefghijkl.js">',
        '</script>',
      ].join('\n'),
    )
  })

  it('leaves every script-loading snippet identical in cookieless mode: the server applies it', () => {
    for (const m of METHODS.filter((x) => !x.bundled)) {
      expect(all(m.id, on), m.id).toBe(all(m.id, off))
      expect(all(m.id, on), m.id).not.toContain('cookieless')
    }
  })

  it('writes cookieless into bundled installs, which never load the server script', () => {
    expect(all('react', on)).toContain('<Analytics site="tkb_abcdefghijkl" host="https://stats.example.com" cookieless />')
    expect(all('next', on)).toContain('<Analytics site="tkb_abcdefghijkl" cookieless />')
    for (const id of ['vue', 'svelte', 'app']) expect(all(id, on), id).toContain("cookieless: true")
    for (const m of METHODS.filter((x) => x.bundled)) expect(all(m.id, off), m.id).not.toContain('cookieless')
  })

  it('numbers the steps where there are several: npm is install, then initialise', () => {
    const steps = stepsFor(methodOf('react'), ctx)
    expect(steps.map((s) => s.code.split('\n')[0])).toEqual(['npm i trckable', "import { Analytics } from 'trckable/react'"])
    expect(stepsFor(methodOf('next'), ctx)).toHaveLength(4)
    expect(stepsFor(methodOf('script'), ctx)).toHaveLength(1)
  })

  it('links every method to a docs page', () => {
    for (const m of METHODS) expect(docsFor(m), m.id).toMatch(/^https:\/\/trckable\.com\/docs\/install\//)
    expect(docsFor(methodOf('wordpress'))).toContain('#wordpress')
  })
})

describe('tabs', () => {
  it('shows Script, Next.js, WordPress and npm/React first, the rest under More…', () => {
    expect([...TABS]).toEqual(['script', 'next', 'wordpress', 'react'])
    expect(tabsFor('script')).toEqual([...TABS])
    const more = moreItems().map((x) => x.id)
    for (const id of TABS) expect(more).not.toContain(id)
    expect(more.length + TABS.length).toBe(METHODS.length)
  })

  it('adds a method picked from More… as a fifth tab', () => {
    expect(tabsFor('shopify')).toEqual([...TABS, 'shopify'])
  })

  it('moves with the arrow keys, wrapping, and jumps with Home and End', () => {
    expect(keyTarget('ArrowRight', 0, 4)).toBe(1)
    expect(keyTarget('ArrowRight', 3, 4)).toBe(0)
    expect(keyTarget('ArrowLeft', 0, 4)).toBe(3)
    expect(keyTarget('Home', 2, 4)).toBe(0)
    expect(keyTarget('End', 0, 5)).toBe(4)
    expect(keyTarget('a', 0, 4)).toBeNull()
  })

  it('falls back to the script tag for a method that does not exist (?method=nope)', () => {
    expect(methodOf('nope').id).toBe('script')
  })
})

describe('AI prompt', () => {
  it('carries the site id, domain, host and the exact snippet', () => {
    const p = aiPrompt(ctx, methodOf('wordpress'))
    expect(p).toContain(tagFor(ctx))
    expect(p).toContain('tkb_abcdefghijkl')
    expect(p).toContain('shop.example')
    expect(p).toContain('https://stats.example.com/shop.example')
    expect(p).toMatch(/Add it once/)
    expect(p).toMatch(/Keep data-site="tkb_abcdefghijkl"/)
    expect(p).toContain('WordPress')
  })

  it('never spells out the proxy key', () => {
    expect(aiPrompt(ctx, methodOf('next'))).not.toContain('pk_secret')
  })

  it('writes cookieless into the bundled instructions only when it is on', () => {
    expect(aiPrompt(on, methodOf('react'))).toContain("cookieless: true")
    expect(aiPrompt(off, methodOf('react'))).not.toContain('cookieless')
  })
})

describe('the check', () => {
  const base = { url: 'https://shop.example/', scripts: 3 }
  it('says exactly what was found', () => {
    expect(outcomeOf({ ...base, found: 'site', via: 'page' }, 'shop.example')).toMatchObject({ kind: 'site', via: undefined })
    expect(outcomeOf({ ...base, found: 'site', via: 'https://shop.example/app.js' }, 'shop.example').via).toContain('shop.example/app.js')
    expect(outcomeOf({ ...base, found: 'none' }, 'shop.example').text).toContain('3 scripts')
    expect(outcomeOf({ ...base, found: 'nosite' }, 'shop.example').kind).toBe('nosite')
    expect(outcomeOf({ ...base, found: 'other' }, 'shop.example').text).toContain('another site')
    expect(outcomeOf({ ...base, error: 'shop.example could not be reached over https' }, 'shop.example').kind).toBe('unreachable')
  })

  it('looks again every 30 s until found, backs off when limited, and stops once a visit lands', () => {
    expect(nextLook({ phase: 'done', result: { ...base, found: 'none' } }, false)).toBe(RECHECK_MS)
    expect(RECHECK_MS).toBe(30_000)
    expect(nextLook({ phase: 'done', result: { ...base, found: 'site' } }, false)).toBeNull()
    expect(nextLook({ phase: 'limited' }, false)).toBe(BACKOFF_MS)
    expect(nextLook({ phase: 'failed' }, false)).toBe(RECHECK_MS)
    expect(nextLook({ phase: 'done', result: { ...base, found: 'none' } }, true)).toBeNull()
    expect(nextLook({ phase: 'idle' }, false)).toBeNull()
  })
})

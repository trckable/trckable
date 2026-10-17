// The logo is drawn in one place (brand/logo.ts) and reached from everywhere else: a header or shell that draws a mark of its
// own (a blob, a copy of the ghost's path, an svg called "logo") is what this fails on.
import { describe, expect, it } from 'vitest'
import { GHOST } from './logo'

const sources = import.meta.glob<string>(['/src/**/*.tsx', '/src/**/*.ts'], { query: '?raw', import: 'default', eager: true })

const drawn = Object.entries(sources).filter(([f]) => !f.includes('/brand/') && !/\.test\.tsx?$/.test(f) && !f.includes('/i18n/locales/'))

describe('the logo', () => {
  it('is found in the sources it is guarded over', () => {
    expect(drawn.length).toBeGreaterThan(300)
  })

  it('is never a copy of the ghost’s path outside brand/logo.ts', () => {
    const copies = drawn.filter(([, s]) => s.includes(GHOST.slice(0, 24))).map(([f]) => f)
    expect(copies, 'these draw the ghost themselves; use ghostSvg() or logoInner() from src/brand/logo').toEqual([])
  })

  it('is never an svg of its own called a logo, nor the old blob', () => {
    const own = drawn.filter(([, s]) => /<svg[^>]*(className|class)=["'{][^>]*\blogo\b/.test(s) || s.includes('M8 26c0-9 5-16 12-16s12 7')).map(([f]) => f)
    expect(own, 'a header or shell draws its own logo; render ghostSvg() / logoInner() from src/brand/logo instead').toEqual([])
  })
})

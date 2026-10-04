import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('./locales/de')
})

/** The page as a browser with this saved choice and these languages opens it. */
const open = (saved: string | null, languages: string[]) => {
  vi.stubGlobal('localStorage', { getItem: () => saved })
  vi.stubGlobal('navigator', { languages, language: languages[0] })
  vi.stubGlobal('document', { documentElement: {} })
}

describe('which language', () => {
  it('follows the saved choice, else the browser, else English', async () => {
    const { pickLang } = await import('./lang')
    const have = ['de', 'fr']
    expect(pickLang('fr', ['de-DE'], have)).toBe('fr')
    expect(pickLang('en', ['de-DE'], have)).toBe('en')
    expect(pickLang(null, ['de-AT', 'en'], have)).toBe('de')
    expect(pickLang('auto', ['fr-CA'], have)).toBe('fr')
    expect(pickLang('xx', ['pt-BR', 'fr'], have)).toBe('fr')
    expect(pickLang(null, ['pt-BR'], have)).toBe('en')
    expect(pickLang(null, [], have)).toBe('en')
  })

  it('takes the browser’s first language that the dashboard speaks, English included', async () => {
    const { pickLang } = await import('./lang')
    expect(pickLang(null, ['en-GB', 'de'], ['de'])).toBe('en')
    expect(pickLang(null, ['nl', 'de'], ['de'])).toBe('de')
  })
})

describe('merge', () => {
  const en = { a: 'Save', n: (k: number) => `${k} items`, list: ['Mon', 'Tue'], deep: { x: 'Close', y: [{ name: 'One' }, { name: 'Two' }] }, url: 'https://example.com' }

  it('puts the language’s words in, key by key, and leaves English where a key is missing', async () => {
    const { merge } = await import('./lazy')
    const out = merge(en, 'ns', { 'ns.a': 'Speichern', 'ns.n': (k: number) => `${k} Elemente`, 'ns.list': ['Mo', 'Di'], 'ns.deep.y.1.name': 'Zwei' }) as typeof en
    expect(out.a).toBe('Speichern')
    expect(out.n(3)).toBe('3 Elemente')
    expect(out.list).toEqual(['Mo', 'Di'])
    expect(out.deep.x).toBe('Close')
    expect(out.deep.y).toEqual([{ name: 'One' }, { name: 'Zwei' }])
    expect(out.url).toBe(en.url)
  })

  it('does not touch the English, and ignores a word of the wrong kind', async () => {
    const { merge } = await import('./lazy')
    const out = merge(en, 'ns', { 'ns.a': ['no'], 'ns.n': 'no', 'ns.list': 'no' }) as typeof en
    expect(out.a).toBe('Save')
    expect(out.n(2)).toBe('2 items')
    expect(out.list).toEqual(['Mon', 'Tue'])
    expect(en.a).toBe('Save')
  })

  it('is the same object for English: nothing to copy, nothing to load', async () => {
    open(null, ['en-US'])
    const { defineCopy, lang } = await import('./index')
    expect(lang).toBe('en')
    expect(defineCopy('ns', en)).toBe(en)
  })
})

describe('loading a language', () => {
  it('waits for the one file before anything reads a word', async () => {
    open('de', ['en-US'])
    vi.doMock('./locales/de', () => ({ default: { 'ns.a': 'Speichern', 'ns.list': ['Mo', 'Di'] } }))
    const { defineCopy, lang, tag } = await import('./index')
    expect(lang).toBe('de')
    expect(tag).toBe('de')
    const words = defineCopy('ns', { a: 'Save', b: 'Cancel', list: ['Mon', 'Tue'] })
    expect(words).toEqual({ a: 'Speichern', b: 'Cancel', list: ['Mo', 'Di'] })
  })

  it('formats with the browser’s own form of the language (de-AT)', async () => {
    open(null, ['de-AT'])
    vi.doMock('./locales/de', () => ({ default: {} }))
    const { tag } = await import('./index')
    expect(tag).toBe('de-AT')
  })

  it('falls back to English when the file cannot be loaded', async () => {
    open('de', ['en-US'])
    vi.doMock('./locales/de', () => {
      throw new Error('offline')
    })
    const { defineCopy } = await import('./index')
    expect(defineCopy('ns', { a: 'Save' })).toEqual({ a: 'Save' })
  })
})

describe('plural', () => {
  it('follows the language: French reads 0 as one, English does not', async () => {
    const { plural } = await import('./helpers')
    const fr = new Intl.PluralRules('fr')
    const en = new Intl.PluralRules('en')
    expect([0, 1, 1.5, 2].map((n) => plural(n, 'visiteur', 'visiteurs', fr))).toEqual(['visiteur', 'visiteur', 'visiteur', 'visiteurs'])
    expect([0, 1, 2].map((n) => plural(n, 'visitor', 'visitors', en))).toEqual(['visitors', 'visitor', 'visitors'])
    expect(plural(1, 'Besucher', 'Besucher', new Intl.PluralRules('de'))).toBe('Besucher')
  })

  it('counts with the number in the language’s digits', async () => {
    open('de', ['de'])
    vi.doMock('./locales/de', () => ({ default: {} }))
    const { count, int, pct, dayLabel } = await import('./helpers')
    expect(count(1, 'Besucher', 'Besucher')).toBe('1 Besucher')
    expect(int(1234567)).toBe('1.234.567')
    expect(pct(0.123, 1)).toMatch(/^12,3\s%$/)
    expect(dayLabel('2026-10-04', { weekday: true })).toMatch(/^So\.?,? 4\. Okt/)
  })
})

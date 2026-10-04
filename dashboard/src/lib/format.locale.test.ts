import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('../i18n/locales/de')
  vi.doUnmock('../i18n/locales/fr')
})

const open = (lang: string) => {
  vi.stubGlobal('localStorage', { getItem: () => lang })
  vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' })
  vi.stubGlobal('document', { documentElement: {} })
  vi.doMock(`../i18n/locales/${lang}`, () => ({ default: {} }))
}

describe('numbers, money and dates follow the language', () => {
  it('writes them as English always has, in English', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'en' })
    const { fmtInt, fmtPct, fmtMoney, fmtFixed, fmtRatio } = await import('../lib/format')
    const { fmtDay, fmtRange } = await import('../lib/dates')
    expect(fmtInt(1234567)).toBe('1,234,567')
    expect(fmtPct(0.123)).toBe('12%')
    expect(fmtRatio(0.0123, 2)).toBe('1.23%')
    expect(fmtFixed(3.14159, 1)).toBe('3.1')
    expect(fmtMoney(123456, 'USD', 2)).toBe('$1,235')
    expect(fmtDay('2026-10-04', { weekday: true, year: true })).toBe('Sun, Oct 4, 2026')
    expect(fmtRange({ from: '2026-10-01', to: '2026-10-04' }, '2026-10-05')).toBe('Oct 1 – 4')
  })

  it('writes them in German: separators, currency, percentages, days', async () => {
    open('de')
    const { fmtInt, fmtPct, fmtMoney, fmtFixed, fmtRatio, delta } = await import('../lib/format')
    const { fmtDay, fmtRange, monthLong, dayShort } = await import('../lib/dates')
    expect(fmtInt(1234567)).toBe('1.234.567')
    expect(fmtPct(0.123)).toMatch(/^12\s%$/)
    expect(fmtRatio(0.0123, 2)).toMatch(/^1,23\s%$/)
    expect(fmtFixed(3.14159, 1)).toBe('3,1')
    expect(fmtMoney(123456, 'EUR', 2, { cents: true })).toMatch(/^1\.234,56\s€$/)
    expect(fmtDay('2026-10-04', { weekday: true })).toMatch(/^So\.?,? 4\. Okt/)
    expect(fmtRange({ from: '2026-10-01', to: '2026-10-04' }, '2026-10-05')).toMatch(/1\.\s?[–-]\s?4\. Okt/)
    expect(monthLong[2]).toBe('März')
    expect(dayShort[0]).toMatch(/^Mo/)
    expect(delta(128, 100)?.short).toMatch(/^28% ↑$/)
    expect(delta(105, 100)?.short).toBe('5,0% ↑')
  })

  it('names countries and months in the language', async () => {
    open('fr')
    const { countryName } = await import('../lib/format')
    const { fmtDay } = await import('../lib/dates')
    expect(countryName('DE')).toBe('Allemagne')
    expect(fmtDay('2026-10-04')).toMatch(/4 oct/)
  })
})

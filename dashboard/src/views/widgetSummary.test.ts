import { describe, expect, it } from 'vitest'
import { EMPTY_LOOK } from './widgetKinds'
import { brandSummary, languageSummary, lookSummary, placeSummary } from './widgetSummary'

describe('the one line a closed section shows', () => {
  it('names the theme, the colour and the corners', () => {
    expect(lookSummary(EMPTY_LOOK)).toBe('Look · Auto · lime · Rounded')
    expect(lookSummary({ ...EMPTY_LOOK, theme: 'dark', accent: '#facc15', radius: 4 })).toBe('Look · Dark · yellow · Square')
  })
  it('names the placement', () => {
    expect(placeSummary('inline')).toBe('Placement · Inline')
    expect(placeSummary('bl')).toBe('Placement · Corner ↙')
  })
  it('counts the words that were changed, ignoring blanks', () => {
    expect(languageSummary(EMPTY_LOOK)).toBe('Language & texts · Auto · default texts')
    expect(languageSummary({ ...EMPTY_LOOK, lang: 'de', texts: { online: 'da', few: ' ' } })).toBe('Language & texts · Deutsch · 1 text changed')
    expect(languageSummary({ ...EMPTY_LOOK, texts: { a: 'x', b: 'y' } })).toBe('Language & texts · Auto · 2 texts changed')
  })
  it('says whether the credit shows', () => {
    expect(brandSummary(EMPTY_LOOK)).toBe('Brand · shown')
    expect(brandSummary({ ...EMPTY_LOOK, brand: false })).toBe('Brand · hidden')
  })
})

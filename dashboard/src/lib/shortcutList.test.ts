import { describe, expect, it } from 'vitest'
import { ACTIONS } from './shortcutList'

describe('the shortcut list', () => {
  it('names the keys of the page as it is: L and B switch, E is Explore, the palette is Peek', () => {
    const by = Object.fromEntries(ACTIONS.map((a) => [a.id, a.def]))
    expect(by.live).toBe('l')
    expect(by.briefing).toBe('b')
    expect(by.explore).toBe('e')
    expect(by.ask).toBe('mod+k')
    expect(by.settings).toBe(',')
    expect(by.filter).toBe('/')
    expect(by.share).toBe('shift+s')
  })

  it('gives no two actions one key, and none of the old Data page', () => {
    const keys = ACTIONS.map((a) => a.def)
    expect(new Set(keys).size).toBe(keys.length)
    expect(ACTIONS.map((a) => a.label).join('|')).not.toMatch(/Features|Core|Data/)
  })
})

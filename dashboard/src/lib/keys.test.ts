import { describe, expect, it } from 'vitest'
import { caps, comboOf, keyFor, loadKeymap, pressed } from './keys'
import { ACTIONS, takenBy } from './shortcutList'

// The tests run without a browser: a key press is its fields, and the keymap's
// change event goes to a bare EventTarget.
;(globalThis as { window?: EventTarget }).window ??= new EventTarget()
const press = (key: string, o: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; code?: string } = {}) =>
  ({ key, code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o }) as KeyboardEvent

describe('keymap', () => {
  it('names a press the way the keymap stores it', () => {
    expect(comboOf(press('K', { metaKey: true }))).toBe('mod+k')
    expect(comboOf(press('/', { shiftKey: true, code: 'Slash' }))).toBe('?')
    expect(comboOf(press('ArrowLeft'))).toBe('arrowleft')
    expect(comboOf(press('Shift'))).toBe('')
  })

  it('uses the defaults until a person changes one', () => {
    loadKeymap({})
    expect(pressed(press('t'), 'period.today')).toBe(true)
    loadKeymap({ 'period.today': 'd' })
    expect(pressed(press('t'), 'period.today')).toBe(false)
    expect(pressed(press('d'), 'period.today')).toBe(true)
    expect(keyFor('compare')).toBe('c')
  })

  it('knows which action a key already belongs to', () => {
    loadKeymap({})
    expect(takenBy('c', 'mode')?.id).toBe('compare')
    expect(takenBy('c', 'compare')).toBeUndefined()
    expect(takenBy('q', 'mode')).toBeUndefined()
  })

  it('drops actions that no longer exist', () => {
    loadKeymap({ gone: 'x' })
    expect(takenBy('x', 'mode')).toBeUndefined()
  })

  it('tells Shift S from S', () => {
    loadKeymap({})
    expect(comboOf(press('S', { shiftKey: true }))).toBe('shift+s')
    expect(pressed(press('S', { shiftKey: true }), 'share')).toBe(true)
    expect(pressed(press('s'), 'share')).toBe(false)
    // Shift on a letter is not the plain letter's action.
    expect(pressed(press('S', { shiftKey: true }), 'site')).toBe(false)
    expect(pressed(press('s'), 'site')).toBe(true)
    // A symbol already says it is shifted: ? stays ?, and , and / are themselves.
    expect(comboOf(press('?', { shiftKey: true, code: 'Slash' }))).toBe('?')
    expect(pressed(press(','), 'settings')).toBe(true)
    expect(pressed(press('/'), 'filter')).toBe(true)
    // Command or Control with a letter is never the plain letter.
    expect(pressed(press('s', { metaKey: true }), 'site')).toBe(false)
  })

  it('gives no two actions the same key by default, and none a key the page already uses', () => {
    loadKeymap({})
    const seen = new Map<string, string>()
    for (const a of ACTIONS) {
      expect(seen.get(a.def), `${a.id} and ${seen.get(a.def)} share ${a.def}`).toBeUndefined()
      seen.set(a.def, a.id)
    }
    // Esc closes what is open, [ and ] set Replay's speed, Tab and Enter belong to the page's own controls.
    for (const reserved of ['escape', '[', ']', 'tab', 'enter', 'space']) expect(seen.has(reserved)).toBe(false)
    // The ones this round added, and the periods they sit beside.
    expect(['site', 'user', 'settings', 'filter', 'share', 'replay'].map(keyFor)).toEqual(['s', 'u', ',', '/', 'shift+s', 'r'])
    expect(keyFor('period.now')).toBe('n')
    expect(keyFor('period.mtd')).toBe('m')
  })

  it('names every action in words and puts it in a group the list draws', () => {
    expect(new Set(ACTIONS.map((a) => a.label)).size).toBe(ACTIONS.length)
    expect(new Set(ACTIONS.map((a) => a.group))).toEqual(new Set(['around', 'page', 'period']))
  })

  it('refuses a key an action already has, Shift S included', () => {
    loadKeymap({})
    expect(takenBy('shift+s', 'mode')?.id).toBe('share')
    expect(takenBy('s', 'share')?.id).toBe('site')
    expect(takenBy('r', 'replay')).toBeUndefined()
  })

  it('draws arrows and letters as keycaps', () => {
    expect(caps('arrowright')).toEqual(['→'])
    expect(caps('mod+k').at(-1)).toBe('K')
    expect(caps('shift+s')).toHaveLength(2)
    expect(caps('shift+s').at(-1)).toBe('S')
  })
})

import { describe, expect, it } from 'vitest'
import { caps, comboOf, keyFor, loadKeymap, pressed, takenBy } from './keys'

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

  it('draws arrows and letters as keycaps', () => {
    expect(caps('arrowright')).toEqual(['→'])
    expect(caps('mod+k').at(-1)).toBe('K')
  })
})

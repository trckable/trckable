import { describe, expect, it } from 'vitest'
import { keyFor, loadKeymap, pressed } from '../../lib/keys'
import { readView, writeView } from '../../lib/url'

;(globalThis as { window?: EventTarget }).window ??= new EventTarget()

describe('Live in the address bar', () => {
  it('is ?view=live, and absent means Data', () => {
    expect(readView(new URLSearchParams('view=live')).live).toBe(true)
    expect(readView(new URLSearchParams('')).live).toBeUndefined()
    expect(readView(new URLSearchParams('view=data')).live).toBeUndefined()
  })

  it('keeps the rest of the view, so Data comes back as it was', () => {
    const q = 'view=live&period=7d&f=channel%3ASearch&mode=full'
    const v = readView(new URLSearchParams(q))
    expect(v).toMatchObject({ live: true, period: '7d', mode: 'full', filters: [{ dim: 'channel', value: 'Search' }] })
    expect(writeView(v)).toBe('?' + q)
    expect(writeView({ ...v, live: undefined })).toBe('?period=7d&f=channel%3ASearch&mode=full')
  })

  it('answers to L by default, and to whatever key a person picks', () => {
    loadKeymap({})
    expect(keyFor('live')).toBe('l')
    const press = (metaKey = false) => ({ key: 'l', code: 'KeyL', metaKey, ctrlKey: false, altKey: false, shiftKey: false }) as KeyboardEvent
    const l = press()
    expect(pressed(l, 'live')).toBe(true)
    expect(pressed(press(true), 'live')).toBe(false) // ⌘L is the browser's
    loadKeymap({ live: 'v' })
    expect(pressed(l, 'live')).toBe(false)
    loadKeymap({})
  })
})

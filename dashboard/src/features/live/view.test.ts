import { describe, expect, it } from 'vitest'
import { keyFor, loadKeymap, pressed } from '../../lib/keys'
import { readView, setView, wantsLive, writeView } from '../../lib/url'

;(globalThis as { window?: EventTarget }).window ??= new EventTarget()

describe('Live in the address bar', () => {
  it('is ?view=live or ?view=data, and absent says nothing', () => {
    expect(readView(new URLSearchParams('view=live')).live).toBe(true)
    expect(readView(new URLSearchParams('view=data')).live).toBe(false)
    expect(readView(new URLSearchParams('')).live).toBeUndefined()
  })

  it('writes Data only when nothing else in the address says Data', () => {
    const bare = readView(new URLSearchParams(''))
    expect(writeView({ ...bare, live: false })).toBe('?view=data')
    expect(writeView({ ...bare, live: false, period: '7d' })).toBe('?period=7d')
    expect(writeView({ ...bare, live: true })).toBe('?view=live')
    expect(writeView(bare)).toBe('')
  })

  it('opens a site that has had visits in Live, unless the address says otherwise', () => {
    const at = (q: string) => readView(new URLSearchParams(q))
    const visited = { last_event_at: 1_700_000_000 }
    expect(wantsLive(at(''), visited)).toBe(true)
    expect(wantsLive(at('account=profile'), visited)).toBe(true) // not a view parameter
    expect(wantsLive(at('view=data'), visited)).toBe(false)
    expect(wantsLive(at('view=live'), visited)).toBe(true)
    // What only Data has: a link made before, or a saved view, stays Data.
    for (const q of ['period=7d', 'mode=full', 'f=channel%3ASearch', 'compare=none', 'compare=year', 'day=2026-09-01', 'metric=revenue']) expect(wantsLive(at(q), visited), q).toBe(false)
    // No visit yet: the install screen first, in Data.
    expect(wantsLive(at(''), { last_event_at: 0 })).toBe(false)
    expect(wantsLive(at(''), {})).toBe(false)
    expect(wantsLive(at('view=live'), { last_event_at: 0 })).toBe(true) // the address still asks; liveShown holds it back
  })

  it('keeps the rest of the view, so Data comes back as it was', () => {
    const q = 'view=live&period=7d&f=channel%3ASearch&mode=full'
    const v = readView(new URLSearchParams(q))
    expect(v).toMatchObject({ live: true, period: '7d', mode: 'full', filters: [{ dim: 'channel', value: 'Search' }] })
    expect(writeView(v)).toBe('?' + q)
    expect(writeView({ ...v, live: undefined })).toBe('?period=7d&f=channel%3ASearch&mode=full')
  })

  it('keeps saying Data when a change takes the last other thing out of the address', () => {
    const g = globalThis as unknown as { location: { pathname: string; search: string }; history: { pushState: (a: unknown, b: string, to: string) => void; replaceState: (a: unknown, b: string, to: string) => void } }
    const went: string[] = []
    g.history = { pushState: (_a, _b, to) => void went.push(to), replaceState: (_a, _b, to) => void went.push(to) }
    const from = (search: string) => {
      g.location = { pathname: '/example.com', search }
    }
    from('?period=7d')
    setView({ period: '30d' })
    from('?f=channel%3ASearch')
    setView({ filters: [] })
    from('?view=live')
    setView({ live: false })
    from('?period=7d')
    setView({ period: '30d', live: true })
    expect(went).toEqual(['/example.com?view=data', '/example.com?view=data', '/example.com?view=data', '/example.com?view=live'])
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

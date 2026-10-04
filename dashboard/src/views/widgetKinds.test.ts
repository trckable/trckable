import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Widget, WidgetLook } from '../lib/apiMore'
import { EMPTY_LOOK, LANGS, MODES, TEXT_FIELDS, cornerCode, defaultName, frameCode, hasOldCode, modeOf, partsOf, placeOf, previewUrl, size, snippet, withPlace } from './widgetKinds'

const look = (patch: Partial<WidgetLook>): WidgetLook => ({ ...EMPTY_LOOK, ...patch })
const widget = (patch: Partial<Widget> = {}): Widget => ({ ...EMPTY_LOOK, name: 'x', id: 'w_abc', site_id: 'tkb_s', on: true, created_at: 0, kind: 'online', shows: ['spark'], ...patch })

describe('the online design', () => {
  it('reads its mode from its parts', () => {
    expect(modeOf([])).toBe('pill')
    expect(modeOf(['spark'])).toBe('spark')
    expect(modeOf(['card', 'pages'])).toBe('card')
    expect(MODES.map((m) => modeOf(m.shows))).toEqual(['pill', 'spark', 'card'])
  })

  it('has lists only in the card, and sizes its frame per mode', () => {
    expect(partsOf(look({ kind: 'online', shows: [] }))).toEqual([])
    expect(partsOf(look({ kind: 'online', shows: ['spark'] }))).toEqual([])
    expect(partsOf(look({ kind: 'online', shows: ['card'] })).map((p) => p.id)).toEqual(['pages', 'countries'])
    expect(size(look({ kind: 'online', shows: [] }))).toEqual({ w: 180, h: 44 })
    expect(size(look({ kind: 'online', shows: ['spark'] }))).toEqual({ w: 230, h: 44 })
    const card = size(look({ kind: 'online', shows: ['card'] }))
    const more = size(look({ kind: 'online', shows: ['card', 'pages', 'countries'] }))
    expect(more.h - card.h).toBe(208)
  })

  it('names the unnamed after its mode', () => {
    expect(defaultName(look({ kind: 'online', shows: [] }))).toBe('Online pill')
    expect(defaultName(look({ kind: 'online', shows: ['spark'] }))).toBe('Online pill + graph')
    expect(defaultName(look({ kind: 'online', shows: ['card'] }))).toBe('Online card')
    expect(defaultName(look({ kind: 'revenue' }))).toBe('Open revenue')
  })
})

describe('the code for a page', () => {
  it('is a frame, or for the online design a script tag for a corner', () => {
    const w = widget()
    expect(frameCode('https://t.example', w, 'site.com')).toContain('<iframe src="https://t.example/w/w_abc" width="230" height="44"')
    // The loader that sets the height comes with it, and a pill only shrinks to fit.
    expect(frameCode('https://t.example', w, 'site.com')).toContain('max-width:100%')
    expect(frameCode('https://t.example', w, 'site.com')).toContain('<script async src="https://t.example/js/w.js"></script>')
    expect(frameCode('https://t.example', widget({ kind: 'live', shows: [] }), 'site.com')).toContain('width:100%;max-width:320px')
    expect(cornerCode('https://t.example', w)).toBe('<script async src="https://t.example/js/w_abc.online.js"></script>')
    expect(snippet('https://t.example', w, 'site.com', 'br')).toBe(cornerCode('https://t.example', w))
    // The corner is kept with the widget, not in the pasted tag.
    expect(withPlace(['spark'], 'bl')).toEqual(['spark', 'left'])
    expect(withPlace(['spark', 'left'], 'br')).toEqual(['spark', 'right'])
    expect(withPlace(['left'], 'inline')).toEqual([])
    expect(placeOf(['card', 'left'])).toBe('bl')
    expect(snippet('https://t.example', w, 'site.com', 'inline')).toBe(frameCode('https://t.example', w, 'site.com'))
    // Another design floats in a fixed box, still without a script.
    expect(snippet('https://t.example', widget({ kind: 'live', shows: [] }), 'site.com', 'bl')).toContain('position:fixed;left:16px')
  })
})

describe('old embed code', () => {
  it('is suspected only for a widget made before the loader', () => {
    expect(hasOldCode(widget({ created_at: 1_700_000_000 }))).toBe(true)
    expect(hasOldCode(widget({ created_at: 1_800_000_000 }))).toBe(false)
  })
})

describe('language and wording in the preview', () => {
  it('carries the language and only the texts that are set, encoded', () => {
    const url = new URL('https://x.example' + previewUrl('tkb_a b', look({ kind: 'counter', lang: 'de', texts: { now: '{n} hier & <jetzt>', empty: '' } })))
    expect(url.pathname).toBe('/api/v1/sites/tkb_a%20b/widgets/preview')
    expect(url.searchParams.get('lang')).toBe('de')
    expect(url.searchParams.get('text.now')).toBe('{n} hier & <jetzt>')
    expect(url.searchParams.has('text.empty')).toBe(false)
  })

  it('offers the languages the server has files for', () => {
    expect(LANGS.map((l) => l.id).sort()).toEqual(['auto', 'de', 'en', 'es', 'fr', 'it', 'nl', 'pt', 'sq'])
  })
})

// The dashboard's table of rewordable labels is the server's: the same keys per
// design, and the English defaults it shows as placeholders are the English
// messages.
describe('the rewordable labels match the server', () => {
  const serverDir = new URL('../../../server/internal/', import.meta.url)
  const en = JSON.parse(readFileSync(new URL('api/widgetlang/en.json', serverDir), 'utf8')) as Record<string, string>
  const src = readFileSync(new URL('store/sqlite/widgets.go', serverDir), 'utf8')
  const block = /var WidgetTexts = map\[string\]map\[string\]string\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? ''
  const server: Record<string, Record<string, string>> = {}
  for (const line of block.split('\n')) {
    const m = /^\s*"(\w+)":\s*\{(.*)\},?$/.exec(line)
    if (!m) continue
    server[m[1]] = Object.fromEntries([...m[2].matchAll(/"(\w+)":\s*"(\w+)"/g)].map((p) => [p[1], p[2]]))
  }

  it('has the same designs, keys and messages', () => {
    expect(Object.keys(server).sort()).toEqual(Object.keys(TEXT_FIELDS).sort())
    for (const [kind, fields] of Object.entries(TEXT_FIELDS)) {
      expect(Object.fromEntries(fields.map((f) => [f.key, f.msg]))).toEqual(server[kind])
    }
  })

  it('shows the English defaults', () => {
    for (const f of Object.values(TEXT_FIELDS).flat()) expect(f.def).toBe(en[f.msg])
  })
})

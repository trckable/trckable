// The registry is the one answer to "what does this module put on screen":
// every module the server offers is in it, and turning one off takes every
// one of its entry points away — and nothing that belongs to another.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ON, MODULES, createItems, isOn, settingsModule, shows, type EntryPoints, type Mods } from './modules'

const goSource = readFileSync(new URL('../../../server/internal/modules/modules.go', import.meta.url), 'utf8')
// Each module in the server's list starts with {ID: "…" and runs to the next
// one; "On: true" inside it makes it on by default.
const entries = goSource.split('{ID: "').slice(1)
const serverModules = entries.map((e) => ({ id: e.slice(0, e.indexOf('"')), on: /\bOn: true\b/.test(e) }))

const allOn: Mods = Object.fromEntries(Object.keys(MODULES).map((id) => [id, true]))
const without = (id: string): Mods => ({ ...allOn, [id]: false })
const kinds: (keyof EntryPoints)[] = ['create', 'cards', 'filters', 'tabs', 'settings']

describe('module registry', () => {
  it('lists exactly the modules the server offers', () => {
    expect(serverModules.length).toBeGreaterThan(10)
    expect(Object.keys(MODULES).sort()).toEqual(serverModules.map((m) => m.id).sort())
  })

  it('has the same defaults as the server', () => {
    for (const m of serverModules) expect([m.id, DEFAULT_ON[m.id] === true]).toEqual([m.id, m.on])
  })

  it('makes Funnels and Notes real modules, on by default', () => {
    expect(isOn(null, 'funnels')).toBe(true)
    expect(isOn(null, 'notes')).toBe(true)
  })

  it('never offers a site in the Create menu', () => {
    expect(createItems(allOn)).toEqual(['goal', 'funnel', 'note'])
  })

  describe.each(Object.keys(MODULES))('%s off', (id) => {
    const off = without(id)
    const mine = MODULES[id]

    it.each(kinds)('removes its %s', (kind) => {
      for (const name of mine[kind] ?? []) {
        expect(shows(allOn, kind, name)).toBe(true)
        expect(shows(off, kind, name)).toBe(false)
      }
    })

    it('keeps every other module’s entry points', () => {
      for (const other of Object.keys(MODULES).filter((o) => o !== id)) {
        for (const kind of kinds) for (const name of MODULES[other][kind] ?? []) expect(shows(off, kind, name)).toBe(true)
      }
    })

    it('drops its Create entries and nothing else', () => {
      const gone = mine.create ?? []
      expect(createItems(off)).toEqual(createItems(allOn).filter((c) => !gone.includes(c)))
    })

    it('owns its settings sections', () => {
      for (const tab of mine.settings ?? []) expect(settingsModule(tab)).toBe(id)
    })
  })

  it('shows core entry points whatever is off', () => {
    const none: Mods = {}
    expect(shows(none, 'filters', 'channel')).toBe(true)
    expect(shows(none, 'cards', 'sources')).toBe(true)
    expect(createItems(none)).toEqual([])
  })
})

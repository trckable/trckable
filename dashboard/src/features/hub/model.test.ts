import { describe, expect, it } from 'vitest'
import { MODULES } from '../../lib/modules'
import { ICONS } from './icons'
import { canOpen, canToggle, matches, statusOf } from './model'
import { FEATURES, GROUPS, ownerOnly } from './registry'
import { words } from './words'

const by = (id: string) => {
  const f = FEATURES.find((x) => x.id === id)
  if (!f) throw new Error(id)
  return f
}

describe('the feature list', () => {
  it('has every module the registry knows, once each', () => {
    const listed = FEATURES.flatMap((f) => (f.module ? [f.module] : []))
    expect([...listed].sort()).toEqual(Object.keys(MODULES).sort())
  })

  it('has each feature once, with a group, a name, a line and a picture', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length)
    for (const f of FEATURES) {
      expect(GROUPS).toContain(f.group)
      const w = (words as Record<string, { name: string; line: string }>)[f.id]
      expect(w?.name, f.id).toBeTruthy()
      expect(w?.line, f.id).toBeTruthy()
      expect(ICONS[f.id], f.id).toBeDefined()
    }
    expect(Object.keys(words).sort()).toEqual(FEATURES.map((f) => f.id).sort())
  })

  it('has something in every group', () => {
    for (const g of GROUPS) expect(FEATURES.some((f) => f.group === g)).toBe(true)
  })
})

describe('the status of a card', () => {
  it('follows the module, built in without one, server-set with nowhere to open', () => {
    expect(statusOf(by('heatmaps'), { heatmaps: false })).toBe('off')
    expect(statusOf(by('heatmaps'), { heatmaps: true })).toBe('on')
    expect(statusOf(by('goals'), null)).toBe('on') // the default while loading
    expect(statusOf(by('live'), {})).toBe('builtIn')
    expect(statusOf(by('sso'), {})).toBe('server')
  })
})

describe('who may switch a module', () => {
  it('an owner switches a module and nothing else; a viewer switches nothing', () => {
    for (const f of FEATURES) {
      expect(canToggle(f, false), f.id).toBe(false)
      expect(canToggle(f, true), f.id).toBe(f.module !== undefined)
    }
  })

  it('a viewer is not offered an owner’s settings, an owner is', () => {
    expect(ownerOnly(by('widgets'))).toBe(true)
    expect(canOpen(by('widgets'), { owner: false, mods: {} })).toBe(false)
    expect(canOpen(by('widgets'), { owner: true, mods: {} })).toBe(true)
  })

  it('a module that is off has nowhere to open yet, and a feature with no place has none', () => {
    expect(canOpen(by('map'), { owner: true, mods: { map: false } })).toBe(false)
    expect(canOpen(by('map'), { owner: true, mods: { map: true } })).toBe(true)
    expect(canOpen(by('sso'), { owner: true, mods: {} })).toBe(false)
  })
})

describe('the search', () => {
  it('matches any part of the text, in any case, and everything when empty', () => {
    expect(matches('Heatmaps Where people click', 'CLICK')).toBe(true)
    expect(matches('Heatmaps Where people click', ' ')).toBe(true)
    expect(matches('Heatmaps Where people click', 'funnel')).toBe(false)
  })
})

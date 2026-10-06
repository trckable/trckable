// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import FeaturesDialog from './FeaturesDialog'
import { FEATURES } from './registry'
import { hasUnseen } from './seen'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const state = vi.hoisted(() => ({ owner: true }))
vi.mock('../../lib/me', () => ({ canChange: () => state.owner }))
vi.mock('./useFeatureMods', () => ({ useFeatureMods: () => ({ mods: { heatmaps: false, map: true }, busy: '', set: () => Promise.resolve(true) }) }))
vi.mock('./open', () => ({ needsSite: () => false, openWhere: () => undefined }))

const site = { id: 'tkb_a', domain: 'shop.example' } as Site
let root: Root
let host: HTMLDivElement
const draw = () => act(() => root.render(<FeaturesDialog site={site} user="a@b.c" onClose={() => undefined} />))
const cards = () => [...document.querySelectorAll('.feat')]
const type = (v: string) =>
  act(() => {
    const input = document.querySelector('input[type="search"]')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- applied to the input below
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!(input instanceof HTMLInputElement) || !set) throw new Error('no search box')
    Reflect.apply(set, input, [v]) // React listens for the native setter
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

describe('the Features pop-up', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    state.owner = true
  })
  afterEach(() => {
    act(() => root.unmount())
    document.body.replaceChildren() // the dialog's fading copy too
    localStorage.clear()
  })

  it('has a card for every feature, a dialog with a name, and counts them as seen', () => {
    expect(hasUnseen('a@b.c')).toBe(true)
    draw()
    expect(cards()).toHaveLength(FEATURES.length)
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBeTruthy()
    expect(hasUnseen('a@b.c')).toBe(false)
  })

  it('gives an owner a switch for each module, and Try it on one that is off', () => {
    draw()
    expect(document.querySelectorAll('[role="switch"]')).toHaveLength(FEATURES.filter((f) => f.module).length)
    expect(document.querySelector('#feat-heatmaps .tag')?.textContent).toBe('Try it')
    expect(document.querySelector('#feat-map .tag')?.textContent).toBe('On')
  })

  it('gives a viewer the status and no switch', () => {
    state.owner = false
    draw()
    expect(document.querySelectorAll('[role="switch"]')).toHaveLength(0)
    expect(document.querySelector('#feat-heatmaps .tag')?.textContent).toBe('Off')
    expect(document.querySelector('#feat-widgets button')).toBeNull() // an owner's settings are not offered
    expect(document.querySelector('#feat-live button')).not.toBeNull()
  })

  it('searches by name, line and group', () => {
    draw()
    type('heat')
    expect(cards().map((c) => c.id)).toEqual(['feat-heatmaps'])
    type('share')
    expect(cards().length).toBeGreaterThan(1)
    type('zzzz')
    expect(cards()).toHaveLength(0)
    expect(document.querySelector('.feat-none')).not.toBeNull()
  })
})

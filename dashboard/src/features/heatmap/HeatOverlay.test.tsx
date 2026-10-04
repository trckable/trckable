// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true, "handleDisabledFileLoadingAsSuccess": true } }
// (the frame is only checked for what it is told, never loaded)
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError, type Site } from '../../lib/api'
import type { HeatMap } from './api'
import { exampleHeat } from './model'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const asked: string[] = []
let answer: HeatMap | Error = exampleHeat(1280)
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  heatApi: {
    map: vi.fn((_site: string, _q: unknown, path: string, width: number) => {
      asked.push(`${path}@${width}`)
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve({ ...answer, path })
    }),
    ask: vi.fn(),
  },
}))

import HeatOverlay from './HeatOverlay'

const site = { id: 's1', domain: 'site.com' } as Site
let root: Root
let host: HTMLDivElement
const settle = () =>
  act(async () => {
    await Promise.resolve()
  })
const mount = async (node: React.ReactNode) => {
  act(() => root.render(node))
  await settle()
  await settle()
}
const must = <T,>(el: T | null | undefined): T => {
  if (!el) throw new Error('not on the page')
  return el
}
const dialog = () => must(document.body.querySelector('[role=dialog]'))
const q = (sel: string) => dialog().querySelector<HTMLElement>(sel)
const button = (label: string) => must(dialog().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`))
const press = async (label: string) => {
  act(() => button(label).click())
  await settle()
}

beforeEach(() => {
  asked.length = 0
  answer = exampleHeat(1280)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the heatmap overlay', () => {
  it('shows a page in a frame that runs nothing, with its clicks laid over it', async () => {
    await mount(<HeatOverlay site={site} path="/pricing" query={{ from: '2026-09-01', to: '2026-09-30' }} onClose={() => undefined} />)
    expect(asked).toEqual(['/pricing@0'])
    const frame = must(q('iframe'))
    expect(frame.getAttribute('src')).toBe('https://site.com/pricing')
    // sandbox with no tokens at all: no scripts, no forms, no same-origin
    expect(frame.getAttribute('sandbox')).toBe('')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(dialog().querySelectorAll('.heat-dots circle[fill="url(#heat-glow)"]').length).toBe(exampleHeat(1280).clicks.length)
    expect(dialog().querySelectorAll('.heat-dead').length).toBeGreaterThan(0)
    expect(dialog().querySelectorAll('.heat-rage').length).toBeGreaterThan(0)
  })

  it('names the elements and the form fields, never a person', async () => {
    await mount(<HeatOverlay site={site} path="/" query={{ from: 'a', to: 'b' }} onClose={() => undefined} />)
    const side = must(q('.heat-side')).textContent
    expect(side).toContain('a.cta')
    expect(side).toContain('email')
    expect(side).toContain('company')
  })

  it('switches the width and asks again for it', async () => {
    await mount(<HeatOverlay site={site} path="/" query={{ from: 'a', to: 'b' }} onClose={() => undefined} />)
    answer = { ...exampleHeat(390), width: 390 }
    await press('Phone')
    expect(asked).toEqual(['/@0', '/@390'])
    expect(button('Phone').getAttribute('aria-pressed')).toBe('true')
  })

  it('disables a width nothing was counted at', async () => {
    answer = { ...exampleHeat(1280), widths: [{ width: 390, views: 0 }, { width: 768, views: 0 }, { width: 1280, views: 9 }] }
    await mount(<HeatOverlay site={site} path="/" query={{ from: 'a', to: 'b' }} onClose={() => undefined} />)
    expect(button('Phone').disabled).toBe(true)
    expect(button('Tablet').disabled).toBe(true)
    expect(button('Desktop').disabled).toBe(false)
  })

  it('hides a layer when its button is pressed, and the page itself', async () => {
    await mount(<HeatOverlay site={site} path="/" query={{ from: 'a', to: 'b' }} onClose={() => undefined} />)
    await press('Clicks')
    expect(dialog().querySelectorAll('.heat-dots circle[fill="url(#heat-glow)"]').length).toBe(0)
    expect(q('.heat-scroll')).toBeNull() // off to begin with
    await press('How far down')
    expect(q('.heat-scroll')).not.toBeNull()
    await press('The page')
    expect(q('iframe')).toBeNull()
  })

  it('says so when nothing was counted', async () => {
    answer = { ...exampleHeat(1280), views: 0, clicks: [], dead: [], rage: [], elements: [], fields: [] }
    await mount(<HeatOverlay site={site} path="/" query={{ from: 'a', to: 'b' }} onClose={() => undefined} />)
    expect(dialog().textContent).toContain('Nothing counted')
    expect(q('.heat-stage, .heat-room')).toBeNull()
  })

  it('says why when it cannot be loaded', async () => {
    answer = new APIError(404, 'the heatmaps module is off for this site')
    await mount(<HeatOverlay site={site} path="/" query={{ from: 'a', to: 'b' }} onClose={() => undefined} />)
    expect(dialog().textContent).toContain('Not found')
  })

  it('draws an example without asking the server, and says it is one', async () => {
    await mount(<HeatOverlay site={site} path="/" query={{ from: 'a', to: 'b' }} demo onClose={() => undefined} />)
    expect(asked).toEqual([])
    expect(dialog().textContent).toContain('Example data')
    expect(q('iframe')).toBeNull() // no page of anyone's is loaded for an example
    expect(q('.heat-sample')).not.toBeNull()
  })

  it('closes', async () => {
    const onClose = vi.fn()
    await mount(<HeatOverlay site={site} path="/" query={{ from: 'a', to: 'b' }} demo onClose={onClose} />)
    await press('Close')
    expect(onClose).toHaveBeenCalled()
  })
})

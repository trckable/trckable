// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamSquare } from './TeamSquare'

const teams = (current: string) => ({
  list: [
    { id: 'p', name: 'Personal' },
    { id: 's', name: 'Studio Kalendar' },
    { id: 'k', name: 'Kiosk' },
  ],
  current,
  onPick: () => {},
  onManage: () => {},
})

describe('the team square', () => {
  it('shows the initial of the team in view, with its name for a reader, and the list shut', () => {
    const html = renderToStaticMarkup(<TeamSquare teams={teams('s')} />)
    expect(html).toContain('aria-label="Studio Kalendar"')
    expect(html).toContain('>S</span>')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Manage teams')
  })

  it('draws a team’s own mark in place of its initial', () => {
    const own = { ...teams('p'), list: [{ id: 'p', name: 'Personal', mark: (size: number) => <i className="own-mark" data-size={size} /> }] }
    const html = renderToStaticMarkup(<TeamSquare teams={own} />)
    expect(html).toContain('own-mark')
    expect(html).not.toContain('>P</span>')
  })

  it('shows one team’s square even when it is the only one', () => {
    const one = { ...teams('p'), list: [{ id: 'p', name: 'Personal' }] }
    expect(renderToStaticMarkup(<TeamSquare teams={one} />)).toContain('>P</span>')
  })
})

// Arranging: the build gives onReorder, and the list shows grips and moves by drag or Alt + ↑/↓.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | null = null
let host: HTMLElement | null = null

function open(onReorder?: (ids: string[]) => void) {
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => root?.render(<TeamSquare teams={{ ...teams('p'), onReorder }} />))
  act(() => host?.querySelector<HTMLElement>('.team-btn')?.click())
  return host
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
})

const rowOf = (h: HTMLElement, id: string) => h.querySelector<HTMLElement>(`[data-team="${id}"]`) as HTMLElement
const press = (el: Element, type: string, y: number, target: EventTarget = el) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientY: y, button: 0 }))

describe('arranging the teams', () => {
  it('shows no grips without onReorder', () => {
    const h = open()
    expect(h.querySelectorAll('.grip')).toHaveLength(0)
    expect(h.querySelectorAll('[data-team]')).toHaveLength(3)
  })

  it('moves a team with Alt + ↓ / ↑ and says where it went', () => {
    const saved = vi.fn()
    const h = open(saved)
    expect(h.querySelectorAll('.grip')).toHaveLength(3)
    const key = (id: string, k: string) => act(() => void rowOf(h, id).querySelector('.mi')?.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: true, bubbles: true, cancelable: true })))
    key('p', 'ArrowDown')
    expect(saved).toHaveBeenLastCalledWith(['s', 'p', 'k'])
    expect(h.querySelector('[aria-live]')?.textContent).toBe('Moved Personal to position 2')
    key('k', 'ArrowUp')
    expect(saved).toHaveBeenLastCalledWith(['p', 'k', 's'])
    saved.mockClear()
    key('p', 'ArrowUp') // already first
    expect(saved).not.toHaveBeenCalled()
  })

  it('drags a team to a new place, and Escape puts it back', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }))
    const saved = vi.fn()
    const h = open(saved)
    const box = h.querySelector<HTMLElement>('.team-rows') as HTMLElement
    ;['p', 's', 'k'].forEach((id, i) => {
      rowOf(h, id).getBoundingClientRect = () => ({ top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, width: 200 }) as DOMRect
    })
    box.getBoundingClientRect = () => ({ top: 0, bottom: 120, height: 120, left: 0, width: 200 }) as DOMRect
    const grab = (y0: number, y1: number) => {
      act(() => void press(rowOf(h, 'p'), 'pointerdown', y0, rowOf(h, 'p').querySelector('.mi') as Element))
      act(() => void press(document.body, 'pointermove', y1, document))
    }
    grab(20, 110) // over the lower half of the third row: last
    expect(rowOf(h, 'p').className).toContain('dragging')
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    act(() => void press(document.body, 'pointerup', 110, document))
    expect(saved).not.toHaveBeenCalled()
    expect(rowOf(h, 'p').className).not.toContain('dragging')
    grab(20, 110)
    act(() => void press(document.body, 'pointerup', 110, document))
    expect(saved).toHaveBeenCalledWith(['s', 'k', 'p'])
  })
})

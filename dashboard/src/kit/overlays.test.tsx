/* eslint-disable react/jsx-no-literals -- test fixtures: sample words */
// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal, Popover, Segmented, Sheet, Tooltip } from './index'
import { hearFrames } from './Modal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})
const key = (k: string, target: EventTarget = document) => act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })))

describe('Segmented', () => {
  it('moves the choice with the arrow keys and wraps', () => {
    const seen: string[] = []
    const opts = [{ value: 'd', label: 'D' }, { value: 'w', label: 'W' }, { value: 'm', label: 'M' }]
    act(() => root.render(<Segmented options={opts} value="m" onChange={(v) => seen.push(v)} />))
    const m = host.querySelector<HTMLElement>('[aria-checked=true]') as HTMLElement
    key('ArrowRight', m)
    key('ArrowLeft', m)
    expect(seen).toEqual(['d', 'w'])
  })
})

describe('Tooltip', () => {
  it('opens on focus, describes its trigger, and Escape closes it', () => {
    act(() => root.render(<Tooltip text="Why">{(p) => <button type="button" {...p}>i</button>}</Tooltip>))
    const b = host.querySelector('button') as HTMLButtonElement
    act(() => b.focus())
    expect(host.querySelector('[role=tooltip]')?.textContent).toBe('Why')
    expect(b.getAttribute('aria-describedby')).toBe((host.querySelector('[role=tooltip]') as HTMLElement).id)
    key('Escape')
    expect(host.querySelector('[role=tooltip]')).toBeNull()
  })
})

describe('Modal', () => {
  it('closes on Escape, and gives focus back to what had it', () => {
    const onClose = vi.fn()
    function Page() {
      return (
        <>
          <button type="button" id="opener">open</button>
          <Modal label="Dialog" onClose={onClose}>
            <button type="button">inside</button>
          </Modal>
        </>
      )
    }
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    act(() => root.render(<Page />))
    expect(document.querySelector('[role=dialog]')).not.toBeNull()
    key('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => root.render(<div />))
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
  it('hears Escape pressed inside a same-origin frame, and skips one it cannot reach', () => {
    const box = document.createElement('div')
    const ok = document.createElement('iframe')
    const foreign = document.createElement('iframe')
    const doc = new EventTarget()
    Object.defineProperty(ok, 'contentWindow', { get: () => ({ document: doc }) })
    Object.defineProperty(ok, 'contentDocument', { get: () => doc })
    Object.defineProperty(foreign, 'contentWindow', {
      get: () => {
        throw new Error('cross-origin')
      },
    })
    box.append(ok, foreign)
    document.body.append(box)
    const esc = vi.fn()
    const stop = hearFrames(box, esc)
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(esc).toHaveBeenCalledTimes(1)
    stop()
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(esc).toHaveBeenCalledTimes(1)
    box.remove()
  })
})

describe('Sheet', () => {
  it('is a labelled dialog with a grab handle', () => {
    act(() => root.render(<Sheet label="Filters" onClose={() => {}}>content</Sheet>))
    expect(document.querySelector('[role=dialog][aria-label=Filters]')).not.toBeNull()
    expect(document.querySelector('.kit-grab')).not.toBeNull()
  })
})

describe('Popover', () => {
  it('opens on click, Escape closes it and focus returns to the trigger', () => {
    act(() =>
      root.render(
        <Popover label="Pick" trigger={(p) => <button type="button" {...p}>go</button>}>
          {() => <button type="button" data-nav>one</button>}
        </Popover>,
      ),
    )
    const t = host.querySelector('button') as HTMLButtonElement
    act(() => t.click())
    expect(document.querySelector('[role=dialog][aria-label=Pick]')).not.toBeNull()
    key('Escape')
    expect(document.querySelector('[role=dialog][aria-label=Pick]')).toBeNull()
    expect(document.activeElement).toBe(t)
  })
  it('closes on a click outside', () => {
    act(() =>
      root.render(
        <Popover label="Pick" trigger={(p) => <button type="button" {...p}>go</button>}>
          {() => <button type="button" data-nav>one</button>}
        </Popover>,
      ),
    )
    act(() => (host.querySelector('button') as HTMLButtonElement).click())
    act(() => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    expect(document.querySelector('[role=dialog][aria-label=Pick]')).toBeNull()
  })
})

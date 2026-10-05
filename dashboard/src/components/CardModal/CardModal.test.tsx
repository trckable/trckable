// @vitest-environment happy-dom
import { Bot } from 'lucide-react'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CardModal } from './CardModal'
import { Bars, busiest, Spark } from './parts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function Page() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" id="opener" onClick={() => setOpen(true)}>
        {'Details'}
      </button>
      {open && (
        <CardModal label="Story" kind={{ icon: <Bot size={14} />, label: 'AI & Search', tint: 'var(--ch-6)' }} when={{ text: 'Oct 1 – Oct 7', title: 'This period' }} title="12" onClose={() => setOpen(false)}>
          <Bars label="rows" rows={[{ key: 'a', label: 'A', n: 10 }, { key: 'b', label: 'B', n: 5 }]} />
          <Spark values={[1, 3, 2]} label="by day" hl={busiest([1, 3, 2])} />
          <button type="button" id="inner">
            {'Inner'}
          </button>
        </CardModal>
      )}
    </>
  )
}

describe('the card dialog shell', () => {
  it('is a modal dialog with the kind, when, title and a Close of its own', () => {
    act(() => root.render(<Page />))
    act(() => document.getElementById('opener')?.click())
    const dlg = (document.body.querySelector('[role="dialog"]') as HTMLElement)
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.getAttribute('aria-label')).toBe('Story')
    expect(dlg.querySelector('.cm-kind')?.textContent).toBe('AI & Search')
    expect(dlg.querySelector('.cm-when')?.textContent).toBe('Oct 1 – Oct 7')
    expect(dlg.querySelector('.cm-title')?.textContent).toBe('12')
    expect(dlg.querySelector('.cm-actions button')?.textContent).toBe('Close')
  })
  it('scales the bars to the biggest and names the chart', () => {
    act(() => root.render(<Page />))
    act(() => document.getElementById('opener')?.click())
    const bars = [...document.body.querySelectorAll<HTMLElement>('[role="dialog"] .cm-bars i')].map((i) => i.style.width)
    expect(bars).toEqual(['100%', '50%'])
    expect(document.body.querySelector('[role="dialog"] svg[role="img"]')?.getAttribute('aria-label')).toBe('by day')
    expect(busiest([1, 3, 2])).toBe(1)
  })
  it('keeps Tab inside, and Escape closes it and gives focus back to the button that opened it', () => {
    act(() => root.render(<Page />))
    const opener = document.getElementById('opener') as HTMLButtonElement
    opener.focus()
    act(() => opener.click())
    const dlg = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dlg.contains(document.activeElement)).toBe(true)
    const last = [...dlg.querySelectorAll<HTMLElement>('button')].pop() as HTMLElement
    last.focus()
    act(() => {
      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(dlg.contains(document.activeElement)).toBe(true)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})

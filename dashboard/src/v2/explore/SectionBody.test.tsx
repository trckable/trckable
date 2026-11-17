// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { XCtx } from './ctx'
import type { TabData } from './data/useExplore'
import type { Loaded } from './data/useLoad'
import { SectionBody } from './SectionBody'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./views/Tables', () => ({ Tables: ({ d }: { d: { n: number } }) => <p>{`figure ${d.n}`}</p> }))

const x = {} as XCtx
const ok = (n: number): Loaded<TabData> => ({ state: 'ok', data: { n } as unknown as TabData })

describe('the section while its numbers are read', () => {
  it('shows a loading shape and none of the old figures when the period changes', () => {
    const box = document.createElement('div')
    const root = createRoot(box)
    act(() => root.render(<SectionBody tab="pages" x={x} r={ok(30)} still />))
    expect(box.textContent).toContain('figure 30')
    act(() => root.render(<SectionBody tab="pages" x={x} r={{ state: 'loading' }} still />))
    expect(box.textContent).not.toContain('figure')
    expect(box.querySelector('.xhold .xsk')).not.toBeNull()
    act(() => root.render(<SectionBody tab="pages" x={x} r={ok(90)} still />))
    expect(box.textContent).toContain('figure 90')
    expect(box.querySelector('.xsk')).toBeNull()
    act(() => root.unmount())
  })
})

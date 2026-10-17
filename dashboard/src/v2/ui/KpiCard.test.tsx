// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Kcs, type Kc } from './KpiCard'
import { whyUsual } from '../briefing/why'

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

const card = (o: Partial<Kc>): Kc => ({ key: 'people', icon: 'people', label: 'People', val: '931', note: { t: '+29% vs usual', up: true }, vals: [1, 2, 3], ...o })

describe('the number\'s Why?', () => {
  it('opens the days it is told against for that number, and closes again', () => {
    const why = whyUsual({ label: 'People', now: 931, weeks: [{ day: 'a', visitors: 684 }, { day: 'b', visitors: 733 }], weekday: 'Friday', at: '16:30' })
    act(() => root.render(<Kcs items={[card({ why }), card({ key: 'pages', label: 'Pages', val: '4', note: { t: 'steady' } })]} />))
    const btn = host.querySelector<HTMLButtonElement>('button[title="Why?"]') as HTMLButtonElement
    expect(host.querySelectorAll('button[title="Why?"]')).toHaveLength(1)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    act(() => btn.click())
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    const said = host.querySelector('.hw.show')?.textContent ?? ''
    expect(said).toContain('931')
    expect(said).toContain('684, 733')
    expect(said).toContain('Friday')
    expect(btn.closest('.kc')?.querySelector('.hw.show')).not.toBeNull()
    act(() => btn.click())
    expect(host.querySelector('.hw.show')).toBeNull()
  })
})

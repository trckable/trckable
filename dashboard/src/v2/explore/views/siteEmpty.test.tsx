// @vitest-environment happy-dom
// Speed with nothing measured: switched off, an owner gets the switch; switched on, only the wait; a viewer keeps the line.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mods = vi.hoisted(() => ({ value: null as Record<string, boolean> | null }))
vi.mock('../../../lib/useMods', () => ({ useMods: () => mods.value }))
const runSetup = vi.hoisted(() => vi.fn())
vi.mock('../../live/setupLinks', () => ({ runSetup }))

import { setRole } from '../../../lib/me'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { Speed as SpeedModel } from '../types'
import { Speed } from './Site'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const x = { site: { id: 's1', domain: 'site.com' }, limit: 5, showAll: vi.fn() } as unknown as XCtx
const none: SpeedModel = { kcs: [], pages: [], devices: [] }
let root: Root
let host: HTMLDivElement
const show = () => act(() => root.render(<Speed x={x} d={none} />))

beforeEach(() => {
  runSetup.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Speed with nothing measured', () => {
  it('off: an owner gets the button that turns it on', () => {
    setRole('owner')
    mods.value = { vitals: false }
    show()
    expect(host.textContent).toContain(copy.speedOff)
    const go = [...host.querySelectorAll('button')].find((b) => b.textContent === copy.turnOnSpeed)
    expect(go).toBeDefined()
    act(() => go?.click())
    expect(runSetup).toHaveBeenCalledWith(x.site, 'speed')
  })

  it('on: the wait for visits, no button', () => {
    setRole('owner')
    mods.value = { vitals: true }
    show()
    expect(host.textContent).toContain(copy.emptySpeed)
    expect(host.querySelector('button')).toBeNull()
  })

  it('off: a viewer sees the line and no button', () => {
    setRole('viewer')
    mods.value = { vitals: false }
    show()
    expect(host.textContent).toContain(copy.emptySpeed)
    expect(host.querySelector('button')).toBeNull()
  })
})

// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import FeaturesDialog from './FeaturesDialog'
import { hasUnseen } from './seen'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../views/ScriptRecords', () => ({ ScriptRecords: () => <section id="script-records" /> }))

const site = { id: 'tkb_a', domain: 'shop.example' } as Site
let root: Root
let host: HTMLDivElement

describe('the Tracking options pop-up', () => {
  afterEach(() => {
    act(() => root.unmount())
    document.body.replaceChildren()
    localStorage.clear()
  })

  it('is a named dialog holding What the script records, and counts the list as seen', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    expect(hasUnseen('a@b.c')).toBe(true)
    act(() => root.render(<FeaturesDialog site={site} user="a@b.c" onClose={() => undefined} />))
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Tracking options')
    expect(document.querySelector('.feat-body #script-records')).not.toBeNull()
    expect(hasUnseen('a@b.c')).toBe(false)
  })
})

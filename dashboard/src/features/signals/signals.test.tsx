// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.fn<(text: string, kind: string) => void>()
const chime = vi.fn<() => void>()
vi.mock('../../components/Toast', () => ({ toast: (text: string, kind: string) => toast(text, kind) }))
vi.mock('./chime', () => ({ chime: () => chime() }))

import { NotifyAsk } from './NotifyAsk'
import { pref, setPref } from './prefs'
import { useSaleToast } from './useSaleToast'
import { useTabCount } from './useTabCount'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const draw = (ui: React.ReactNode) => act(() => root.render(ui))
const sale = (id: number, amount = 1200) => ({ id, kind: 'sale' as const, ts: id, amount, currency: 'USD', exponent: 2 })

function Tab({ n }: { n: number | null }) {
  useTabCount(n)
  return null
}
function Sales({ sales }: { sales: ReturnType<typeof sale>[] }) {
  useSaleToast(sales)
  return null
}

beforeEach(() => {
  localStorage.clear()
  toast.mockClear()
  chime.mockClear()
  document.head.innerHTML = '<title>trckable</title><link rel="icon" type="image/svg+xml" href="/favicon.svg">'
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, text: () => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"></svg>') }))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('the count in the tab', () => {
  it('puts the count in the title while anyone is on, and takes it away at 0 and on the way out', () => {
    draw(<Tab n={8} />)
    expect(document.title).toBe('● 8 · trckable')
    draw(<Tab n={0} />)
    expect(document.title).toBe('trckable')
    draw(<Tab n={3} />)
    expect(document.title).toBe('● 3 · trckable')
    act(() => root.unmount())
    expect(document.title).toBe('trckable')
    root = createRoot(host)
  })
  it('puts a dot on the icon while anyone is on, and gives the plain icon back', async () => {
    const icon = () => document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? ''
    const plain = icon()
    await act(async () => {
      draw(<Tab n={8} />)
      await Promise.resolve()
    })
    expect(icon()).toMatch(/^data:image\/svg\+xml,/)
    expect(decodeURIComponent(icon())).toContain('<circle')
    await act(async () => {
      draw(<Tab n={0} />)
      await Promise.resolve()
    })
    expect(icon()).toBe(plain)
  })
  it('is off when the person turned it off', () => {
    setPref('tab', false)
    draw(<Tab n={8} />)
    expect(document.title).toBe('trckable')
  })
  it('is on until it is turned off; the sound and the notices are off until they are turned on', () => {
    expect([pref('tab'), pref('sound'), pref('notify')]).toEqual([true, false, false])
  })
})

describe('a sale', () => {
  it('is a coin toast with the amount, once, and the chime only for someone who asked for it', () => {
    draw(<Sales sales={[]} />)
    draw(<Sales sales={[sale(1)]} />)
    expect(toast).toHaveBeenCalledWith('Cha-ching! +$12.00', 'sale')
    expect(chime).not.toHaveBeenCalled()
    draw(<Sales sales={[sale(1)]} />)
    expect(toast).toHaveBeenCalledTimes(1)
    setPref('sound', true)
    draw(<Sales sales={[sale(2, 4900), sale(1)]} />)
    expect(toast).toHaveBeenLastCalledWith('Cha-ching! +$49.00', 'sale')
    expect(chime).toHaveBeenCalledTimes(1)
  })
  it('tells a burst with at most three toasts, oldest first, and one chime', () => {
    setPref('sound', true)
    draw(<Sales sales={[5, 4, 3, 2, 1].map((i) => sale(i, i * 100))} />)
    expect(toast.mock.calls.map((c) => c[0])).toEqual(['Cha-ching! +$3.00', 'Cha-ching! +$4.00', 'Cha-ching! +$5.00'])
    expect(chime).toHaveBeenCalledTimes(1)
  })
})

describe('the question about notices', () => {
  const ask = vi.fn(() => Promise.resolve('granted' as NotificationPermission))
  const stub = (permission: NotificationPermission) => vi.stubGlobal('Notification', Object.assign(function Notification() {}, { permission, requestPermission: ask }))
  beforeEach(() => ask.mockClear())

  it('is a side card after a sale, and never asks the browser until the button is pressed', async () => {
    stub('default')
    draw(<NotifyAsk sold={false} />)
    expect(document.body.querySelector('.side-card')).toBeNull()
    draw(<NotifyAsk sold />)
    const card = document.body.querySelector('.side-card')
    expect(card?.textContent).toContain('Get notified?')
    expect(ask).not.toHaveBeenCalled()
    await act(async () => {
      ;(card?.querySelector('.btn.primary') as HTMLButtonElement).click()
      await Promise.resolve()
    })
    expect(ask).toHaveBeenCalledTimes(1)
    expect(pref('notify')).toBe(true)
  })
  it('leaves a blocked browser alone, and an answered question, and one put away', () => {
    stub('denied')
    draw(<NotifyAsk sold />)
    expect(document.body.querySelector('.side-card')).toBeNull()
    stub('granted')
    draw(<NotifyAsk sold />)
    expect(document.body.querySelector('.side-card')).toBeNull()
    stub('default')
    localStorage.setItem('trckable:card:notify:*', '1')
    draw(<NotifyAsk sold />)
    expect(document.body.querySelector('.side-card')).toBeNull()
  })
})

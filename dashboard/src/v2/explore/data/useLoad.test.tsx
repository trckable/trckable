// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { useLoad } from './useLoad'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const asks: ((n: number) => void)[] = []

function Figure({ k }: { k: string }) {
  const r = useLoad<number>(k, () => new Promise<number>((resolve) => asks.push(resolve)), true)
  return <p>{r.state === 'ok' ? `n=${r.data}` : r.state}</p>
}

const box = document.createElement('div')
const root = createRoot(box)
const text = () => box.textContent
const show = (k: string) => {
  act(() => root.render(<Figure k={k} />))
}
const answer = async (n: number) => {
  await act(async () => {
    asks.pop()?.(n)
    await Promise.resolve()
  })
}

afterEach(() => {
  act(() => root.render(null))
  asks.length = 0
})

describe('a read for a key', () => {
  it('shows nothing of the old period at once when the period changes, then the new numbers', async () => {
    show('site|30d')
    expect(text()).toBe('loading')
    await answer(30)
    expect(text()).toBe('n=30')
    show('site|90d')
    expect(text()).toBe('loading')
    await answer(90)
    expect(text()).toBe('n=90')
  })

  it('keeps the numbers on screen while the same period is read again', async () => {
    show('site|30d')
    await answer(30)
    act(() => {
      window.dispatchEvent(new Event('trckable:refresh'))
    })
    expect(asks).toHaveLength(1)
    expect(text()).toBe('n=30')
    await answer(31)
    expect(text()).toBe('n=31')
  })
})

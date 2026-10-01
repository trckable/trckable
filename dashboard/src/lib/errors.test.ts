import { afterEach, describe, expect, it, vi } from 'vitest'
import { APIError, refused } from './api'
import { answerCode, fail, hostIsUp } from '../components/toastBus'
import { friendly, words } from './errors'

describe('friendly', () => {
  it('never shows the server own text', () => {
    const f = friendly(new APIError(400, 'UNIQUE constraint failed: sites.domain'))
    expect(f?.text).toBe('Something went wrong')
  })

  it('says what kind of failure it was', () => {
    expect(words(new TypeError('Failed to fetch'))).toBe("Can't reach the server")
    expect(words(new APIError(401, 'x'))).toBe('Please sign in again')
    expect(words(new APIError(403, 'x'))).toBe('Not allowed')
    expect(words(new APIError(404, 'x'))).toBe('Not found')
    expect(words(new APIError(413, 'x'))).toBe('That file is too large')
    expect(words(new APIError(429, 'x'))).toBe('Too many tries · Wait a moment')
    expect(words(new APIError(503, 'x'))).toBe('Server busy · Try again')
  })

  it('is a warning for a busy server and an error for a refusal', () => {
    expect(friendly(new APIError(429, 'x'))?.kind).toBe('warning')
    expect(friendly(new APIError(500, 'x'))?.kind).toBe('warning')
    expect(friendly(new APIError(403, 'x'))?.kind).toBe('error')
  })

  it('has nothing to say about a request that was cancelled', () => {
    expect(friendly(new DOMException('aborted', 'AbortError'))).toBeNull()
    expect(words(new DOMException('aborted', 'AbortError'))).toBe('')
  })

  it('lets a code be taught its own answer, and only that code', () => {
    answerCode('quota', () => ({ text: 'Limit reached', kind: 'warning', action: { label: 'See limits', run: () => {} } }))
    const f = friendly(Object.assign(new APIError(409, 'x'), { code: 'quota' }))
    expect(f?.text).toBe('Limit reached')
    expect(f?.kind).toBe('warning')
    expect(f?.action?.label).toBe('See limits')
    expect(friendly(Object.assign(new APIError(409, 'x'), { code: 'other' }))?.text).toBe('Something went wrong')
  })
})

describe('refused', () => {
  it('is a wrong answer, not a broken server', () => {
    expect(refused(new APIError(403, 'x'))).toBe(true)
    expect(refused(new APIError(500, 'x'))).toBe(false)
    expect(refused(new TypeError('x'))).toBe(false)
  })
})

describe('fail', () => {
  const sent: { error?: unknown; retry?: () => void }[] = []
  const bus = new EventTarget()
  vi.stubGlobal('window', bus)
  bus.addEventListener('trckable:toast', (e) => sent.push((e as CustomEvent).detail as (typeof sent)[number]))
  hostIsUp()
  afterEach(() => (sent.length = 0))

  it('hands the failure to the host, with Retry only when it can try again', () => {
    const boom = new APIError(500, 'boom')
    const again = () => {}
    fail(boom)
    fail(boom, again)
    expect(sent.map((s) => [s.error, s.retry])).toEqual([
      [boom, undefined],
      [boom, again],
    ])
  })
})

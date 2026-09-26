import { afterEach, describe, expect, it, vi } from 'vitest'
import { setManaged, signedOutPage } from './managed'

// The tests run without a browser: the page's address is a stand-in.
describe('signedOutPage', () => {
  afterEach(() => {
    setManaged(undefined)
    vi.unstubAllGlobals()
  })

  it('is the own sign-in page when self-hosted', () => {
    expect(signedOutPage()).toBe('/login')
  })

  it('tells the provider to end its session too', () => {
    vi.stubGlobal('location', { href: 'https://cloud.trckable.com/example.com' })
    setManaged('https://cloud.trckable.com/login')
    expect(signedOutPage()).toBe('https://cloud.trckable.com/login?signedout=1')
  })

  it('keeps what the provider page already carries', () => {
    vi.stubGlobal('location', { href: 'https://cloud.trckable.com/' })
    setManaged('https://cloud.trckable.com/login?from=dashboard')
    expect(signedOutPage()).toBe('https://cloud.trckable.com/login?from=dashboard&signedout=1')
  })
})

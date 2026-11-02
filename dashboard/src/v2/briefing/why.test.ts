import { describe, expect, it } from 'vitest'
import { whyDown } from './why'

describe('why', () => {
  it('an outage is said in the check\'s own words, or honestly unknown', () => {
    expect(whyDown({ domain: 'x.com', cause: 'DNS name not found', minutes: 5, ongoing: true }).cause).toBe('x.com stopped answering: DNS name not found.')
    expect(whyDown({ domain: 'x.com', minutes: 5, ongoing: false }).cause).toContain('cannot say why')
  })
})

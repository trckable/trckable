import { describe, expect, it } from 'vitest'
import { first } from './firstCopy'
import { gaStartUrl } from './gaImport'

describe('importing from Google Analytics', () => {
  it('starts at the server, for one site, with its id escaped', () => {
    expect(gaStartUrl('abc123')).toBe('/api/v1/sites/abc123/ga/start')
    expect(gaStartUrl('a/b c')).toBe('/api/v1/sites/a%2Fb%20c/ga/start')
  })

  it('says every code the server can leave, and never the provider\'s own words', () => {
    const errors: Record<string, string> = first.importDialog.google.errors
    for (const code of ['failed', 'denied', 'quota', 'expired']) expect(errors[code]).toBeTruthy()
  })
})

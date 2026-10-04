import { describe, expect, it } from 'vitest'
import { copy } from '../overview/copy'
import { first } from './firstCopy'
import { gaStartUrl } from './gaImport'

describe('importing from Google Analytics', () => {
  it('starts at the server, for one site, with its id escaped', () => {
    expect(gaStartUrl('abc123')).toBe('/api/v1/sites/abc123/ga/start')
    expect(gaStartUrl('a/b c')).toBe('/api/v1/sites/a%2Fb%20c/ga/start')
  })

  it('says every code the server can leave, and never the provider\'s own words', () => {
    for (const code of ['failed', 'denied', 'quota', 'expired']) expect(first.importDialog.google.errors[code]).toBeTruthy()
  })

  it('names the imported period on one day or many', () => {
    expect(copy.importedRange('2024-01-01', '2024-01-01')).toBe('2024-01-01')
    expect(copy.importedRange('2024-01-01', '2024-03-01')).toBe('2024-01-01 – 2024-03-01')
  })
})

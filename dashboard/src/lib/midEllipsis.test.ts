import { describe, expect, it } from 'vitest'
import { midEllipsis } from './midEllipsis'

describe('midEllipsis', () => {
  it('leaves a short name alone', () => expect(midEllipsis('example.com', 24)).toBe('example.com'))
  it('cuts a long one in the middle, keeping the ending', () => {
    const out = midEllipsis('a-very-long-subdomain-name-for-testing.example.org', 24)
    expect(out).toHaveLength(24)
    expect(out.startsWith('a-very-long')).toBe(true)
    expect(out.endsWith('ple.org')).toBe(true)
    expect(out).toContain('…')
  })
})

import { describe, expect, it } from 'vitest'
import type { Site } from './api'
import { redirectFor, siteForSegment } from './siteRoute'

const sites = [{ id: 'a', domain: 'example.com' }, { id: 'b', domain: 'café.example' }] as Site[]

describe('siteForSegment', () => {
  it('finds a known domain', () => {
    expect(siteForSegment(sites, 'example.com')?.id).toBe('a')
  })
  it('finds none for an unknown domain', () => {
    expect(siteForSegment(sites, 'unknown.example')).toBeNull()
    expect(siteForSegment(sites, '')).toBeNull()
  })
  it('ignores case', () => {
    expect(siteForSegment(sites, 'Example.COM')?.id).toBe('a')
  })
  it('matches an IDN in either spelling', () => {
    expect(siteForSegment(sites, encodeURIComponent('café.example'))?.id).toBe('b')
    expect(siteForSegment(sites, 'xn--caf-dma.example')?.id).toBe('b')
    expect(siteForSegment(sites, 'CAFÉ.example')?.id).toBe('b')
  })
  it('survives a malformed address', () => {
    expect(siteForSegment(sites, '%E0%A4%A')).toBeNull()
  })
})

describe('redirectFor', () => {
  it('sends an unknown address to the first site', () => {
    expect(redirectFor(sites)).toEqual({ path: '/example.com', wizard: false })
  })
  it('opens the first run with no sites, on every kind of server', () => {
    expect(redirectFor([])).toEqual({ path: '/settings', wizard: true })
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { setRole } from '../../lib/me'
import { StatusCard, StatusPanel } from './StatusCard'
import { readGap, writeGap } from './recovery'

const NOW = Math.floor(Date.now() / 1000)
const site = (o: Partial<Site> = {}): Site => ({ id: 's1', domain: 'a.example', name: '', timezone: 'UTC', currency: 'USD', proxy_key: '', ...o })

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('the badge and panel of a site that stopped', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memory())
    setRole('owner')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('says the site is not answering, with its actions', () => {
    const s = site({ last_event_at: NOW - 8 * 3600, check: { at: NOW - 60, error: 'a.example could not be reached over https' } })
    expect(renderToStaticMarkup(<StatusCard site={s} />)).toContain('Down · 8h')
    const html = renderToStaticMarkup(<StatusPanel site={s} last={NOW - 8 * 3600} down />)
    expect(html).toContain('Down')
    expect(html).toContain('did not answer')
    expect(html).toContain('What we checked')
    expect(html).toContain('Check again')
    expect(html).toContain('Open site')
    expect(html).toContain('Install guide')
    expect(html).toContain('href="https://a.example"')
  })

  it('says since when the site is down, once the server knows', () => {
    const s = site({ last_event_at: NOW - 8 * 3600, check: { at: NOW - 60, error: 'x', down_since: NOW - 5 * 3600 } })
    const html = renderToStaticMarkup(<StatusPanel site={s} last={NOW - 8 * 3600} down />)
    expect(html).toContain('Your site is down since')
    expect(html).not.toContain('No visits since')
  })

  it('says no visits since, and for how long, when the page answers', () => {
    const s = site({ last_event_at: NOW - 8 * 3600 })
    expect(renderToStaticMarkup(<StatusCard site={s} />)).toContain('Quiet · 8h')
    const html = renderToStaticMarkup(<StatusPanel site={s} last={NOW - 8 * 3600} down={false} />)
    expect(html).toContain('Tracking stopped')
    expect(html).toContain('No visits since')
    expect(html).toContain('>8h<')
    expect(html).not.toContain('did not answer')
  })

  it('shows a badge once visits are back, for a day', () => {
    const back = NOW - 3600
    writeGap('s1', { since: back - 42 * 60, back })
    const html = renderToStaticMarkup(<StatusCard site={site({ last_event_at: NOW - 60 })} />)
    expect(html).toContain('Back · gap of 42 min')
    expect(html).not.toContain('What we checked')
  })

  it('says nothing for a healthy site, and drops a note older than a day', () => {
    expect(renderToStaticMarkup(<StatusCard site={site({ last_event_at: NOW - 60 })} />)).toBe('')
    writeGap('s1', { since: NOW - 3 * 86400, back: NOW - 2 * 86400 })
    expect(renderToStaticMarkup(<StatusCard site={site({ last_event_at: NOW - 60 })} />)).toBe('')
    expect(readGap('s1')).toBeNull()
  })
})

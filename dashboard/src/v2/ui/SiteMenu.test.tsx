import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/api'
import { MarkDot } from '../../features/sites/MarkDot'
import { siteLabel } from './SiteMenu'

const NOW = Math.floor(Date.now() / 1000)
const site = (o: Partial<Site> = {}): Site => ({ id: 's1', domain: 'drivemymac.app', name: '', timezone: 'UTC', currency: 'USD', proxy_key: '', last_event_at: NOW - 3600, ...o })

describe('the header button’s name', () => {
  it('adds the state only when the site is not fine', () => {
    expect(siteLabel('drivemymac.app', 'new')).toBe('drivemymac.app · Not verified')
    expect(siteLabel('drivemymac.app', 'stopped')).toBe('drivemymac.app · Down')
    expect(siteLabel('drivemymac.app', 'quiet')).toBe('drivemymac.app · Quiet')
    expect(siteLabel('drivemymac.app', 'live')).toBe('drivemymac.app')
    expect(siteLabel('drivemymac.app', 'now')).toBe('drivemymac.app')
  })

  it('marks a not-verified and a down site on the mark, never as fine', () => {
    const html = (s: Site, state?: 'new') => renderToStaticMarkup(<MarkDot site={s} size={18} state={state} />)
    expect(html(site({ last_event_at: undefined }), 'new')).toContain('mk-dot off')
    expect(html(site({ last_event_at: NOW - 3 * 86400, check: { at: NOW - 3600, error: 'could not be reached' } }))).toContain('mk-dot down')
    expect(html(site())).toContain('mk-dot "')
  })
})

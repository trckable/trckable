import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/api'
import { Status } from './TeamParts'
import { teamSite } from './model'

const NOW = 1_800_000_000_000
const site = (o: Partial<Site> = {}): Site => ({ id: 's1', domain: 'a.example', name: '', timezone: 'UTC', currency: 'USD', proxy_key: '', ...o })

describe('the sites list status line', () => {
  it('says nothing for a quiet site, and still names a down one', () => {
    const quiet = teamSite(site({ last_event_at: NOW / 1000 - 24 * 86400 }), undefined, NOW)
    expect(quiet.state).toBe('quiet')
    expect(renderToStaticMarkup(<Status s={quiet} />)).toBe('')
    const down = teamSite(site({ last_event_at: NOW / 1000 - 24 * 86400, down_since: NOW / 1000 - 600 }), undefined, NOW)
    expect(renderToStaticMarkup(<Status s={down} />)).toContain('down')
  })
})

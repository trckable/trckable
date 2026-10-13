import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Site } from '../lib/api'
import { AllNeeds } from './AllNeeds'

const site = (o: Partial<Site> = {}) => ({ id: 's1', domain: 'a.com', name: 'a', last_event_at: Math.floor(Date.now() / 1000) - 3 * 86400, ...o }) as Site

describe('Needs you on All sites', () => {
  it('says all is well in one line when nothing needs attention', () => {
    const out = renderToStaticMarkup(<AllNeeds needs={[]} sites={6} />)
    expect(out).toContain('All 6 sites look fine.')
    expect(out).not.toContain('<button')
  })
  it('gives a quiet site a plain title, one reason and one button', () => {
    const out = renderToStaticMarkup(<AllNeeds needs={[{ kind: 'quiet', site: site() }]} sites={6} />)
    expect(out).toContain('a has been quiet for 3 days')
    expect(out).toContain('No visits since')
    expect(out.match(/<button/g)).toHaveLength(1)
  })
})

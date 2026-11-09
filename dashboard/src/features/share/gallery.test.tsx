import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CardSection } from './CardSection'
import { PICTURES, TOPICS, missing, picturesOf, type Look, type Picture } from './card'

const look: Look = { template: 'numbers', shape: 'link', period: '7d', compare: false, metric: 'visitors', stats: ['engaged'], theme: 'dark', accent: '#b8ff3c' }
const has = { revenue: true, data: true, sources: true, places: true, tech: true, changed: true, search: true, ai: true, goals: true, milestone: true }
const none = { revenue: false, data: false, sources: false, places: false, tech: false, changed: false, search: false, ai: false, goals: false, milestone: false }

describe('gallery', () => {
  it('lists the Overview pictures first, the picked one checked, each with its own thumbnail address', () => {
    const html = renderToStaticMarkup(<CardSection site="s1" look={look} has={has} onChange={() => undefined} />)
    expect(picturesOf('overview').map((p) => p.id)).toEqual(['overview', 'numbers', 'grid'])
    expect(TOPICS.map((t) => picturesOf(t).length)).toEqual([3, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1])
    expect(html.match(/role="radio"/g)).toHaveLength(PICTURES.length)
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:(?!<button).)*Big number/s)
    for (const t of ['overview', 'numbers', 'grid', 'changed', 'sources', 'topsource', 'leaderboard', 'toppage', 'places', 'topplace', 'devices', 'browsers', 'search', 'ai', 'goals', 'sales', 'milestone']) expect(html).toContain(`t=${t}&amp;`)
    expect(html).not.toContain('t=post&amp;') // a post is text, not a picture
  })
  it('draws every thumbnail as the link preview, whatever size is picked', () => {
    const html = renderToStaticMarkup(<CardSection site="s1" look={{ ...look, shape: 'story' }} has={has} onChange={() => undefined} />)
    expect(html).not.toContain('shape=')
  })
  it('asks for the small picture, and for none of a picture the period cannot fill', () => {
    const html = renderToStaticMarkup(<CardSection site="s1" look={look} has={{ ...has, data: false, tech: false }} onChange={() => undefined} />)
    expect(html).toContain('thumb=1')
    expect(html).not.toContain('t=numbers&amp;')
    expect(html).not.toContain('t=grid&amp;')
    for (const t of ['overview', 'leaderboard', 'devices']) expect(html).not.toContain(`t=${t}&amp;`)
    for (const t of ['changed', 'search', 'ai', 'goals', 'sales', 'milestone']) expect(html).toContain(`t=${t}&amp;`) // lazily, with the rest: their own needs are met
    expect(html).toContain('Needs a visit in this period')
    const bare = renderToStaticMarkup(<CardSection site="s1" look={look} has={none} onChange={() => undefined} />)
    expect(bare).not.toContain('thumb=1')
    expect(bare).toContain('Needs a visit from another site')
    expect(bare).toContain('Needs a visit from a known country')
    expect(bare).toContain('Needs a visit with a known browser')
    for (const why of ['Needs an earlier period with visits', 'Needs Search Console connected', 'Needs a visit from an AI assistant or a mention', 'Needs a goal reached', 'Needs a connected payment provider', 'Needs a milestone in this period']) expect(bare).toContain(why)
  })
  it('shows a picture the site cannot make disabled, with the reason', () => {
    const sales: Picture = { id: 'grid', topic: 'overview', need: 'revenue' }
    expect(missing(sales, { ...has, revenue: false })).toBe('revenue')
    expect(missing(sales, has)).toBeNull()
    const html = renderToStaticMarkup(<CardSection site="s1" look={look} has={{ ...has, revenue: false }} pictures={[...PICTURES.filter((p) => p.id !== 'grid'), sales]} onChange={() => undefined} />)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/)
    expect(html).toContain('Needs a connected payment provider')
  })
})

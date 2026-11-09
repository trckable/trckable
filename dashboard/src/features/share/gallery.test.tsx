import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CardSection } from './CardSection'
import { PICTURES, missing, picturesOf, type Look, type Picture } from './card'

const look: Look = { template: 'numbers', shape: 'link', period: '7d', compare: false, metric: 'visitors', stats: ['engaged'], theme: 'dark', accent: '#b8ff3c' }
const has = { revenue: false }

describe('gallery', () => {
  it('lists the Overview pictures first, the picked one checked, each with its own thumbnail address', () => {
    const html = renderToStaticMarkup(<CardSection site="s1" look={look} has={has} onChange={() => undefined} />)
    expect(picturesOf('overview').map((p) => p.id)).toEqual(['overview', 'numbers', 'grid'])
    expect(html.match(/role="radio"/g)).toHaveLength(PICTURES.length)
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:(?!<button).)*Big number/s)
    for (const t of ['overview', 'numbers', 'grid', 'leaderboard']) expect(html).toContain(`t=${t}&amp;`)
    expect(html).not.toContain('t=post&amp;') // a post is text, not a picture
  })
  it('draws every thumbnail as the link preview, whatever size is picked', () => {
    const html = renderToStaticMarkup(<CardSection site="s1" look={{ ...look, shape: 'story' }} has={has} onChange={() => undefined} />)
    expect(html).not.toContain('shape=')
  })
  it('shows a picture the site cannot make disabled, with the reason', () => {
    const sales: Picture = { id: 'grid', topic: 'overview', need: 'revenue' }
    expect(missing(sales, { revenue: false })).toBe('revenue')
    expect(missing(sales, { revenue: true })).toBeNull()
    const html = renderToStaticMarkup(<CardSection site="s1" look={look} has={has} pictures={[...PICTURES.filter((p) => p.id !== 'grid'), sales]} onChange={() => undefined} />)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/)
    expect(html).toContain('Needs a connected payment provider')
  })
})

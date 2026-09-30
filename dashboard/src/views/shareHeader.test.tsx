import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ShareInfo } from '../lib/api'
import { ShareHeader } from './Share'

const info: ShareInfo = { name: 'Test', revenue: false, domain: 'albas.com', site: 'albas', timezone: 'UTC', currency: 'USD', modules: {} }
const header = (p: Partial<ShareInfo>) => renderToStaticMarkup(<ShareHeader info={{ ...info, ...p }} />)

describe('the shared page header', () => {
  it('puts the site mark before the site name and the link name', () => {
    const html = header({})
    expect(html.indexOf('site-mark')).toBeGreaterThan(-1)
    expect(html.indexOf('site-mark')).toBeLessThan(html.indexOf('albas</b>'))
    expect(html).toContain('Test')
  })
  it('draws the site\'s initial on its colour when it has no icon', () => {
    const html = header({ color: '#3366ff' })
    expect(html).toContain('site-mark letter')
    expect(html).toContain('>A<')
    expect(html).not.toContain('<img')
  })
  it('draws the icon from this server when it has one', () => {
    const html = header({ icon_url: '/api/v1/share/icon?v=7' })
    expect(html).toContain('src="/api/v1/share/icon?v=7"')
    expect(html).toContain('width="20"')
  })
})

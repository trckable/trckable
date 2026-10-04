import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Site, Widget } from '../lib/apiMore'
import { EMPTY_LOOK } from './widgetKinds'
import { WidgetRow } from './WidgetRow'

const site = { id: 'tkb_s', domain: 'site.com' } as Site
const widget = (patch: Partial<Widget> = {}): Widget => ({ ...EMPTY_LOOK, id: 'w_abc', site_id: 'tkb_s', name: 'Footer pill', kind: 'online', shows: ['spark'], on: true, created_at: 1_700_000_000, ...patch })
const row = (w: Widget) => renderToStaticMarkup(<WidgetRow site={site} w={w} base="https://t.example" onChange={() => undefined} onEdit={() => undefined} />)

describe('a widget in the list', () => {
  it("shows its name, a thumbnail of the design in its language, and a menu", () => {
    const html = row(widget({ lang: 'de', texts: { online: 'hier' } }))
    expect(html).toContain('Footer pill')
    expect(html).toContain('wg-thumb')
    expect(html).toContain('/widgets/preview?kind=online')
    expect(html).toContain('lang=de')
    expect(html).toContain('text.online=hier')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).not.toContain('role="menu"') // closed until it is opened
  })

  it('escapes a name that holds markup', () => {
    const html = row(widget({ name: '<img src=x onerror=alert(1)>' }))
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })
})

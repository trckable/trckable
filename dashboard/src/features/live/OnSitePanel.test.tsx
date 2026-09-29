import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MAX_ROWS, type Row } from './model'
import { OnSitePanel } from './OnSitePanel'

const T0 = Date.UTC(2026, 8, 27, 12, 0, 0)
const row = (i: number, o: Partial<Row> = {}): Row => ({ kind: 'pageview', ts: T0, last: T0, path: '/p' + String(i), visitor: 'v' + String(i), key: 'v:v' + String(i), ...o })

describe('on the site right now', () => {
  it('says the same number as the tile, with a row for each', () => {
    const html = renderToStaticMarkup(<OnSitePanel rows={[row(1), row(2)]} online={2} clock={T0} />)
    expect(html).toContain('2 people')
    expect(html.match(/class="live-row/g)).toHaveLength(2)
    expect(html).not.toContain('more')
  })

  it('shows a row that has no page as still on the site', () => {
    const html = renderToStaticMarkup(<OnSitePanel rows={[row(1, { kind: 'active', path: undefined })]} online={1} clock={T0} />)
    expect(html).toContain('Still on the site')
    expect(html).toContain('1 person')
  })

  it('says how many more when the list is full', () => {
    const rows = Array.from({ length: MAX_ROWS }, (_, i) => row(i))
    const html = renderToStaticMarkup(<OnSitePanel rows={rows} online={MAX_ROWS + 7} clock={T0} />)
    expect(html).toContain(String(MAX_ROWS + 7) + ' people')
    expect(html).toContain('and 7 more')
  })
})

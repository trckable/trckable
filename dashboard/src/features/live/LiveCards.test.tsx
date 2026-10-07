import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LiveNow } from './api'
import { LiveCards } from './LiveCards'
import type { Row } from './model'

const T0 = Date.UTC(2026, 9, 7, 12)
const data = (o: Partial<LiveNow> = {}): LiveNow => ({ at: T0, start: T0, minutes: [], online: 0, visitors: 0, previous: 0, sources: [], recent: [], ...o })
const row = (o: Partial<Row> = {}): Row => ({ kind: 'pageview', ts: T0, last: T0, path: '/a', key: 'k', country: 'DE', device: 'mobile', ...o })
const today = { visitors: 10, before: 8, compare: true, hours: [1, 4, 10], last: [2, 3, 4, 8] }

describe('the cards under Live', () => {
  it('are not there when nobody is online and there are no visitors today', () => {
    expect(renderToStaticMarkup(<LiveCards data={data({ today: { ...today, visitors: 0 } })} rows={[]} />)).toBe('')
    expect(renderToStaticMarkup(<LiveCards data={data()} rows={[]} />)).toBe('')
  })
  it('show all three when there is something for each', () => {
    const html = renderToStaticMarkup(<LiveCards data={data({ today })} rows={[row()]} />)
    expect(html.match(/class="kit-card[^"]*lv-card"/g)).toHaveLength(3)
    expect(html).toContain('▲ 25%')
    expect(html).toContain('/a')
  })
  it('leave out a card with nothing to say', () => {
    const html = renderToStaticMarkup(<LiveCards data={data()} rows={[row({ country: undefined })]} />)
    expect(html.match(/class="kit-card[^"]*lv-card"/g)).toHaveLength(1)
    expect(html).toContain('Top pages right now')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Downtime } from './Downtime'

describe('the downtime band', () => {
  it('is left out when there was none, and lists the incidents when there were some', () => {
    expect(renderToStaticMarkup(<Downtime down={[]} />)).toBe('')
    const html = renderToStaticMarkup(<Downtime down={[{ from: '2026-10-13T09:12:00Z', to: '2026-10-13T09:35:00Z', min: 23 }]} />)
    expect(html).toContain('Downtime')
    expect(html).toContain('23')
  })
  it('says under a minute for an outage that began and ended in the same minute', () => {
    const html = renderToStaticMarkup(<Downtime down={[{ from: '11-08 04:07', to: '11-08 04:07', min: 1 }]} />)
    expect(html).toContain('Nov 8, 04:07')
    expect(html).toContain('under a minute')
    expect(html).not.toContain(' to ')
    expect(renderToStaticMarkup(<Downtime down={[{ from: '11-08 04:07', to: '11-08 04:08', min: 0 }]} />)).toContain('under a minute')
  })
})

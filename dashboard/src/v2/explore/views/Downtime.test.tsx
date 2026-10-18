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
})

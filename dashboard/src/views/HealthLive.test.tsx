import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HealthLive } from './HealthLive'

describe('the Health live stamp', () => {
  it('writes 24-hour time without seconds', () => {
    const html = renderToStaticMarkup(<HealthLive at={new Date(2026, 9, 18, 16, 30, 45)} err={null} />)
    expect(html).toContain('Live · 16:30<')
    expect(html).not.toMatch(/AM|PM|:45/)
  })
  it('says so when the refresh failed', () => {
    expect(renderToStaticMarkup(<HealthLive at={null} err="x" />)).toContain('Could not refresh')
  })
})

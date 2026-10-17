import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Logo } from './Header'

describe('the header’s logo', () => {
  it('is the brand’s ghost, not a drawing of its own', () => {
    const html = renderToStaticMarkup(<Logo title="All sites" onClick={() => {}} />)
    expect(html).toContain('tkb-logo')
    expect(html).toContain('tkb-ghost')
    expect(html).toContain('tkb-body')
    expect(html).toContain('aria-label="All sites"')
  })
})

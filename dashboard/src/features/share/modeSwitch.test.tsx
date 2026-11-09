import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModeSwitch } from './ModeSwitch'

describe('picture or text', () => {
  it('offers both, the one in use checked', () => {
    const html = renderToStaticMarkup(<ModeSwitch mode="text" onChange={() => undefined} />)
    expect(html.match(/role="radio"/g)).toHaveLength(2)
    expect(html).toMatch(/aria-checked="false"[^>]*>Picture/)
    expect(html).toMatch(/aria-checked="true"[^>]*>Text post/)
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The header's spacer is a span called "sp": a floating card that took that name once pulled the search, bell and
// avatar next to Live. The card's classes all start with "ist".
describe('the install status styles', () => {
  it('never touch the header spacer', () => {
    const css = readFileSync(new URL('./setupPanel.css', import.meta.url), 'utf8')
    expect(css).not.toMatch(/\.sp(?![\w-])/)
    expect(css).toMatch(/\.ist\b/)
  })
})

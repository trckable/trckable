import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BRANDS } from '../../lib/brandIcons'
import { SourceChip } from './SourceChip'

const chip = (channel: string, referrer: string) => renderToStaticMarkup(<SourceChip channel={channel} referrer={referrer} />)

describe('the source chip', () => {
  it('draws the brand mark for a known site, not a letter', () => {
    for (const [channel, host, brand] of [['Paid', 'google.com', 'google'], ['Social', 'instagram.com', 'instagram'], ['Referral', 'news.ycombinator.com', 'ycombinator']]) {
      const html = chip(channel, host)
      expect(html).toContain(`<path d="${BRANDS[brand].d}"`)
      expect(html).not.toContain('v-mark letter')
    }
  })
  it('keeps the monogram for an unknown host', () => {
    const html = chip('Referral', 'example.org')
    expect(html).toContain('v-mark letter')
    expect(html).not.toContain('<path')
  })
})

describe('a visitor on the site pulses once in the window', () => {
  it('only the page they are on animates; the bar, the rail and the face hold still', () => {
    const css = readFileSync(new URL('./Journey.css', import.meta.url), 'utf8')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*animation:\s*jr-ping[^{}]*)\}/g)].map((m) => m[1].trim())
    expect(rules).toEqual(['.jr-node.here .jr-dot'])
    expect(css).toMatch(/\.journey-dialog \.v-avatar\.live::after\s*\{\s*animation:\s*none/)
  })
})

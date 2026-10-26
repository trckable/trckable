import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Site } from '../lib/apiMore'
import { EMPTY_LOOK } from './widgetKinds'
import { WidgetStudio } from './WidgetStudio'

const site = { id: 'tkb_s', domain: 'site.com' } as Site
const studio = (kind: 'live' | 'online') =>
  renderToStaticMarkup(<WidgetStudio site={site} look={{ ...EMPTY_LOOK, kind }} onLook={() => undefined} place="inline" onPlace={() => undefined} />)

describe('the widget studio', () => {
  it('names each group of buttons once, by a group label and not by a wrapping label', () => {
    const html = studio('online')
    for (const name of ['Corners', 'Placement', 'Mode']) {
      expect(html.match(new RegExp(`role="group" aria-label="${name}"`, 'g'))).toHaveLength(1)
      expect(html).toContain(`<span aria-hidden="true">${name}</span>`)
    }
    expect(html).not.toMatch(/<label class="wg-opt"><span[^>]*>(Corners|Placement|Mode)</)
  })
})

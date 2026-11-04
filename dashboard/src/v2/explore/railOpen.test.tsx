import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Rail } from './Rail'
import { railOpen, railPressed, railToggled } from './railOpen'
import type { Connected } from './types'

const conn = { rev: true } as unknown as Connected
const html = (section: string, tab: string) => renderToStaticMarkup(<Rail section={section as never} tab={tab as never} conn={conn} onPick={() => {}} onTab={() => {}} />)
const state = (h: string) => /data-xkids="sales"([^>]*)>/.exec(h)?.[1] ?? ''

describe('the folded entries of the section list', () => {
  it('stay closed on another tab', () => {
    const h = html('pages', 'pages')
    expect(h).toContain('aria-expanded="false"')
    expect(state(h)).toContain('data-closed')
  })
  it.each([['sales', 'sales'], ['sales', 'payments'], ['sales', 'customers']])('are open in %s / %s', (section, tab) => {
    const h = html(section, tab)
    expect(h).toContain('aria-expanded="true"')
    expect(state(h)).not.toContain('data-closed')
  })
  it('open and close with the chevron without moving to another tab', () => {
    expect(railOpen(railToggled({}, 'sales', 'pages'), 'sales', 'pages')).toBe(true)
    expect(railOpen(railToggled({}, 'sales', 'sales'), 'sales', 'sales')).toBe(false)
    expect(railOpen(railToggled(railToggled({}, 'sales', 'sales'), 'sales', 'sales'), 'sales', 'sales')).toBe(true)
  })
  it('open when the entry itself is pressed', () => {
    expect(railOpen(railPressed(railToggled({}, 'sales', 'sales'), 'sales'), 'sales', 'sales')).toBe(true)
  })
})

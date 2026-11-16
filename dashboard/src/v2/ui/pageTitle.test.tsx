// A page's title above its path: the row shows the title with the path small under it, and the path alone when there is none.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { rowsOf } from '../explore/data/stats'
import { XTable } from './XTable'

const table = (title?: string) => {
  const rows = rowsOf([{ value: '/pricing', visitors: 40, ...(title ? { title } : {}) }], [{ value: '/pricing', visitors: 40 }], 100, (v) => v)
  return { rows, html: renderToStaticMarkup(<XTable rows={rows} head="Page" limit={5} of={100} onAll={() => {}} />) }
}

describe('page titles in a table', () => {
  it('carries the title from the report row', () => {
    expect(table('Pricing | Acme').rows[0]).toMatchObject({ val: '/pricing', title: 'Pricing | Acme' })
  })

  it('shows the title with the path under it', () => {
    const { html } = table('Pricing | Acme')
    expect(html).toContain('<b>Pricing | Acme</b><small>/pricing</small>')
  })

  it('shows the path alone when the page has no title', () => {
    const { rows, html } = table()
    expect(rows[0]).not.toHaveProperty('title')
    expect(html).not.toContain('<small>')
    expect(html).toContain('/pricing')
  })
})

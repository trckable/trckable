import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { V2ExtrasContext } from '../slots'
import { MenuFoot } from './MenuFoot'

const items = [{ key: 'add', label: 'Add a site', run: () => {} }]

describe('the site list’s foot', () => {
  it('draws Add a site through a build’s guard, which may show it off', () => {
    const guard = (render: (off: boolean) => React.ReactNode) => render(true)
    const html = renderToStaticMarkup(
      <V2ExtrasContext.Provider value={{ addSiteGuard: guard }}>
        <MenuFoot items={items} done={() => {}} />
      </V2ExtrasContext.Provider>,
    )
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add a site/)
  })

  it('draws it plainly without one', () => {
    expect(renderToStaticMarkup(<MenuFoot items={items} done={() => {}} />)).not.toContain('disabled')
  })
})

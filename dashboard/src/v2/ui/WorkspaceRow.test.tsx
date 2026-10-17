import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorkspaceRow } from './WorkspaceRow'

const MANAGE = 'Manage accounts'
const html = (accounts?: () => React.ReactNode) => renderToStaticMarkup(<WorkspaceRow w={{ name: 'Albas', d: 'Team', accounts }} close={() => {}} />)

describe('the account line of the site menu', () => {
  it('starts shut: a line that can open a list says so and shows no list', () => {
    const out = html(() => <button type="button">{MANAGE}</button>)
    expect(out).toContain('aria-expanded="false"')
    expect(out).not.toContain(MANAGE)
  })

  it('is a plain line when there is no list to open', () => {
    expect(html()).not.toContain('aria-expanded')
  })
})

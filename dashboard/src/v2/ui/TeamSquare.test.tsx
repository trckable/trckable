import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TeamSquare } from './TeamSquare'

const teams = (current: string) => ({
  list: [
    { id: 'p', name: 'Personal' },
    { id: 's', name: 'Studio Kalendar' },
  ],
  current,
  onPick: () => {},
  onManage: () => {},
})

describe('the team square', () => {
  it('shows the initial of the team in view, with its name for a reader, and the list shut', () => {
    const html = renderToStaticMarkup(<TeamSquare teams={teams('s')} />)
    expect(html).toContain('aria-label="Studio Kalendar"')
    expect(html).toContain('>S</span>')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Manage teams')
  })

  it('shows one team’s square even when it is the only one', () => {
    const one = { ...teams('p'), list: [{ id: 'p', name: 'Personal' }] }
    expect(renderToStaticMarkup(<TeamSquare teams={one} />)).toContain('>P</span>')
  })
})

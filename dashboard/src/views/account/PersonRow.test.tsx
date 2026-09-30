import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Person } from '../../lib/api'
import { PersonAvatar } from '../../components/PersonAvatar'

// The row's imports read the address bar; this test has none.
vi.stubGlobal('location', { search: '', pathname: '/', hash: '' })
let PersonRow: typeof import('./PersonRow').PersonRow
beforeAll(async () => {
  PersonRow = (await import('./PersonRow')).PersonRow
})

const person = (o: Partial<Person>): Person => ({ id: 'usr_a', email: 'ann@site.com', name: 'Ann', role: 'viewer', created_at: 0, two_step: false, last_seen: 1, must_change: false, has_avatar: false, ...o })
const access = { shown: false, of: () => null, list: null } as never
const act = {} as never
const row = (p: Person, me?: string, waiting = false) => renderToStaticMarkup(<PersonRow p={p} me={me} owners={1} waiting={waiting} access={access} act={act} />)

describe('a people row', () => {
  it('shows the initial when the person has no picture', () => {
    const html = row(person({}), 'me@site.com')
    expect(html).toContain('person-avatar')
    expect(html).toContain('>A<')
    expect(html).not.toContain('<img')
  })
  it("shows the person's picture from their own address", () => {
    const html = row(person({ has_avatar: true }), 'me@site.com')
    expect(html).toContain('src="/api/v1/people/usr_a/avatar?v=0"')
    expect(html).not.toContain('>A<')
  })
  it('shows your own picture from the same address as the header, so they change together', () => {
    const html = row(person({ has_avatar: true, email: 'me@site.com' }), 'me@site.com')
    expect(html).toContain('src="/api/v1/account/avatar?v=0"')
  })
  it('keeps the owner tint on the avatar', () => {
    expect(row(person({ role: 'owner' }), 'me@site.com')).toContain('avatar person-avatar owner')
  })
})

describe('the avatar', () => {
  it('carries the version, so a new picture is fetched again', () => {
    const html = renderToStaticMarkup(<PersonAvatar p={{ email: 'a@b.c', name: '', has_avatar: true }} v={3} />)
    expect(html).toContain('/api/v1/account/avatar?v=3')
  })
})

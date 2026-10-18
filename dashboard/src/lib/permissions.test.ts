import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from './permissions.json'

// Who is signed in is module state: each test starts afresh.
async function fresh() {
  vi.resetModules()
  const [me, perm] = await Promise.all([import('./me'), import('./permissions')])
  return { me, ...perm }
}

describe('who may do what', () => {
  let t: Awaited<ReturnType<typeof fresh>>
  beforeEach(async () => {
    t = await fresh()
  })

  it('offers nothing before anyone is known', () => {
    for (const a of t.ACTIONS) expect(t.can(a)).toBe(false)
  })

  it('lets an owner do everything', () => {
    t.me.setRole('owner')
    for (const a of t.ACTIONS) expect(t.can(a)).toBe(true)
  })

  it('keeps a viewer to reading', () => {
    t.me.setRole('viewer')
    for (const a of t.ACTIONS) expect(t.can(a)).toBe(false)
  })

  it.each([undefined, '', 'admin', 'Owner', 'editor', 'constructor'])('reads when the role is %j', (r) => {
    t.me.setRole(r)
    for (const a of t.ACTIONS) expect(t.can(a)).toBe(false)
  })

  it('never offers a change on a shared link, even to an owner', () => {
    t.me.setRole('owner')
    t.me.setShared({})
    for (const a of t.ACTIONS) expect(t.can(a)).toBe(false)
  })

  it('gives a role of its own the row it was defined with', () => {
    t.defineRole('admin', ['goal.create'])
    t.me.setRole('admin')
    expect(t.can('goal.create')).toBe(true)
    expect(t.can('site.delete')).toBe(false)
  })
})

// The server keeps the same table (server/internal/api/permissions.go) and its
// test reads this same file: change one side and the other fails.
describe('the table against the shared fixture', () => {
  it('lists the same actions', async () => {
    const { ACTIONS } = await fresh()
    expect([...ACTIONS].sort()).toEqual(Object.keys(fixture.actions).sort())
  })

  it('gives each action to the same roles', async () => {
    const { ACTIONS, rolesOf } = await fresh()
    for (const a of ACTIONS) expect(rolesOf(a).sort(), a).toEqual([...fixture.actions[a].roles].sort())
  })
})

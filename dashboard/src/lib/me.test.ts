import { beforeEach, describe, expect, it, vi } from 'vitest'

// me.ts keeps who is signed in in module state: each test starts afresh.
async function fresh() {
  vi.resetModules()
  return import('./me')
}

describe('who may change things', () => {
  let me: Awaited<ReturnType<typeof fresh>>
  beforeEach(async () => {
    me = await fresh()
  })

  it('offers nothing before anyone is known', () => {
    expect(me.canChange()).toBe(false)
    expect(me.isViewer()).toBe(true)
  })

  it('lets an owner change the instance', () => {
    me.setRole('owner')
    expect(me.canChange()).toBe(true)
    expect(me.isViewer()).toBe(false)
  })

  it('keeps a viewer to reading', () => {
    me.setRole('viewer')
    expect(me.canChange()).toBe(false)
    expect(me.isViewer()).toBe(true)
  })

  it.each([undefined, '', 'admin', 'Owner', 'editor'])('reads when the role is %j', (r) => {
    me.setRole(r)
    expect(me.canChange()).toBe(false)
    expect(me.isViewer()).toBe(true)
  })

  it('never offers a change on a shared link, even to an owner', () => {
    me.setRole('owner')
    me.setShared({})
    expect(me.canChange()).toBe(false)
    expect(me.isViewer()).toBe(true)
  })
})

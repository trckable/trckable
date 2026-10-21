// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { ALL, apply, groupOf, readFilter, saveFilter, unreadGroups } from './filter'
import type { Notice } from './notices'

const r = (kind: Notice['kind'], site: string, unread = true, extra: Partial<Notice> = {}) => ({ kind, site, unread, ...extra })

describe('the groups of the panel’s filter', () => {
  it('come from the alert a notice came from, one mapping', () => {
    expect(groupOf({ kind: 'down' })).toBe('down')
    expect(groupOf({ kind: 'up' })).toBe('down')
    expect(groupOf({ kind: 'failed', alert: 'stopped' })).toBe('down')
    expect(groupOf({ kind: 'spike' })).toBe('busy')
    expect(groupOf({ kind: 'spike', alert: 'surge' })).toBe('busy')
    expect(groupOf({ kind: 'milestone' })).toBe('milestones')
    expect(groupOf({ kind: 'milestone', alert: 'threshold' })).toBe('milestones')
    expect(groupOf({ kind: 'plan' })).toBeUndefined()
    expect(groupOf({ kind: 'weekly' })).toBeUndefined()
  })

  it('filter by group and site; All lists every row, a merged busy row is Busy and on each of its sites', () => {
    const merged = r('spike', '', true, { members: [{ site: 'a.com' }, { site: 'b.com' }] as Notice[] })
    const rows = [r('down', 'a.com'), r('milestone', 'b.com'), r('plan', ''), merged]
    expect(apply(rows, ALL)).toHaveLength(4)
    expect(apply(rows, { group: 'down', site: '' })).toEqual([rows[0]])
    expect(apply(rows, { group: 'busy', site: 'b.com' })).toEqual([merged])
    expect(apply(rows, { group: 'all', site: 'a.com' })).toEqual([rows[0], merged])
  })

  it('say which kinds have unread rows', () => {
    const rows = [r('down', 'a.com'), r('milestone', 'b.com', false), r('spike', 'b.com')]
    expect([...unreadGroups(rows, '')].sort()).toEqual(['all', 'busy', 'down'])
    expect([...unreadGroups(rows, 'a.com')].sort()).toEqual(['all', 'down'])
  })
})

describe('the kept choice', () => {
  beforeEach(() => localStorage.clear())
  it('is read back, and a damaged one is All', () => {
    saveFilter({ group: 'busy', site: 'a.com' })
    expect(readFilter()).toEqual({ group: 'busy', site: 'a.com' })
    localStorage.setItem('trckable.bell.filter', '{"group":"nope","site":5}')
    expect(readFilter()).toEqual(ALL)
    localStorage.setItem('trckable.bell.filter', 'not json')
    expect(readFilter()).toEqual(ALL)
  })
})

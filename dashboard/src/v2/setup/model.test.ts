import { describe, expect, it } from 'vitest'
import type { SetupItem, SetupState } from '../../lib/apiMore'
import { CHECK_FOR, installWaiting, isStale, visitMissed, STALE, wanted, splitOf, hiddenBy, hideId, left, offset, percent, ringMode, rowsOf } from './model'

const item = (id: string, group: SetupItem['group'], o: Partial<SetupItem> = {}): SetupItem => ({ id, group, done: false, counted: group !== 'more', skipped: false, skippable: group === 'optional', ...o })
const state = (done: number, counted: number): SetupState => ({ kind: { value: 'shop', chosen: false }, goal_suggestion: '', done, counted, all_set: counted > 0 && done === counted, items: [] })

describe('the ring maths', () => {
  it('reads done over counted', () => {
    expect(percent(4, 9)).toBe(44)
    expect(percent(9, 9)).toBe(100)
    expect(percent(0, 0)).toBe(0)
    expect(percent(5, 4)).toBe(100)
  })
  it('leaves the arc of what is done', () => {
    expect(offset(0, 4)).toBe(88)
    expect(offset(4, 4)).toBe(0)
    expect(offset(2, 4)).toBe(44)
  })
  it('counts the steps left, after skips lowered the count', () => {
    expect(left(state(4, 9))).toBe(5)
    expect(left(state(4, 4))).toBe(0)
  })
  it('four of four reads as all set once Payments is skipped', () => {
    const before = state(4, 5)
    const after = state(4, 4)
    expect(before.all_set).toBe(false)
    expect(after.all_set).toBe(true)
    expect(percent(after.done, after.counted)).toBe(100)
  })
})

describe('the rows', () => {
  it('moves a skipped step to More, first, and keeps the rest in order', () => {
    const rows = rowsOf([item('verified', 'core'), item('payments', 'optional', { skipped: true, group: 'more' }), item('funnel', 'optional'), item('vitals', 'more')])
    expect(rows.core.map((i) => i.id)).toEqual(['verified'])
    expect(rows.optional.map((i) => i.id)).toEqual(['funnel'])
    expect(rows.more.map((i) => i.id)).toEqual(['payments', 'vitals'])
  })
})

describe('when the ring shows', () => {
  const now = 1_000_000_000_000
  it('is a ring while something is left', () => {
    expect(ringMode({ state: state(4, 9), hidden: false, doneSince: null, now })).toBe('ring')
  })
  it('is nothing before the checklist has arrived, or with nothing counted', () => {
    expect(ringMode({ state: null, hidden: false, doneSince: null, now })).toBe('none')
    expect(ringMode({ state: state(0, 0), hidden: false, doneSince: null, now })).toBe('none')
  })
  it('is a check for seven days after the last step, then hides', () => {
    const s = state(5, 5)
    expect(ringMode({ state: s, hidden: false, doneSince: null, now })).toBe('check')
    expect(ringMode({ state: s, hidden: false, doneSince: now - CHECK_FOR + 1, now })).toBe('check')
    expect(ringMode({ state: s, hidden: false, doneSince: now - CHECK_FOR, now })).toBe('none')
  })
  it('is gone for good when the person hid it', () => {
    expect(ringMode({ state: state(2, 9), hidden: true, doneSince: null, now })).toBe('none')
  })
})

describe('Hide this', () => {
  it('holds while no more is left undone than when it was hidden', () => {
    const read = [hideId('s1', 0, 100)]
    expect(hiddenBy(read, 's1', 0)).toBe(true)
  })
  it('comes back when a step becomes undone', () => {
    const read = [hideId('s1', 0, 100)]
    expect(hiddenBy(read, 's1', 1)).toBe(false)
  })
  it('hid at 5 steps left stays hidden as steps get done', () => {
    const read = [hideId('s1', 5, 100)]
    expect(hiddenBy(read, 's1', 3)).toBe(true)
    expect(hiddenBy(read, 's1', 6)).toBe(false)
  })
  it('follows the latest hide, per site', () => {
    const read = [hideId('s1', 0, 100), hideId('s1', 2, 200), hideId('s2', 9, 300), 'down:1']
    expect(hiddenBy(read, 's1', 2)).toBe(true)
    expect(hiddenBy(read, 's3', 0)).toBe(false)
    const older = [hideId('s1', 2, 200), hideId('s1', 0, 300)]
    expect(hiddenBy(older, 's1', 2)).toBe(false)
  })
})

describe('the folded panel', () => {
  it('splits what is left, what is done and what can wait', () => {
    const s = splitOf([item('verified', 'core', { done: true }), item('locale', 'core'), item('payments', 'optional', { skipped: true, group: 'more' }), item('funnel', 'optional'), item('search', 'optional', { done: true }), item('vitals', 'more')])
    expect(s.todo.map((i) => i.id)).toEqual(['locale', 'funnel'])
    expect(s.done.map((i) => i.id)).toEqual(['verified', 'search'])
    expect(s.more.map((i) => i.id)).toEqual(['payments', 'vitals'])
  })
})

describe('a setup prompt is wanted', () => {
  const withPayments = (o: Partial<SetupItem>): SetupState => ({ ...state(0, 1), items: [item('payments', 'optional', o), item('search', 'optional')] })
  it('is wanted when the step is chosen and not skipped', () => {
    expect(wanted(withPayments({}), 'rev')).toBe(true)
    expect(wanted(withPayments({}), 'search')).toBe(true)
  })
  it('is not wanted once the step is skipped or not chosen, and wanted again when brought back', () => {
    expect(wanted(withPayments({ skipped: true, group: 'more', counted: false }), 'rev')).toBe(false)
    expect(wanted(withPayments({ skipped: false }), 'rev')).toBe(true)
  })
  it('waits while the checklist is not known, and always asks for a prompt with no step', () => {
    expect(wanted(null, 'rev')).toBe(false)
    expect(wanted(null, 'goals')).toBe(true)
    expect(wanted(withPayments({ skipped: true }), 'alerts')).toBe(true)
  })
})

describe('reading the checklist again', () => {
  const waiting = { ...state(0, 1), items: [item('verified', 'core')] }
  const done = { ...state(1, 1), items: [item('verified', 'core', { done: true })] }
  it('knows the install waits only while Verified is open', () => {
    expect(installWaiting(waiting)).toBe(true)
    expect(installWaiting(done)).toBe(false)
    expect(installWaiting(null)).toBe(false)
  })
  it('reads again when a visit landed while it waits, never when done', () => {
    expect(visitMissed(true, waiting)).toBe(true)
    expect(visitMissed(true, done)).toBe(false)
    expect(visitMissed(false, waiting)).toBe(false)
  })
  it('calls a read old after the short time', () => {
    expect(isStale(0, STALE)).toBe(true)
    expect(isStale(1, STALE)).toBe(false)
  })
})

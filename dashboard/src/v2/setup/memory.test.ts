// @vitest-environment happy-dom
import { beforeEach, expect, test } from 'vitest'
import type { SetupState } from '../../lib/apiMore'
import { lastState, remember } from './memory'

const read: SetupState = { kind: { value: 'shop', chosen: false }, goal_suggestion: '', done: 2, counted: 5, all_set: false, items: [] }

beforeEach(() => localStorage.clear())

test('the last read of a site comes back, and a site never read has none', () => {
  expect(lastState('a')).toBeNull()
  remember('a', read)
  expect(lastState('a')).toEqual(read)
  expect(lastState('b')).toBeNull()
})

test('something else under the key is not taken for a checklist', () => {
  localStorage.setItem('trckable:ring:state:a', JSON.stringify({ done: 'x' }))
  expect(lastState('a')).toBeNull()
})

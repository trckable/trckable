// @vitest-environment happy-dom
import { beforeEach, expect, test, vi } from 'vitest'
import type { SetupState } from '../../lib/apiMore'
import { more } from '../../lib/apiMore'
import { lastState, readSetup, remember } from './memory'

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

test('a site\'s checklist is read once for whoever asks while it is on its way, and for a second asker that accepts a recent one', async () => {
  const get = vi.spyOn(more, 'setup').mockResolvedValue(read)
  await Promise.all([readSetup('r'), readSetup('r')])
  await readSetup('r', 30_000)
  expect(get).toHaveBeenCalledTimes(1)
  await readSetup('r')
  expect(get).toHaveBeenCalledTimes(2)
  get.mockRestore()
})

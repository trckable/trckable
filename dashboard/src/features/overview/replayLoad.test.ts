import { describe, expect, it } from 'vitest'
import { loadReplay } from './replayLoad'

describe('loadReplay', () => {
  it('fetches the engine once, however often it is asked', async () => {
    const first = loadReplay()
    expect(loadReplay()).toBe(first)
    const engine = await first
    expect(typeof engine.runClock).toBe('function')
    expect(typeof engine.raceRows).toBe('function')
  })
})

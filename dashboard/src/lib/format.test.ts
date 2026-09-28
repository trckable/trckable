import { describe, expect, it } from 'vitest'
import { delta } from './format'

describe('delta', () => {
  it('has an arrow and a sign, so it reads without colour', () => {
    expect(delta(128, 100)).toEqual({ text: '↑ +28%', tone: 'up', label: 'up 28.0 percent' })
    expect(delta(96, 100)).toEqual({ text: '↓ −4.0%', tone: 'down', label: 'down 4.0 percent' })
  })
  it('turns the colour round where lower is better', () => {
    expect(delta(44, 48, true)?.tone).toBe('up')
  })
  it('says new when there was nothing before', () => {
    expect(delta(1329, 0)).toEqual({ text: 'new', tone: 'flat', label: 'new' })
    expect(delta(0, 0)?.label).toBe('no change')
    expect(delta(5, undefined)).toBeNull()
  })
})

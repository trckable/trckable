import { describe, expect, it } from 'vitest'
import type { Alert } from '../../lib/api'
import { destination } from './weeklyTarget'

const alert = (kind: Alert['kind'], target: string): Alert => ({ id: kind, site_id: 's', kind, enabled: true, target, threshold: 0, last_fired: 0, created_at: 0 })

describe('where the weekly email goes', () => {
  it('uses the weekly alert’s own destination first', () => {
    expect(destination([alert('stopped', 'https://hooks.example.com/a'), alert('weekly', 'mailto:me@example.com')], true, 'owner@example.com')).toBe('mailto:me@example.com')
  })
  it('follows another alert’s destination when the site has no weekly one yet', () => {
    expect(destination([alert('customer', 'https://hooks.slack.com/x')], true, 'owner@example.com')).toBe('https://hooks.slack.com/x')
  })
  it('falls back to the owner’s address only when the server can send mail', () => {
    expect(destination([], true, 'owner@example.com')).toBe('mailto:owner@example.com')
    expect(destination([], false, 'owner@example.com')).toBe('')
  })
  it('has nowhere to send it with no mail, no destination and no address', () => {
    expect(destination([], true, '')).toBe('')
    expect(destination([alert('weekly', '')], false, '')).toBe('')
  })
})

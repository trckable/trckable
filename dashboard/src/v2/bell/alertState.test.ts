import { afterEach, describe, expect, it, vi } from 'vitest'
import { more } from '../../lib/apiMore'
import type { Alert } from '../../lib/api'
import { alertOf, setAlertOn } from './alertState'

const alert = (kind: Alert['kind'], enabled: boolean): Alert => ({ id: 'a1', site_id: 's1', kind, enabled, target: 'me@x.com', threshold: 6, last_fired: 0, created_at: 1 })

afterEach(() => vi.restoreAllMocks())

describe('the alert a notice came from', () => {
  it('is the one it names, else its kind’s own, else none', () => {
    expect(alertOf({ kind: 'down' })).toBe('stopped')
    expect(alertOf({ kind: 'up' })).toBe('stopped')
    expect(alertOf({ kind: 'spike', alert: 'surge' })).toBe('surge')
    expect(alertOf({ kind: 'plan' })).toBeUndefined()
  })
})

describe('turning an alert off for a site', () => {
  it('saves the same alert, disabled, and says so', async () => {
    vi.spyOn(more, 'alerts').mockResolvedValue({ alerts: [alert('spike', true)], kinds: [] })
    const save = vi.spyOn(more, 'saveAlert').mockResolvedValue(alert('spike', false))
    expect(await setAlertOn('s1', 'spike', false)).toBe('done')
    expect(save).toHaveBeenCalledWith('s1', { id: 'a1', kind: 'spike', enabled: false, target: 'me@x.com', threshold: 6 })
  })

  it('writes nothing when it already is so, or when the site has no such alert', async () => {
    const save = vi.spyOn(more, 'saveAlert').mockResolvedValue(alert('spike', false))
    vi.spyOn(more, 'alerts').mockResolvedValue({ alerts: [alert('spike', false)], kinds: [] })
    expect(await setAlertOn('s1', 'spike', false)).toBe('same')
    expect(await setAlertOn('s1', 'stopped', false)).toBe('none')
    expect(save).not.toHaveBeenCalled()
  })
})

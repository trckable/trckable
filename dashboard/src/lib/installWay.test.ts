import { describe, expect, it } from 'vitest'
import { isIos, wayToInstall } from './installWay'

describe('the install item', () => {
  it('is hidden where the browser offers nothing', () => {
    expect(wayToInstall({ offered: false, ios: false, installed: false })).toBeNull()
  })

  it('asks the browser once it has offered', () => {
    expect(wayToInstall({ offered: true, ios: false, installed: false })).toBe('prompt')
  })

  it('points to Share on iOS, which has no offer', () => {
    expect(wayToInstall({ offered: false, ios: true, installed: false })).toBe('ios')
  })

  it('is hidden in the installed app, whatever the browser says', () => {
    expect(wayToInstall({ offered: true, ios: false, installed: true })).toBeNull()
    expect(wayToInstall({ offered: false, ios: true, installed: true })).toBeNull()
  })

  it('knows iPhones and iPads, also the iPad that calls itself a Mac', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(isIos('Mozilla/5.0 (X11; Linux x86_64) Chrome/126', 0)).toBe(false)
  })
})

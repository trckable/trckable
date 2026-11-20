import { describe, expect, it } from 'vitest'
import { howKey, howName, isAppKey } from './copy'

describe('how a visit opened the site', () => {
  it('keys a visit the way the server groups it', () => {
    expect(howKey({ device: 'Desktop', os: 'macOS', app: '' })).toBe('Desktop')
    expect(howKey({ device: 'Desktop', os: 'Windows', app: 'app' })).toBe('Desktop|app')
    expect(howKey({ device: 'Mobile', os: 'iOS', app: '' })).toBe('iOS|browser')
    expect(howKey({ device: 'Mobile', os: 'iOS', app: 'browser' })).toBe('iOS|browser')
    expect(howKey({ device: 'Tablet', os: 'Android', app: 'app' })).toBe('Android|app')
    expect(howKey({ device: 'Mobile', os: 'iOS', app: 'instagram' })).toBe('instagram')
    expect(howKey({ device: 'Mobile', os: '', app: 'app' })).toBe('Mobile|app')
    expect(howKey({ device: '', os: '', app: 'app' })).toBe('')
  })

  it('names the six ways, and any other system the same way', () => {
    expect(['Desktop', 'iOS|browser', 'iOS|app', 'Android|browser', 'Android|app', 'instagram'].map(howName)).toEqual(['Desktop', 'iOS browser', 'iOS app', 'Android browser', 'Android app', 'Instagram'])
    expect(howName('Desktop|app')).toBe('Desktop app')
    expect(howName('Windows Phone|app')).toBe('Windows Phone app')
  })

  it('tells an app from a browser', () => {
    expect(['iOS|app', 'Desktop|app', 'instagram'].every(isAppKey)).toBe(true)
    expect(['Desktop', 'iOS|browser', ''].some(isAppKey)).toBe(false)
  })
})

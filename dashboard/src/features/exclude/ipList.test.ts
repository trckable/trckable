import { describe, expect, it } from 'vitest'
import { MAX_IPS, parseList, validEntry } from './ipList'

describe('an address or a range', () => {
  it('takes IPv4 and IPv6, alone or with bits', () => {
    for (const ok of ['203.0.113.7', '203.0.113.0/24', '0.0.0.0/0', '2001:db8::1', '2001:db8::/32', '::1', '::ffff:203.0.113.7']) expect(validEntry(ok), ok).toBe(true)
  })

  it('refuses everything else', () => {
    for (const bad of ['', 'banana', '203.0.113', '203.0.113.256', '203.0.113.0/33', '2001:db8::/129', '203.0.113.0/', '/24', 'fe80::1%eth0', '1.2.3.4-1.2.3.9', '203.0.113.0/24/8', '2001:::1', 'http://1.2.3.4']) expect(validEntry(bad), bad).toBe(false)
  })
})

describe('the list as typed', () => {
  it('skips blank lines and repeats, and trims', () => {
    expect(parseList(' 203.0.113.7 \n\n203.0.113.7\n198.51.100.0/24\n')).toEqual({ list: ['203.0.113.7', '198.51.100.0/24'] })
  })

  it('names the first bad line', () => {
    expect(parseList('203.0.113.7\nnope\nalso nope').bad).toBe('nope')
  })

  it('stops at fifty', () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `10.0.${i}.1`).join('\n')
    expect(parseList(lines(MAX_IPS)).many).toBeUndefined()
    expect(parseList(lines(MAX_IPS + 1)).many).toBe(true)
  })
})

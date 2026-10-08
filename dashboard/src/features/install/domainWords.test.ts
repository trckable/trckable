import { describe, expect, it } from 'vitest'
import { checkDomain, cleanDomain } from './domain'
import { domainWords } from './domainWords'

const say = (raw: string) => domainWords(checkDomain(cleanDomain(raw), raw), cleanDomain(raw))

describe('domainWords', () => {
  it('tells a space what to do, with an example', () => {
    expect(say('bad one')).toBe('Use a domain like example.com, with no spaces.')
  })
  it('tells a non-domain what to do, with an example', () => {
    expect(say('nodots')).toBe('That doesn’t look like a domain. Use one like example.com.')
  })
  it('says nothing for a full address, which is cleaned instead', () => {
    expect(say('https://www.example.com/pricing?x=1')).toBe('')
  })
  it('names the domain you already have', () => {
    expect(domainWords('added', 'example.com')).toBe('You already have example.com.')
  })
  it('says nothing for an empty or valid field', () => {
    expect(say('')).toBe('')
    expect(say('example.com')).toBe('')
  })
})

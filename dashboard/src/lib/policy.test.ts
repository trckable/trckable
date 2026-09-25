// The paragraph is a legal statement about what a site collects. If it says
// something the site does not do, or leaves out something it does, that is
// worse than having no generator at all — so every branch is pinned here.
import { describe, expect, it } from 'vitest'
import type { SiteConfig } from './api'
import { policyCaveats, policyText, type PolicyInput } from './policy'

const config = (over: Partial<SiteConfig> = {}): SiteConfig => ({
  consent_free: false,
  exclude_paths: [],
  honor_dnt: false,
  record_city: true,
  retention_days: 0,
  week_start: 1,
  bot_strict: false,
  groups: [],
  banner: { mode: '', text: '', accept: '', decline: '', policy: '', bg: '', fg: '', button: '', button_fg: '', position: '', radius: 0, css: '' },
  ...over,
})

const input = (over: Partial<PolicyInput> = {}): PolicyInput => ({
  domain: 'site.com',
  host: 'stats.site.com',
  config: config(),
  modules: {},
  ...over,
})

describe('policyText', () => {
  it('names the site and where trckable runs', () => {
    const t = policyText(input())
    expect(t).toContain('## Analytics on site.com')
    expect(t).toContain('we run ourselves on stats.site.com')
  })

  it('lists what is collected with one "and", not several', () => {
    const t = policyText(input({ modules: { goals: true, outbound: true } }))
    const line = t.split('\n').find((l) => l.startsWith('**What is recorded.'))!
    expect(line.match(/; and /g)).toHaveLength(1)
    expect(line).toContain('marked actions')
    expect(line).toContain('which files you downloaded')
  })

  it('leaves out modules that are off', () => {
    const t = policyText(input())
    expect(t).not.toContain('marked actions')
    expect(t).not.toContain('which files you downloaded')
    expect(t).not.toContain('**Purchases.**')
    expect(t).not.toContain('Do Not Track')
  })

  it('describes the cookie only when there is one', () => {
    expect(policyText(input())).toContain('`trckable_vid`')
    const free = policyText(input({ config: config({ consent_free: true, record_city: false, honor_dnt: true }) }))
    expect(free).toContain('it sets no cookie and stores nothing in your browser')
    expect(free).not.toContain('One cookie')
    expect(free).toContain('Do Not Track')
  })

  it('claims region and city only while they are recorded', () => {
    expect(policyText(input())).toContain('your country, region and city')
    expect(policyText(input({ config: config({ record_city: false }) }))).toContain('your country;')
    expect(policyText(input({ config: config({ record_city: false }) }))).not.toContain('city')
    expect(policyText(input({ config: config({ record_city: false }) }))).not.toContain('region')
  })

  it('says how long records are kept, in the site’s own words', () => {
    expect(policyText(input())).toContain('for as long as the site is running')
    expect(policyText(input({ config: config({ retention_days: 1 }) }))).toContain('after 1 day.')
    expect(policyText(input({ config: config({ retention_days: 90 }) }))).toContain('after 90 days.')
  })

  it('mentions payments only when revenue is on', () => {
    expect(policyText(input({ modules: { revenue: true } }))).toContain('your card details never reach us')
  })
})

describe('the cookie banner module', () => {
  it('says the cookie waits for the banner', () => {
    const t = policyText(input({ modules: { consent: true } }))
    expect(t).toContain('Until you answer our cookie banner')
    expect(t).toContain('If you change your mind, that cookie is deleted')
    expect(t).not.toContain('your consent may be required')
    // Only trckable's own bar keeps the answer; a CMP keeps its own.
    expect(t).not.toContain('Your answer itself')
  })

  it("owns up to the one thing trckable's own bar stores", () => {
    const bar = { ...config(), banner: { ...config().banner, mode: 'bar' as const } }
    const t = policyText(input({ config: bar, modules: { consent: true } }))
    expect(t).toContain('Until you answer our cookie banner')
    expect(t).toContain('Your answer itself — yes or no — is kept in your browser')
  })

  it('says our bar covers trckable and nothing else on the page', () => {
    const bar = { ...config(), banner: { ...config().banner, mode: 'bar' as const } }
    const cs = policyCaveats(input({ config: bar, modules: { consent: true } }))
    expect(cs[0]).toContain('need their own consent')
  })

  it('does not describe a banner in cookieless mode, nor promise that none is needed', () => {
    const t = policyText(input({ config: config({ consent_free: true, record_city: false }), modules: { consent: true } }))
    expect(t).toContain('running in cookieless mode')
    expect(t).toContain('your IP address itself is never stored')
    expect(t).not.toContain('Until you answer our cookie banner')
    expect(t).not.toMatch(/no banner|do not ask for your consent/)
  })

  it('says a visitor who declines is not counted at all', () => {
    const t = policyText(input({ modules: { consent: true } }))
    expect(t).toContain('If you decline, your visit is not counted at all')
  })

  it('names the countries where cookieless mode is not enough on its own', () => {
    const cs = policyCaveats(input({ config: config({ consent_free: true }) }))
    expect(cs.some((c) => c.includes('Germany and Austria'))).toBe(true)
  })

  it('asks about the banner instead of about consent', () => {
    const cs = policyCaveats(input({ modules: { consent: true } }))
    expect(cs[0]).toContain('refusing is as easy as agreeing')
    expect(cs.some((c) => c.includes('normally needs consent'))).toBe(false)
  })
})

describe('policyCaveats', () => {
  it('warns about consent while a cookie is set', () => {
    expect(policyCaveats(input())[0]).toContain('needs consent')
  })

  it('drops the consent and city warnings in consent-free mode', () => {
    const cs = policyCaveats(input({ config: config({ consent_free: true, record_city: false }) }))
    expect(cs.some((c) => c.includes('needs consent'))).toBe(false)
    expect(cs.some((c) => c.startsWith('City is being recorded'))).toBe(false)
  })

  it('always says it covers trckable alone', () => {
    for (const p of [input(), input({ config: config({ consent_free: true }) })]) {
      expect(policyCaveats(p).at(-1)).toContain('needs its own paragraph')
    }
  })
})

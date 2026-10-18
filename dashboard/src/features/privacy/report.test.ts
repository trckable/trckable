// The report states facts about a site, so each combination of settings is
// pinned: what it says must follow what the site is set to.
import { describe, expect, it } from 'vitest'
import type { SiteConfig } from '../../lib/api'
import type { PolicyInput } from '../../lib/policy'
import { buildReport, bannerKind, COOKIE } from './report'

const config = (over: Partial<SiteConfig> = {}): SiteConfig => ({
  consent_free: false,
  exclude_paths: [],
  honor_dnt: false,
  record_city: false,
  retention_days: 0,
  week_start: 1,
  bot_strict: false,
  groups: [],
  banner: { mode: '', text: '', accept: '', decline: '', policy: '', bg: '', fg: '', button: '', button_fg: '', position: '', radius: 0, css: '' },
  ...over,
})
const input = (over: Partial<PolicyInput> = {}): PolicyInput => ({ domain: 'site.com', host: 'stats.site.com', config: config(), modules: {}, ...over })
const value = (r: ReturnType<typeof buildReport>, label: RegExp) => r.settings.find((x) => label.test(x.label))?.value

describe('buildReport', () => {
  it('cookieless: stores nothing, banner usually not needed', () => {
    const r = buildReport(input({ config: config({ consent_free: true }) }))
    expect(value(r, /Cookieless/)).toBe('On')
    expect(r.notCollected.join('\n')).toContain('No cookie')
    expect(r.notCollected.join('\n')).not.toContain(COOKIE.name)
    expect(r.banner).toMatch(/^Usually not/)
    expect(r.banner).toContain('Germany and Austria')
  })

  it('cookie mode names the cookie and its lifetime, and needs a banner', () => {
    const r = buildReport(input())
    expect(value(r, /Cookieless/)).toBe('Off')
    expect(r.notCollected.join('\n')).toContain(`${COOKIE.name}, holding a random id for 400 days`)
    expect(bannerKind(input())).toBe('cookie')
    expect(r.banner).toMatch(/^Yes/)
  })

  it('consent mode: the cookie waits for the answer', () => {
    const p = input({ modules: { consent: true } })
    const r = buildReport(p)
    expect(value(r, /Consent mode/)).toBe('On')
    expect(r.notCollected.join('\n')).toContain('only after the visitor agrees')
    expect(bannerKind(p)).toBe('asks')
  })

  it('the city is listed only when it is recorded and cookies are in use', () => {
    expect(buildReport(input({ config: config({ record_city: true }) })).collected).toContain('Country, region and city')
    expect(buildReport(input({ config: config({ record_city: true, consent_free: true }) })).collected).toContain('Country')
  })

  it('states retention and the number of exclusions', () => {
    const r = buildReport(input({ config: config({ retention_days: 90, exclude_paths: ['/a', '/b'], exclude_ips: ['203.0.113.7'] }) }))
    expect(value(r, /Retention/)).toBe('Visits are deleted after 90 days')
    expect(value(r, /paths/)).toBe('2')
    expect(value(r, /IP/)).toBe('1')
    expect(value(buildReport(input()), /Retention/)).toContain('until you delete')
  })

  it('tells what has no switch with what is collected, and lists only the choices that are on', () => {
    const r = buildReport(input({ modules: { goals: true, forms: true, vitals: false } }))
    expect(r.modules).toHaveLength(2)
    expect(r.modules.join('\n')).toContain('never what was typed')
    expect(buildReport(input()).modules).toEqual([])
    expect(buildReport(input()).collected.join('\n')).toContain('robots that read the site')
    expect(buildReport(input({ config: config({ consent_free: true }) })).collected.join('\n')).not.toContain('random id')
  })

  it('carries the generated policy paragraph, and says the data stays on your server', () => {
    const r = buildReport(input())
    expect(r.policy).toContain('## Analytics on site.com')
    expect(r.where).toContain('On your server')
  })
})

describe('buildReport and Answers', () => {
  it('tells where the questions go only when assistants are asked', () => {
    expect(buildReport(input()).whereAnswers).toBeUndefined()
    expect(buildReport(input({ answers: [] } as never)).whereAnswers).toBeUndefined()
    const r = buildReport({ ...input(), answers: ['OpenAI', 'Perplexity', 'Anthropic'] })
    expect(r.whereAnswers).toBe('Answers sends your questions to OpenAI, Perplexity, and Anthropic. Nothing about your visitors.')
    expect(r.where).toContain('On your server')
  })
})

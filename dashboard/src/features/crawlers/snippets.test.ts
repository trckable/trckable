import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AI_BOTS, snippetsFor, type Plan, type Setup } from './snippets'

const plan: Plan = { host: 'https://stats.example.com', site: 'tkb_abc123', key: 'tkb_px_secret', domain: 'site.com' }
const SETUPS: Setup[] = ['cloudflare', 'vercel', 'nginx', 'caddy', 'other']

/** The robots the server counts as AI: its own list, read from the source. */
function serverAI(): string[] {
  const go = readFileSync(new URL('../../../../server/internal/ingest/crawlers.go', import.meta.url), 'utf8')
  return [...go.matchAll(/\{"([a-z0-9-]+)", Crawler\{"[^"]+", "(answer|train)"\}\}/g)].map((m) => m[1])
}

describe('the robots the snippets look for', () => {
  it('are exactly the ones the server counts as AI, so a setup never misses one', () => {
    const server = serverAI()
    expect(server.length).toBeGreaterThan(20)
    expect([...AI_BOTS].sort()).toEqual([...server].sort())
  })

  it('are matched whatever the case, and the token is what nginx hands over', () => {
    const re = new RegExp(`(?<t>${AI_BOTS.join('|')})`, 'i')
    for (const token of AI_BOTS) {
      const m = `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ${token.toUpperCase()}/1.0)`.match(re)
      expect(m?.groups?.t.toLowerCase(), token).toBe(token)
    }
    expect('Mozilla/5.0 (Macintosh) Chrome/140 Safari/537.36').not.toMatch(re)
  })
})

describe('each setup', () => {
  it('names this site and this server, and has something to paste', () => {
    for (const setup of SETUPS) {
      const all = snippetsFor(setup, plan)
      expect(all.length, setup).toBeGreaterThan(0)
      for (const s of all) {
        expect(s.code, setup).toContain(plan.host + '/api/crawl')
        expect(s.code, setup).toContain(plan.site)
      }
    }
  })

  it('never carries a visitor: no address, no cookie, no id', () => {
    for (const setup of SETUPS) {
      for (const s of snippetsFor(setup, plan)) {
        expect(s.code, setup).not.toMatch(/connecting-ip|x-forwarded|x-real-ip|remote_addr|remoteAddr|cookie/i)
      }
    }
  })

  it('send the four fields the endpoint reads, and the key in the header it checks', () => {
    for (const setup of SETUPS) {
      const code = snippetsFor(setup, plan)[0].code
      expect(code.toLowerCase(), setup).toContain('x-trckable-proxy-key')
      expect(code, setup).toMatch(/\bs\b|"s"/)
      expect(code, setup).toMatch(/\bu\b|"u"/)
      expect(code, setup).toMatch(/\bua\b|"ua"/)
    }
  })
})

describe('the docs page', () => {
  it('carries every setup exactly as the sheet gives it (with the example address, id and key in it)', () => {
    const docs = readFileSync(new URL('../../../../docs/ai-search.md', import.meta.url), 'utf8')
    const example: Plan = { host: 'https://stats.example.com', site: 'tkb_yoursiteid', key: 'tkb_px_yourkey', domain: 'example.com' }
    for (const setup of SETUPS) {
      for (const s of snippetsFor(setup, example)) expect(docs, `${setup} ${s.id}`).toContain(s.code)
    }
  })
})

describe('Cloudflare and Vercel', () => {
  it('report after the answer has gone, and keep the key out of the code', () => {
    for (const setup of ['cloudflare', 'vercel'] as const) {
      const code = snippetsFor(setup, plan)[0].code
      expect(code, setup).toContain('waitUntil')
      expect(code, setup).toContain('TRCKABLE_PROXY_KEY')
      expect(code, setup).not.toContain(plan.key)
    }
  })

  it('the Worker passes the request on first and reports its status', () => {
    const code = snippetsFor('cloudflare', plan)[0].code
    expect(code.indexOf('await fetch(request)')).toBeLessThan(code.indexOf('waitUntil'))
    expect(code).toContain('st: response.status')
    expect(code).toContain('site.com/*')
  })
})

describe('nginx and Caddy', () => {
  it('the mirror hands over a token, not the user agent, and skips an address that could break the body', () => {
    const mirror = snippetsFor('nginx', plan)[0].code
    expect(mirror).toContain('mirror /_trckable')
    expect(mirror).toContain('"ua":"$trk_bot"')
    expect(mirror).not.toContain('$http_user_agent"')
    expect(mirror).toContain('\\x22')
    expect(mirror).toContain(plan.key)
  })

  it('the log lines are JSON with the status as a number, and only robots are logged', () => {
    const log = snippetsFor('nginx', plan)[1].code
    expect(log).toContain('escape=json')
    expect(log).toContain('"status":$status}')
    expect(log).toContain('if=$trk_bot')
    expect(snippetsFor('caddy', plan)[0].code).toContain('format json')
  })

  it('the forwarder builds the body with jq, so nothing in a log line is spliced into it', () => {
    for (const setup of ['nginx', 'caddy'] as const) {
      const all = snippetsFor(setup, plan)
      const code = all[all.length - 1].code
      expect(code).toContain("jq -c --unbuffered '")
      expect(code).toContain('-d "$body"')
    }
  })
})

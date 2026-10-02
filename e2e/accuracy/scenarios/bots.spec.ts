// Robots are not visitors. Headless browsers, scripts, crawlers and referrer
// spam are dropped; the AI crawlers that read a site are counted apart, from
// the site's own server, and never as a visit.
import { CHROME_UA, kind, scene, test, expect } from '../harness'

const BOTS = [
  '',
  'curl/8.4.0',
  'python-requests/2.31.0',
  'Go-http-client/2.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0 Safari/537.36',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
]

test('robots, scripts and referrer spam are not visitors; a person beside them still is', async ({ lab }) => {
  kind('server')
  const s = await scene(lab, 'robots')
  const u = `https://${s.site.domain}/a`
  let n = 0
  for (const ua of BOTS) await lab.server.send({ s: s.site.id, k: 'pv', u, id: `bot${n++}`, pv: `bp${n}` }, { 'user-agent': ua })
  await lab.server.send({ s: s.site.id, k: 'pv', u, r: 'https://0-0.fr/', id: 'spam1', pv: 'sp1' }) // a spammer's referrer
  await lab.server.send({ s: s.site.id, k: 'pv', u, id: 'human1', pv: 'hp1', v: 'abc123.m1a2b3' })
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, bounce: 1 })
})

test('a browser under automation is not counted unless the site says it is testing', async ({ page, lab }) => {
  kind('browser')
  const s = await scene(lab, 'automation')
  // The script as a site installs it: no data-dev.
  lab.web.page(s.prefix + '/a', `<!doctype html><html><head><script defer src="${lab.server.url}/js/t.js" data-site="${s.site.id}"></script></head><body><h1>a</h1></body></html>`)
  await page.goto(s.url('/a'))
  await page.waitForTimeout(1000)
  await lab.settled(s.site, { visitors: 0, sessions: 0, pageviews: 0 })
})

test('AI crawlers are counted by what they were doing, and are never visitors', async ({ lab }) => {
  kind('server')
  const s = await scene(lab, 'ai-crawlers')
  await lab.server.module(s.site, 'crawlers', true)
  const hit = (ua: string, path: string) =>
    fetch(lab.server.url + '/api/crawl', {
      method: 'POST',
      headers: { 'X-Trckable-Proxy-Key': s.site.key },
      body: JSON.stringify({ s: s.site.id, u: `https://${s.site.domain}${path}`, ua, st: 200 }),
    })
  const GPT = 'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)'
  const CLAUDE = 'Mozilla/5.0 AppleWebKit/537.36 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'
  const ASKED = 'Mozilla/5.0 AppleWebKit/537.36 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)'
  for (const [ua, path] of [
    [GPT, '/a'],
    [GPT, '/b'],
    [CLAUDE, '/a'],
    [ASKED, '/a'],
    [ASKED, '/b'],
  ])
    expect((await hit(ua, path)).status).toBe(202)
  await lab.server.send({ s: s.site.id, k: 'pv', u: `https://${s.site.domain}/a`, id: 'person1', pv: 'pp1', v: 'abc999.m1a2b3' }, { 'user-agent': CHROME_UA })
  // Hits are written once the writer has them: wait for them, and for nothing more.
  const want = { total: 5, kinds: { train: 3, answer: 2 } }
  let got: { total: number; kinds: Record<string, number> } = { total: 0, kinds: {} }
  for (let i = 0; i < 40 && got.total < want.total; i++) {
    got = (await lab.server.crawlers(s.site)) as typeof got
    if (got.total < want.total) await new Promise((r) => setTimeout(r, 500))
  }
  await new Promise((r) => setTimeout(r, 1500))
  got = (await lab.server.crawlers(s.site)) as typeof got
  expect(got.total).toBe(want.total)
  expect(got.kinds).toEqual(want.kinds)
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1 }) // only the person
})

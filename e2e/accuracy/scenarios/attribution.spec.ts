// Where each visit came from is decided by its first page, and no later page,
// route or navigation changes it: the referrer, the campaign and the click
// that paid are kept exactly as they arrived.
import { expect } from '@playwright/test'
import { kind, person, scene, test } from '../harness'

test.beforeEach(() => kind('browser'))

test('every visit keeps the source it arrived with, through pages and routes', async ({ page, lab }) => {
  const s = await scene(lab, 'sources')
  s.page('/a', `<a id="b" href="${s.prefix}/b?utm_source=other&utm_medium=cpc">b</a>`)
  s.page('/b', `<button id="route" onclick="history.pushState({}, '', '${s.prefix}/c?utm_campaign=later')">c</button>`)
  const arrive = async (url: string, referer?: string, routes = false) => {
    const p = await person(page)
    // The pageviews go out as beacons after each page has loaded: the visit is closed only once the one of every page it saw has, or a slow browser loses the last one.
    const seen = new Set<string>()
    p.page.on('response', (res) => {
      const r = res.request()
      if (r.method() !== 'POST' || !r.url().includes('/api/e')) return
      const body = r.postData() ?? ''
      if (!body.includes('"k":"pv"')) return
      const u = /"u":"[^"]*\/(a|b|c)\?/.exec(body) ?? /"u":"[^"]*\/(a|b|c)"/.exec(body)
      if (!u) return
      // Only an accepted pageview counts: any other answer is kept to be read in the report.
      if (res.status() === 202) seen.add(u[1])
      else console.log(`attribution: the pageview of /${u[1]} was answered ${res.status()}`)
    })
    await p.page.goto(s.url(url), referer ? { referer } : undefined)
    await p.page.click('#b')
    await p.page.waitForURL('**/b?*')
    if (routes) await p.page.click('#route')
    await expect.poll(() => [...seen].sort().join(''), { timeout: 15_000 }).toBe(routes ? 'abc' : 'ab')
    await p.ctx.close()
  }
  await arrive('/a?utm_source=news&utm_medium=email&utm_campaign=oct', 'https://www.google.com/', true) // a campaign beats the search it came through
  await arrive('/a', 'https://www.google.com/search?q=trckable')
  await arrive('/a', 'https://news.ycombinator.com/item?id=1')
  await arrive('/a', 'https://some-blog.example/post')
  await arrive('/a?ref=producthunt')
  await arrive('/a?gclid=abc123')
  await arrive('/a') // nobody sent them
  await lab.settled(
    s.site,
    {
      visitors: 7,
      sessions: 7,
      pageviews: 15, // two pages each, and the route on the first visit
      bounce: 0,
      channels: { Email: 1, Search: 1, Social: 2, Referral: 1, Paid: 1, Direct: 1 },
      sources: { news: 1 },
      mediums: { email: 1 },
      campaigns: { oct: 1 },
      referrers: { 'google.com': 2, 'news.ycombinator.com': 1, 'some-blog.example': 1, 'producthunt.com': 1 },
      entries: { '/a': 7 },
    },
    { prefix: s.prefix },
  )
})

// What the visitor asked for, and what the owner asked for, is exactly what is
// counted: consent, Do Not Track, the owner's own browser, and the proxy that
// carries events from the site's own domain.
import { expect, hide, kind, scene, test } from '../harness'

test.beforeEach(() => kind('browser'))

const ASK = `<script>window.dataLayer = window.dataLayer || []; function gtag() { dataLayer.push(arguments) }; gtag('consent', 'default', { analytics_storage: 'denied' })</script>`
const answer = (what: 'granted' | 'denied') => `<button id="answer" onclick="gtag('consent', 'update', { analytics_storage: '${what}' })">answer</button>`
const GOAL = '<button id="signup" data-trckable-goal="signup">sign up</button>'

async function consenting(lab: Parameters<typeof scene>[0], name: string, what: 'granted' | 'denied') {
  const s = await scene(lab, name, 'site')
  await lab.server.module(s.site, 'consent', true)
  // The consent default comes first, before the script, as a banner's own code runs.
  s.bare('/a', ASK + s.tag + GOAL + answer(what) + `<button id="route" onclick="history.pushState({}, '', '${s.prefix}/b')">b</button>`)
  return s
}

test('what a visitor does before answering the cookie banner is counted once they accept, with a cookie', async ({ page, context, lab }) => {
  const s = await consenting(lab, 'consent-granted', 'granted')
  await page.goto(s.url('/a'))
  await page.click('#signup') // before the answer: held, not sent
  await page.waitForTimeout(1000)
  expect(await lab.server.events(s.site)).toHaveLength(0)
  await page.click('#answer')
  await page.click('#route')
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, goals: { signup: 1 } })
  expect((await context.cookies()).some((c) => c.name === 'trckable_vid')).toBe(true)
})

test('a visitor who declines is not counted at all, not by a cookie and not without one', async ({ page, context, lab }) => {
  const s = await consenting(lab, 'consent-declined', 'denied')
  await page.goto(s.url('/a'))
  await page.click('#signup')
  await page.click('#answer')
  await page.click('#route')
  await page.click('#signup')
  await hide(page) // leaving must not count what they refused
  await lab.settled(s.site, { visitors: 0, sessions: 0, pageviews: 0 })
  expect((await context.cookies()).some((c) => c.name === 'trckable_vid')).toBe(false)
})

test('a visitor who leaves without answering is counted without a cookie', async ({ page, context, lab }) => {
  const s = await consenting(lab, 'consent-unanswered', 'granted')
  await page.goto(s.url('/a'))
  await page.waitForTimeout(500)
  await hide(page) // another tab: nobody has answered
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, bounce: 1 })
  expect((await context.cookies()).some((c) => c.name === 'trckable_vid')).toBe(false)
})

test('Do Not Track and Global Privacy Control are honoured, direct and through the proxy', async ({ browser, lab }) => {
  for (const mode of ['direct', 'proxy'] as const) {
    const s = await scene(lab, `gpc-${mode}`, mode)
    await lab.server.config(s.site, { honor_dnt: true })
    s.page('/a', '<h1>a</h1>')
    const visit = async (headers: Record<string, string>) => {
      const ctx = await browser.newContext({ extraHTTPHeaders: headers })
      const p = await ctx.newPage()
      await p.goto(s.url('/a'))
      await p.waitForTimeout(500)
      await ctx.close()
    }
    await visit({ 'Sec-GPC': '1' })
    await visit({ DNT: '1' })
    await visit({})
    await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, bounce: 1 })
  }
})

test('leaving a browser out of the counts with ?trckable=ignore holds on every page, until ?trckable=track', async ({ page, lab }) => {
  const s = await scene(lab, 'own-visits')
  s.page('/a', `<a id="b" href="${s.prefix}/b">b</a>`)
  s.page('/b', '<h1>b</h1>')
  await page.goto(s.url('/a?trckable=ignore'))
  await page.click('#b')
  await page.waitForURL('**/b')
  await page.goto(s.url('/a'))
  await lab.settled(s.site, { visitors: 0, sessions: 0, pageviews: 0 })
  await page.goto(s.url('/a?trckable=track'))
  await page.click('#b')
  await page.waitForURL('**/b')
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, pages: ['/a', '/b'] }, { prefix: s.prefix })
})

test('through the proxy with its key, visitors keep a long cookie and stay one person each', async ({ browser, lab }) => {
  const s = await scene(lab, 'proxy-key', 'proxy')
  s.page('/a', GOAL + `<a id="next" href="${s.prefix}/b">b</a>`)
  s.page('/b', '<h1>b</h1>')
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.goto(s.url('/a'))
    await p.click('#signup') // before the first answer could have set a cookie
    await p.click('#next')
    await p.waitForURL('**/b')
    await p.waitForTimeout(800)
    const cookie = (await ctx.cookies()).find((c) => c.name === 'trckable_vid')!
    expect((cookie.expires * 1000 - Date.now()) / 86_400_000).toBeGreaterThan(300) // the server's, not Safari's 7 days
    await ctx.close()
  }
  await lab.settled(s.site, { visitors: 2, sessions: 2, pageviews: 4, bounce: 0, goals: { signup: 2 }, converted: { signup: 2 } })
})

test('a click that leaves before the first answer is the same visitor, and the checkout link carries them', async ({ page, context, lab }) => {
  const s = await scene(lab, 'checkout-first-visit', 'proxy')
  s.page('/a', '<a id="buy" href="https://buy.stripe.com/test_checkout">buy</a>')
  await page.route('https://buy.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>paid</h1>' }))
  await page.route('**/api/e', async (route) => {
    const sent = await route.fetch() // the server has the event at once
    await new Promise((r) => setTimeout(r, 1500)) // its answer, with the cookie, is slow
    await route.fulfill({ response: sent }).catch(() => undefined)
  })
  await page.goto(s.url('/a'))
  await page.click('#buy')
  await page.waitForURL('https://buy.stripe.com/**')
  const id = (await context.cookies()).find((c) => c.name === 'trckable_vid')!.value
  expect(new URL(page.url()).searchParams.get('client_reference_id')).toBe('trckable_' + id.replace('.', '_'))
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, goals: { outbound_click: 1 } })
})

test('a proxy with no key says so, loudly, and counts nothing wrongly', async ({ page, lab }) => {
  const s = await scene(lab, 'proxy-no-key', 'nokey')
  s.page('/a', '<h1>a</h1>')
  const answered = page.waitForResponse('**/api/e')
  await page.goto(s.url('/a'))
  const r = await answered
  expect(r.status()).toBe(500)
  expect(await r.text()).toContain('TRCKABLE_PROXY_KEY')
  await lab.settled(s.site, { visitors: 0, sessions: 0, pageviews: 0 })
})

test('a reverse proxy that adds no key still sees every person as themselves', async ({ browser, lab }) => {
  const s = await scene(lab, 'proxy-plain', 'plain')
  s.page('/a', '<h1>a</h1>')
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.goto(s.url('/a'))
    await p.waitForTimeout(800)
    await ctx.close()
  }
  await lab.settled(s.site, { visitors: 3, sessions: 3, pageviews: 3, bounce: 1 })
})

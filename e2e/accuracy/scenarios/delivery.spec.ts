// Getting events to the server when the network, the browser or the visitor
// does not help: offline, lost answers, slow answers, cookies refused, a server
// that is down for a moment. Each event counts exactly once.
import { expect, kind, scene, test } from '../harness'

test.beforeEach(() => kind('browser'))

const BUTTON = (prefix: string, next: string) => `<button id="signup" data-trckable-goal="signup">sign up</button><a id="next" href="${prefix}${next}">next</a>`

test('events made offline arrive once the visitor is back online', async ({ page, context, lab }) => {
  const s = await scene(lab, 'offline')
  s.page('/a', BUTTON(s.prefix, '/b'))
  s.page('/b', '<h1>b</h1>')
  await page.goto(s.url('/a'))
  await lab.settled(s.site, { pageviews: 1 })
  await context.setOffline(true)
  await page.click('#signup')
  await page.waitForTimeout(300)
  await context.setOffline(false)
  await page.goto(s.url('/b'))
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, goals: { signup: 1 }, converted: { signup: 1 } })
})

test('an answer that never came back is not counted twice when it is sent again', async ({ page, lab }) => {
  const s = await scene(lab, 'lost-answers')
  s.page('/a', BUTTON(s.prefix, '/b'))
  s.page('/b', '<h1>b</h1>')
  let lost = 0
  // The event reaches the server, and the answer is cut: the browser cannot know.
  await page.route('**/api/e', async (route) => {
    if (lost++ < 2) {
      await route.fetch()
      await route.abort('connectionreset')
    } else await route.continue()
  })
  await page.goto(s.url('/a'))
  await page.waitForTimeout(500)
  await page.click('#signup')
  await page.waitForTimeout(500)
  await page.unroute('**/api/e')
  await page.goto(s.url('/b')) // sends everything that was not acknowledged, again
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, goals: { signup: 1 } })
})

test('events that never reached the server are sent on the next page, once', async ({ page, lab }) => {
  const s = await scene(lab, 'refused')
  s.page('/a', BUTTON(s.prefix, '/b'))
  s.page('/b', '<h1>b</h1>')
  let n = 0
  await page.route('**/api/e', (route) => (n++ < 2 ? route.abort('connectionrefused') : route.continue()))
  await page.goto(s.url('/a'))
  await page.waitForTimeout(500)
  await page.click('#signup')
  await page.waitForTimeout(500)
  await page.unroute('**/api/e')
  await page.goto(s.url('/b'))
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, goals: { signup: 1 } })
})

test('a slow server and a quick visitor lose nothing', async ({ page, lab }) => {
  const s = await scene(lab, 'slow')
  for (const [p, next] of [
    ['/a', '/b'],
    ['/b', '/c'],
    ['/c', '/a'],
  ])
    s.page(p, BUTTON(s.prefix, next))
  await page.route('**/api/e', async (route) => {
    const sent = await route.fetch() // the server has the event at once
    await new Promise((r) => setTimeout(r, 2500)) // and its answer is slow
    await route.fulfill({ response: sent }).catch(() => undefined)
  })
  await page.goto(s.url('/a'))
  await page.click('#signup')
  await page.click('#next')
  await page.waitForURL('**/b')
  await page.click('#next')
  await page.waitForURL('**/c')
  await page.unroute('**/api/e')
  await page.goto(s.url('/a')) // anything cut off by leaving is sent again here
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 4, goals: { signup: 1 }, bounce: 0 })
})

test('a browser that refuses cookies is one visitor, not one per event', async ({ page, lab }) => {
  const s = await scene(lab, 'no-cookies')
  s.page('/a', BUTTON(s.prefix, '/b') + `<button id="route" onclick="history.pushState({}, '', '${s.prefix}/c')">c</button>`)
  s.page('/b', '<h1>b</h1>')
  await page.addInitScript(() => {
    Object.defineProperty(document, 'cookie', { get: () => '', set: () => undefined, configurable: true })
  })
  await page.goto(s.url('/a'))
  await page.click('#signup')
  await page.click('#route')
  await page.click('#signup')
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, goals: { signup: 2 }, converted: { signup: 1 } })
})

test('without a cookie or storage, an event the server refused is sent again from memory, once', async ({ page, lab }) => {
  const s = await scene(lab, 'cookieless-retry', 'direct', 'data-cookieless')
  s.page('/a', '<h1>a</h1>')
  let n = 0
  await page.route('**/api/e', (route) => (n++ < 1 ? route.fulfill({ status: 503, body: 'deploying' }) : route.continue()))
  await page.goto(s.url('/a'))
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, bounce: 1 })
  expect(await page.evaluate(() => localStorage.length + document.cookie.length)).toBe(0) // it kept nothing
})

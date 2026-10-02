// A server that is down for hours. A visitor's browser keeps what it could not
// send (24 hours, 200 events) and sends it, oldest first, with each event's id
// and its age, as soon as the server answers: the visit is counted once, on the
// day it happened. Each scenario has its own trckabled, stopped and started by
// the test, and a page whose script comes from the site's own origin, so the
// page still loads while trckabled is down.
//
// The test cannot make a server's clock run, so the visitor's clock runs ahead
// instead: two hours (or twenty) pass in the browser between the visit and the
// moment the server comes back. The server dates an event by its own clock
// minus the age it is told, so a visit made at 14:00 and delivered "two hours
// later" is stored at 12:00: two hours before the moment it was made.
import { type BrowserContext, type Page } from '@playwright/test'
import { Server, Web, expect, kind, scene, test, type Lab } from '../harness'

const HOUR = 3_600_000
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const STEP = (prefix: string, next: string) => `<button id="signup" data-trckable-goal="signup">sign up</button><a id="next" href="${prefix}${next}">next</a>`

/** The visitor's clock reads real time plus `window.__skew`, which a test sets. */
async function clock(context: BrowserContext) {
  await context.addInitScript(() => {
    const real = Date.now.bind(Date)
    Date.now = () => real() + ((window as unknown as { __skew?: number }).__skew ?? 0)
  })
}

/** A trckabled of its own, a site beside it, and the lab that goes with them. */
async function own(lab: Lab, run: (own: Lab, server: Server) => Promise<void>) {
  const server = new Server()
  await server.start()
  const web = new Web(server)
  await web.start()
  try {
    await run({ ...lab, server, web } as Lab, server)
  } finally {
    await web.stop()
    await server.dispose()
  }
}

const goto = async (page: Page, url: string) => {
  await page.goto(url)
  await page.waitForLoadState('load')
}

test('a server that is down for two hours, then back: the visit made meanwhile is counted once, two hours back', async ({ page, context, lab }) => {
  kind('browser')
  await clock(context)
  await own(lab, async (lab, server) => {
    const s = await scene(lab, 'outage-2h', 'local')
    s.page('/a', STEP(s.prefix, '/b'))
    s.page('/b', STEP(s.prefix, '/c'))
    s.page('/c', '<h1>c</h1>')
    await server.stop()

    // Three pages, three sign-ups, and nothing answers.
    const from = Date.now()
    await goto(page, s.url('/a'))
    for (let i = 0; i < 3; i++) {
      await page.click('#signup')
      await page.waitForTimeout(100)
    }
    await page.click('#next')
    await page.waitForURL('**/b')
    await page.click('#next')
    await page.waitForURL('**/c')
    const to = Date.now()

    // Two hours later, on the visitor's clock, the server is back.
    await page.evaluate((ms) => ((window as unknown as { __skew: number }).__skew = ms), 2 * HOUR)
    await server.start()
    await page.evaluate(() => window.dispatchEvent(new Event('online'))) // the browser knows before the next pause is over

    const then = day(from - 2 * HOUR) === day(to - 2 * HOUR) ? { days: { [day(from - 2 * HOUR)]: { sessions: 1, pageviews: 3 } } } : {}
    await lab.settled(
      s.site,
      { visitors: 1, sessions: 1, pageviews: 3, bounce: 0, goals: { signup: 3 }, converted: { signup: 1 }, pages: ['/a', '/b', '/c'], ...then },
      { server, prefix: s.prefix },
    )
    // Every event is dated to when it was made, less the two hours.
    const evs = await server.events(s.site)
    expect(evs.length).toBeGreaterThanOrEqual(6) // 3 page views and 3 goals, and the reports of leaving a page
    for (const e of evs) {
      const at = Date.parse(e.ts)
      expect(at, `${e.kind} ${e.path} is dated ${e.ts}`).toBeGreaterThan(from - 2 * HOUR - 5000)
      expect(at, `${e.kind} ${e.path} is dated ${e.ts}`).toBeLessThan(to - 2 * HOUR + 5000)
    }
  })
})

test('a server that is down for twenty hours and a visitor who comes back the next day: each visit is on its own day', async ({ page, context, lab }) => {
  kind('browser')
  await clock(context)
  await own(lab, async (lab, server) => {
    const s = await scene(lab, 'outage-20h', 'local')
    s.page('/a', STEP(s.prefix, '/b'))
    s.page('/b', '<h1>b</h1>')
    s.page('/d', STEP(s.prefix, '/d'))
    await server.stop()

    // The first visit, with the server down. The visitor closes the tab.
    const from = Date.now()
    await goto(page, s.url('/a'))
    await page.click('#signup')
    await page.waitForTimeout(100)
    await page.click('#next')
    await page.waitForURL('**/b')
    const to = Date.now()
    await page.close()

    // The next day (twenty hours on the visitor's clock) the server is back, and the visitor returns.
    await context.addInitScript('window.__skew = ' + 20 * HOUR)
    await server.start()
    const back = await context.newPage()
    const returned = Date.now()
    await goto(back, s.url('/d'))
    const returnedTo = Date.now()

    // Yesterday's page views are dated yesterday, today's today; the order they arrive in is the order they happened in.
    const first = day(from - 20 * HOUR)
    const sameDay = first === day(to - 20 * HOUR) && day(returned) === day(returnedTo)
    const days = sameDay
      ? first === day(returned)
        ? { [first]: { sessions: 2, pageviews: 3 } }
        : { [first]: { sessions: 1, pageviews: 2 }, [day(returned)]: { sessions: 1, pageviews: 1 } }
      : undefined
    await lab.settled(
      s.site,
      { visitors: 1, sessions: 2, pageviews: 3, goals: { signup: 1 }, converted: { signup: 1 }, pages: ['/a', '/b', '/d'], ...(days ? { days } : {}) },
      { server, prefix: s.prefix },
    )
    const evs = await server.events(s.site)
    for (const e of evs.filter((x) => x.path.endsWith('/a') || x.path.endsWith('/b'))) {
      const at = Date.parse(e.ts)
      expect(at, `${e.kind} ${e.path} is dated ${e.ts}`).toBeLessThan(to - 20 * HOUR + 5000)
      expect(at, `${e.kind} ${e.path} is dated ${e.ts}`).toBeGreaterThan(from - 20 * HOUR - 5000)
    }
  })
})

test('an event sent again twenty hours on, across a restart, is counted once; one older than a day is refused', async ({ lab }) => {
  kind('server')
  await own(lab, async (lab, server) => {
    const s = await scene(lab, 'resend-20h')
    const u = `https://${s.site.domain}/late`
    const v = 'rs0001.m1a2b3'
    const pv = { s: s.site.id, k: 'pv', u, id: 'rs1', pv: 'rsp1', v }
    expect(await server.send({ ...pv, a: 20 * HOUR })).toBe(202)
    await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, pages: ['/late'] }, { server })

    // The server is redeployed, and the browser, which never saw the answer, sends the same event again.
    await server.stop('SIGTERM')
    await server.start()
    expect(await server.send({ ...pv, a: 20 * HOUR + 5000 })).toBe(202)
    // An event that claims to be older than any browser keeps one is refused: it would land on a day it was never on.
    expect(await server.send({ ...pv, id: 'rs2', pv: 'rsp2', a: 26 * HOUR })).toBe(400)
    await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, pages: ['/late'] }, { server })
  })
})

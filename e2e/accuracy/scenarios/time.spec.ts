// Time. Only visible time counts as time on a page, a tab that is closed still
// reports it, and a page read for longer than a session lasts keeps its time in
// the session it belongs to. Time is the one thing measured in a range: a
// browser's clock is not the test's.
import { CHROME_UA, hide, kind, scene, test } from '../harness'

test('time on a page is the time it was in front of the visitor, not the time it was open', async ({ page, lab }) => {
  kind('browser')
  const s = await scene(lab, 'time-on-page')
  s.page('/a', '<h1>a</h1>')
  await page.goto(s.url('/a'))
  await page.waitForTimeout(3000)
  await hide(page) // another tab for two seconds
  await page.waitForTimeout(2000)
  await hide(page, false)
  await page.waitForTimeout(1000)
  await hide(page)
  // Three seconds, then one: four. The two seconds away are not time on the page.
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, bounce: 1, engagedMs: [3500, 4800] })
})

test('closing the tab mid-visit still reports the time spent', async ({ page, lab, browserName }) => {
  kind('browser')
  const s = await scene(lab, 'tab-closed')
  s.page('/a', '<h1>a</h1>')
  s.bare('/gone', '<h1>gone</h1>')
  await page.goto(s.url('/a'))
  await page.waitForTimeout(2500)
  // Headless Chromium drops what a page sends as it unloads; there the tab is hidden first, as it is before it closes.
  if (browserName === 'chromium') await hide(page)
  await page.goto(s.url('/gone'))
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, bounce: 1, engagedMs: [2000, 3600] })
})

test('a page read for thirty-five minutes keeps its time in its own session', async ({ lab }) => {
  kind('server')
  const s = await scene(lab, 'long-read')
  const u = `https://${s.site.domain}/long`
  const v = 'long01.m1a2b3'
  // The page view was thirty minutes ago (the oldest an event may claim); the
  // visitor read until now and the page reports its time as it is hidden.
  await lab.server.send({ s: s.site.id, k: 'pv', u, id: 'lr1', pv: 'lrp1', v, a: 1_800_000 }, { 'user-agent': CHROME_UA })
  await lab.server.send({ s: s.site.id, k: 'e', u, id: 'lr2', pv: 'lrp1', v, en: 2_100_000, sc: 100 }, { 'user-agent': CHROME_UA })
  // One visit, one page view, and the thirty-five minutes are in it: not a second
  // visit without a page view that takes them away. By the documented rule (one
  // page and no goal) it is a bounce, whatever the time.
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, bounce: 1, engagedMs: [2_100_000, 2_100_000], seconds: [2100, 2101] })
})

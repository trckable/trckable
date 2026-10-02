// The plain shapes of a visit: one page, many pages, people coming back,
// people arriving together. The counts are the ones a person would count.
import { kind, person, scene, test } from '../harness'

test.beforeEach(() => kind('browser'))

test('a visit of three pages is one visitor, one session, three views', async ({ page, lab }) => {
  const s = await scene(lab, 'three-pages')
  for (const [p, next] of [['/a', '/b'], ['/b', '/c'], ['/c', '/a']]) s.page(p, `<h1>${p}</h1><a id="next" href="${s.prefix}${next}">next</a>`)
  await page.goto(s.url('/a'))
  await page.click('#next')
  await page.waitForURL('**/b')
  await page.click('#next')
  await page.waitForURL('**/c')
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 3, bounce: 0, pages: ['/a', '/b', '/c'], entries: { '/a': 1 } }, { prefix: s.prefix })
})

test('one page and gone is a bounce', async ({ page, lab }) => {
  const s = await scene(lab, 'bounce')
  s.page('/a', '<h1>a</h1>')
  await page.goto(s.url('/a'))
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 1, bounce: 1 })
})

test('someone coming back is the same visitor in the same session; a stranger is another', async ({ page, browser, lab }) => {
  const s = await scene(lab, 'returning')
  s.page('/a', '<h1>a</h1>')
  s.page('/b', '<h1>b</h1>')
  await page.goto(s.url('/a'))
  await page.goto(s.url('/b')) // back within the session
  const other = await person(page)
  await other.page.goto(s.url('/a'))
  await lab.settled(s.site, { visitors: 2, sessions: 2, pageviews: 3, bounce: 0.5 })
  await other.ctx.close()
  void browser
})

test('ten people at once are ten visitors and twenty views', async ({ page, lab }) => {
  const s = await scene(lab, 'ten-at-once')
  s.page('/a', `<h1>a</h1><a id="next" href="${s.prefix}/b">b</a>`)
  s.page('/b', '<h1>b</h1>')
  const people = await Promise.all(Array.from({ length: 10 }, () => person(page)))
  await Promise.all(
    people.map(async ({ page: p }) => {
      await p.goto(s.url('/a'))
      await p.click('#next')
      await p.waitForURL('**/b')
    }),
  )
  await lab.settled(s.site, { visitors: 10, sessions: 10, pageviews: 20, bounce: 0 })
  await Promise.all(people.map((p) => p.ctx.close()))
})

test('back and forward are views: the history, whether the browser kept the page or loaded it again', async ({ page, lab }) => {
  const s = await scene(lab, 'back-forward')
  s.page('/a', `<h1>a</h1><a id="next" href="${s.prefix}/b">b</a>`)
  s.page('/b', '<h1>b</h1>')
  await page.goto(s.url('/a'))
  await page.click('#next')
  await page.waitForURL('**/b')
  await page.goBack()
  await page.waitForURL('**/a')
  await page.goForward()
  await page.waitForURL('**/b')
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 4, bounce: 0, pages: ['/a', '/b', '/a', '/b'] }, { prefix: s.prefix })
})

test('two tabs of one person are one visitor and one session', async ({ context, lab }) => {
  const s = await scene(lab, 'two-tabs')
  s.page('/a', '<h1>a</h1>')
  s.page('/b', '<h1>b</h1>')
  const first = await context.newPage()
  await first.goto(s.url('/a'))
  await first.waitForTimeout(800) // a new tab, opened from the first
  const second = await context.newPage()
  await second.goto(s.url('/b'))
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0 })
})

// Known, and not scored: a first visit has no cookie yet, so two tabs that load
// for the first time within a few milliseconds of each other each make their
// own visitor id. Browsers write the cookie a moment after the script does.
test.fixme('two tabs opened at the very same moment on a first visit are one visitor', async ({ context, lab }) => {
  const s = await scene(lab, 'two-tabs-at-once')
  s.page('/a', '<h1>a</h1>')
  s.page('/b', '<h1>b</h1>')
  const first = await context.newPage()
  const second = await context.newPage()
  await Promise.all([first.goto(s.url('/a')), second.goto(s.url('/b'))])
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0 })
})

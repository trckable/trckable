// A server that stops while people are using the site: crashed with nothing
// saved (SIGKILL) or redeployed (SIGTERM). What it had said yes to is still
// there, what it had not is sent again by the browser, and every event is
// counted exactly once across the restart, in the same session.
import { Server, Web, kind, scene, test, type Lab } from '../harness'

test.beforeEach(() => kind('browser'))

for (const [name, signal] of [
  ['crashes (kill -9)', 'SIGKILL'],
  ['is redeployed (SIGTERM)', 'SIGTERM'],
] as const) {
  test(`a server that ${name} in the middle of a visit loses nothing and counts nothing twice`, async ({ page, lab }) => {
    const server = new Server()
    await server.start()
    const web = new Web(server)
    await web.start()
    try {
      const own = { ...lab, server, web } as Lab
      const s = await scene(own, 'restart')
      s.page('/a', `<a id="next" href="${s.prefix}/b">b</a>`)
      s.page('/b', `<button id="tick" data-trckable-goal="tick">tick</button><a id="next" href="${s.prefix}/c">c</a>`)
      s.page('/c', '<h1>c</h1>')
      await page.goto(s.url('/a'))
      await lab.settled(s.site, { pageviews: 1 }, { server })
      await server.stop(signal)
      // The server is gone: the page keeps the visitor's clicks.
      await page.click('#next')
      await page.waitForURL('**/b')
      for (let i = 0; i < 5; i++) await page.click('#tick')
      await page.waitForTimeout(500)
      await server.start() // the same data folder, the same address
      await page.click('#next') // the next page sends what could not be sent
      await page.waitForURL('**/c')
      await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 3, bounce: 0, goals: { tick: 5 }, pages: ['/a', '/b', '/c'] }, { server, prefix: s.prefix })
    } finally {
      await web.stop()
      await server.dispose()
    }
  })
}

test('a crash in the middle of a burst of clicks counts every one of them exactly once', async ({ page, lab }) => {
  const server = new Server()
  await server.start()
  const web = new Web(server)
  await web.start()
  try {
    const own = { ...lab, server, web } as Lab
    const s = await scene(own, 'restart-burst')
    s.page('/a', `<button id="tick" data-trckable-goal="tick">tick</button><a id="next" href="${s.prefix}/b">b</a>`)
    s.page('/b', '<h1>b</h1>')
    await page.goto(s.url('/a'))
    await lab.settled(s.site, { pageviews: 1 }, { server })
    const clicks = 40
    const killer = (async () => {
      await page.waitForFunction(() => (window as unknown as { n?: number }).n! >= 15)
      await server.stop('SIGKILL') // while the rest are still being clicked
    })()
    await page.evaluate(async (n) => {
      for (let i = 0; i < n; i++) {
        ;(document.getElementById('tick') as HTMLElement).click()
        ;(window as unknown as { n: number }).n = i + 1
        await new Promise((r) => setTimeout(r, 25))
      }
    }, clicks)
    await killer
    await server.start()
    await page.click('#next')
    await page.waitForURL('**/b')
    await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, goals: { tick: clicks } }, { server })
  } finally {
    await web.stop()
    await server.dispose()
  }
})

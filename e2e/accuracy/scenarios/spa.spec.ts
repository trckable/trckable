// Single-page apps: the address changes without a page load. A new page is a
// new path (or, in hash mode, a new route); a query that changes while someone
// types is the same page.
import { resolve } from 'node:path'
import { kind, scene, test } from '../harness'

const PKG = resolve(import.meta.dirname, '../../../packages/trckable/dist/index.js')

test.beforeEach(() => kind('browser'))

test('pushState routes are views; the same address again is not', async ({ page, lab }) => {
  const s = await scene(lab, 'push-state')
  const to = (id: string, how: string, path: string) => `<button id="${id}" onclick="history.${how}({}, '', '${s.prefix}${path}')">${id}</button>`
  s.page('/home', to('docs', 'pushState', '/docs') + to('same', 'replaceState', '/docs') + to('blog', 'pushState', '/blog') + to('blog-again', 'pushState', '/blog'))
  await page.goto(s.url('/home'))
  await page.click('#docs')
  await page.click('#same') // replaceState to the address it already has
  await page.click('#blog')
  await page.click('#blog-again') // pushState to the address it already has
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 3, bounce: 0, pages: ['/home', '/docs', '/blog'] }, { prefix: s.prefix })
})

test('typing in a search box that keeps its text in the address is one page', async ({ page, lab }) => {
  const s = await scene(lab, 'search-box')
  s.page(
    '/find',
    `<input id="q" oninput="history.replaceState({}, '', '?q=' + this.value)">
     <button id="page2" onclick="history.pushState({}, '', '?page=2')">2</button>
     <button id="open" onclick="history.pushState({}, '', '${s.prefix}/result')">open</button>`,
  )
  await page.goto(s.url('/find'))
  await page.type('#q', 'abcd')
  await page.click('#page2')
  await page.click('#open')
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, pages: ['/find', '/result'] }, { prefix: s.prefix })
})

test('hash routes are views when the site routes by hash', async ({ page, lab }) => {
  const s = await scene(lab, 'hash-routes', 'direct', 'data-hash')
  await lab.server.config(s.site, { hash_mode: true }) // the site says it routes by hash
  s.page('/app', ['home', 'about', 'pricing'].map((r) => `<button id="${r}" onclick="location.hash='#/${r}'">${r}</button>`).join(''), '')
  await page.goto(s.url('/app#/home'))
  await page.click('#about')
  await page.click('#about') // already there
  await page.click('#pricing')
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 3, bounce: 0, pages: ['/app/#/home', '/app/#/about', '/app/#/pricing'] }, { prefix: s.prefix })
})

test('a page prepared in the background is counted once, when it is shown', async ({ page, lab }) => {
  const s = await scene(lab, 'prerender')
  s.page('/a', `<a id="go" href="${s.prefix}/b">b</a>`, `<script type="speculationrules">{"prerender":[{"source":"list","urls":["${s.prefix}/b"]}]}</script>`)
  s.page('/b', '<h1>b</h1>')
  await page.goto(s.url('/a'))
  await page.waitForTimeout(1500) // time to prepare it, where the browser does
  await page.click('#go')
  await page.waitForURL('**/b')
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, pages: ['/a', '/b'] }, { prefix: s.prefix })
})

test('the tag twice, and the npm package too, count a page once', async ({ page, lab }) => {
  const s = await scene(lab, 'three-copies')
  lab.web.file(`${s.prefix}/_pkg.js`, PKG)
  const pkg = `<script type="module">import { init } from '${s.prefix}/_pkg.js'; init({ site: '${s.site.id}', host: '${lab.server.url}', dev: true })</script>`
  s.page('/a', `<button id="go" onclick="history.pushState({}, '', '${s.prefix}/b')">b</button>` + s.tag + pkg)
  await page.goto(s.url('/a'))
  await page.waitForTimeout(500)
  await page.click('#go')
  await lab.settled(s.site, { visitors: 1, sessions: 1, pageviews: 2, bounce: 0, pages: ['/a', '/b'] }, { prefix: s.prefix })
})

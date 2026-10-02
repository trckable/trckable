// What people did, counted as it happened: goals from clicks, scrolling,
// outbound links and downloads, who reached each, and who left without doing
// anything (a bounce is one page and no goal).
import { kind, person, scene, test } from '../harness'

test.beforeEach(() => kind('browser'))

test('every goal is counted once, for the visitor who reached it, and only a visit with none is a bounce', async ({ page, lab }) => {
  const s = await scene(lab, 'conversions')
  s.page(
    '/a',
    `<button id="signup" data-trckable-goal="signup" data-trckable-goal-plan="pro">sign up</button>
     <button id="buy" data-trckable-goal="buy">buy</button>
     <a id="out" href="https://example.org/elsewhere">elsewhere</a>
     <a id="pdf" href="${s.prefix}/files/guide.pdf" download>guide</a>
     <div style="height:2400px"></div>
     <section id="pricing" data-trckable-scroll="saw_pricing"><h2>Pricing</h2></section>`,
  )
  lab.web.routes.set(`GET ${s.prefix}/files/guide.pdf`, (_q, res) => void res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment' }).end('%PDF-1.4\n'))
  const visit = async (what: (p: typeof page) => Promise<void>) => {
    const v = await person(page)
    await v.page.route('https://example.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>elsewhere</h1>' }))
    await v.page.goto(s.url('/a'))
    await what(v.page)
    await v.page.waitForTimeout(500)
    await v.ctx.close()
  }
  await visit(async (p) => (await p.click('#signup'), await p.click('#buy')))
  await visit(async (p) => (await p.click('#signup'), await p.click('#buy')))
  await visit(async (p) => p.click('#signup'))
  await visit(async (p) => p.locator('#pricing').scrollIntoViewIfNeeded())
  await visit(async (p) => {
    await p.click('#out')
    await p.waitForURL('https://example.org/**')
    await p.goBack() // anything the browser dropped while leaving is sent again here
    await p.waitForURL('**/a')
  })
  await visit(async (p) => {
    const download = p.waitForEvent('download')
    await p.click('#pdf')
    await download
  })
  await visit(async () => undefined) // reads and leaves
  await lab.settled(s.site, {
    visitors: 7,
    sessions: 7,
    bounce: 1 / 7,
    goals: { signup: 3, buy: 2, saw_pricing: 1, outbound_click: 1, file_download: 1 },
    converted: { signup: 3, buy: 2, saw_pricing: 1, outbound_click: 1, file_download: 1 },
  })
})

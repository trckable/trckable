// A burst: a thousand visitors, ten thousand events, every one sent twice (a
// retry the server cannot tell from the first), all at once. Each event is
// stored once, nobody becomes two people, nothing is dropped.
import { CHROME_UA, expect, kind, scene, test } from '../harness'

const VISITORS = 1000
const GOALS = 9 // a page view and nine goals each: ten events a visitor
const PARTS = 20

const b36 = (n: number) => n.toString(36)

test('ten thousand events sent twice, at once, are counted exactly once', async ({ lab }) => {
  kind('server')
  test.setTimeout(180_000)
  const s = await scene(lab, 'burst')
  const send = (body: object, ip: string) =>
    fetch(lab.server.url + '/api/e', {
      method: 'POST',
      headers: { 'user-agent': CHROME_UA, 'x-trckable-proxy-key': s.site.key, 'x-trckable-client-ip': ip },
      body: JSON.stringify(body),
    }).then((r) => r.status)

  const jobs: (() => Promise<number>)[] = []
  for (let v = 0; v < VISITORS; v++) {
    const ip = `10.${(v >> 8) & 255}.${v & 255}.7`
    const visitor = `${b36(5_000_000 + v)}.m1a2b3`
    const u = `https://${s.site.domain}/burst/p${String(v % PARTS).padStart(2, '0')}`
    for (let k = 0; k <= GOALS; k++) {
      const event = k === 0 ? { k: 'pv', pv: b36(70_000_000 + v) } : { k: 'g', n: `g${k}` }
      const body = { s: s.site.id, u, v: visitor, id: b36(900_000_000 + v * 100 + k), ...event }
      jobs.push(() => send(body, ip), () => send(body, ip)) // and once more
    }
  }
  const statuses: number[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: 64 }, async () => {
      while (next < jobs.length) statuses.push(await jobs[next++]())
    }),
  )
  expect(statuses.filter((c) => c !== 202)).toEqual([]) // every request was taken

  await lab.settled(
    s.site,
    {
      visitors: VISITORS,
      sessions: VISITORS,
      pageviews: VISITORS,
      bounce: 0,
      converted: Object.fromEntries(Array.from({ length: GOALS }, (_, i) => [`g${i + 1}`, VISITORS])),
    },
    { timeout: 60_000 },
  )

  // And the event log itself, a part of the site at a time: ten events a visitor, none doubled.
  let pageviews = 0
  let goals = 0
  for (let p = 0; p < PARTS; p++) {
    const evs = await lab.server.events(s.site, `/burst/p${String(p).padStart(2, '0')}`)
    pageviews += evs.filter((e) => e.kind === 'pageview').length
    goals += evs.filter((e) => e.kind === 'goal').length
  }
  expect({ pageviews, goals }).toEqual({ pageviews: VISITORS, goals: VISITORS * GOALS })
})

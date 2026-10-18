import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Row } from '../explore/types'
import { Calm } from './ConnectPlaceholder'
import { XTable } from './XTable'

const row = (o: Partial<Row>): Row => ({ val: 'a', name: 'a', v: 10, c: 0, st: '', ...o })
const cells = (rows: Row[]) => [...renderToStaticMarkup(<XTable rows={rows} head="Page" limit={5} onAll={() => {}} />).matchAll(/<span class="d[^"]*">([^<]*)<\/span>/g)].map((m) => m[1])

describe('the vs usual column', () => {
  it('is never blank: as usual inside the usual, a dash with nothing to count from', () => {
    expect(cells([row({ c: 10 }), row({ val: 'b', c: 0 }), row({ val: 'c', c: 3, v: 9, st: 'up' })])).toEqual(['as usual', '–', '▲ 3×'])
  })
})

describe('the quiet line under the cards', () => {
  it('says it is still learning, not that everything was normal, in a site\'s first days', () => {
    const html = renderToStaticMarkup(<Calm cards={false} names={[]} paused={false} learning onExplore={() => {}} />)
    expect(html).toContain('Still learning')
    expect(html).not.toContain('normal</b>')
    expect(renderToStaticMarkup(<Calm cards={false} names={[]} paused={false} learning={false} onExplore={() => {}} />)).toContain('Everything was normal')
  })

  it('says a single calm topic on its own, and lists several', () => {
    const calm = (names: string[]) => renderToStaticMarkup(<Calm cards names={names} paused={false} learning={false} onExplore={() => {}} />)
    expect(calm(['search'])).toContain('Search looked normal</b>.')
    expect(calm(['search'])).not.toContain('Everything else')
    expect(calm(['devices', 'pages'])).toContain('Everything else was normal</b>: devices, pages.')
  })
})

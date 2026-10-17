// The sections about the site itself rather than its people: how fast it loads, where it is talked about, and which
// robots read it.
import { fmtInt } from '../../../lib/format'
import { XEmpty, XNote, XSec } from '../../ui/XBits'
import { XKcsPlain } from '../../ui/XKcs'
import { XCols, type CRow } from '../../ui/XTable'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { Bot, Mention, Speed as SpeedModel } from '../types'
import { openAi } from '../../ui/AiHost'

export function Speed({ x, d }: { x: XCtx; d: SpeedModel }) {
  const max = Math.max(1, ...d.pages.map((p) => p.v))
  const rows: CRow[] = d.pages.map((p) => ({
    key: p.name,
    a: p.name,
    bar: p.v / max,
    mono: true,
    c: [
      p.val,
      <>
        <i className={`vg ${p.grade}`} />
        {copy.grades[p.grade]}
      </>,
    ],
  }))
  return (
    <>
      <XKcsPlain items={d.kcs} three />
      <XSec a={copy.slowest} b={copy.byLcp} />
      <XCols first={copy.heads.page} cols={[{ h: copy.lcp }, { h: copy.rating }]} rows={rows} xc="minmax(0,1fr) 64px 112px" xcm="minmax(0,1fr) 52px 104px" limit={x.limit} onAll={x.showAll} />
      <XNote>{copy.noteSpeed}</XNote>
    </>
  )
}

export function Mentions({ x, d }: { x: XCtx; d: Mention[] }) {
  if (d.length === 0) return <XEmpty title={copy.emptyMentions} hint={copy.emptyMentionsHint} />
  const rows: CRow[] = d.map((m) => ({
    key: m.title,
    a: (
      <>
        <b className="mtt">{m.title}</b>
        <small>
          <span className="ms">{m.src}</span>
          <span className="ph"> {'·'} {m.when}</span>
        </small>
      </>
    ),
    c: [fmtInt(m.pts), fmtInt(m.cm), m.when],
  }))
  return (
    <>
      <XCols first={copy.mention} cols={[{ h: copy.points }, { h: copy.comments, hm: true }, { h: copy.when, hm: true }]} rows={rows} xc="minmax(0,1fr) 56px 76px 92px" xcm="minmax(0,1fr) 52px" limit={x.limit} onAll={x.showAll} />
      <XNote>{copy.noteMentions(x.siteName)}</XNote>
    </>
  )
}

export function Bots({ x, d }: { x: XCtx; d: Bot[] }) {
  if (d.length === 0) return <XEmpty title={copy.emptyPeriod} hint={copy.emptyPeriodHint} />
  const total = d.reduce((p, b) => p + b.count, 0) || 1
  const max = Math.max(1, ...d.map((b) => b.count))
  const rows: CRow[] = d.map((b) => ({ key: b.name, a: b.name, bar: b.count / max, c: [fmtInt(b.count), `${Math.round((b.count / total) * 100)}%`] }))
  return (
    <>
      <XCols first={copy.bot} cols={[{ h: copy.requests }, { h: copy.share }]} rows={rows} xc="minmax(0,1fr) 84px 64px" limit={x.limit} onAll={x.showAll} />
      <XNote>
        {copy.noteBots}{' '}
        <button type="button" className="xb" onClick={() => openAi('crawler')}>
          {copy.aboutAi}
        </button>
      </XNote>
    </>
  )
}

// The tables about the site itself rather than its people: how fast it loads and whether it answered, and where it is talked about.
import { fmtInt } from '../../../lib/format'
import { XEmpty, XNote, XSec } from '../../ui/XBits'
import { XKcsPlain } from '../../ui/XKcs'
import { XCols, type CRow } from '../../ui/XTable'
import { copy } from '../copy'
import { SlowCost } from './SlowCost'
import type { XCtx } from '../ctx'
import type { Mention, Speed as SpeedModel } from '../types'
import { can } from '../../../lib/permissions'
import { isOn } from '../../../lib/modules'
import { openSettings } from '../../../lib/settings'
import { useMods } from '../../../lib/useMods'
import { runSetup } from '../../live/setupLinks'

/** Nothing measured: with the switch off, an owner gets it; with it on, the wait is only for visits. */
function SpeedEmpty({ x }: { x: XCtx }) {
  const mods = useMods(x.site.id)
  if (mods !== null && !isOn(mods, 'vitals') && can('site.settings')) {
    return (
      <XEmpty title={copy.speedOff} hint={copy.speedOffHint}>
        <button type="button" className="xb" onClick={() => runSetup(x.site, 'speed')}>
          {copy.turnOnSpeed}
        </button>
      </XEmpty>
    )
  }
  return <XEmpty title={copy.emptySpeed} hint={copy.emptySpeedHint} />
}

export function Speed({ x, d }: { x: XCtx; d: SpeedModel }) {
  const max = Math.max(1, ...d.pages.map((p) => p.v))
  const rows: CRow[] = d.pages.map((p) => ({
    key: p.name,
    a: p.name,
    bar: p.v / max,
    mono: true,
    grade: p.grade,
    c: [
      p.val,
      <>
        <i className={`vg ${p.grade}`} />
        {copy.grades[p.grade]}
      </>,
    ],
  }))
  const devices: CRow[] = d.devices.map((p) => ({
    key: p.name,
    a: p.name,
    bar: p.v / Math.max(1, ...d.devices.map((x) => x.v)),
    mono: true,
    grade: p.grade,
    c: [
      p.val,
      <>
        <i className={`vg ${p.grade}`} />
        {copy.grades[p.grade]}
      </>,
    ],
  }))
  // Nothing at all to say; a site with a few visits keeps its cards, which tell how many more it takes.
  if (rows.length === 0 && devices.length === 0 && !d.kcs.some((k) => k.detail && k.detail !== copy.nothingMeasured)) return <SpeedEmpty x={x} />
  return (
    <>
      {d.cost && <SlowCost x={x} d={d.cost} />}
      <XKcsPlain items={d.kcs} />
      {devices.length > 0 && (
        <>
          <XSec a={copy.byDevice} b={copy.byLcp} />
          <XCols first={copy.heads.device} cols={[{ h: copy.lcp }, { h: copy.rating }]} rows={devices} xc="minmax(0,1fr) 64px 112px" xcm="minmax(0,1fr) 52px 104px" limit={x.limit} onAll={x.showAll} />
        </>
      )}
      <XSec a={copy.slowest} b={copy.byLcp} />
      {rows.length === 0 ? (
        <SpeedEmpty x={x} />
      ) : (
        <XCols first={copy.heads.page} cols={[{ h: copy.lcp }, { h: copy.rating }]} rows={rows} xc="minmax(0,1fr) 64px 112px" xcm="minmax(0,1fr) 52px 104px" limit={x.limit} onAll={x.showAll} />
      )}
      <XNote>{copy.noteSpeed}</XNote>
    </>
  )
}

export function Mentions({ x, d }: { x: XCtx; d: Mention[] }) {
  if (d.length === 0) {
    return (
      <XEmpty title={copy.emptyMentions} hint={copy.emptyMentionsHint}>
        {can('site.settings') && (
          <button type="button" className="xb" onClick={() => openSettings(x.site, 'mentions')}>
            {copy.addWords}
          </button>
        )}
      </XEmpty>
    )
  }
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
    c: [m.pts === null ? '–' : fmtInt(m.pts), m.cm === null ? '–' : fmtInt(m.cm), m.when],
  }))
  return (
    <>
      <XCols first={copy.mention} cols={[{ h: copy.points }, { h: copy.comments, hm: true }, { h: copy.when, hm: true }]} rows={rows} xc="minmax(0,1fr) 56px 76px 92px" xcm="minmax(0,1fr) 52px" limit={x.limit} onAll={x.showAll} />
      <XNote>{copy.noteMentions(x.siteName)}</XNote>
    </>
  )
}

// The assistants: what each one's robots read, the people it sent, and how many reads it took to send one.
import { XEmpty, XNote, XSec } from '../../../ui/XBits'
import { XCols, type CRow } from '../../../ui/XTable'
import { fmtInt } from '../../../../lib/format'
import type { AiSearchReport } from '../../../../lib/apiMore'
import { aiCopy } from '../../../../features/aisearch/copy'
import type { XCtx } from '../../ctx'
import { lowReturn, returnPer, type Return } from './aiTipsOf'

const ROWS = 12

function returnLine(r: Return): string {
  if (r.kind === 'per') return aiCopy.returnPer(r.n)
  return r.kind === 'nobody' ? aiCopy.returnNobody : ''
}

export function AiAssistants({ rep, x }: { rep: AiSearchReport; x: XCtx }) {
  const people = rep.assistants.slice(0, ROWS)
  const robots = rep.bots.length > 0
  const top = Math.max(1, ...people.map((a) => a.visitors))
  const rows: CRow[] = people.map((a) => {
    const ret = returnPer(a.fetches, a.visitors)
    const line = returnLine(ret)
    const name = line ? (
      <>
        {a.name}
        <small className={lowReturn(ret, a.fetches) ? 'xai-ret low' : 'xai-ret'}>{line}</small>
      </>
    ) : (
      a.name
    )
    const c = robots ? [a.fetches === undefined ? '–' : fmtInt(a.fetches), fmtInt(a.visitors)] : [fmtInt(a.visitors)]
    return { key: a.name, a: name, bar: a.visitors / top, c, onPick: a.referrer ? () => x.pick('referrer', a.referrer as string) : undefined }
  })
  const cols = robots ? [{ h: aiCopy.fetches }, { h: aiCopy.visitors }] : [{ h: aiCopy.visitors }]
  return (
    <>
      <XSec a={aiCopy.assistantsHead} />
      <XNote>{aiCopy.whyAssistants}</XNote>
      {people.length === 0 ? (
        <XEmpty title={aiCopy.noAssistants} hint="" />
      ) : (
        <>
          <XCols first={aiCopy.assistant} cols={cols} rows={rows} xc={robots ? 'minmax(0,1fr) 84px 84px' : 'minmax(0,1fr) 84px'} xcm={robots ? 'minmax(0,1fr) 56px 56px' : 'minmax(0,1fr) 64px'} limit={ROWS} onAll={x.showAll} />
          {!robots && <XNote>{aiCopy.noRobots}</XNote>}
        </>
      )}
    </>
  )
}

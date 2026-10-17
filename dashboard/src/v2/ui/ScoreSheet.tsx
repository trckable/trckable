// What the ring and its three parts open: how each part is worked out from today's numbers, what it came to, and a
// link to the table behind it. The ring opens all of them with their weights; a part opens its own.
import { copy } from '../briefing/copy'
import { WEIGHT, type Score } from '../briefing/model'
import { totalOf, type WhyRow } from '../briefing/scoreWhy'
import { InfoRow, InfoSheet } from './InfoSheet'

const SEE = { traffic: () => copy.whySeeTraffic, engagement: () => copy.whySeeEngagement, uptime: () => copy.whySeeUptime }

export function ScoreSheet({ rows, only, onSee, onClose }: { rows: WhyRow[]; only: Score['key'] | null; onSee: (k: Score['key']) => void; onClose: () => void }) {
  const shown = only ? rows.filter((r) => r.key === only) : rows
  const total = totalOf(rows)
  const title = only ? (shown[0]?.name ?? copy.whySheet) : copy.whySheet
  const sub = total === null ? copy.whySheetSub : String(total)
  return (
    <InfoSheet title={title} sub={only ? undefined : sub} onClose={onClose} close={copy.close}>
      <ScoreBody rows={shown} all={!only} onSee={onSee} />
    </InfoSheet>
  )
}

/** The sheet's body: each part with its figures, its number and the way to the table behind it; the weights when the ring opened it. */
export function ScoreBody({ rows, all, onSee }: { rows: WhyRow[]; all: boolean; onSee: (k: Score['key']) => void }) {
  const pct = (k: Score['key']) => String(Math.round(WEIGHT[k] * 100))
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} data-why={r.key}>
          <InfoRow t={r.name} d={`${r.figures} ${r.rule}`} r={<b>{r.value}</b>} />
          <button type="button" className="xb" onClick={() => onSee(r.key)}>
            {SEE[r.key]()}
          </button>
        </div>
      ))}
      {all && rows.length > 0 && <p className="mk-quiet">{copy.whyWeights(pct('traffic'), pct('engagement'), pct('uptime'))}</p>}
    </>
  )
}

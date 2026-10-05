// The dialog behind the card on opening: the moment told in full. Its kind, when, the figure and where
// it came from, the days around it as a chart, its facts and one line, and the button that shows it
// on the dashboard (the filter, the day, the chart in view and the marker lit).
import { Chart } from '../../components/SideCard/Chart'
import { CardModal } from '../../components/CardModal/CardModal'
import { cardModal } from '../../components/CardModal/copy'
import { Meaning, Part } from '../../components/CardModal/parts'
import type { Point } from '../../lib/api'
import { todayIn } from '../../lib/dates'
import { modalCopy } from './modalCopy'
import { figureOf, seeLabel, whenOf } from './figure'
import { chipsOf, kindOf } from './kinds'
import { pinChart } from './pinChart'
import { useOwn } from './PinCard'
import type { Pin } from './pins'
import { SourceChip } from './SourceChip'
import { say } from './words'

export default function PinModal({ pin, site, series, money, onClose, onSee }: { pin: Pin; site: { id: string; timezone: string }; series: readonly Point[]; money: (minor: number) => string; onClose: () => void; onSee: () => void }) {
  const said = say(pin, money)
  const fig = figureOf(pin, money)
  const spec = pinChart(pin, series, useOwn(pin, site))
  const chips = chipsOf(pin)
  return (
    <CardModal
      label={said.title}
      kind={kindOf(pin)}
      when={whenOf(pin, todayIn(site.timezone))}
      title={
        <>
          {fig.n !== undefined && fig.fmt ? fig.fmt(fig.n) : fig.text}
          {fig.unit && <small>{fig.unit}</small>}
          {fig.mult && <small className="num">{fig.mult}</small>}
        </>
      }
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {cardModal.close}
          </button>
          <button type="button" className="btn primary" onClick={onSee}>
            {seeLabel(pin)}
          </button>
        </>
      }
    >
      {chips.length > 0 && (
        <div className="side-sub">
          {chips.map((c, i) => (
            <SourceChip key={i} chip={c} />
          ))}
        </div>
      )}
      {spec && (
        <Part title={modalCopy.chart}>
          <Chart spec={spec} />
        </Part>
      )}
      {said.facts.length > 0 && <Meaning>{said.facts.join(' · ')}</Meaning>}
      <Meaning>{said.line}</Meaning>
    </CardModal>
  )
}

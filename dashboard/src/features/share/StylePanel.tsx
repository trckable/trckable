// How the card looks: six backgrounds, six colours and three switches. Kept for the site by this browser.
import { Switch } from '../../components/Switch'
import { ACCENTS, STYLES, hasChart, type CardId, type Style } from './card'
import { copy } from './copy'

type Props = { card: CardId; style: Style; onChange: (s: Partial<Style>) => void }

export function StylePanel({ card, style, onChange }: Props) {
  return (
    <div className="sd-style">
      <div className="sd-bgs" role="radiogroup" aria-label={copy.background}>
        {STYLES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={style.style === s.id} className={`sd-bg is-${s.id}`} onClick={() => onChange({ style: s.id })}>
            <span>{copy.styles[s.id]}</span>
          </button>
        ))}
      </div>
      <div className="sd-colours" role="radiogroup" aria-label={copy.colour}>
        <span className="sd-label">{copy.colour}</span>
        <div>
          {ACCENTS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={style.accent === c} aria-label={c} className="sd-swatch" style={{ background: c }} onClick={() => onChange({ accent: c })} />
          ))}
        </div>
      </div>
      <div className="sd-row">
        <span>{copy.showName}</span>
        <Switch on={style.name} label={copy.showName} onChange={() => onChange({ name: !style.name })} />
      </div>
      <div className="sd-row">
        <span>{copy.showDate}</span>
        <Switch on={style.date} label={copy.showDate} onChange={() => onChange({ date: !style.date })} />
      </div>
      <div className="sd-row" aria-disabled={!hasChart(card)}>
        <span>{copy.showChart}</span>
        <Switch on={style.chart} label={copy.showChart} disabled={!hasChart(card)} onChange={() => onChange({ chart: !style.chart })} />
      </div>
    </div>
  )
}

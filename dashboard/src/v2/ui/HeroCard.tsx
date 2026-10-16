// The top card of the Briefing: the sentence, the score ring and what makes it up, and the day against its usual band.
// Markup and classes are the walkthrough's own (mock/mock.css).
import type { ReactNode } from 'react'
import { dash, ringTone } from '../briefing/geometry'
import { copy } from '../briefing/copy'
import { overall, type Part, type Score, type Sentence } from '../briefing/model'

const RING = { lime: 'var(--mk-lime)', amber: '#f0c64a', red: 'var(--mk-red)' }

function Ring({ value }: { value: number | null }) {
  const r = 27
  return (
    <div className="ring">
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--mk-line)" strokeWidth="5" />
        {value !== null && <circle cx="32" cy="32" r={r} fill="none" stroke={RING[ringTone(value)]} strokeWidth="5" strokeLinecap="round" strokeDasharray={dash(value, r)} />}
      </svg>
      <b>{value ?? '–'}</b>
    </div>
  )
}

function toneOf(s: Score): string {
  if (s.verdict === 'above' || s.verdict === 'clear') return 'up'
  return s.verdict === 'below' || s.verdict === 'down' || s.verdict === 'lost' ? 'dn' : ''
}

const parts = (list: Part[]): ReactNode[] => list.map((p, i) => (p.em ? <em key={i}>{p.t}</em> : p.t))

function Side({ scores, learn }: { scores: Score[]; learn: { day: number } | null }) {
  if (learn) {
    return (
      <div className="sidecol">
        <b className="sbig">{copy.learnDay(learn.day)}</b>
        <div className="ldots">
          {Array.from({ length: 7 }, (_, i) => (
            <i key={i} className={i < learn.day ? 'on' : ''} />
          ))}
        </div>
        <span className="sn">{copy.learnLine}</span>
      </div>
    )
  }
  const names = { traffic: copy.traffic, engagement: copy.engagement, uptime: copy.uptime }
  return (
    <div className="pulsewrap">
      <Ring value={overall(scores)} />
      <div className="contrib">
        {scores.map((s) => (
          <button key={s.key} type="button" className={toneOf(s)} data-contrib={s.key}>
            <b>
              {names[s.key]} {s.value ?? '–'}
            </b>
            <span>{s.words}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export interface HeroProps {
  say: Sentence
  scores: Score[]
  learn: { day: number } | null
  since?: ReactNode
  period: string
  onPeriod: () => void
  /** The chart, drawn in the card's lower half. */
  chart: ReactNode
}

export function Hero({ say, scores, learn, since, period, onPeriod, chart }: HeroProps) {
  return (
    <section className={`card hero${say.bad ? ' bad' : ''}`}>
      <div className="htop">
        <div className="hl-col">
          <button type="button" className="tline" onClick={onPeriod} title={copy.tline}>
            {period}{' '}
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" fill="none" strokeWidth="1.6" />
            </svg>
          </button>
          {since}
          <h1 className={`hl${say.bad ? ' bad' : ''}`}>
            <b>{say.lead}</b> {parts(say.long)}
          </h1>
          <h1 className={`hl s${say.bad ? ' bad' : ''}`}>{parts(say.short)}</h1>
          {say.sub && <p className="hsub">{say.sub}</p>}
        </div>
        <Side scores={scores} learn={learn} />
      </div>
      {chart}
    </section>
  )
}

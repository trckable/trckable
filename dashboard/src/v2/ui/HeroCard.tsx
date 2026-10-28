// The top card of the Briefing: the sentence, the score ring and what makes it up, and the day against its usual band.
// Markup and classes are the walkthrough's own (mock/mock.css).
import { useState, type ReactNode } from 'react'
import type { Why } from '../briefing/why'
import { dash, ringTone } from '../briefing/geometry'
import { copy } from '../briefing/copy'
import { WhyBody } from './WhyBody'
import { overall, type Part, type Score, type Sentence } from '../briefing/model'
import type { WhyRow } from '../briefing/scoreWhy'
import { ScoreSheet } from './ScoreSheet'

const RING = { lime: 'var(--mk-lime)', amber: 'var(--mk-amber)', red: 'var(--mk-red)' }

function Ring({ value, onOpen }: { value: number | null; onOpen: () => void }) {
  const r = 27
  return (
    <button type="button" className="mk-ring" onClick={onOpen} title={copy.whyScoreOpen} aria-label={`${copy.whyScoreOpen} ${value ?? ''}`}>
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--mk-line)" strokeWidth="5" />
        {value !== null && <circle cx="32" cy="32" r={r} fill="none" stroke={RING[ringTone(value)]} strokeWidth="5" strokeLinecap="round" strokeDasharray={dash(value, r)} />}
      </svg>
      <b>{value ?? '–'}</b>
    </button>
  )
}

function toneOf(s: Score): string {
  if (s.verdict === 'above' || s.verdict === 'clear') return 'up'
  return s.verdict === 'below' || s.verdict === 'down' || s.verdict === 'lost' ? 'dn' : ''
}

const parts = (list: Part[]): ReactNode[] => list.map((p, i) => (p.em ? <em key={i}>{p.t}</em> : p.t))

interface Crowd {
  /** "186 people" */
  big: string
  /** How many dots are drawn, one per person up to 80. */
  n: number
  note: string
}

function Side({ scores, learn, crowd, onOpen }: { scores: Score[]; learn: { day: number } | null; crowd: Crowd | null; onOpen: (k: Score['key'] | 'all') => void }) {
  if (crowd) {
    return (
      <div className="sidecol">
        <b className="sbig">{crowd.big}</b>
        <div className="dots">
          {Array.from({ length: crowd.n }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <span className="sn">{crowd.note}</span>
      </div>
    )
  }
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
      <Ring value={overall(scores)} onOpen={() => onOpen('all')} />
      <div className="contrib">
        {scores.map((s) => (
          <button key={s.key} type="button" className={toneOf(s)} data-contrib={s.key} onClick={() => onOpen(s.key)}>
            <b>
              <span className="cn">{names[s.key]} </span>
              {s.value ?? '–'}
            </b>
            <span className="cw">{s.words}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface HeroProps {
  say: Sentence
  scores: Score[]
  /** What each part is made of, for the sheet a part (or the ring) opens. */
  rows: WhyRow[]
  /** Opens the table behind a part. */
  onSee: (k: Score['key']) => void
  learn: { day: number } | null
  since?: ReactNode
  period: string
  onPeriod: () => void
  /** A quiet site: its people as dots, not a score. */
  crowd?: Crowd | null
  /** The key numbers, a row under the headline and above the chart. */
  numbers?: ReactNode
  /** The chart, drawn in the card's lower half. */
  chart: ReactNode
  /** The pills under the buttons (a run above usual); the record day is a star on the chart. */
  moments?: { pills: string[] }
  /** Play the period back; absent when there is not enough to play. */
  onReplay?: () => void
  /** It is playing: the button says Stop. */
  replaying?: boolean
  /** A button after Replay on the same row (the daily email's chip). */
  extra?: ReactNode
  /** The card has the first-load shimmer, or the site is down and not answering. */
  enter?: boolean
  /** Why the headline says what it says. */
  why?: Why | null
}

export function Hero({ say, scores, rows, onSee, learn, crowd = null, since, period, onPeriod, chart, numbers, moments, onReplay, replaying, extra, enter, why }: HeroProps) {
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState<Score['key'] | 'all' | null>(null)
  return (
    <section className={`mk-card hero${say.bad ? ' bad' : ''}${enter ? ' enter' : ''}`}>
      <div className="htop">
        <div className="hl-col">
          <button type="button" className="tline" onClick={onPeriod} title={copy.tline}>
            {period}{' '}
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" fill="none" strokeWidth="1.6" />
            </svg>
          </button>
          {since}
          <h1 className={`mk-hl${say.bad ? ' bad' : ''}`}>
            <b>{say.lead}</b>
            {say.long[0]?.t.startsWith(',') ? '' : ' '}
            {parts(say.long)}
          </h1>
          <h1 className={`mk-hl s${say.bad ? ' bad' : ''}`}>{parts(say.short)}</h1>
          {say.sub && <p className="hsub">{say.sub}</p>}
          {onReplay && (
            <button type="button" className="gh rpb" data-replay="1" data-key="replay" aria-label={replaying ? copy.stop : copy.replay} title={replaying ? copy.stopReplay : copy.replayTitle} onClick={onReplay}>
              <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d={replaying ? 'M2.5 2.5h7v7h-7z' : 'M2.5 1.2v9.6L10.5 6z'} />
              </svg>
              {/* The other word is laid under this one (invisible, no height), so the button is as wide for either. */}
              <span className="rpl" data-ghost={replaying ? copy.replay : copy.stop}>
                {replaying ? copy.stop : copy.replay}
              </span>
            </button>
          )}
          {extra}
          {why && (
            <button type="button" className="gh rpb whyb" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {copy.whyQ}
            </button>
          )}
          {open && why && (
            <div className="hw show">
              <WhyBody why={why} />
            </div>
          )}
          {moments && moments.pills.length > 0 && (
            <div className="moments">
              {moments.pills.map((t) => (
                <span key={t} className="mom">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <Side scores={scores} learn={learn} crowd={crowd} onOpen={setSheet} />
      </div>
      {numbers}
      {chart}
      {sheet && <ScoreSheet rows={rows} only={sheet === 'all' ? null : sheet} onSee={onSee} onClose={() => setSheet(null)} />}
    </section>
  )
}

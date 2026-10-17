// The Briefing while it is still being read: the walkthrough's own loading shapes (the headline and ring, the chart, the
// four numbers, and one card per kind the page had last), so nothing jumps when the numbers land.
import type { CSSProperties } from 'react'
import { Ico } from './icons'

const CHEV = <Ico name="chev" className="ic-ch" strokeWidth={1.8} />

/** What a card of each kind looks like before it is read: rows, dots, a line or bars. */
const SHAPE: Record<string, 'rows' | 'dots' | 'spark' | 'bar' | 'bars'> = { uptime: 'bar', sales: 'rows', sources: 'dots', funnel: 'rows', countries: 'spark', devices: 'bars', pages: 'bars', goals: 'bars', search: 'rows' }

const bone = (h: number): CSSProperties => ({ height: h, width: '100%' })

function Vis({ topic }: { topic: string }) {
  const s = SHAPE[topic] ?? 'bars'
  if (s === 'rows') return [0, 1, 2].map((k) => <i key={k} className="skl" style={bone(28)} />)
  if (s === 'dots') return <i className="skl" style={bone(64)} />
  if (s === 'spark') return <i className="skl" style={bone(44)} />
  if (s === 'bar') return <i className="skl" style={bone(16)} />
  return [0, 1].map((k) => <i key={k} className="skl" style={bone(14)} />)
}

function Card({ topic, wide }: { topic: string; wide: boolean }) {
  return (
    <article className={`icard sk${wide ? ' wide' : ''}`} data-topic={topic}>
      <div className="ic-h">
        <Ico name={topic} className="ic-i" />
        <h3>
          <i className="skl" style={{ width: '86%' }} />
          <i className="skl" style={{ width: '54%' }} />
        </h3>
        <span className="ic-val">
          <i className="skl" style={{ width: 34 }} />
        </span>
        {CHEV}
      </div>
      <div className="ic-v">
        <Vis topic={topic} />
      </div>
      <div className="ic-w">
        <i className="skl" style={{ width: '70%' }} />
      </div>
      <div className="ic-f">
        <i className="skl" style={{ width: 96, height: 'var(--mk-h)' }} />
        <i className="skl" style={{ width: 130, height: 'var(--mk-h)' }} />
      </div>
    </article>
  )
}

/** The topics of the cards a site had on its last page, so its loading page is shaped like it. */
const last = new Map<string, string[]>()
export function rememberCards(site: string, topics: string[]) {
  if (topics.length) last.set(site, topics)
}

export function BriefingSkeleton({ site, label }: { site: string; label: string }) {
  const topics = (last.get(site) ?? ['sources', 'countries', 'pages']).slice(0, 4)
  return (
    <div className="mk mk-body">
      <div className="brief" aria-busy="true" role="status" aria-label={label}>
        <section className="card hero">
          <div className="htop">
            <div className="hl-col">
              <i className="skl sk-t" />
              <i className="skl sk-h1" />
              <i className="skl sk-h2" />
              <i className="skl sk-p" />
            </div>
            <div className="pulsewrap">
              <i className="skl sk-ring" />
              <div className="contrib">
                {[0, 1, 2].map((k) => (
                  <i key={k} className="skl sk-c" />
                ))}
              </div>
            </div>
          </div>
          <i className="skl sk-chart" />
          <div className="facts">
            {[0, 1, 2, 3].map((k) => (
              <div className="fact" key={k}>
                <i className="skl" style={{ width: 70, height: 26 }} />
                <i className="skl" style={{ width: 110, display: 'block', marginTop: 8 }} />
              </div>
            ))}
          </div>
        </section>
        <div className="cards">
          {topics.map((t, k) => (
            <Card key={t} topic={t} wide={k === 0 || (topics.length % 2 === 0 && k === topics.length - 1)} />
          ))}
        </div>
      </div>
    </div>
  )
}

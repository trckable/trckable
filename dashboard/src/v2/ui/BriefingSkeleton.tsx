// The Briefing while it is still being read: the walkthrough's own loading shapes (the headline and ring, the chart, the
// four numbers, and one card per kind the page had last), so nothing jumps when the numbers land.
import type { CSSProperties } from 'react'
import { Ico } from './icons'
import './storyCard.css'

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

function Card({ topic }: { topic: string }) {
  return (
    <article className="icard sk" data-topic={topic}>
      <div className="ic-h">
        <div className="ic-top">
          <Ico name={topic} className="ic-i" />
          <i className="skl" style={{ width: 90, margin: 0 }} />
        </div>
        <h3>
          <i className="skl" style={{ width: '86%' }} />
          <i className="skl" style={{ width: '54%' }} />
        </h3>
      </div>
      <p className="ic-w">
        <i className="skl" style={{ width: '70%' }} />
      </p>
      <div className="ic-v">
        <Vis topic={topic} />
      </div>
      <div className="ic-f">
        <i className="skl" style={{ width: 96, height: 'var(--mk-h)' }} />
        <i className="skl" style={{ width: 90, height: 14, marginLeft: 'auto' }} />
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
        <section className="mk-card hero">
          <div className="htop">
            <div className="hl-col">
              <i className="skl sk-hl" />
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
        </section>
        <div className="kcs">
          {[0, 1, 2, 3].map((k) => (
            <div className="kc sk-kc" key={k}>
              <div className="kt">
                <i className="skl" style={{ width: 28, height: 28, margin: 0 }} />
                <i className="skl" style={{ width: 80, height: 14, margin: 0 }} />
              </div>
              <i className="skl" style={{ width: 96, height: 30, margin: '12px 0 8px' }} />
              <i className="skl sk-sp" />
            </div>
          ))}
        </div>
        <div className="cards">
          {topics.map((t) => (
            <Card key={t} topic={t} />
          ))}
        </div>
      </div>
    </div>
  )
}

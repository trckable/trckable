// A sample of what Live shows once the first visit lands, drawn inside a small browser frame under the code. It is only
// decoration (aria-hidden, no links, no real numbers): the chip says so. The numbers drift gently; for a reader who asks for
// less motion they stay as drawn.
import { useEffect, useState } from 'react'
import { copy } from './copy'
import './samplePreview.css'

type Row = { name: string; n: number }
const SOURCES: Row[] = [
  { name: 'google.com', n: 42 },
  { name: 'Direct', n: 31 },
  { name: 'news.ycombinator.com', n: 18 },
]
const PAGES: Row[] = [
  { name: '/', n: 38 },
  { name: '/pricing', n: 24 },
  { name: '/blog/launch', n: 11 },
]
const COUNTRIES: Row[] = [
  { name: 'United States', n: 36 },
  { name: 'Germany', n: 15 },
  { name: 'Brazil', n: 9 },
]
const VISITORS = [12, 13, 12, 14, 15, 14]

function calm(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Block({ title, rows }: { title: string; rows: Row[] }) {
  const top = Math.max(...rows.map((r) => r.n))
  return (
    <div className="sp-blk">
      <h4>{title}</h4>
      {rows.map((r) => (
        <div key={r.name} className="sp-row">
          <i style={{ width: `${Math.round((r.n / top) * 100)}%` }} />
          <span>{r.name}</span>
          <b>{r.n}</b>
        </div>
      ))}
    </div>
  )
}

export function SamplePreview({ domain }: { domain: string }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (calm()) return
    const t = setInterval(() => setStep((s) => (s + 1) % VISITORS.length), 2600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="sp-frame" aria-hidden="true" data-testid="sample-preview">
      <div className="sp-bar">
        <span className="sp-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="sp-url">{domain}</span>
        <span className="sp-chip">{copy.sampleData}</span>
      </div>
      <div className="sp-body">
        <div className="sp-now">
          <b>{VISITORS[step]}</b>
          <span>
            <i className="sp-pulse" />
            {copy.sampleNow}
          </span>
        </div>
        <div className="sp-cols">
          <Block title={copy.sampleSources} rows={SOURCES} />
          <Block title={copy.samplePages} rows={PAGES} />
          <Block title={copy.sampleCountries} rows={COUNTRIES} />
        </div>
      </div>
    </div>
  )
}

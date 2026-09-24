// Who crawls you, and what for. Robots do not run JavaScript, so these hits
// come from the site's own server; this card shows them split three ways —
// answering someone now, indexing for search, or collecting training data.
import { useEffect, useMemo, useState } from 'react'
import { DialogActions } from '../components/DialogActions'
import { Modal } from '../components/Modal'
import { api, type CrawlerReport, type ReportQuery, type Site } from '../lib/api'
import { CodeBlock } from '../components/Code'
import { fmtInt } from '../lib/format'

const KINDS = [
  { id: 'answer', label: 'AI answers', what: 'Fetched to answer someone right now' },
  { id: 'index', label: 'Indexing', what: 'Crawled so your pages can be found' },
  { id: 'train', label: 'Training', what: 'Collected as training data' },
] as const

// One colour per crawler, assigned by name so a filter never repaints them.
const COLORS = ['var(--ch-1)', 'var(--ch-2)', 'var(--ch-3)', 'var(--ch-4)', 'var(--ch-5)', 'var(--ch-6)', 'var(--ch-7)']
const colorOf = (name: string) => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]

export function Crawlers({ site, query }: { site: Site; query: ReportQuery }) {
  const [data, setData] = useState<CrawlerReport | null>(null)
  const [err, setErr] = useState(false)
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('answer')
  const [off, setOff] = useState<Set<string>>(new Set())
  const [help, setHelp] = useState(false)

  useEffect(() => {
    let live = true
    api
      .crawlers(site.id, query)
      .then((d) => live && setData(d))
      .catch(() => live && setErr(true))
    return () => {
      live = false
    }
  }, [site.id, query])

  const shown = useMemo(() => (data?.series ?? []).filter((s) => s.kind === kind && !off.has(s.name)), [data, kind, off])
  const inKind = useMemo(() => (data?.series ?? []).filter((s) => s.kind === kind), [data, kind])
  const peak = Math.max(1, ...shown.flatMap((s) => s.values))

  if (err) return null
  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <h2>Robots</h2>
        <div className="tabs" role="tablist" aria-label="What the robot wanted">
          {KINDS.map((k) => (
            <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} onClick={() => setKind(k.id)} title={k.what}>
              {k.label}
              <span className="faint num" style={{ marginLeft: 6 }}>
                {fmtInt(data?.kinds?.[k.id] ?? 0)}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="btn ghost" style={{ marginLeft: 'auto', height: 30, fontSize: 12.5 }} onClick={() => setHelp(true)}>
          How to feed this
        </button>
      </div>

      {!data ? (
        <div className="skeleton" style={{ height: 170 }} />
      ) : data.total === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Nothing yet. Robots never reach the browser script, so your server has to forward them — one middleware, shown under “How to feed this”.
        </p>
      ) : (
        <>
          <div className="crawl-chart">
            <svg viewBox={`0 0 ${Math.max(2, data.buckets.length - 1) * 10} 100`} preserveAspectRatio="none" role="img" aria-label={`${KINDS.find((k) => k.id === kind)?.label} over time`}>
              {shown.map((s) => (
                <polyline
                  key={s.name}
                  fill="none"
                  stroke={colorOf(s.name)}
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  points={s.values.map((v, i) => `${i * 10},${100 - (v / peak) * 92}`).join(' ')}
                />
              ))}
            </svg>
            <div className="crawl-axis faint num">
              <span>{data.buckets[0]?.slice(5, 10)}</span>
              <span>{data.buckets[data.buckets.length - 1]?.slice(5, 10)}</span>
            </div>
          </div>

          <ul className="crawl-list">
            {inKind.map((s) => (
              <li key={s.name}>
                <button type="button" aria-pressed={!off.has(s.name)} onClick={() => setOff((o) => (o.has(s.name) ? new Set([...o].filter((x) => x !== s.name)) : new Set([...o, s.name])))}>
                  <span className="dot" style={{ background: off.has(s.name) ? 'var(--text-3)' : colorOf(s.name), borderRadius: 3 }} aria-hidden="true" />
                  <span className="crawl-name">{s.name}</span>
                  <span className="num">{fmtInt(s.total)}</span>
                </button>
              </li>
            ))}
            {inKind.length === 0 && <li className="faint" style={{ fontSize: 13 }}>No {KINDS.find((k) => k.id === kind)?.label.toLowerCase()} in this period.</li>}
          </ul>

          {data.errors > 0 && (
            <span className="faint" style={{ fontSize: 12 }}>
              {fmtInt(data.errors)} crawler request{data.errors > 1 ? 's' : ''} hit an error page.
            </span>
          )}
        </>
      )}

      {help && <FeedHelp site={site} onClose={() => setHelp(false)} />}
    </div>
  )
}

function FeedHelp({ site, onClose }: { site: Site; onClose: () => void }) {
  const host = location.origin
  return (
    <Modal label="Report crawlers" className="wide" onClose={onClose}>
      <h2>Let your server report robots</h2>
      <p className="muted" style={{ margin: 0 }}>
        Crawlers do not run JavaScript, so the only honest way to count them is from the server that answers them. One middleware, no visitor data: the path and the user agent.
      </p>
      <CodeBlock
        lang="js"
        code={`// Next.js — middleware.ts
import { reportCrawler } from 'trckable/server'

export function middleware(req) {
reportCrawler({
  host: '${host}',
  site: '${site.id}',
  key: process.env.TRCKABLE_PROXY_KEY,
  url: req.url,
  ua: req.headers.get('user-agent'),
})
}`}
      />
      <CodeBlock
        lang="shell"
        code={`# any language: one POST per robot request
curl -X POST ${host}/api/crawl \\
-H 'content-type: application/json' \\
-H 'X-Trckable-Proxy-Key: ${site.proxy_key}' \\
-d '{"s":"${site.id}","u":"https://${site.domain}/page","ua":"<user agent>","st":200}'`}
      />
      <span className="faint" style={{ fontSize: 12 }}>
        Only robots trckable recognises are stored; everything else is ignored. No IP, no cookie, nothing about a person.
      </span>
      <DialogActions>
        <button type="button" className="btn primary big" onClick={onClose}>
          Done
        </button>
      </DialogActions>
    </Modal>
  )
}

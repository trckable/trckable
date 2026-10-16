import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { countryName, fmtInt } from '../../lib/format'
import type { Detail as DetailData, Mention, Named } from './api'
import { copy } from './copy'
import { page } from './pageCopy'
import { agoOf, safeURL } from './model'
import { reachOf } from './FeedRow'
import { DetailChart } from './DetailChart'
import { replyURL } from './pageModel'
import { Quote } from './Quote'
import { SourceMark } from './SourceMark'
import { useDetail } from './usePage'

const HOURS = ['-10 min', '+12 h', '+24 h', '+36 h', '+48 h']

function Top({ title, rows, label }: { title: string; rows: Named[]; label?: (n: string) => string }) {
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.visitors))
  return (
    <section>
      <h3>{title}</h3>
      <ul className="mp-top">
        {rows.map((r) => (
          <li key={r.name} style={{ ['--w' as string]: `${Math.round((r.visitors / max) * 100)}%` }}>
            <span>{label ? label(r.name) : r.name}</span>
            <b>{fmtInt(r.visitors)}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Body({ d, m, words }: { d: DetailData; m: Mention; words: string[] }) {
  const href = safeURL(m.url)
  const reply = replyURL(m)
  return (
    <>
      {(m.snippet || m.title) && (
        <section>
          <h3>{page.full}</h3>
          <Quote text={m.snippet || m.title} words={words} full />
        </section>
      )}
      {reachOf(m).length > 0 && (
        <section>
          <h3>{page.platform}</h3>
          <p>{reachOf(m).join(' · ')}</p>
        </section>
      )}
      <section>
        <h3>{page.traffic}</h3>
        {m.visitors > 0 ? <DetailChart curve={d.curve} usual={d.usual} hours={HOURS} /> : <p className="muted">{page.noTraffic}</p>}
      </section>
      <Top title={page.topPages} rows={d.pages} />
      <Top title={page.countries} rows={d.countries} label={countryName} />
      {m.visitors > 0 && <p className="muted">{d.goals > 0 ? page.goals(d.goals) : page.noGoals}</p>}
      <p className="mp-links">
        {href && (
          <a className="btn ghost" href={href} target="_blank" rel="noopener noreferrer nofollow">
            {m.source === 'news' ? page.openArticle : page.openDiscussion}
          </a>
        )}
        {reply && (
          <a className="btn ghost" href={reply} target="_blank" rel="noopener noreferrer nofollow">
            {page.reply}
          </a>
        )}
      </p>
    </>
  )
}

/** One mention in full: a side panel, a sheet on a phone. Escape closes it and focus goes back to where it was. */
export function Detail({ site, m, words, onClose }: { site: string; m: Mention; words: string[]; onClose: () => void }) {
  const got = useDetail(site, m.id)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null
    close.current?.focus()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      was?.focus?.()
    }
  }, [onClose])
  return (
    <>
      <div className="mp-scrim" onClick={onClose} aria-hidden="true" />
      <div className="mp-detail" role="dialog" aria-modal="true" aria-label={page.detail}>
        <header role="none">
          <SourceMark source={m.source} />
          <div>
            <h2>{m.title || copy.name[m.source]}</h2>
            <p className="muted">
              {copy.name[m.source]}
              {m.author ? ` · ${copy.by(m.author)}` : ''} · {agoOf(m.posted_at)} · {page.visitors(m.visitors)}
            </p>
          </div>
          <button ref={close} type="button" className="mp-x" aria-label={page.close} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {got.state === 'ready' && <Body d={got.data} m={got.data.mention} words={words} />}
        {got.state === 'failed' && <p className="muted" role="alert">{page.failed}</p>}
      </div>
    </>
  )
}

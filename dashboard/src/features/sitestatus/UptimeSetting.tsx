// Settings → Alerts: the uptime check of the open site. One switch to pause it (a paused check looks at nothing and
// reports nothing), and the pages of the same domain it looks at together with the homepage, up to five.
import { useEffect, useState, type SyntheticEvent } from 'react'
import { X } from 'lucide-react'
import { more, fail, type Site, type Uptime } from '../../lib/apiMore'
import { can } from '../../lib/permissions'
import { Row } from '../../components/Row'
import { Switch } from '../../components/Switch'
import { copy } from './uptimeCopy'
import './UptimeSetting.css'

export function UptimeSetting({ site }: { site: Site }) {
  const [u, setU] = useState<Uptime | null>(null)
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const may = can('site.settings')
  useEffect(() => {
    let live = true
    more
      .uptime(site.id)
      .then((r) => live && setU(r))
      .catch(() => live && setU(null))
    return () => {
      live = false
    }
  }, [site.id])
  if (!u) return null
  const run = (job: Promise<Uptime>) => job.then(setU).catch((e: unknown) => fail(e))
  const add = (e: SyntheticEvent) => {
    e.preventDefault()
    setError('')
    more
      .addUptimePath(site.id, path.trim())
      .then((r) => {
        setU(r)
        setPath('')
      })
      .catch(() => setError(copy.pathError))
  }
  const full = u.paths.length >= u.max
  return (
    <section className="card" data-uptime-check>
      <Row label={copy.label} hint={u.paused ? copy.pausedHint : copy.hint}>
        <Switch on={!u.paused} disabled={!may} onChange={() => void run(more.setUptimePaused(site.id, !u.paused))} />
      </Row>
      <div className="uptime-pages">
        <div className="srow-text">
          <b>{copy.pages}</b>
          <span className="faint">{full ? copy.full(u.max) : copy.pagesHint(u.max)}</span>
        </div>
        {u.paths.length > 0 && (
          <ul aria-label={copy.pages}>
            {u.paths.map((p) => (
              <li key={p}>
                <code>{p}</code>
                {may && (
                  <button type="button" aria-label={copy.remove(p)} onClick={() => void run(more.removeUptimePath(site.id, p))}>
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {may && !full && (
          <form onSubmit={add}>
            <input className="input" value={path} onChange={(e) => setPath(e.target.value)} placeholder={copy.pathPlaceholder} aria-label={copy.pathLabel} aria-invalid={!!error} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <button type="submit" className="btn" disabled={!path.trim()}>
              {copy.add}
            </button>
          </form>
        )}
        {error && (
          <span className="faint" role="alert">
            {error}
          </span>
        )}
      </div>
    </section>
  )
}

// Settings → General → Domain: the address, the earlier ones still accepted,
// and a way to change it (owners and admins; everyone else only reads).
import { useEffect, useState } from 'react'
import { Row } from '../../components/Row'
import { toast } from '../../components/Toast'
import { fail, more, type DomainState, type Site } from '../../lib/apiMore'
import { fmtDay } from '../../lib/dates'
import { rememberMove } from '../../lib/moved'
import { can } from '../../lib/permissions'
import { DomainDialog } from './DomainDialog'
import { copy } from './copy'
import './domain.css'

const day = (unix: number) => fmtDay(new Date(unix * 1000).toISOString().slice(0, 10), { year: true })

export function DomainRow({ site, onSaved }: { site: Site; onSaved: () => void }) {
  const [state, setState] = useState<DomainState | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    more.siteDomain(site.id).then(setState).catch(() => setState(null))
  }, [site.id, site.domain])

  const stop = (host: string) =>
    more
      .endFormerDomain(site.id, host)
      .then((s) => {
        setState(s)
        toast(copy.stopped(host))
      })
      .catch((e: unknown) => fail(e))

  return (
    <>
      <Row label={copy.label} hint={copy.hint}>
        <span className="dom-now">
          <b className="dom-name">{site.domain}</b>
          {can('site.settings') && (
            <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
              {copy.change}
            </button>
          )}
        </span>
      </Row>
      {state?.former?.map((f) => (
        <p key={f.host} className="dom-note faint">
          {copy.also(f.host, day(f.until))}
          {can('site.settings') && (
            <button type="button" className="dom-stop" onClick={() => stop(f.host)}>
              {copy.stopNow}
            </button>
          )}
        </p>
      ))}
      {state?.search && !state.search.matches && <p className="dom-note dom-warn">{copy.noMatch(state.search.property, site.domain)}</p>}
      {open && (
        <DomainDialog
          site={site}
          grace={state?.grace_days ?? 30}
          onClose={() => setOpen(false)}
          onChanged={(s) => {
            // The address names the site by its domain: the open page follows it to the new one.
            rememberMove(site.domain, s.domain)
            setState(s)
            onSaved()
          }}
        />
      )}
    </>
  )
}

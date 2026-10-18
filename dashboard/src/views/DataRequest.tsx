import { useEffect, useState } from 'react'
import { Info } from '../components/Info'
import { fail, type PersonFound, type PersonPayment, type Site, more } from '../lib/apiMore'
import { toast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { settingsParam } from '../lib/settings'
import { dateFmt } from '../lib/format'

/** Someone asks what you hold about them, or asks for it to go. Both start by
 *  finding the right person and showing what was found — an erasure that acts
 *  on a guess is worse than no erasure at all. */
export function DataRequest({ site }: { site: Site }) {
  const { ask, dialog } = useConfirm()
  const [by, setBy] = useState<'visitor' | 'email'>('visitor')
  // A journey can send someone here with the visitor already in hand.
  const [value, setValue] = useState(() => settingsParam('visitor') ?? '')
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<{ found: PersonFound; payments: PersonPayment[] } | null>(null)

  const look = (who = value, how = by) => {
    setBusy(true)
    setFound(null)
    more
      .findPerson(site.id, how, who.trim())
      .then(setFound)
      .catch((e: unknown) => fail(e, look))
      .finally(() => setBusy(false))
  }

  // Arriving from a visitor's journey: the lookup is why they came.
  useEffect(() => {
    const from = settingsParam('visitor')
    if (from) look(from, 'visitor')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- look is a new function each render; the lookup from the URL runs once per site
  }, [site.id])

  const erase = async () => {
    if (!found) return
    const ok = await ask({
      title: `Erase everything for ${found.found.visitor}?`,
      body:
        `${found.found.events} events and ${found.found.sessions} visits are deleted and cannot be brought back from the dashboard. Backups made before today still hold them until they age out (seven days here, longer off-site): after restoring one, erase again. ` +
        (found.payments.length ? 'Their payments stay as business records, with nothing on them pointing at a person any more; the payment provider\'s notices about them are deleted.' : ''),
      confirmLabel: 'Erase',
      danger: true,
      busyLabel: 'Erasing…',
      run: () => more.erasePerson(site.id, by, value.trim()).then((r) => toast(`Erased ${r.events} events and ${r.sessions} visits`)),
    })
    if (ok) {
      setFound(null)
      setValue('')
    }
  }

  const when = (iso?: string) => (iso ? dateFmt(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—')

  return (
    <section className="card" id="requests" style={{ gap: 12 }}>
      <div className="card-head">
        <h2>Answer a data request</h2>
        <Info text="Someone has the right to ask what you hold about them and to ask for it to go. trckable keeps no IP address and no name, so a request is answered by visitor id — or by the email used at checkout, which is the one thing that connects a person to a visit." />
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
        trckable stores no IP addresses and no names: a visitor is a number from a salted hash. Find them here, hand over the file, or erase them.
      </p>

      <div className="request-find">
        <div className="seg" role="group" aria-label="Find them by">
          <button type="button" aria-pressed={by === 'visitor'} onClick={() => {
              setBy('visitor')
              setFound(null)
            }}>
            Visitor id
          </button>
          <button type="button" aria-pressed={by === 'email'} onClick={() => {
              setBy('email')
              setFound(null)
            }}>
            Email
          </button>
        </div>
        <input
          className="input"
          value={value}
          placeholder={by === 'visitor' ? 'k3f9zq1' : 'them@company.com'}
          onChange={(e) => {
            setValue(e.target.value)
            setFound(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && look()}
        />
        <button type="button" className="btn" disabled={busy || !value.trim()} onClick={() => look()}>
          {busy ? 'Looking…' : 'Look up'}
        </button>
      </div>
      {found && (
        <div className="request-found">
          <div className="request-facts">
            <span>
              <b className="num">{found.found.events}</b>
              events
            </span>
            <span>
              <b className="num">{found.found.sessions}</b>
              visits
            </span>
            <span>
              <b className="num">{found.payments.length}</b>
              payments
            </span>
            <span>
              <b>{when(found.found.first_seen)}</b>
              first seen
            </span>
            <span>
              <b>{when(found.found.last_seen)}</b>
              last seen
            </span>
            {found.found.countries?.length ? (
              <span>
                <b>{found.found.countries.join(', ')}</b>
                seen from
              </span>
            ) : null}
          </div>
          {found.found.events === 0 && found.payments.length === 0 ? (
            <p className="faint" style={{ margin: 0, fontSize: 13 }}>Nothing is held for this visitor. There is nothing to export or erase.</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn primary" href={more.exportPersonURL(site.id, by, value.trim())} download>
                Download their data
              </a>
              <button type="button" className="btn danger" onClick={erase}>
                Erase them
              </button>
            </div>
          )}
        </div>
      )}
      {dialog}
    </section>
  )
}

/** When midnight UTC is on the site's own clock, for the cookieless note:
 *  " — 02:00 in Europe/Berlin", or nothing when the site runs on UTC. */
export function utcMidnight(tz: string): string {
  try {
    const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
    const t = dateFmt('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
    return t === '00:00' ? '' : ` — ${t} in ${tz.split('/').pop()?.replace(/_/g, ' ')}`
  } catch {
    return ''
  }
}

// Changing a site's domain: the new address, then what changes, then done.
import { Globe } from 'lucide-react'
import { useState } from 'react'
import { DialogActions } from '../../components/DialogActions'
import { DialogHead } from '../../components/DialogHead'
import { Field } from '../../components/Field'
import { toast } from '../../components/Toast'
import { Modal } from '../../kit/Modal'
import { APIError } from '../../lib/api'
import { more, type DomainState, type Site } from '../../lib/apiMore'
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'

const day = (unix: number) => fmtDay(new Date(unix * 1000).toISOString().slice(0, 10), { year: true })
function message(e: unknown): string {
  if (e instanceof APIError && e.code === 'domain_too_soon') return copy.tooSoon
  return e instanceof Error ? e.message : String(e)
}

export function DomainDialog({ site, grace, onClose, onChanged }: { site: Site; grace: number; onClose: () => void; onChanged: (s: DomainState) => void }) {
  const [typed, setTyped] = useState('')
  const [asked, setAsked] = useState<DomainState['preview'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [until, setUntil] = useState('')

  const ask = () => {
    setBusy(true)
    setError(null)
    more
      .siteDomain(site.id, typed.trim())
      .then((s) => {
        setUntil(day(Math.floor(Date.now() / 1000) + grace * 86400))
        setAsked(s.preview ?? null)
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setBusy(false))
  }
  const run = () => {
    if (!asked) return
    setBusy(true)
    more
      .changeDomain(site.id, asked.domain)
      .then((s) => {
        toast(copy.done(asked.domain))
        onChanged(s)
        onClose()
      })
      .catch((e: unknown) => {
        setError(message(e))
        setAsked(null)
      })
      .finally(() => setBusy(false))
  }
  if (!asked) {
    return (
      <Modal label={copy.title} over keepSize={false} onClose={onClose}>
        <DialogHead icon={Globe} heading={copy.title} hint={copy.newHint} />
        <Field label={copy.newLabel} error={error}>
          {(f) => (
            <input
              {...f}
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="example.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && typed.trim() && !busy && ask()}
            />
          )}
        </Field>
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onClose}>
              {copy.cancel}
            </button>
          }
        >
          <button type="button" className="btn primary big" disabled={!typed.trim() || busy} onClick={ask}>
            {busy ? copy.checking : copy.next}
          </button>
        </DialogActions>
      </Modal>
    )
  }
  return (
    <Modal label={copy.title} over keepSize={false} onClose={onClose}>
      <DialogHead icon={Globe} heading={copy.confirmTitle(site.domain, asked.domain)} hint={copy.confirmHint} />
      <ul className="bullets">
        <li>{copy.keep}</li>
        <li>{copy.accepting(site.domain, until)}</li>
        <li>{copy.follows(asked.domain)}</li>
        {site.name === site.domain && <li>{copy.nameFollows(asked.domain)}</li>}
        <li>{copy.note(asked.domain)}</li>
        {asked.search && !asked.search.matches && <li>{copy.searchWarn(asked.domain)}</li>}
      </ul>
      <DialogActions
        left={
          <button type="button" className="btn ghost" onClick={() => setAsked(null)} disabled={busy}>
            {copy.back}
          </button>
        }
      >
        <button type="button" className="btn primary big" disabled={busy} onClick={run}>
          {copy.confirm}
        </button>
      </DialogActions>
    </Modal>
  )
}

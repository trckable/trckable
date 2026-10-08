import { useState } from 'react'
import { type Site } from '../../lib/api'
import { friendly } from '../../lib/errors'
import { more } from '../../lib/apiMore'
import { checkDomain, cleanDomain, isAdded, type DomainCheck } from '../install/domain'
import { copy } from './copy'

function complaint(verdict: DomainCheck, added: boolean): string {
  if (verdict === 'space') return copy.more.space
  if (verdict !== 'ok') return copy.more.invalid
  return added ? copy.more.added : ''
}

/** "+ Add another site" under the install card: the same domain rules as Add a
 *  site, the site created on Add. The server's refusal (a plan's site limit)
 *  shows under the field. */
export function AddAnother({ sites, onAdded }: { sites: Site[]; onAdded: (s: Site) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const t = copy.more

  if (!open)
    return (
      <button type="button" className="btn ghost ob-more" onClick={() => setOpen(true)}>
        {t.open}
      </button>
    )

  const submit = () => {
    const clean = cleanDomain(value)
    const verdict = checkDomain(clean, value)
    const bad = complaint(verdict, isAdded(clean, sites.map((s) => s.domain)))
    if (bad) {
      setProblem(bad)
      return
    }
    setBusy(true)
    setProblem('')
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    more
      .createSite(clean)
      .then((s) => more.updateSite(s.id, { timezone: zone }).catch(() => s))
      .then((s) => {
        setValue('')
        setOpen(false)
        onAdded(s)
      })
      .catch((e: unknown) => setProblem(friendly(e)?.text ?? ''))
      .finally(() => setBusy(false))
  }

  return (
    <form
      className="ob-more-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) submit()
      }}
    >
      <input
        className="input"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setProblem('')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          }
        }}
        aria-label={t.label}
        aria-invalid={!!problem}
        aria-describedby={problem ? 'ob-more-problem' : undefined}
        placeholder={t.placeholder}
        autoFocus
        spellCheck={false}
        autoCapitalize="none"
        autoComplete="url"
        inputMode="url"
      />
      <button type="submit" className="btn primary" disabled={busy || !value.trim()}>
        {busy ? t.busy : t.add}
      </button>
      <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
        {t.cancel}
      </button>
      {problem && (
        <p className="ob-more-problem" id="ob-more-problem" role="alert">
          {problem}
        </p>
      )}
    </form>
  )
}

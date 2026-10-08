import { useState } from 'react'
import { type Site } from '../../lib/api'
import { FieldError, fieldProps } from '../../kit/FieldError'
import { formWords } from '../../lib/formWords'
import { more } from '../../lib/apiMore'
import { wizard } from '../install/copy'
import { checkDomain, cleanDomain, isAdded } from '../install/domain'
import { domainWords } from '../install/domainWords'
import { copy } from './copy'

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
    const added = verdict === 'ok' && isAdded(clean, sites.map((s) => s.domain))
    const bad = domainWords(added ? 'added' : verdict, clean)
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
      .catch((e: unknown) => setProblem(formWords(e, { 500: wizard.failed, 502: wizard.failed, 503: wizard.failed, 504: wizard.failed })))
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
        {...fieldProps('ob-more-problem', problem)}
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
      <FieldError id="ob-more-problem" error={problem} className="ob-more-problem" />
    </form>
  )
}

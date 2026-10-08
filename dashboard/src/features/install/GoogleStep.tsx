// The Google step of the import dialog: sign in, pick a property, watch the
// import. Shown only when the server has a Google OAuth client; without one
// the dialog is the command line's, as it always was.
import { LogIn, Play, Unplug } from 'lucide-react'
import { useState } from 'react'
import { FieldError } from '../../kit/FieldError'
import { first } from './firstCopy'
import { gaStartUrl, useGaImport } from './gaImport'
import './googleStep.css'

const t = first.importDialog.google
const errors: Record<string, string> = t.errors

export function GoogleStep({ site }: { site: string }) {
  const ga = useGaImport(site)
  const [picked, setPicked] = useState('')
  if (!ga.status?.enabled) return null
  const job = ga.status.job
  const property = picked || job?.property || ga.properties?.[0]?.id || ''
  const busy = job?.status === 'running'
  const code = ga.error || job?.code || ''
  const known = Object.hasOwn(errors, code) ? errors[code] : t.errors.other
  const message = code ? known : ''
  return (
    <div className="ga-step">
      <FieldError id="ga-err" error={message} />
      {job && job.status !== 'stopped' && (
        <div className="ga-progress">
          <progress max={Math.max(job.total, 1)} value={job.done} aria-label={t.done} />
          <span className="num faint">{job.status === 'done' ? `${t.done} · ${t.days(job.days)}` : t.progress(job.done, job.total)}</span>
        </div>
      )}
      {!ga.status.connected && (
        <a className="btn" href={gaStartUrl(site)}>
          <LogIn size={14} strokeWidth={1.75} aria-hidden="true" />
          {job?.status === 'denied' ? t.signInAgain : t.signIn}
        </a>
      )}
      {ga.status.connected && !busy && (
        <div className="ga-pick">
          {ga.properties && ga.properties.length === 0 && <span className="faint">{t.none}</span>}
          {ga.properties && ga.properties.length > 0 && (
            <select aria-label={t.property} value={property} onChange={(e) => setPicked(e.target.value)}>
              {ga.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.account} · {p.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn primary" disabled={!property} onClick={() => ga.start(property, job?.status === 'paused')}>
            <Play size={14} strokeWidth={1.75} aria-hidden="true" />
            {job?.status === 'paused' ? t.resume : t.start}
          </button>
          <button type="button" className="btn ghost" onClick={() => void ga.disconnect()} aria-label={t.stop} title={t.stop}>
            <Unplug size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}

// Settings → General → Allowed domains: the extra addresses whose visits count
// besides the site's own. The refused ones the server saw this week are one tap
// away. The bell's "visits are refused" notice opens Settings here (focus: allowed-domains).
import { useEffect, useId, useRef, useState } from 'react'
import { Row } from '../../components/Row'
import { toast } from '../../components/Toast'
import { FieldError, fieldProps } from '../../kit/FieldError'
import { APIError } from '../../lib/api'
import { fail, more, type AllowedDomains as State, type Site } from '../../lib/apiMore'
import { can } from '../../lib/permissions'
import { settingsParam } from '../../lib/settings'
import { allowedCopy as copy } from './copy'
import './allowed.css'

/** The host a person typed or pasted, as the server keeps it (no scheme, path, wildcard or www.). */
const hostOf = (typed: string) =>
  typed
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^\*\./, '')
    .replace(/^www\./, '')

export function AllowedDomains({ site }: { site: Site }) {
  const [state, setState] = useState<State | null>(null)
  const [text, setText] = useState('')
  const [wrong, setWrong] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const here = useRef<HTMLDivElement>(null)
  const errId = useId()
  const edit = can('site.settings')
  useEffect(() => {
    more.allowedDomains(site.id).then(setState).catch(() => setState(null))
  }, [site.id])
  // Opened from the bell: bring the field into view and put the cursor in it.
  const wanted = useRef(settingsParam('focus') === 'allowed-domains')
  useEffect(() => {
    if (!state || !wanted.current) return
    wanted.current = false
    here.current?.scrollIntoView({ block: 'center' })
    if (edit) input.current?.focus({ preventScroll: true })
  }, [state, edit])

  const save = async (list: string[], said: string) => {
    setBusy(true)
    try {
      setState(await more.setAllowedDomains(site.id, list))
      setText('')
      setWrong(null)
      toast(said)
    } catch (e) {
      if (e instanceof APIError && e.status === 400) setWrong(e.message)
      else fail(e)
    } finally {
      setBusy(false)
    }
  }
  const have = state?.allowed ?? []
  const add = (typed: string) => {
    const h = hostOf(typed)
    if (!h) return
    if (have.includes(h)) {
      setWrong(copy.have)
      return
    }
    if (state && have.length >= state.max) {
      setWrong(copy.full(state.max))
      return
    }
    void save([...have, h], copy.added(h))
  }
  const remove = (h: string) => void save(have.filter((x) => x !== h), copy.removed(h))

  return (
    <Row label={copy.label} hint={copy.hint}>
      <div className="alw" ref={here}>
        {have.length > 0 && (
          <ul className="alw-list">
            {have.map((h) => (
              <li key={h} className="alw-chip">
                <span>{h}</span>
                {edit && (
                  <button type="button" disabled={busy} aria-label={copy.remove(h)} title={copy.remove(h)} onClick={() => remove(h)}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {edit && (
          <form
            className="alw-add"
            onSubmit={(e) => {
              e.preventDefault()
              add(text)
            }}
          >
            <input
              ref={input}
              className="input"
              value={text}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={copy.placeholder}
              aria-label={copy.label}
              {...fieldProps(errId, wrong)}
              onChange={(e) => {
                setText(e.target.value)
                setWrong(null)
              }}
            />
            <button type="submit" className="btn" disabled={busy || !text.trim()}>
              {copy.add}
            </button>
          </form>
        )}
        <FieldError id={errId} error={wrong} />
        {edit && state && state.refused.length > 0 && (
          <div className="alw-sug">
            <span className="faint">{copy.refused}</span>
            <ul className="alw-list">
              {state.refused.map((r) => (
                <li key={r.host}>
                  <button type="button" className="alw-chip alw-pick" disabled={busy} aria-label={copy.allow(r.host)} title={copy.allow(r.host)} onClick={() => add(r.host)}>
                    <span>{r.host}</span>
                    <b>+</b>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Row>
  )
}

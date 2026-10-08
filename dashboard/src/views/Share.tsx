// A shared link: one site's numbers, for someone with no account. The page is
// the same dashboard, with everything that writes taken away — and the server
// is the one enforcing that, not this file.
import { useEffect, useState, type SubmitEvent } from 'react'
import { APIError, api, setShareMode, setShareSession, fail, refused, wrong, type ShareInfo } from '../lib/api'
import { FieldError, fieldProps } from '../kit/FieldError'
import { words } from '../lib/errors'
import { isEmbed, openShare, shareToken } from '../lib/earlyStart'
import { setShared } from '../lib/me'
import { Ghost, Name, Wordmark } from '../components/Logo'
import { SiteMark } from '../components/SiteMark'
import './Share.css'

type State = { state: 'loading' } | { state: 'password'; error?: string; hideBrand?: boolean } | { state: 'ready'; info: ShareInfo } | { state: 'error'; message: string }

/** An embed keeps its session in memory, since the browser will not send a
 *  cookie from inside another site's page. The token stays in the address (and
 *  the page sends no Referer), so the link can be copied, bookmarked and reloaded. */
const opened = (info: ShareInfo) => {
  if (info.session) setShareSession(info.session)
}

/** Opens the link, asking for a password only if the server says to. */
export function useShare(): State {
  const [s, setS] = useState<State>({ state: 'loading' })
  useEffect(() => {
    setShareMode(true)
    setShared()
    const done = (info: ShareInfo) => {
      setShared(info.modules)
      setS({ state: 'ready', info })
      opened(info)
    }
    // Already under way since the script started (lib/earlyStart.ts). With a
    // token in the address the server opens the link: a reload of a password
    // link is let in by the session cookie the first open left.
    const open = openShare()
    open.then(done).catch((e: unknown) => {
      if (e instanceof APIError && e.status === 401) return setS({ state: 'password', hideBrand: e.hideBrand })
      setS({ state: 'error', message: words(e) })
    })
  }, [])
  return s
}

/** The password gate, and the frame around it. */
export function SharePassword({ onOpen, error, hideBrand }: { onOpen: (info: ShareInfo) => void; error?: string; hideBrand?: boolean }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(error ?? null)
  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    api
      .openShare(shareToken(), password, isEmbed())
      .then((info) => {
        setShared(info.modules)
        opened(info)
        onOpen(info)
      })
      .catch((e: unknown) => (refused(e) ? setErr(wrong) : fail(e)))
      .finally(() => setBusy(false))
  }
  return (
    <ShareShell title="Shared with you" sub="This link asks for a password." plain={hideBrand}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">
          Password
          <input className="input" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setErr(null) }} {...fieldProps('share-err', err)} required autoFocus autoComplete="off" />
        </label>
        <FieldError id="share-err" error={err} />
        <button className="btn primary" type="submit" disabled={busy || !password} style={{ height: 44, justifyContent: 'center' }}>
          {busy ? 'Opening…' : 'Open'}
        </button>
      </form>
    </ShareShell>
  )
}

export function ShareShell({ title, sub, plain, children }: { title: string; sub: string; plain?: boolean; children?: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card rise" style={{ width: 'min(420px, 100%)', padding: 28, gap: 18 }}>
        {!plain && <Wordmark />}
        <div>
          <h1 style={{ fontSize: 22, letterSpacing: '-0.01em' }}>{title}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {sub}
          </p>
        </div>
        {children}
      </div>
    </main>
  )
}

/** The header a shared page gets instead of the picker, gear and account. */
/** The slim bar an embedded dashboard shows: whose numbers, and by what. */
export function EmbedHeader({ info }: { info: ShareInfo }) {
  return (
    <span className="share-who embed-who">
      <b>{info.site || info.domain}</b>
      {!info.hide_brand && (
        <span className="faint">
          <Ghost size={14} /> analytics by <Name />
        </span>
      )}
    </span>
  )
}

export function ShareHeader({ info }: { info: ShareInfo }) {
  return (
    <>
      <span className="brand">
        {info.logo_url && <img className="share-logo" src={info.logo_url} alt={info.site || info.domain} />}
        {!info.logo_url && !info.hide_brand && <Wordmark />}
      </span>
      <span className="share-id">
        <SiteMark site={{ domain: info.domain, color: info.color, icon_url: info.icon_url }} size={20} />
        <span className="share-who">
          <b>{info.site || info.domain}</b>
          <span className="faint">{info.name || 'Shared with you'}</span>
        </span>
        {info.logo_url && !info.hide_brand && (
          <span className="faint share-credit">
            <Ghost size={14} /> <Name />
          </span>
        )}
      </span>
    </>
  )
}

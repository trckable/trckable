// A shared link: one site's numbers, for someone with no account. The page is
// the same dashboard, with everything that writes taken away — and the server
// is the one enforcing that, not this file.
import { useEffect, useState, type FormEvent } from 'react'
import { APIError, api, setShareMode, type ShareInfo, setShareSession } from '../lib/api'
import { setShared } from '../lib/me'
import { Ghost, Wordmark } from '../components/Logo'

/** The token out of /s/<token>. It is in the address bar once; after that the
 *  browser carries a session cookie instead, so it stays out of logs. */
export const shareToken = () => {
  const m = /^\/s\/([^/]+)/.exec(location.pathname)
  return m ? decodeURIComponent(m[1]) : ''
}

type State = { state: 'loading' } | { state: 'password'; error?: string } | { state: 'ready'; info: ShareInfo } | { state: 'error'; message: string }

/** Opens the link, asking for a password only if the server says to. */
/** ?embed=1: the link is shown inside another site's page. */
export const isEmbed = () => new URLSearchParams(location.search).get('embed') === '1'

/** An embed keeps its token in the iframe's own address (the page embedding
 *  it has it anyway) and its session in memory. */
const opened = (info: ShareInfo) => {
  if (info.session) setShareSession(info.session)
  if (!isEmbed()) history.replaceState(null, '', '/s')
}

export function useShare(): State {
  const [s, setS] = useState<State>({ state: 'loading' })
  useEffect(() => {
    setShareMode(true)
    setShared()
    const token = shareToken()
    const done = (info: ShareInfo) => {
      setShared(info.modules)
      setS({ state: 'ready', info })
      // The link has been exchanged for a session: take the token out of the
      // address bar so it is not in a screenshot, a Referer or a bookmark.
      opened(info)
    }
    // With a token in the address this is a first open; without one it is a
    // reload, and the cookie from the first open answers instead.
    const open = token
      ? api.openShare(token, undefined, isEmbed())
      : api.shareMe().catch(() => Promise.reject(new APIError(410, 'This link is incomplete. Ask for the full address.')))
    open.then(done).catch((e: Error) => {
      if (e instanceof APIError && e.status === 401) return setS({ state: 'password' })
      setS({ state: 'error', message: e.message })
    })
  }, [])
  return s
}

/** The password gate, and the frame around it. */
export function SharePassword({ onOpen, error }: { onOpen: (info: ShareInfo) => void; error?: string }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(error ?? null)
  const submit = (e: FormEvent) => {
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
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <ShareShell title="Shared with you" sub="This link asks for a password.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">
          Password
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus autoComplete="off" />
        </label>
        {err && (
          <div role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
            {err}
          </div>
        )}
        <button className="btn primary" type="submit" disabled={busy || !password} style={{ height: 44, justifyContent: 'center' }}>
          {busy ? 'Opening…' : 'Open'}
        </button>
      </form>
    </ShareShell>
  )
}

export function ShareShell({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card rise" style={{ width: 'min(420px, 100%)', padding: 28, gap: 18 }}>
        <Wordmark height={30} />
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
      <span className="faint">
        <Ghost size={14} /> analytics by trckable
      </span>
    </span>
  )
}

export function ShareHeader({ info }: { info: ShareInfo }) {
  return (
    <>
      <span className="brand" aria-label="trckable">
        <span className="wordmark">
          <Wordmark height={28} />
        </span>
        <span className="mark" aria-hidden="true">
          <Ghost size={30} peek />
        </span>
      </span>
      <span className="share-who">
        <b>{info.site || info.domain}</b>
        <span className="faint">{info.name || 'Shared with you'}</span>
      </span>
    </>
  )
}

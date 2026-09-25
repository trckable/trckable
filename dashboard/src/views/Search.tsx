// Settings → Search Console. Google's own numbers for the searches that
// showed the site, read with a service account: no Google app to register,
// no redirect to your own address, so it works on localhost and behind a
// firewall. The key is sealed on the server and never comes back here.
import { Check, CircleCheck, ExternalLink, FileCheck2, FileUp, LockKeyhole, Search as SearchIcon, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type SearchConnection, type SearchProperty, type Site } from '../lib/api'
import { Row } from '../components/Row'
import { Copyable } from '../components/Copyable'
import { Picker } from '../components/Picker'
import { useConfirm } from '../components/Confirm'
import { toast, settle } from '../components/Toast'
import './Search.css'

const CLOUD_ACCOUNTS = 'https://console.cloud.google.com/iam-admin/serviceaccounts'
const CLOUD_API = 'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com'
const CONSOLE = 'https://search.google.com/search-console/users'

function when(unix?: number) {
  if (!unix) return 'never'
  const m = Math.round((Date.now() / 1000 - unix) / 60)
  if (m < 2) return 'just now'
  if (m < 90) return `${m} minutes ago`
  const h = Math.round(m / 60)
  return h < 36 ? `${h} hours ago` : `${Math.round(h / 24)} days ago`
}

export function SearchSettings({ site }: { site: Site }) {
  const [conn, setConn] = useState<SearchConnection | null | undefined>(undefined)
  const [props, setProps] = useState<SearchProperty[] | null>(null)
  const [propsErr, setPropsErr] = useState('')
  const [replacing, setReplacing] = useState(false)
  const { ask, dialog } = useConfirm()

  const load = () =>
    api
      .searchConsole(site.id)
      .then((r) => setConn(r.connected ? r.connection! : null))
      .catch(() => setConn(null))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id])
  useEffect(() => {
    if (!conn) return
    setPropsErr('')
    api
      .searchProperties(site.id)
      .then((r) => setProps(r.properties))
      .catch((e: Error) => setPropsErr(e.message))
  }, [conn?.client_email, site.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (conn === undefined) return <div className="skeleton" style={{ height: 240 }} />

  const connected = (r: { connection: SearchConnection; properties?: SearchProperty[] }) => {
    setConn(r.connection)
    if (r.properties) setProps(r.properties)
    setReplacing(false)
  }

  return (
    <>
      {(!conn || replacing) && <Connect site={site} replacing={replacing} onCancel={() => setReplacing(false)} onDone={connected} />}

      {conn && !replacing && (
        <>
          <section className={'gsc-status' + (conn.last_error ? ' bad' : conn.property ? '' : ' warn')}>
            <span className="gsc-orb" aria-hidden="true">
              {conn.last_error ? <TriangleAlert size={20} strokeWidth={1.75} /> : conn.property ? <CircleCheck size={20} strokeWidth={1.75} /> : <SearchIcon size={20} strokeWidth={1.75} />}
            </span>
            <span className="gsc-status-text">
              <b>{conn.last_error ? 'Google said no the last time' : conn.property ? `Reading ${conn.property.replace(/^sc-domain:/, '')}` : 'Connected — pick the property to read'}</b>
              <span className="faint">{conn.last_error ? conn.last_error : conn.property ? `Last answer from Google ${when(conn.last_ok_at)}. Read when you open the Search tab, at most once an hour; nothing is kept.` : 'Choose which Search Console property belongs to this site.'}</span>
            </span>
          </section>

          <section className="card" style={{ gap: 0 }}>
            <Row label="Property" hint="The Search Console property this site's Search tab reads">
              {propsErr ? (
                <span className="faint" style={{ fontSize: 13, maxWidth: 320 }}>{propsErr}</span>
              ) : !props ? (
                <span className="faint gsc-asking">
                  <span className="btn-spin" aria-hidden="true" /> Asking Google…
                </span>
              ) : props.length === 0 ? (
                <span style={{ fontSize: 13, maxWidth: 340 }}>
                  This account can't read any property yet. In{' '}
                  <a href={CONSOLE} target="_blank" rel="noreferrer">
                    Search Console → Users and permissions
                  </a>
                  , add the address below as a user, then come back.
                </span>
              ) : (
                <Picker
                  label="Property"
                  align="right"
                  placeholder="Search properties…"
                  value={conn.property || undefined}
                  onPick={(property) => {
                    const id = toast('Checking with Google…', 'busy')
                    api
                      .setSearchConsole(site.id, { property })
                      .then((r) => (connected(r), settle(id, `Reading ${property.replace(/^sc-domain:/, '')}`)))
                      .catch((e: Error) => settle(id, e.message, 'error'))
                  }}
                  items={props.map((p) => ({ id: p.url, label: p.url.replace(/^sc-domain:/, '') + (p.url.startsWith('sc-domain:') ? ' (whole domain)' : ''), hint: p.permission.replace(/^site/, '').replace(/User$/, ' user') }))}
                />
              )}
            </Row>
            <Row label="Service account" hint="The address Google knows trckable by. It needs to be a user of the property.">
              <Copyable value={conn.client_email} />
            </Row>
            <Row label="Key" hint="A new key replaces this one; the old one stops working here at once">
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={() => setReplacing(true)}>
                  Replace key
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={async () => {
                    const ok = await ask({
                      title: 'Disconnect Search Console?',
                      body: 'The key is deleted from this server, and the Search tab asks to connect again. Nothing else changes: trckable never copied anything from Google.',
                      confirmLabel: 'Disconnect',
                      danger: true,
                      busyLabel: 'Disconnecting…',
                      done: 'Search Console disconnected',
                      run: () => api.deleteSearchConsole(site.id),
                    })
                    if (ok) (setConn(null), setProps(null))
                  }}
                >
                  Disconnect
                </button>
              </div>
            </Row>
          </section>
        </>
      )}
      {dialog}
    </>
  )
}

/** What a pasted key says about itself, before Google is asked. */
function readKey(text: string): { email?: string; error?: string } {
  const t = text.trim()
  if (!t) return {}
  try {
    const k = JSON.parse(t) as { type?: string; client_email?: string; private_key?: string }
    if (k.type !== 'service_account') return { error: 'This is JSON, but not a service account key. It should say "type": "service_account".' }
    if (!k.client_email || !k.private_key) return { error: 'The key has no client_email or private_key. Download a new JSON key.' }
    return { email: k.client_email }
  } catch {
    return { error: 'That is not the JSON key file. Choose the .json file Google downloaded.' }
  }
}

/** The five-minute setup: three steps in Google, then the key. */
function Connect({ site, replacing, onDone, onCancel }: { site: Site; replacing: boolean; onDone: (r: { connection: SearchConnection; properties?: SearchProperty[] }) => void; onCancel: () => void }) {
  const [key, setKey] = useState('')
  const [paste, setPaste] = useState(false)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const parsed = readKey(key)

  const connect = () => {
    setBusy(true)
    setErr('')
    api
      .setSearchConsole(site.id, { key: key.trim() })
      .then((r) => {
        onDone(r)
        toast(r.connection.property ? `Connected · reading ${r.connection.property.replace(/^sc-domain:/, '')}` : 'Connected · pick the property to read')
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false))
  }
  const take = (f?: File | null) => {
    if (!f) return
    f.text().then((t) => (setKey(t), setErr('')))
  }

  const steps = [
    {
      title: 'Create a service account',
      text: (
        <>
          No roles needed. Open it, then <b>Keys → Add key → JSON</b>. A file downloads.
        </>
      ),
      href: CLOUD_ACCOUNTS,
      link: 'Google Cloud',
    },
    { title: 'Turn on the Search Console API', text: <>In the same Google Cloud project.</>, href: CLOUD_API, link: 'Enable the API' },
    {
      title: 'Let it read your property',
      text: parsed.email ? (
        <>
          Add <b className="gsc-email">{parsed.email}</b> as a user. <b>Restricted</b> is enough: trckable only reads.
        </>
      ) : (
        <>
          Add the service account's email as a user. <b>Restricted</b> is enough: trckable only reads.
        </>
      ),
      href: CONSOLE,
      link: 'Search Console',
    },
  ]

  return (
    <section className="card gsc-connect">
      <div className="gsc-intro">
        <span className="icon-tile accent" aria-hidden="true">
          <SearchIcon size={18} strokeWidth={1.75} />
        </span>
        <span>
          <h2>{replacing ? 'Replace the key' : 'Connect Google Search Console'}</h2>
          <span className="muted">
            The Google searches that showed {site.domain}, and which were clicked, next to your own numbers. About five minutes, once.
          </span>
        </span>
      </div>

      <ol className="gsc-steps">
        {steps.map((st, i) => (
          <li key={st.title} className="gsc-step">
            <span className="gsc-num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="gsc-step-text">
              <b>{st.title}</b>
              <span className="faint">{st.text}</span>
            </span>
            <a className="btn gsc-go" href={st.href} target="_blank" rel="noreferrer">
              {st.link}
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            </a>
          </li>
        ))}
        <li className="gsc-step last">
          <span className={'gsc-num' + (parsed.email ? ' done' : '')} aria-hidden="true">
            {parsed.email ? <Check size={14} strokeWidth={2.5} /> : 4}
          </span>
          <span className="gsc-step-text">
            <b>Add the key here</b>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="sr"
              onChange={(e) => {
                take(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {paste ? (
              <>
                <label htmlFor="gsc-key" className="sr">
                  Service account key (JSON)
                </label>
                <textarea
                  id="gsc-key"
                  className="input mono gsc-paste"
                  rows={5}
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                  placeholder='{ "type": "service_account", "client_email": "…", "private_key": "…" }'
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </>
            ) : (
              <button
                type="button"
                className={'gsc-drop' + (drag ? ' over' : '') + (parsed.email ? ' ok' : '')}
                onClick={() => file.current?.click()}
                onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDrag(false)
                  take(e.dataTransfer.files?.[0])
                }}
              >
                {parsed.email ? <FileCheck2 size={22} strokeWidth={1.5} aria-hidden="true" /> : <FileUp size={22} strokeWidth={1.5} aria-hidden="true" />}
                <span>
                  {parsed.email ? (
                    <>
                      Key for <b>{parsed.email}</b>
                    </>
                  ) : (
                    <>
                      <b>Drop the JSON key here</b> or choose the file
                    </>
                  )}
                </span>
              </button>
            )}
            <button type="button" className="linkish" onClick={() => setPaste(!paste)}>
              {paste ? 'Choose the file instead' : 'Or paste its contents'}
            </button>
          </span>
        </li>
      </ol>

      {(parsed.error || err) && (
        <p className="confirm-err" role="alert">
          {err || parsed.error}
        </p>
      )}

      <div className="gsc-foot">
        <span className="faint">
          <LockKeyhole size={14} strokeWidth={1.75} aria-hidden="true" />
          Encrypted on this server and never shown again.
        </span>
        {replacing && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="btn primary" disabled={busy || !parsed.email} onClick={connect}>
          {busy && <span className="btn-spin" aria-hidden="true" />}
          {busy ? 'Checking with Google…' : 'Connect'}
        </button>
      </div>
    </section>
  )
}

// Settings → Search Console. Google's own numbers for the searches that
// showed the site, read with a service account: no Google app to register,
// no redirect to your own address, so it works on localhost and behind a
// firewall. The key is sealed on the server and never comes back here.
import { useEffect, useRef, useState } from 'react'
import { api, type SearchConnection, type SearchProperty, type Site } from '../lib/api'
import { Row } from '../components/Row'
import { Info } from '../components/Info'
import { Copyable } from '../components/Copyable'
import { Picker } from '../components/Picker'
import { useConfirm } from '../components/Confirm'
import { toast, settle } from '../components/Toast'

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
        <section className="card" style={{ gap: 0 }}>
          <div className="card-head" style={{ paddingBottom: 10 }}>
            <h2>Google Search Console</h2>
            <Info text="trckable reads the report from Google when you open it, at most once an hour per view, and keeps nothing it reads. No visitor data is ever sent to Google." />
          </div>
          <Row label="Service account" hint="Add this address as a user of your property in Search Console">
            <Copyable value={conn.client_email} />
          </Row>
          <Row label="Property" hint="The Search Console property this site's reports read">
            {propsErr ? (
              <span className="faint" style={{ fontSize: 13, maxWidth: 320 }}>{propsErr}</span>
            ) : !props ? (
              <span className="faint" style={{ fontSize: 13 }}>Asking Google…</span>
            ) : props.length === 0 ? (
              <span style={{ fontSize: 13, maxWidth: 340 }}>
                This account can't read any property yet. In{' '}
                <a href={CONSOLE} target="_blank" rel="noreferrer">
                  Search Console → Users and permissions
                </a>
                , add <b>{conn.client_email}</b> as a user, then come back.
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
                    .then((r) => (connected(r), settle(id, `Reading ${property}`)))
                    .catch((e: Error) => settle(id, e.message, 'error'))
                }}
                items={props.map((p) => ({ id: p.url, label: p.url.replace(/^sc-domain:/, '') + (p.url.startsWith('sc-domain:') ? ' (whole domain)' : ''), hint: p.permission.replace(/^site/, '').replace(/User$/, ' user') }))}
              />
            )}
          </Row>
          <Row label="Status" hint={conn.last_error ? 'The last time trckable asked, Google said no' : 'The last answer from Google'}>
            <span style={{ fontSize: 13, color: conn.last_error ? 'var(--down)' : 'var(--text-2)', maxWidth: 340 }}>
              {conn.last_error ? conn.last_error : `Working · ${when(conn.last_ok_at)}`}
            </span>
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
                    body: 'The key is deleted from this server and the Search tab goes away. Nothing else changes: trckable never copied anything from Google.',
                    confirmLabel: 'Disconnect',
                    danger: true,
                  })
                  if (!ok) return
                  api
                    .deleteSearchConsole(site.id)
                    .then(() => (setConn(null), setProps(null), toast('Disconnected')))
                    .catch((e: Error) => toast(e.message, 'error'))
                }}
              >
                Disconnect
              </button>
            </div>
          </Row>
        </section>
      )}
      {dialog}
    </>
  )
}

/** The five-minute setup, and the box the key goes in. */
function Connect({ site, replacing, onDone, onCancel }: { site: Site; replacing: boolean; onDone: (r: { connection: SearchConnection; properties?: SearchProperty[] }) => void; onCancel: () => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)

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

  return (
    <section className="card">
      <div className="card-head">
        <h2>{replacing ? 'Replace the key' : 'Connect Google Search Console'}</h2>
      </div>
      <p className="muted" style={{ margin: 0, maxWidth: '62ch' }}>
        See which Google searches showed {site.domain} and which of them were clicked, next to your own numbers. It takes a
        service account with read-only access: about five minutes, once.
      </p>
      <ol className="gsc-steps">
        <li>
          In Google Cloud, <a href={CLOUD_ACCOUNTS} target="_blank" rel="noreferrer">create a service account</a> (no roles needed), open it, and under{' '}
          <b>Keys</b> add a <b>JSON</b> key. A file downloads.
        </li>
        <li>
          In the same project, <a href={CLOUD_API} target="_blank" rel="noreferrer">enable the Google Search Console API</a>.
        </li>
        <li>
          In <a href={CONSOLE} target="_blank" rel="noreferrer">Search Console → Settings → Users and permissions</a>, add the service account's email as a user.{' '}
          <b>Restricted</b> is enough: trckable only ever reads.
        </li>
        <li>Paste the key file here, or choose it.</li>
      </ol>
      <label htmlFor="gsc-key" className="sr">
        Service account key (JSON)
      </label>
      <textarea
        id="gsc-key"
        className="input mono"
        rows={6}
        spellCheck={false}
        autoComplete="off"
        placeholder='{ "type": "service_account", "client_email": "…", "private_key": "…" }'
        value={key}
        onChange={(e) => setKey(e.target.value)}
        style={{ width: '100%', resize: 'vertical', fontSize: 12.5 }}
      />
      {err && (
        <p role="alert" style={{ margin: 0, color: 'var(--down)', fontSize: 13 }}>
          {err}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn primary" disabled={busy || !key.trim()} onClick={connect}>
          {busy ? 'Checking with Google…' : 'Connect'}
        </button>
        <input
          ref={file}
          id="gsc-file"
          type="file"
          accept="application/json,.json"
          className="sr"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            f.text().then(setKey)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          Choose the key file…
        </button>
        {replacing && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <span className="faint" style={{ fontSize: 12 }}>
          The key is encrypted on this server and never shown again.
        </span>
      </div>
    </section>
  )
}

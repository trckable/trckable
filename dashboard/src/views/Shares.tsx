// Settings → Data & privacy → a link to this site's numbers for someone with
// no account. What it may show is decided on the server: hiding revenue means
// the figure is never asked for, not that the page leaves it out.
import { useEffect, useState } from 'react'
import { Switch } from '../components/Switch'
import { api, type Share, type Site } from '../lib/api'
import { Info } from '../components/Info'
import { Menu } from '../components/Menu'
import { Modal } from '../components/Modal'
import { CodeBlock } from '../components/Code'
import { useConfirm } from '../components/Confirm'
import { toast } from '../components/Toast'

const LASTS = [
  { days: 0, label: 'No end date' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'A year' },
]

export function Shares({ site }: { site: Site }) {
  const { ask, dialog } = useConfirm()
  const [list, setList] = useState<Share[] | null>(null)
  const [making, setMaking] = useState(false)
  const load = () => api.shares(site.id).then((r) => setList(r.shares ?? [])).catch(() => setList([]))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id])

  const when = (unix?: number | null) => (unix ? new Date(unix * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null)

  return (
    <section className="card" id="shares" style={{ gap: 12 }}>
      <div className="card-head">
        <h2>Share these numbers</h2>
        <Info text="A read-only link to this one site. No account, no sign-in, nothing to change. Give it a password if it is going anywhere public, and turn revenue off if the person reading should not see money — the server then never puts the figure in the answer at all." />
        <button type="button" className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setMaking(true)}>
          New link
        </button>
      </div>

      <div className="keylist">
        {list?.map((s) => (
          <div key={s.id} className="keyrow">
            <span className="keyrow-name">
              {s.name || 'Shared link'}
              {s.has_password && (
                <span className="tag quiet" style={{ marginLeft: 8 }}>
                  password
                </span>
              )}
              {!s.revenue && (
                <span className="tag quiet" style={{ marginLeft: 8 }}>
                  no revenue
                </span>
              )}
              {!!s.embed_origins?.length && (
                <span className="tag quiet" style={{ marginLeft: 8 }} title={s.embed_origins.join(', ')}>
                  embeddable
                </span>
              )}
            </span>
            <span className="faint num keyrow-meta">
              {s.views > 0 ? `opened ${s.views}× · last ${when(s.viewed_at)}` : 'never opened'}
              {s.expires_at ? ` · ends ${when(s.expires_at)}` : ''}
            </span>
            <Menu label={`${s.name || 'link'} options`}>
              {(close) => (
                <button
                  type="button"
                  role="menuitem"
                  style={{ color: 'var(--down)' }}
                  onClick={async () => {
                    close()
                    const ok = await ask({
                      title: `Revoke "${s.name || 'this link'}"?`,
                      body: 'Anyone holding it sees nothing from then on, including anyone with it open right now. The link cannot be brought back.',
                      confirmLabel: 'Revoke',
                      danger: true,
                      busyLabel: 'Revoking…',
                      done: 'Link revoked',
                      run: () => api.deleteShare(site.id, s.id),
                    })
                    if (ok) load()
                  }}
                >
                  Revoke
                </button>
              )}
            </Menu>
          </div>
        ))}
        {list?.length === 0 && <span className="faint">No links yet. One shows this site's dashboard, read-only, to anyone who has it.</span>}
        {!list && <div className="skeleton" style={{ height: 54 }} />}
      </div>

      {making && <NewShare site={site} onClose={() => setMaking(false)} onMade={load} />}
      {dialog}
    </section>
  )
}

/** Two steps: what it shows, then the link — which is only shown once. */
function NewShare({ site, onClose, onMade }: { site: Site; onClose: () => void; onMade: () => void }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [revenue, setRevenue] = useState(false)
  const [days, setDays] = useState(0)
  const [embed, setEmbed] = useState('')
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const origins = embed.split(/[\s,]+/).filter(Boolean)
  const create = () => {
    setBusy(true)
    setErr(null)
    api
      .createShare(site.id, { name: name.trim() || site.domain, password, revenue, days, embed_origins: origins })
      .then((r) => {
        setUrl(r.url)
        onMade()
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <Modal label="New shared link" className="wizard" onClose={url ? undefined : onClose}>
      <div className="wiz-rail" aria-hidden="true">
        {['What it shows', 'The link'].map((label, i) => (
          <span key={label} className={url ? (i === 1 ? 'on' : 'done') : i === 0 ? 'on' : ''}>
            <i />
            {label}
          </span>
        ))}
      </div>

      <div key={url ? 'link' : 'what'} className="wiz-step">
        {!url ? (
          <>
            <h2>Share {site.domain}</h2>
            <p className="muted" style={{ margin: 0 }}>
              Whoever has the link sees this site's dashboard, read-only. Nothing else on this instance is reachable through it.
            </p>
            <label className="field">
              What to call it
              <input className="input" style={{ height: 44 }} value={name} maxLength={60} placeholder="For the investors" autoFocus onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              Password
              <input className="input" type="password" value={password} placeholder="Optional" autoComplete="off" onChange={(e) => setPassword(e.target.value)} />
              <span className="faint" style={{ fontSize: 12 }}>
                Worth setting if the link might be forwarded. Asked for once, then remembered for half a day.
              </span>
            </label>
            <div className="edit-pair">
              <label className="field">
                Ends after
                <div className="seg" role="group" aria-label="Ends after" style={{ flexWrap: 'wrap' }}>
                  {LASTS.map((l) => (
                    <button key={l.days} type="button" aria-pressed={days === l.days} onClick={() => setDays(l.days)}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field">
                Revenue
                <Switch on={revenue} onChange={() => setRevenue(!revenue)} />
                <span className="faint" style={{ fontSize: 12 }}>
                  {revenue ? 'Money is shown, as you see it.' : 'Money is left out — the server never puts it in the answer.'}
                </span>
              </label>
            </div>
            <label className="field">
              Allow embedding on
              <input className="input mono" value={embed} placeholder="https://yoursite.com (optional)" autoComplete="off" spellCheck={false} onChange={(e) => setEmbed(e.target.value)} />
              <span className="faint" style={{ fontSize: 12 }}>
                The sites that may show this dashboard inside their own pages, in an iframe. Up to five, separated by spaces. Leave it empty and no
                other site can frame it.
              </span>
            </label>
            {err && (
              <span role="alert" style={{ color: 'var(--down)', fontSize: 13 }}>
                {err}
              </span>
            )}
            <div className="wiz-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary big" disabled={busy} onClick={create}>
                {busy ? 'Creating…' : 'Create the link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Copy it now</h2>
            <p className="muted" style={{ margin: 0 }}>
              This is the only time the link is shown — trckable keeps just a hash of it, the same as an API key.
            </p>
            <CodeBlock code={url} lang="url" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  navigator.clipboard?.writeText(url).then(() => {
                    setCopied(true)
                    toast('Link copied')
                    setTimeout(() => setCopied(false), 1500)
                  })
                }
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <a className="btn" href={url} target="_blank" rel="noreferrer noopener">
                Open it
              </a>
            </div>
            {origins.length > 0 && (
              <>
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  To embed it on {origins.join(', ')}, paste this where the dashboard should appear:
                </p>
                <CodeBlock code={embedSnippet(url, site.domain)} lang="html" />
                <button
                  type="button"
                  className="btn"
                  style={{ justifySelf: 'start' }}
                  onClick={() => navigator.clipboard?.writeText(embedSnippet(url, site.domain)).then(() => toast('Embed code copied'))}
                >
                  Copy embed code
                </button>
              </>
            )}
            <div className="wiz-actions">
              <button type="button" className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/** The iframe for an embeddable link. The height fits Core mode; the page
 *  scrolls inside the frame if Full mode needs more. */
function embedSnippet(url: string, domain: string) {
  return `<iframe src="${url}?embed=1" title="${domain} analytics" loading="lazy"\n  style="width: 100%; height: 1300px; border: 0;"></iframe>`
}
